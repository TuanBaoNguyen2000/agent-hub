import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type {
  LaunchPlan,
  LaunchTarget,
  Launcher,
  LoginProcess,
  McpRegistration,
  McpServerSpec,
  PlannedStep,
  PlatformPort,
  ProfileStatus,
  RequiredConfirmation,
  ToolProcess,
  UsageReport,
  UsageWindow,
} from '@agenthub/application';
import { type AccountProfile, DomainError, type LaunchOutcome, type Message, type MessageKey, type Provider, msg, raw } from '@agenthub/domain';
import { joinMessages } from '@agenthub/i18n';

interface ProviderSpec {
  cli: string;
  label: string;
  desktopLabel: string;
  appName: string;
  bundleId: string;
  configEnv: string;
  // Versions with evidence for the separate-instance mechanism (ADR-013, ADR-014).
  evidencedDesktopVersions: readonly string[];
  loginArgs: string[];
  // A CLI's address only ever opens in a browser if it belongs to the provider.
  loginHosts: readonly string[];
}

const PROVIDERS: Record<Provider, ProviderSpec> = {
  claude: {
    cli: 'claude',
    label: 'Claude CLI',
    desktopLabel: 'Claude Desktop',
    appName: 'Claude',
    bundleId: 'com.anthropic.claudefordesktop',
    configEnv: 'CLAUDE_CONFIG_DIR',
    evidencedDesktopVersions: ['4.4212.0'],
    loginArgs: ['auth', 'login'],
    loginHosts: ['claude.com', 'claude.ai', 'anthropic.com'],
  },
  codex: {
    cli: 'codex',
    label: 'Codex CLI',
    desktopLabel: 'Codex Desktop',
    appName: 'ChatGPT',
    bundleId: 'com.openai.codex',
    configEnv: 'CODEX_HOME',
    evidencedDesktopVersions: ['26.1023.51421', '26.1027.51404'],
    loginArgs: ['login'],
    loginHosts: ['openai.com', 'chatgpt.com'],
  },
};

type Action =
  | {
      kind: 'terminal';
      executable: string;
      args: string[];
      cwd: string;
      inProject: boolean;
      extraEnv: Record<string, string>;
      ensureDirs: string[];
      manual: Message[];
    }
  | { kind: 'claude-desktop'; executable: string; cwd: string; bundleId: string; manualPrompt: Message }
  | { kind: 'codex-app'; executable: string; path: string; bundleId: string; manualPrompt: Message }
  | { kind: 'open-app'; bundleId: string; manual: Message[] }
  | { kind: 'open-main'; appName: string; executable: string; manual: Message[]; warning: Message | null }
  | { kind: 'focus'; pid: number; manual: Message[]; warning: Message | null }
  | { kind: 'instance'; appName: string; envName: string; envValue: string; dataDir: string; executable: string; manual: Message[] };

const VERSION_CONFIRMATION = 'desktop-version-without-evidence';

const MCP_NAME = 'agenthub';

type ServerState = 'registered' | 'missing' | 'different';

function sameServer(found: unknown, server: McpServerSpec): boolean {
  if (typeof found !== 'object' || found === null) return false;
  const entry = found as { command?: unknown; args?: unknown };
  return entry.command === server.command && JSON.stringify(entry.args ?? []) === JSON.stringify(server.args);
}

const MANUAL_PROMPT = msg('launch.manual.typePrompt');
const PASTE_PROMPT = msg('launch.manual.pastePrompt');

// A Desktop app takes no first prompt, so the user pastes the one AgentHub copied.
const desktopPromptStep = (target: LaunchTarget): Message => (target.prompt ? PASTE_PROMPT : MANUAL_PROMPT);

// SPIKE-13: the prompt goes last, and `--add-dir=` keeps the flag from swallowing it.
// Codex reads outside its workspace already (SPIKE-15), so only Claude is given read-only folders.
export function cliPromptArgs(prompt: LaunchTarget['prompt'], provider: Provider = 'claude'): string[] {
  if (!prompt) return [];
  const dirs = [prompt.addDir, ...(provider === 'claude' ? (prompt.readDirs ?? []) : [])].filter((dir): dir is string => Boolean(dir));
  return [...[...new Set(dirs)].map((dir) => `--add-dir=${dir}`), prompt.text];
}

const envFor = (spec: ProviderSpec, profile: AccountProfile): Record<string, string> =>
  profile.cliConfigRoot === null ? {} : { [spec.configEnv]: profile.cliConfigRoot };

function blocked(code: NonNullable<LaunchPlan['blocker']>['code'], message: Message): LaunchPlan {
  return { steps: [], requiredConfirmations: [], blocker: { code, message }, action: null };
}

const fingerprintOf = (identity: string): string => createHash('sha256').update(identity).digest('hex');

