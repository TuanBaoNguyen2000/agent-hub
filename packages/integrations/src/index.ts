import { createHash } from 'node:crypto';
import type {
  LaunchPlan,
  LaunchTarget,
  Launcher,
  LoginProcess,
  PlannedStep,
  PlatformPort,
  ProfileStatus,
  RequiredConfirmation,
  ToolProcess,
  UsageReport,
  UsageWindow,
} from '@agenthub/application';
import { type AccountProfile, DomainError, type LaunchOutcome, type Provider } from '@agenthub/domain';

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
  | { kind: 'terminal'; executable: string; cwd: string; inProject: boolean; extraEnv: Record<string, string>; ensureDirs: string[] }
  | { kind: 'claude-desktop'; executable: string; cwd: string; bundleId: string }
  | { kind: 'codex-app'; executable: string; path: string; bundleId: string }
  | { kind: 'open-app'; bundleId: string; manual: string[] }
  | { kind: 'open-main'; appName: string; executable: string; manual: string[]; warning: string | null }
  | { kind: 'focus'; pid: number; manual: string[]; warning: string | null }
  | { kind: 'instance'; appName: string; envName: string; envValue: string; dataDir: string; executable: string; manual: string[] };

const VERSION_CONFIRMATION = 'desktop-version-without-evidence';

const envFor = (spec: ProviderSpec, profile: AccountProfile): Record<string, string> =>
  profile.cliConfigRoot === null ? {} : { [spec.configEnv]: profile.cliConfigRoot };

function blocked(code: NonNullable<LaunchPlan['blocker']>['code'], message: string): LaunchPlan {
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

const unavailable = (detail: string): UsageReport => ({ state: 'unavailable', windows: [], plan: null, limitReached: false, detail });

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
    return unavailable('Claude CLI không trả kết quả đọc được cho /usage.');
  }
  if (data['local_command'] !== 'usage' || data['is_error'] === true || typeof data['result'] !== 'string') {
    return unavailable('Claude CLI không trả kết quả đọc được cho /usage.');
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
        label: scope ? `Tuần, ${scope}` : name,
        usedPercent,
        windowMinutes: scope ? WEEK_MINUTES : null,
        resetsAt: null,
        resetsText,
      });
    }
  }
  if (windows.length === 0) {
    return unavailable('Claude CLI không báo hạn mức. Hạn mức chỉ có với gói thuê bao Claude, không có khi dùng API key.');
  }
  return { state: 'ok', windows, plan: null, limitReached: windows.some((window) => window.usedPercent >= 100), detail: null };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function codexWindow(raw: unknown, label: string | null): UsageWindow | null {
  if (!isRecord(raw) || typeof raw['usedPercent'] !== 'number') return null;
  const minutes = typeof raw['windowDurationMins'] === 'number' ? raw['windowDurationMins'] : null;
  const resetsAt = typeof raw['resetsAt'] === 'number' ? new Date(raw['resetsAt'] * 1000).toISOString() : null;
  const kind = label === null && minutes === SESSION_MINUTES ? 'session' : label === null && minutes === WEEK_MINUTES ? 'weekly' : 'other';
  return { kind, label: kind === 'other' ? (label ?? null) : null, usedPercent: raw['usedPercent'], windowMinutes: minutes, resetsAt, resetsText: null };
}

// The reply of `account/rateLimits/read`. Reset credits, the upsell banner and the account id
// are left out on purpose.
export function parseCodexUsage(reply: Record<string, unknown> | null): UsageReport {
  const main = reply?.['rateLimits'];
  if (!reply || !isRecord(main)) return unavailable('Codex không trả về hạn mức của account này.');
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
  if (windows.length === 0 && !reached) return { ...unavailable('Codex không báo hạn mức theo thời gian cho account này.'), plan };
  return { state: 'ok', windows, plan, limitReached: reached, detail: null };
}

async function readCodexUsage(platform: PlatformPort, executable: string, extraEnv: Record<string, string>): Promise<UsageReport> {
  const tool = platform.spawnTool(executable, ['app-server'], { extraEnv });
  try {
    const server = codexAppServer(tool);
    if (!(await server.initialize())) return unavailable('Không khởi động được Codex app-server.');
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

  async function planCli(target: LaunchTarget, spec: ProviderSpec): Promise<LaunchPlan> {
    const executable = await platform.findCli(spec.cli, target.cliOverride);
    if (!executable) return blocked('BIN_NOT_FOUND', `Không tìm thấy ${spec.label}. Hãy cài đặt, hoặc chỉ đường dẫn trong Cài đặt.`);

    const extraEnv = envFor(spec, target.profile);
    const root = target.profile.cliConfigRoot;
    const steps: PlannedStep[] = [];
    if (root !== null && platform.pathKind(root) === 'missing') {
      steps.push({ label: 'Tạo thư mục cấu hình của account', execution: 'automatic' });
    }
    const inProject = target.projectPath !== null;
    steps.push({
      label: inProject ? `Mở ${spec.label} trong Terminal, tại folder của project` : `Mở ${spec.label} trong Terminal, tại thư mục home`,
      execution: 'automatic',
    });

    const { login } = root !== null && platform.pathKind(root) === 'missing'
      ? { login: 'logged_out' as const }
      : await readLogin(platform, target.profile.provider, executable, extraEnv);
    if (login !== 'logged_in') steps.push({ label: 'Đăng nhập khi CLI yêu cầu', execution: 'manual' });
    steps.push({ label: 'Kiểm tra đúng account bằng lệnh /status', execution: 'manual' });
    steps.push({ label: 'Nhập prompt để bắt đầu', execution: 'manual' });

    const action: Action = {
      kind: 'terminal',
      executable,
      cwd: target.projectPath ?? platform.homeDirectory(),
      inProject,
      extraEnv,
      ensureDirs: root === null ? [] : [root],
    };
    return { steps, requiredConfirmations: [], blocker: null, action };
  }

  async function planDesktop(target: LaunchTarget, spec: ProviderSpec): Promise<LaunchPlan> {
    const app = await platform.findApp(spec.appName);
    if (!app) return blocked('APP_NOT_FOUND', `Không tìm thấy ${spec.desktopLabel} trong thư mục Applications.`);

    const { profile } = target;
    if (profile.desktopDataDir !== null && profile.cliConfigRoot !== null) {
      return planInstance(target, spec, { ...app, dataDir: profile.desktopDataDir, configRoot: profile.cliConfigRoot });
    }

    const inProject = target.projectPath !== null;
    const manualFolder = 'Chọn folder của project trong app';
    const manualAccount = 'Kiểm tra đúng account trong app; nếu sai, đăng xuất rồi đăng nhập lại trong app';
    const manualPrompt = 'Tạo cuộc trò chuyện mới và nhập prompt';
    const manual = inProject ? [manualFolder, manualAccount, manualPrompt] : [manualAccount, manualPrompt];
    const openWarning =
      profile.cliConfigRoot === null
        ? undefined
        : 'Account này chưa có cửa sổ Desktop riêng, nên app vẫn dùng account đang đăng nhập.';

    // macOS hands `open -b`, links and so `claude --desktop` to the copy that started first. If
    // that is another account's window, they would all land there instead of the main app.
    const instances = await platform.runningInstances(app.executable);
    if (instances[0] && instances[0].dataDir !== null) {
      const running = instances.find((instance) => instance.dataDir === null);
      // Without a project there is no folder to send astray, so nothing to warn about.
      const warning = inProject
        ? `Cửa sổ ${spec.desktopLabel} của account khác đã mở từ trước, nên lệnh mở folder sẽ đi nhầm sang đó. Hãy tự chọn folder trong app chính.`
        : null;
      const stepWarning = [openWarning, warning].filter(Boolean).join(' ');
      const steps: PlannedStep[] = [
        {
          label: running ? `Chuyển sang ${spec.desktopLabel} chính, đang mở sẵn` : `Mở ${spec.desktopLabel} chính, bên cạnh cửa sổ đang mở`,
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
        { label: `Mở ${spec.desktopLabel}`, execution: 'automatic', ...(openWarning ? { warning: openWarning } : {}) },
        ...manual.map((label): PlannedStep => ({ label, execution: 'manual' })),
      ];
      return { steps, requiredConfirmations: [], blocker: null, action: { kind: 'open-app', bundleId: spec.bundleId, manual } };
    }

    const executable = await platform.findCli(spec.cli, target.cliOverride);

    if (!executable) {
      const steps: PlannedStep[] = [
        { label: `Mở ${spec.desktopLabel}`, execution: 'automatic', ...(openWarning ? { warning: openWarning } : {}) },
        { label: manualFolder, execution: 'manual', warning: `Không tìm thấy ${spec.label}, nên không tự mở được folder.` },
        { label: manualAccount, execution: 'manual' },
        { label: manualPrompt, execution: 'manual' },
      ];
      const action: Action = { kind: 'open-app', bundleId: spec.bundleId, manual: [manualFolder, manualAccount, manualPrompt] };
      return { steps, requiredConfirmations: [], blocker: null, action };
    }

    const steps: PlannedStep[] = [
      {
        label: `Yêu cầu ${spec.desktopLabel} mở folder của project`,
        execution: 'conditional',
        ...(openWarning ? { warning: openWarning } : {}),
      },
      { label: manualAccount, execution: 'manual' },
      { label: manualPrompt, execution: 'manual' },
    ];
    const action: Action =
      target.profile.provider === 'claude'
        ? { kind: 'claude-desktop', executable, cwd: target.projectPath, bundleId: spec.bundleId }
        : { kind: 'codex-app', executable, path: target.projectPath, bundleId: spec.bundleId };
    return { steps, requiredConfirmations: [], blocker: null, action };
  }

  async function planInstance(
    target: LaunchTarget,
    spec: ProviderSpec,
    app: { executable: string; version: string | null; dataDir: string; configRoot: string },
  ): Promise<LaunchPlan> {
    const instances = await platform.runningInstances(app.executable);
    const running = instances.find((instance) => instance.dataDir === app.dataDir);
    const manualFolder = 'Chọn folder của project trong cửa sổ này; lệnh mở folder chỉ đi tới app chính';
    const manualAccount = 'Kiểm tra đúng account trong cửa sổ này';
    const manualPrompt = 'Tạo cuộc trò chuyện mới và nhập prompt';
    const steps: PlannedStep[] = [];
    const confirmations: RequiredConfirmation[] = [];
    const hasEvidence = app.version !== null && spec.evidencedDesktopVersions.includes(app.version);

    if (running) {
      steps.push({ label: `Chuyển sang cửa sổ ${spec.desktopLabel} của account này, đang mở sẵn`, execution: 'conditional' });
    } else {
      steps.push({ label: `Mở cửa sổ ${spec.desktopLabel} riêng của account`, execution: 'conditional' });
      if (!hasEvidence) {
        confirmations.push({
          id: VERSION_CONFIRMATION,
          label: `${spec.desktopLabel} ${app.version ?? 'không rõ version'} chưa được kiểm chứng cho cửa sổ riêng, cách mở này không có trong tài liệu chính thức nên có thể không hoạt động. Vẫn thử mở? Nếu không, hãy đăng xuất rồi đăng nhập lại trong app chính.`,
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
          label: 'Đăng nhập account này trong cửa sổ mới',
          execution: 'manual',
          warning: `Đây là lần đầu mở cửa sổ này, và Desktop có đăng nhập riêng với CLI. Hãy tự tắt các cửa sổ ${spec.desktopLabel} khác trước khi đăng nhập, vì trình duyệt sẽ trả kết quả đăng nhập về cửa sổ đã mở trước.`,
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
    const manualAccount = 'Kiểm tra đúng account trong app';
    const manualPrompt = 'Tạo cuộc trò chuyện mới và nhập prompt';
    const fallback = async (warning: string): Promise<LaunchOutcome> => {
      const appOpened = await platform.openApp(action.bundleId);
      if (!appOpened) throw new DomainError('LAUNCH_FAILED', 'Không mở được Claude Desktop.');
      return {
        appOpened,
        workspace: 'manual',
        sessionStarted: false,
        userActionRequired: ['Chọn folder của project trong app', manualAccount, manualPrompt],
        warnings: [warning],
      };
    };

    // --desktop needs a signed-in CLI, and a login was once lost right after it (SPIKE-09).
    const before = await readLogin(platform, 'claude', action.executable, {});
    if (before.login !== 'logged_in') {
      return fallback('Claude CLI chưa đăng nhập ở profile mặc định, nên không tự mở được folder.');
    }
    const result = await platform.runInPty(action.executable, ['--desktop'], { cwd: action.cwd, timeoutMs: 30_000 });
    if (result.exit !== 0) return fallback('Claude CLI từ chối lệnh mở folder.');

    const after = await readLogin(platform, 'claude', action.executable, {});
    const warnings =
      after.login === 'logged_in'
        ? []
        : ['Claude CLI mất đăng nhập ngay sau khi mở Desktop. Hãy đăng nhập lại profile mặc định.'];
    return {
      appOpened: true,
      workspace: 'requested',
      sessionStarted: false,
      userActionRequired: ['Kiểm tra app đã mở đúng folder', manualAccount, manualPrompt],
      warnings,
    };
  }

  async function launchAction(action: Action): Promise<LaunchOutcome> {
    switch (action.kind) {
      case 'terminal': {
        for (const dir of action.ensureDirs) platform.ensureDirectory(dir);
        const started = await platform.openTerminal({
          executable: action.executable,
          args: [],
          cwd: action.cwd,
          extraEnv: action.extraEnv,
        });
        if (!started) throw new DomainError('LAUNCH_FAILED', 'Không mở được Terminal.');
        return {
          appOpened: true,
          workspace: action.inProject ? 'opened' : 'none',
          sessionStarted: false,
          userActionRequired: ['Kiểm tra đúng account bằng lệnh /status', 'Nhập prompt để bắt đầu'],
          warnings: [],
        };
      }
      case 'claude-desktop':
        return launchClaudeDesktop(action);
      case 'codex-app': {
        const result = await platform.run(action.executable, ['app', action.path], { timeoutMs: 30_000 });
        const manual = ['Kiểm tra đúng account trong app', 'Tạo cuộc trò chuyện mới và nhập prompt'];
        if (result.exit === 0) {
          return {
            appOpened: true,
            workspace: 'requested',
            sessionStarted: false,
            userActionRequired: ['Kiểm tra app đã mở đúng folder', ...manual],
            warnings: [],
          };
        }
        if (!(await platform.openApp(action.bundleId))) throw new DomainError('LAUNCH_FAILED', 'Không mở được Codex Desktop.');
        return {
          appOpened: true,
          workspace: 'manual',
          sessionStarted: false,
          userActionRequired: ['Chọn folder của project trong app', ...manual],
          warnings: ['Codex CLI từ chối lệnh mở folder.'],
        };
      }
      case 'open-app': {
        if (!(await platform.openApp(action.bundleId))) throw new DomainError('LAUNCH_FAILED', 'Không mở được app.');
        return { appOpened: true, workspace: 'manual', sessionStarted: false, userActionRequired: action.manual, warnings: [] };
      }
      case 'open-main': {
        if (!(await platform.openDefaultInstance(action))) throw new DomainError('LAUNCH_FAILED', 'Không thấy app chính khởi động.');
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
        const warnings = [...(action.warning ? [action.warning] : []), ...(focused ? [] : ['Không tự chuyển được sang cửa sổ này; hãy chọn nó trên Dock.'])];
        return { appOpened: true, workspace: 'manual', sessionStarted: false, userActionRequired: action.manual, warnings };
      }
      case 'instance': {
        platform.ensureDirectory(action.envValue);
        platform.ensureDirectory(action.dataDir);
        const started = await platform.openInstance(action);
        if (!started) throw new DomainError('LAUNCH_FAILED', 'Không thấy instance mới khởi động.');
        return { appOpened: true, workspace: 'manual', sessionStarted: false, userActionRequired: action.manual, warnings: [] };
      }
    }
  }

  return {
    async plan(target) {
      if (!platform.supported) {
        return blocked('LAUNCH_UNSUPPORTED', 'Launcher hiện chỉ hỗ trợ macOS.');
      }
      const spec = PROVIDERS[target.profile.provider];
      return target.mode === 'cli' ? planCli(target, spec) : planDesktop(target, spec);
    },

    launch: (plan) => launchAction(plan.action as Action),

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
        loginDetail: login.detail,
        accountEmail: login.email,
        accountFingerprint: login.fingerprint,
        desktopInstalled: app !== null,
        desktopVersion: app?.version ?? null,
        desktopVersionHasEvidence: app?.version != null && spec.evidencedDesktopVersions.includes(app.version),
      };
    },

    async usage(profile, cliOverride) {
      if (!platform.supported) return unavailable('Launcher hiện chỉ hỗ trợ macOS.');
      const spec = PROVIDERS[profile.provider];
      const executable = await platform.findCli(spec.cli, cliOverride);
      if (!executable) return unavailable(`Không tìm thấy ${spec.label}.`);
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
      if (result.timedOut) return unavailable('Claude CLI không trả lời /usage kịp thời.');
      return parseClaudeUsage(result.stdout);
    },

    async startLogin(profile, cliOverride) {
      if (!platform.supported) throw new DomainError('LAUNCH_UNSUPPORTED', 'Launcher hiện chỉ hỗ trợ macOS.');
      const spec = PROVIDERS[profile.provider];
      const executable = await platform.findCli(spec.cli, cliOverride);
      if (!executable) throw new DomainError('BIN_NOT_FOUND', `Không tìm thấy ${spec.label}.`);
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
      if (!platform.supported) throw new DomainError('LAUNCH_UNSUPPORTED', 'Launcher hiện chỉ hỗ trợ macOS.');
      const spec = PROVIDERS[profile.provider];
      const executable = await platform.findCli(spec.cli, cliOverride);
      if (!executable) throw new DomainError('BIN_NOT_FOUND', `Không tìm thấy ${spec.label}.`);
      if (profile.cliConfigRoot !== null) platform.ensureDirectory(profile.cliConfigRoot);
      const started = await platform.openTerminal({
        executable,
        args: spec.loginArgs,
        cwd: profile.cliConfigRoot ?? platform.homeDirectory(),
        extraEnv: envFor(spec, profile),
      });
      if (!started) throw new DomainError('LAUNCH_FAILED', 'Không mở được Terminal.');
    },
  };
}