function isLoginAddress(spec: ProviderSpec, address: string): boolean {
  try {
    const url = new URL(address);
    return url.protocol === 'https:' && spec.loginHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const CODEX_REQUEST_MS = 15_000;
const URL_WAIT_MS = 15_000;
const LOGIN_POLL_MS = 3000;

type Reply = Record<string, unknown> | null;

// The JSON-RPC that `codex app-server` speaks over stdio. Any failure reads as null: the callers
// have a fallback, and this interface is still marked experimental.
function codexAppServer(tool: ToolProcess) {
  const waiting = new Map<number, (reply: Reply) => void>();
  const notifications = new Map<string, (params: Record<string, unknown>) => void>();
  let nextId = 1;

  tool.onLine((line) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof message['method'] === 'string') {
      notifications.get(message['method'])?.((message['params'] ?? {}) as Record<string, unknown>);
      return;
    }
    const resolve = waiting.get(message['id'] as number);
    if (resolve) resolve(message['error'] ? null : ((message['result'] ?? {}) as Record<string, unknown>));
  });

  function request(method: string, params: unknown): Promise<Reply> {
    const id = nextId;
    nextId += 1;
    return new Promise<Reply>((resolve) => {
      const finish = (reply: Reply): void => {
        waiting.delete(id);
        clearTimeout(timer);
        resolve(reply);
      };
      const timer = setTimeout(() => finish(null), CODEX_REQUEST_MS);
      waiting.set(id, finish);
      void tool.exited.then(() => finish(null));
      tool.write(JSON.stringify({ id, method, params }));
    });
  }

  return {
    request,
    on: (method: string, listener: (params: Record<string, unknown>) => void) => notifications.set(method, listener),
    async initialize(): Promise<boolean> {
      const reply = await request('initialize', { clientInfo: { name: 'agenthub', title: 'AgentHub', version: '0' } });
      if (reply) tool.write(JSON.stringify({ method: 'initialized', params: {} }));
      return reply !== null;
    },
  };
}

// `codex login status` names only the method (SPIKE-05); the app server names the account.
async function readCodexIdentity(
  platform: PlatformPort,
  executable: string,
  extraEnv: Record<string, string>,
): Promise<{ email: string; detail: string | null; fingerprint: string } | null> {
  const tool = platform.spawnTool(executable, ['app-server'], { extraEnv });
  try {
    const server = codexAppServer(tool);
    if (!(await server.initialize())) return null;
    const reply = await server.request('account/read', { refreshToken: false });
    const account = reply?.['account'] as Record<string, unknown> | null | undefined;
    if (!account || typeof account['email'] !== 'string') return null;
    const workspace = typeof account['workspaceName'] === 'string' ? account['workspaceName'] : null;
    const plan = typeof account['planType'] === 'string' ? account['planType'] : null;
    return {
      email: account['email'],
      detail: [plan, workspace].filter(Boolean).join(', ') || null,
      fingerprint: fingerprintOf(`${account['email']}|${workspace ?? ''}`),
    };
  } finally {
    tool.kill();
  }
}

async function readLogin(
  platform: PlatformPort,
  provider: Provider,
  executable: string,
  extraEnv: Record<string, string>,
): Promise<{ login: ProfileStatus['login']; detail: string | null; email: string | null; fingerprint: string | null }> {
  if (provider === 'claude') {
    const result = await platform.run(executable, ['auth', 'status'], { extraEnv, timeoutMs: 20_000 });
    try {
      const data = JSON.parse(result.stdout) as Record<string, unknown>;
      const signedIn = data['loggedIn'] === true;
      const identity = [data['email'], data['orgId']].filter((part) => typeof part === 'string').join('|');
      return {
        login: signedIn ? 'logged_in' : 'logged_out',
        detail: typeof data['subscriptionType'] === 'string' ? data['subscriptionType'] : null,
        email: signedIn && typeof data['email'] === 'string' ? data['email'] : null,
        fingerprint: signedIn && identity ? fingerprintOf(identity) : null,
      };
    } catch {
      return { login: 'unknown', detail: null, email: null, fingerprint: null };
    }
  }
  const result = await platform.run(executable, ['login', 'status'], { extraEnv, timeoutMs: 20_000 });
  const text = `${result.stdout}\n${result.stderr}`;
  if (/not logged in/i.test(text)) return { login: 'logged_out', detail: null, email: null, fingerprint: null };
  const method = /logged in using ([\w ]+)/i.exec(text);
  return method
    ? { login: 'logged_in', detail: method[1]?.trim() ?? null, email: null, fingerprint: null }
    : { login: 'unknown', detail: null, email: null, fingerprint: null };
}

// --- Usage limits (SPIKE-16): only through the CLIs' own commands, never their credentials. ---

const USAGE_TIMEOUT_MS = 30_000;
const SESSION_MINUTES = 300;
const WEEK_MINUTES = 10_080;

const unavailable = (detail: Message): UsageReport => ({ state: 'unavailable', windows: [], plan: null, limitReached: false, detail });

// `/usage` is a local command: in print mode it answers without a model turn. Hooks and MCP
// servers stay off so that reading a number starts nothing of the user's.
export const CLAUDE_USAGE_ARGS = [
  '-p',
  '/usage',
  '--output-format',
  'json',
  '--no-session-persistence',
  '--strict-mcp-config',
  '--settings',
  '{"disableAllHooks":true}',
];

const CLAUDE_USAGE_LINE = /^\s*([^:\n]+?):\s*(\d+(?:\.\d+)?)%\s+used(?:\s*·\s*resets\s+(.+?))?\s*$/gm;

// The command prints text meant for people, so this reads only the "<limit>: N% used · resets …"
// lines; the rest (what the usage went to) is dropped unread.
export function parseClaudeUsage(stdout: string): UsageReport {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return unavailable(msg('usage.claudeUnreadable'));
  }
  if (data['local_command'] !== 'usage' || data['is_error'] === true || typeof data['result'] !== 'string') {
    return unavailable(msg('usage.claudeUnreadable'));
  }
  const windows: UsageWindow[] = [];
  for (const match of data['result'].matchAll(CLAUDE_USAGE_LINE)) {
    const name = match[1]?.trim() ?? '';
    const usedPercent = Number(match[2]);
    const resetsText = match[3]?.trim() ?? null;
    if (/^current session$/i.test(name)) {
      windows.push({ kind: 'session', label: null, usedPercent, windowMinutes: SESSION_MINUTES, resetsAt: null, resetsText });
    } else if (/^current week \(all models\)$/i.test(name)) {
      windows.push({ kind: 'weekly', label: null, usedPercent, windowMinutes: WEEK_MINUTES, resetsAt: null, resetsText });
    } else {
      const scope = /^current week \((.+)\)$/i.exec(name)?.[1];
      windows.push({
        kind: 'other',
        label: scope ? msg('usage.weekScope', { scope }) : raw(name),
        usedPercent,
        windowMinutes: scope ? WEEK_MINUTES : null,
        resetsAt: null,
        resetsText,
      });
    }
  }
  if (windows.length === 0) {
    return unavailable(msg('usage.claudeNoLimits'));
  }
  return { state: 'ok', windows, plan: null, limitReached: windows.some((window) => window.usedPercent >= 100), detail: null };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function codexWindow(value: unknown, label: string | null): UsageWindow | null {
  if (!isRecord(value) || typeof value['usedPercent'] !== 'number') return null;
  const minutes = typeof value['windowDurationMins'] === 'number' ? value['windowDurationMins'] : null;
  const resetsAt = typeof value['resetsAt'] === 'number' ? new Date(value['resetsAt'] * 1000).toISOString() : null;
  const kind = label === null && minutes === SESSION_MINUTES ? 'session' : label === null && minutes === WEEK_MINUTES ? 'weekly' : 'other';
  return { kind, label: kind === 'other' && label !== null ? raw(label) : null, usedPercent: value['usedPercent'], windowMinutes: minutes, resetsAt, resetsText: null };
}

// The reply of `account/rateLimits/read`. Reset credits, the upsell banner and the account id
// are left out on purpose.
export function parseCodexUsage(reply: Record<string, unknown> | null): UsageReport {
  const main = reply?.['rateLimits'];
  if (!reply || !isRecord(main)) return unavailable(msg('usage.codexNoReply'));
  const windows: UsageWindow[] = [];
  const addBucket = (bucket: Record<string, unknown>, label: string | null): void => {
    for (const key of ['primary', 'secondary']) {
      const window = codexWindow(bucket[key], label);
      if (window) windows.push(window);
    }
  };
  addBucket(main, null);
  const others = isRecord(reply['rateLimitsByLimitId']) ? reply['rateLimitsByLimitId'] : {};
  for (const [limitId, bucket] of Object.entries(others)) {
    if (!isRecord(bucket) || limitId === main['limitId']) continue;
    addBucket(bucket, typeof bucket['limitName'] === 'string' ? bucket['limitName'] : limitId);
  }
  const reached =
    main['rateLimitReachedType'] != null ||
    main['spendControlReached'] === true ||
    reply['ordinaryUsageAllowed'] === false ||
    windows.some((window) => window.usedPercent >= 100);
  const plan = typeof main['planType'] === 'string' && main['planType'] !== 'unknown' ? main['planType'] : null;
  if (windows.length === 0 && !reached) return { ...unavailable(msg('usage.codexNoWindows')), plan };
  return { state: 'ok', windows, plan, limitReached: reached, detail: null };
}

async function readCodexUsage(platform: PlatformPort, executable: string, extraEnv: Record<string, string>): Promise<UsageReport> {
  const tool = platform.spawnTool(executable, ['app-server'], { extraEnv });
  try {
    const server = codexAppServer(tool);
    if (!(await server.initialize())) return unavailable(msg('usage.codexServerFailed'));
    return parseCodexUsage(await server.request('account/rateLimits/read', undefined));
  } finally {
    tool.kill();
  }
}

const LOGIN_TIMEOUT_MS = 15 * 60_000;

export function createLauncher(platform: PlatformPort, { loginTimeoutMs = LOGIN_TIMEOUT_MS }: { loginTimeoutMs?: number } = {}): Launcher {
  // `claude auth login` calls whatever BROWSER names with a page that returns to the CLI by itself.
  // The address it prints instead would make the user paste a code back, so it goes unused.
  async function startClaudeLogin(spec: ProviderSpec, executable: string, extraEnv: Record<string, string>, cwd: string): Promise<LoginProcess | null> {
    const before = await readLogin(platform, 'claude', executable, extraEnv);
    const capture = platform.captureBrowserRequest();
    const tool = platform.spawnTool(executable, spec.loginArgs, { cwd, extraEnv: { ...extraEnv, BROWSER: capture.command } });

    let running = true;
    void tool.exited.then(() => {
      running = false;
    });
    const deadline = Date.now() + URL_WAIT_MS;
    let url = capture.url();
    while (url === null && running && Date.now() < deadline) {
      await delay(100);
      url = capture.url();
    }
    capture.dispose();
    if (url === null || !isLoginAddress(spec, url)) {
      tool.kill();
      return null;
    }

    let cancelled = false;
    const completed = (async (): Promise<boolean> => {
      // The CLI normally just exits, but the status also tells if it stays waiting on its prompt.
      while (running) {
        await Promise.race([tool.exited, delay(LOGIN_POLL_MS)]);
        if (cancelled) return false;
        if (!running) break;
        const now = await readLogin(platform, 'claude', executable, extraEnv);
        if (now.login === 'logged_in' && now.fingerprint !== before.fingerprint) {
          tool.kill();
          return true;
        }
      }
      if (cancelled || (await tool.exited) !== 0) return false;
      return (await readLogin(platform, 'claude', executable, extraEnv)).login === 'logged_in';
    })();
    return {
      url,
      completed,
      cancel: () => {
        cancelled = true;
        tool.kill();
      },
    };
  }

  // The app server hands over the address and reports the result, so no browser opens on its own.
  async function startCodexLogin(spec: ProviderSpec, executable: string, extraEnv: Record<string, string>, cwd: string): Promise<LoginProcess | null> {
    const tool = platform.spawnTool(executable, ['app-server'], { cwd, extraEnv });
    const server = codexAppServer(tool);
    const finished = new Promise<boolean>((resolve) => {
      server.on('account/login/completed', (params) => resolve(params['success'] === true));
      void tool.exited.then(() => resolve(false));
    });
    const reply = (await server.initialize()) ? await server.request('account/login/start', { type: 'chatgpt' }) : null;
    const url = reply?.['authUrl'];
    if (typeof url !== 'string' || !isLoginAddress(spec, url)) {
      tool.kill();
      return null;
    }
    return {
      url,
      completed: finished.then((succeeded) => {
        tool.kill();
        return succeeded;
      }),
      cancel: () => tool.kill(),
    };
  }

  // The documents sit outside the project, where a Desktop agent may need to ask before reading.
  function outsideWarning(target: LaunchTarget): Message | null {
    return joinMessages([
      target.prompt?.addDir ? msg('launch.warning.docsOutside') : null,
      target.prompt?.readDirs?.length ? msg('launch.warning.transcriptOutside') : null,
    ]);
  }

  // --- MCP registration (ADR-019 item 6; SPIKE-10, 11, 12) ---

  const claudeConfigFile = (profile: AccountProfile): string => join(profile.cliConfigRoot ?? platform.homeDirectory(), '.claude.json');
  const codexConfigFile = (profile: AccountProfile): string =>
    join(profile.cliConfigRoot ?? join(platform.homeDirectory(), '.codex'), 'config.toml');
  // Only an instance AgentHub opened for this account; the main Desktop app may hold another login.
  const desktopConfigFile = (profile: AccountProfile): string | null =>
    profile.provider === 'claude' && profile.desktopDataDir !== null ? join(profile.desktopDataDir, 'claude_desktop_config.json') : null;

  function jsonConfig(path: string): Record<string, unknown> | null {
    const text = platform.readTextFile(path);
    if (text === null) return {};
    try {
      const data: unknown = JSON.parse(text);
      return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  function jsonState(path: string, server: McpServerSpec): ServerState | null {
    const data = jsonConfig(path);
    if (data === null) return null;
    const servers = data['mcpServers'];
    const found = typeof servers === 'object' && servers !== null ? (servers as Record<string, unknown>)[MCP_NAME] : undefined;
    if (found === undefined) return 'missing';
    return sameServer(found, server) ? 'registered' : 'different';
  }

  async function codexState(profile: AccountProfile, server: McpServerSpec, executable: string): Promise<ServerState> {
    const result = await platform.run(executable, ['mcp', 'get', MCP_NAME, '--json'], {
      extraEnv: envFor(PROVIDERS.codex, profile),
      timeoutMs: 20_000,
    });
    if (result.exit !== 0) return 'missing';
    try {
      const data = JSON.parse(result.stdout) as { transport?: unknown };
      return sameServer(data.transport, server) ? 'registered' : 'different';
    } catch {
      return 'different';
    }
  }

  async function mcpRegistration(profile: AccountProfile, server: McpServerSpec, cliOverride: string | null): Promise<McpRegistration> {
    const spec = PROVIDERS[profile.provider];
    const pending: string[] = [];
    const registered: string[] = [];
    const problems: Message[] = [];
    const note = (path: string, state: ServerState): void => {
      if (state !== 'registered') pending.push(path);
      if (state !== 'missing') registered.push(path);
    };
    if (profile.provider === 'claude') {
      const path = claudeConfigFile(profile);
      const state = jsonState(path, server);
      if (state === null) problems.push(msg('mcp.unreadableConfig', { path }));
      else note(path, state);
    } else {
      const executable = await platform.findCli(spec.cli, cliOverride);
      if (!executable) problems.push(msg('mcp.cliMissing', { cli: spec.label }));
      else note(codexConfigFile(profile), await codexState(profile, server, executable));
    }
    const desktop = desktopConfigFile(profile);
    if (desktop) {
      const state = jsonState(desktop, server);
      if (state === null) problems.push(msg('mcp.unreadableConfig', { path: desktop }));
      else note(desktop, state);
    }
    if (profile.provider === 'claude' && pending.includes(claudeConfigFile(profile)) && !(await platform.findCli(spec.cli, cliOverride))) {
      problems.push(msg('mcp.cliMissing', { cli: spec.label }));
    }
    return { pending, registered, problems };
  }

  async function runOrFail(executable: string, args: string[], extraEnv: Record<string, string>, failure: MessageKey): Promise<void> {
    const result = await platform.run(executable, args, { extraEnv, timeoutMs: 30_000 });
    if (result.exit !== 0) throw new DomainError('LAUNCH_FAILED', failure, { output: (result.stderr || result.stdout).trim().split('\n')[0] ?? '' });
  }

  // Official commands for the CLI configs; Desktop has none, so its JSON is merged by hand.
  async function registerMcp(profile: AccountProfile, server: McpServerSpec, cliOverride: string | null): Promise<void> {
    const spec = PROVIDERS[profile.provider];
    const extraEnv = envFor(spec, profile);
    if (profile.cliConfigRoot !== null) platform.ensureDirectory(profile.cliConfigRoot);
    const executable = await platform.findCli(spec.cli, cliOverride);
    if (profile.provider === 'claude') {
      const state = jsonState(claudeConfigFile(profile), server);
      if (state !== 'registered') {
        if (!executable) throw new DomainError('BIN_NOT_FOUND', 'mcp.cliMissing', { cli: spec.label });
        if (state === 'different') await runOrFail(executable, ['mcp', 'remove', '-s', 'user', MCP_NAME], extraEnv, 'mcp.failed.removeOld');
        const json = JSON.stringify({ type: 'stdio', command: server.command, args: server.args });
        await runOrFail(executable, ['mcp', 'add-json', '-s', 'user', MCP_NAME, json], extraEnv, 'mcp.failed.addClaude');
      }
    } else {
      if (!executable) throw new DomainError('BIN_NOT_FOUND', 'mcp.cliMissing', { cli: spec.label });
      if ((await codexState(profile, server, executable)) !== 'registered') {
        await runOrFail(executable, ['mcp', 'add', MCP_NAME, '--', server.command, ...server.args], extraEnv, 'mcp.failed.addCodex');
      }
    }
    const desktop = desktopConfigFile(profile);
    if (desktop && jsonState(desktop, server) !== 'registered') {
      const data = jsonConfig(desktop);
      if (data === null) throw new DomainError('LAUNCH_FAILED', 'mcp.unreadableJson', { path: desktop });
      const servers = typeof data['mcpServers'] === 'object' && data['mcpServers'] !== null ? (data['mcpServers'] as Record<string, unknown>) : {};
      data['mcpServers'] = { ...servers, [MCP_NAME]: { command: server.command, args: server.args } };
      platform.writeTextFile(desktop, `${JSON.stringify(data, null, 2)}\n`);
    }
  }

  // The same official commands in reverse; only AgentHub's own entry is removed.
  async function unregisterMcp(profile: AccountProfile, cliOverride: string | null): Promise<void> {
    const spec = PROVIDERS[profile.provider];
    const extraEnv = envFor(spec, profile);
    if (profile.provider === 'claude') {
      const data = jsonConfig(claudeConfigFile(profile));
      if (data === null) throw new DomainError('LAUNCH_FAILED', 'mcp.unreadableJson', { path: claudeConfigFile(profile) });
      const servers = data['mcpServers'];
      if (typeof servers === 'object' && servers !== null && MCP_NAME in servers) {
        const executable = await platform.findCli(spec.cli, cliOverride);
        if (!executable) throw new DomainError('BIN_NOT_FOUND', 'mcp.cliMissingRemove', { cli: spec.label });
        await runOrFail(executable, ['mcp', 'remove', '-s', 'user', MCP_NAME], extraEnv, 'mcp.failed.removeClaude');
      }
    } else {
      const executable = await platform.findCli(spec.cli, cliOverride);
      if (!executable) throw new DomainError('BIN_NOT_FOUND', 'mcp.cliMissingRemove', { cli: spec.label });
      const found = await platform.run(executable, ['mcp', 'get', MCP_NAME, '--json'], { extraEnv, timeoutMs: 20_000 });
      if (found.exit === 0) await runOrFail(executable, ['mcp', 'remove', MCP_NAME], extraEnv, 'mcp.failed.removeCodex');
    }
    const desktop = desktopConfigFile(profile);
    if (desktop) {
      const data = jsonConfig(desktop);
      if (data === null) throw new DomainError('LAUNCH_FAILED', 'mcp.unreadableJson', { path: desktop });
      const servers = data['mcpServers'];
      if (typeof servers === 'object' && servers !== null && MCP_NAME in servers) {
        const rest = { ...(servers as Record<string, unknown>) };
        delete rest[MCP_NAME];
        data['mcpServers'] = rest;
        platform.writeTextFile(desktop, `${JSON.stringify(data, null, 2)}\n`);
      }
    }
  }

  async function planCli(target: LaunchTarget, spec: ProviderSpec): Promise<LaunchPlan> {
    const executable = await platform.findCli(spec.cli, target.cliOverride);
    if (!executable) return blocked('BIN_NOT_FOUND', msg('launch.blocker.cliMissing', { cli: spec.label }));

    const extraEnv = envFor(spec, target.profile);
    const root = target.profile.cliConfigRoot;
    const steps: PlannedStep[] = [];
    if (root !== null && platform.pathKind(root) === 'missing') {
      steps.push({ label: msg('launch.step.createConfig'), execution: 'automatic' });
    }
    const inProject = target.projectPath !== null;
    steps.push({
      label: msg(inProject ? 'launch.step.terminalProject' : 'launch.step.terminalHome', { cli: spec.label }),
      execution: 'automatic',
    });

    const { login } = root !== null && platform.pathKind(root) === 'missing'
      ? { login: 'logged_out' as const }
      : await readLogin(platform, target.profile.provider, executable, extraEnv);
    if (login !== 'logged_in') steps.push({ label: msg('launch.step.signInWhenAsked'), execution: 'manual' });
    const manual: Message[] = [msg('launch.manual.checkStatus')];
    if (target.prompt) {
      steps.push({
        label: msg(target.prompt.addDir ? 'launch.step.sendPromptWithDocs' : 'launch.step.sendPrompt'),
        execution: 'automatic',
      });
      // Claude holds the prompt behind its trust question for a new folder (SPIKE-13).
      if (target.profile.provider === 'claude') manual.unshift(msg('launch.manual.trustFolder'));
    } else {
      manual.push(msg('launch.manual.typeToStart'));
    }
    for (const label of manual) steps.push({ label, execution: 'manual' });

    const action: Action = {
      kind: 'terminal',
      executable,
      args: cliPromptArgs(target.prompt, target.profile.provider),
      cwd: target.projectPath ?? platform.homeDirectory(),
      inProject,
      extraEnv,
      ensureDirs: root === null ? [] : [root],
      manual,
    };
    return { steps, requiredConfirmations: [], blocker: null, action };
  }

  async function planDesktop(target: LaunchTarget, spec: ProviderSpec): Promise<LaunchPlan> {
    const app = await platform.findApp(spec.appName);
    if (!app) return blocked('APP_NOT_FOUND', msg('launch.blocker.appMissing', { app: spec.desktopLabel }));

    const { profile } = target;
    if (profile.desktopDataDir !== null && profile.cliConfigRoot !== null) {
      return planInstance(target, spec, { ...app, dataDir: profile.desktopDataDir, configRoot: profile.cliConfigRoot });
    }

    const inProject = target.projectPath !== null;
    const manualFolder = msg('launch.manual.pickFolder');
    const manualAccount = msg('launch.manual.checkAccountSwitch');
    const manualPrompt = desktopPromptStep(target);
    const manual = inProject ? [manualFolder, manualAccount, manualPrompt] : [manualAccount, manualPrompt];
    const openWarning =
      joinMessages([profile.cliConfigRoot === null ? null : msg('launch.warning.noOwnWindow'), outsideWarning(target)]) ?? undefined;

    // macOS hands `open -b`, links and so `claude --desktop` to the copy that started first. If
    // that is another account's window, they would all land there instead of the main app.
    const instances = await platform.runningInstances(app.executable);
    if (instances[0] && instances[0].dataDir !== null) {
      const running = instances.find((instance) => instance.dataDir === null);
      // Without a project there is no folder to send astray, so nothing to warn about.
      const warning = inProject
        ? msg('launch.warning.otherWindowFirst', { app: spec.desktopLabel })
        : null;
      const stepWarning = joinMessages([openWarning ?? null, warning]);
      const steps: PlannedStep[] = [
        {
          label: msg(running ? 'launch.step.focusMain' : 'launch.step.openMainBeside', { app: spec.desktopLabel }),
          execution: 'conditional',
          ...(stepWarning ? { warning: stepWarning } : {}),
        },
        ...manual.map((label): PlannedStep => ({ label, execution: 'manual' })),
      ];
      const action: Action = running
        ? { kind: 'focus', pid: running.pid, manual, warning }
        : { kind: 'open-main', appName: spec.appName, executable: app.executable, manual, warning };
      return { steps, requiredConfirmations: [], blocker: null, action };
    }

    if (target.projectPath === null) {
      const steps: PlannedStep[] = [
        { label: msg('launch.step.openApp', { app: spec.desktopLabel }), execution: 'automatic', ...(openWarning ? { warning: openWarning } : {}) },
        ...manual.map((label): PlannedStep => ({ label, execution: 'manual' })),
      ];
      return { steps, requiredConfirmations: [], blocker: null, action: { kind: 'open-app', bundleId: spec.bundleId, manual } };
    }

    const executable = await platform.findCli(spec.cli, target.cliOverride);

    if (!executable) {
      const steps: PlannedStep[] = [
        { label: msg('launch.step.openApp', { app: spec.desktopLabel }), execution: 'automatic', ...(openWarning ? { warning: openWarning } : {}) },
        { label: manualFolder, execution: 'manual', warning: msg('launch.warning.noCliForFolder', { cli: spec.label }) },
        { label: manualAccount, execution: 'manual' },
        { label: manualPrompt, execution: 'manual' },
      ];
      const action: Action = { kind: 'open-app', bundleId: spec.bundleId, manual: [manualFolder, manualAccount, manualPrompt] };
      return { steps, requiredConfirmations: [], blocker: null, action };
    }

    const steps: PlannedStep[] = [
      {
        label: msg('launch.step.askAppOpenFolder', { app: spec.desktopLabel }),
        execution: 'conditional',
        ...(openWarning ? { warning: openWarning } : {}),
      },
      { label: manualAccount, execution: 'manual' },
      { label: manualPrompt, execution: 'manual' },
    ];
    const action: Action =
      target.profile.provider === 'claude'
        ? { kind: 'claude-desktop', executable, cwd: target.projectPath, bundleId: spec.bundleId, manualPrompt }
        : { kind: 'codex-app', executable, path: target.projectPath, bundleId: spec.bundleId, manualPrompt };
    return { steps, requiredConfirmations: [], blocker: null, action };
  }

  async function planInstance(
    target: LaunchTarget,
    spec: ProviderSpec,
    app: { executable: string; version: string | null; dataDir: string; configRoot: string },
  ): Promise<LaunchPlan> {
    const instances = await platform.runningInstances(app.executable);
    const running = instances.find((instance) => instance.dataDir === app.dataDir);
    const manualFolder = msg('launch.manual.pickFolderInWindow');
    const manualAccount = msg('launch.manual.checkAccountInWindow');
    const manualPrompt = desktopPromptStep(target);
    const steps: PlannedStep[] = [];
    const confirmations: RequiredConfirmation[] = [];
    const hasEvidence = app.version !== null && spec.evidencedDesktopVersions.includes(app.version);

    if (running) {
      steps.push({ label: msg('launch.step.focusInstance', { app: spec.desktopLabel }), execution: 'conditional' });
    } else {
      const warning = outsideWarning(target);
      steps.push({ label: msg('launch.step.openInstance', { app: spec.desktopLabel }), execution: 'conditional', ...(warning ? { warning } : {}) });
      if (!hasEvidence) {
        confirmations.push({
          id: VERSION_CONFIRMATION,
          label: msg('launch.confirm.unverifiedVersion', { app: spec.desktopLabel, version: app.version ?? msg('launch.unknownVersion') }),
        });
      }
      // A sign-in callback is a link, so it goes to whichever copy started first (SPIKE-07).
      // Codex signs in through its CLI instead.
      if (
        target.profile.provider === 'claude' &&
        instances.length > 0 &&
        (platform.pathKind(app.dataDir) === 'missing' || platform.isEmptyDirectory(app.dataDir))
      ) {
        steps.push({
          label: msg('launch.step.signInNewWindow'),
          execution: 'manual',
          warning: msg('launch.warning.firstWindowSignIn', { app: spec.desktopLabel }),
        });
      }
    }
    const manual = target.projectPath !== null ? [manualFolder, manualAccount, manualPrompt] : [manualAccount, manualPrompt];
    for (const label of manual) steps.push({ label, execution: 'manual' });

    const action: Action = running
      ? { kind: 'focus', pid: running.pid, manual, warning: null }
      : {
          kind: 'instance',
          appName: spec.appName,
          envName: spec.configEnv,
          envValue: app.configRoot,
          dataDir: app.dataDir,
          executable: app.executable,
          manual,
        };
    return { steps, requiredConfirmations: confirmations, blocker: null, action };
  }

  async function launchClaudeDesktop(action: Extract<Action, { kind: 'claude-desktop' }>): Promise<LaunchOutcome> {
    const manualAccount = msg('launch.manual.checkAccount');
    const { manualPrompt } = action;
    const fallback = async (warning: Message): Promise<LaunchOutcome> => {
      const appOpened = await platform.openApp(action.bundleId);
      if (!appOpened) throw new DomainError('LAUNCH_FAILED', 'launch.failed.claudeDesktop');
      return {
        appOpened,
        workspace: 'manual',
        sessionStarted: false,
        userActionRequired: [msg('launch.manual.pickFolder'), manualAccount, manualPrompt],
        warnings: [warning],
      };
    };

    // --desktop needs a signed-in CLI, and a login was once lost right after it (SPIKE-09).
    const before = await readLogin(platform, 'claude', action.executable, {});
    if (before.login !== 'logged_in') {
      return fallback(msg('launch.warning.claudeSignedOut'));
    }
    const result = await platform.runInPty(action.executable, ['--desktop'], { cwd: action.cwd, timeoutMs: 30_000 });
    if (result.exit !== 0) return fallback(msg('launch.warning.cliRefused', { cli: 'Claude CLI' }));

    const after = await readLogin(platform, 'claude', action.executable, {});
    const warnings =
      after.login === 'logged_in'
        ? []
        : [msg('launch.warning.claudeLostLogin')];
    return {
      appOpened: true,
      workspace: 'requested',
      sessionStarted: false,
      userActionRequired: [msg('launch.manual.checkFolder'), manualAccount, manualPrompt],
      warnings,
    };
  }

  async function launchAction(action: Action): Promise<LaunchOutcome> {
    switch (action.kind) {
      case 'terminal': {
        for (const dir of action.ensureDirs) platform.ensureDirectory(dir);
        const started = await platform.openTerminal({
          executable: action.executable,
          args: action.args,
          cwd: action.cwd,
          extraEnv: action.extraEnv,
        });
        if (!started) throw new DomainError('LAUNCH_FAILED', 'launch.failed.terminal');
        return {
          appOpened: true,
          workspace: action.inProject ? 'opened' : 'none',
          sessionStarted: false,
          userActionRequired: action.manual,
          warnings: [],
        };
      }
      case 'claude-desktop':
        return launchClaudeDesktop(action);
      case 'codex-app': {
        const result = await platform.run(action.executable, ['app', action.path], { timeoutMs: 30_000 });
        const manual = [msg('launch.manual.checkAccount'), action.manualPrompt];
        if (result.exit === 0) {
          return {
            appOpened: true,
            workspace: 'requested',
            sessionStarted: false,
            userActionRequired: [msg('launch.manual.checkFolder'), ...manual],
            warnings: [],
          };
        }
        if (!(await platform.openApp(action.bundleId))) throw new DomainError('LAUNCH_FAILED', 'launch.failed.codexDesktop');
        return {
          appOpened: true,
          workspace: 'manual',
          sessionStarted: false,
          userActionRequired: [msg('launch.manual.pickFolder'), ...manual],
          warnings: [msg('launch.warning.cliRefused', { cli: 'Codex CLI' })],
        };
      }
      case 'open-app': {
        if (!(await platform.openApp(action.bundleId))) throw new DomainError('LAUNCH_FAILED', 'launch.failed.app');
        return { appOpened: true, workspace: 'manual', sessionStarted: false, userActionRequired: action.manual, warnings: [] };
      }
      case 'open-main': {
        if (!(await platform.openDefaultInstance(action))) throw new DomainError('LAUNCH_FAILED', 'launch.failed.mainApp');
        return {
          appOpened: true,
          workspace: 'manual',
          sessionStarted: false,
          userActionRequired: action.manual,
          warnings: action.warning ? [action.warning] : [],
        };
      }
      case 'focus': {
        // Not worth failing the launch: the window is open, only bringing it forward did not work.
        const focused = await platform.focusProcess(action.pid);
        const warnings = [...(action.warning ? [action.warning] : []), ...(focused ? [] : [msg('launch.warning.focusFailed')])];
        return { appOpened: true, workspace: 'manual', sessionStarted: false, userActionRequired: action.manual, warnings };
      }
      case 'instance': {
        platform.ensureDirectory(action.envValue);
        platform.ensureDirectory(action.dataDir);
        const started = await platform.openInstance(action);
        if (!started) throw new DomainError('LAUNCH_FAILED', 'launch.failed.instance');
        return { appOpened: true, workspace: 'manual', sessionStarted: false, userActionRequired: action.manual, warnings: [] };
      }
    }
  }

  return {
    async plan(target) {
      if (!platform.supported) {
        return blocked('LAUNCH_UNSUPPORTED', msg('launch.macOnly'));
      }
      const spec = PROVIDERS[target.profile.provider];
      return target.mode === 'cli' ? planCli(target, spec) : planDesktop(target, spec);
    },

    launch: (plan) => launchAction(plan.action as Action),

    mcpRegistration,
    registerMcp,
    unregisterMcp,

    // SPIKE-14: each provider reads its account's own folder; the default account uses home.
    skillsDirectory(profile) {
      const root = profile.cliConfigRoot ?? join(platform.homeDirectory(), profile.provider === 'claude' ? '.claude' : '.codex');
      return join(root, 'skills');
    },

    // Codex reads this one for every account, which would cross the per-account limit (FR-016).
    sharedSkillsDirectories: () => [join(platform.homeDirectory(), '.agents', 'skills')],

    async status(profile, cliOverride) {
      const spec = PROVIDERS[profile.provider];
      const cliPath = platform.supported ? await platform.findCli(spec.cli, cliOverride) : null;
      const app = platform.supported ? await platform.findApp(spec.appName) : null;
      const root = profile.cliConfigRoot;
      const rootMissing = root !== null && platform.pathKind(root) === 'missing';

      let cliVersion: string | null = null;
      let login: Awaited<ReturnType<typeof readLogin>> = { login: 'unknown', detail: null, email: null, fingerprint: null };
      if (cliPath) {
        const version = await platform.run(cliPath, ['--version'], { timeoutMs: 15_000 });
        cliVersion = version.exit === 0 ? version.stdout.trim().split('\n')[0] ?? null : null;
        login = rootMissing
          ? { login: 'logged_out', detail: null, email: null, fingerprint: null }
          : await readLogin(platform, profile.provider, cliPath, envFor(spec, profile));
        if (profile.provider === 'codex' && login.login === 'logged_in') {
          const identity = await readCodexIdentity(platform, cliPath, envFor(spec, profile));
          if (identity) login = { ...login, ...identity };
        }
      }
      return {
        cliPath,
        cliVersion,
        login: login.login,
        loginDetail: login.detail === null ? null : raw(login.detail),
        accountEmail: login.email,
        accountFingerprint: login.fingerprint,
        desktopInstalled: app !== null,
        desktopVersion: app?.version ?? null,
        desktopVersionHasEvidence: app?.version != null && spec.evidencedDesktopVersions.includes(app.version),
      };
    },

    async usage(profile, cliOverride) {
      if (!platform.supported) return unavailable(msg('launch.macOnly'));
      const spec = PROVIDERS[profile.provider];
      const executable = await platform.findCli(spec.cli, cliOverride);
      if (!executable) return unavailable(msg('error.cliNotFound', { cli: spec.label }));
      const root = profile.cliConfigRoot;
      // Asking a CLI with no folder yet would create one; there is no login in it anyway.
      const signedOut: UsageReport = { state: 'logged_out', windows: [], plan: null, limitReached: false, detail: null };
      if (root !== null && platform.pathKind(root) === 'missing') return signedOut;
      const extraEnv = envFor(spec, profile);
      // Signed out, Claude would answer with a session cost summary instead, and Codex with an error.
      const { login } = await readLogin(platform, profile.provider, executable, extraEnv);
      if (login === 'logged_out') return signedOut;
      if (profile.provider === 'codex') return readCodexUsage(platform, executable, extraEnv);
      const result = await platform.run(executable, CLAUDE_USAGE_ARGS, {
        cwd: root ?? platform.homeDirectory(),
        extraEnv,
        timeoutMs: USAGE_TIMEOUT_MS,
      });
      if (result.timedOut) return unavailable(msg('usage.claudeTimeout'));
      return parseClaudeUsage(result.stdout);
    },

    async startLogin(profile, cliOverride) {
      if (!platform.supported) throw new DomainError('LAUNCH_UNSUPPORTED', 'launch.macOnly');
      const spec = PROVIDERS[profile.provider];
      const executable = await platform.findCli(spec.cli, cliOverride);
      if (!executable) throw new DomainError('BIN_NOT_FOUND', 'error.cliNotFound', { cli: spec.label });
      if (profile.cliConfigRoot !== null) platform.ensureDirectory(profile.cliConfigRoot);
      const cwd = profile.cliConfigRoot ?? platform.homeDirectory();
      const start = profile.provider === 'claude' ? startClaudeLogin : startCodexLogin;
      const login = await start(spec, executable, envFor(spec, profile), cwd);
      if (login) {
        // A login nobody finishes must not keep a CLI and its local port around.
        const timer = setTimeout(login.cancel, loginTimeoutMs);
        timer.unref();
        void login.completed.then(() => clearTimeout(timer));
      }
      return login;
    },

    async openLogin(profile, cliOverride) {
      if (!platform.supported) throw new DomainError('LAUNCH_UNSUPPORTED', 'launch.macOnly');
      const spec = PROVIDERS[profile.provider];
      const executable = await platform.findCli(spec.cli, cliOverride);
      if (!executable) throw new DomainError('BIN_NOT_FOUND', 'error.cliNotFound', { cli: spec.label });
      if (profile.cliConfigRoot !== null) platform.ensureDirectory(profile.cliConfigRoot);
      const started = await platform.openTerminal({
        executable,
        args: spec.loginArgs,
        cwd: profile.cliConfigRoot ?? platform.homeDirectory(),
        extraEnv: envFor(spec, profile),
      });
      if (!started) throw new DomainError('LAUNCH_FAILED', 'launch.failed.terminal');
    },
  };
}
