import type { InstalledApp, LaunchTarget, PlatformPort, RunOptions, RunResult, ToolProcess } from '@agenthub/application';
import type { AccountProfile } from '@agenthub/domain';
import { describe, expect, it } from 'vitest';
import { CLAUDE_USAGE_ARGS, createLauncher, parseClaudeUsage, parseCodexUsage } from '../src/index';

const CLAUDE_APP: InstalledApp = {
  path: '/Applications/Claude.app',
  executable: '/Applications/Claude.app/Contents/MacOS/Claude',
  version: '4.4212.0',
};
const CHATGPT_APP: InstalledApp = {
  path: '/Applications/ChatGPT.app',
  executable: '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
  version: '26.1027.51404',
};
const PROJECT = "/work/Dự án 'nháy' $(touch x)";

type Call = { method: string; args: unknown[] };

interface Fake {
  platform: PlatformPort;
  calls: Call[];
}

function ok(stdout = ''): RunResult {
  return { exit: 0, stdout, stderr: '', timedOut: false, errorCode: null };
}

// A tool under the test's control; `reply` answers each line AgentHub writes to it.
function fakeTool(reply: (message: Record<string, unknown>, tool: { send: (value: unknown) => void; exit: (code: number) => void }) => void = () => undefined): ToolProcess & {
  exit: (code: number) => void;
  killed: () => boolean;
} {
  let exit: (code: number | null) => void = () => undefined;
  let killed = false;
  const exited = new Promise<number | null>((resolve) => {
    exit = resolve;
  });
  const listeners: ((line: string) => void)[] = [];
  const handle = { send: (value: unknown) => listeners.forEach((listener) => listener(JSON.stringify(value))), exit: (code: number) => exit(code) };
  return {
    onLine: (listener) => listeners.push(listener),
    write: (line) => reply(JSON.parse(line) as Record<string, unknown>, handle),
    kill: () => {
      killed = true;
      exit(null);
    },
    exited,
    exit: (code) => exit(code),
    killed: () => killed,
  };
}

function fakePlatform(overrides: Partial<PlatformPort> & { logins?: string[] } = {}): Fake {
  const calls: Call[] = [];
  const record = (method: string, args: unknown[]): void => {
    calls.push({ method, args });
  };
  const logins = [...(overrides.logins ?? [])];
  const authStatus = (): string =>
    logins.shift() ?? JSON.stringify({ loggedIn: true, email: 'a@example.com', orgId: 'org', subscriptionType: 'pro' });

  const platform: PlatformPort = {
    supported: true,
    findCli: async (name) => `/bin/${name}`,
    run: async (executable, args: string[], options?: RunOptions) => {
      record('run', [executable, args, options]);
      if (args.join(' ') === 'auth status') return ok(authStatus());
      if (args.join(' ') === 'login status') return ok('Logged in using ChatGPT');
      return ok('1.0.0');
    },
    runInPty: async (executable, args, options) => {
      record('runInPty', [executable, args, options]);
      return ok('Opening');
    },
    spawnTool: (executable, args, options) => {
      record('spawnTool', [executable, args, options]);
      return fakeTool();
    },
    captureBrowserRequest: () => ({ command: '/tmp/capture', url: () => null, dispose: () => record('dispose', []) }),
    openPrivateWindow: async () => 'Google Chrome',
    openInDefaultBrowser: async () => true,
    openTerminal: async (request) => {
      record('openTerminal', [request]);
      return true;
    },
    findApp: async (name) => (name === 'Claude' ? CLAUDE_APP : CHATGPT_APP),
    openApp: async (bundleId) => {
      record('openApp', [bundleId]);
      return true;
    },
    openInstance: async (request) => {
      record('openInstance', [request]);
      return true;
    },
    openDefaultInstance: async (request) => {
      record('openDefaultInstance', [request]);
      return true;
    },
    runningInstances: async () => [],
    focusProcess: async (pid) => {
      record('focusProcess', [pid]);
      return true;
    },
    defaultDesktopDataDirs: () => [],
    ensureDirectory: (path) => record('ensureDirectory', [path]),
    isEmptyDirectory: () => false,
    pathKind: () => 'directory',
    homeDirectory: () => '/Users/test',
    ...overrides,
  };
  return { platform, calls };
}

function profile(overrides: Partial<AccountProfile> = {}): AccountProfile {
  return {
    id: 'p',
    provider: 'claude',
    alias: 'A',
    accountEmail: null,
    cliConfigRoot: null,
    desktopDataDir: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function target(overrides: Partial<LaunchTarget> & { profile?: AccountProfile } = {}): LaunchTarget {
  return { profile: profile(), mode: 'cli', projectPath: PROJECT, cliOverride: null, ...overrides };
}

const callsOf = (fake: Fake, method: string): unknown[][] => fake.calls.filter((call) => call.method === method).map((call) => call.args);

describe('Claude CLI', () => {
  it('passes the project as cwd and the profile through the child env only', async () => {
    const fake = fakePlatform();
    const launcher = createLauncher(fake.platform);
    const b = profile({ cliConfigRoot: '/Users/test/claude b' });

    const plan = await launcher.plan(target({ profile: b }));
    await launcher.launch(plan);

    expect(callsOf(fake, 'openTerminal')).toEqual([
      [{ executable: '/bin/claude', args: [], cwd: PROJECT, extraEnv: { CLAUDE_CONFIG_DIR: '/Users/test/claude b' } }],
    ]);
  });

  it('sets no config env for the default profile', async () => {
    const fake = fakePlatform();
    const launcher = createLauncher(fake.platform);

    await launcher.launch(await launcher.plan(target()));

    expect((callsOf(fake, 'openTerminal')[0]?.[0] as { extraEnv: unknown }).extraEnv).toEqual({});
  });

  it('says the cwd is opened but never that a session started or an account switched', async () => {
    const launcher = createLauncher(fakePlatform().platform);

    const outcome = await launcher.launch(await launcher.plan(target()));

    expect(outcome.workspace).toBe('opened');
    expect(outcome.sessionStarted).toBe(false);
    expect(JSON.stringify(outcome)).not.toMatch(/switched/i);
    expect(outcome.userActionRequired.join()).toContain('/status');
  });

  it('blocks with BIN_NOT_FOUND when the CLI is missing', async () => {
    const launcher = createLauncher(fakePlatform({ findCli: async () => null }).platform);

    expect((await launcher.plan(target())).blocker?.code).toBe('BIN_NOT_FOUND');
  });

  it('creates a missing config root only when launching, and asks for sign-in', async () => {
    const fake = fakePlatform({ pathKind: () => 'missing' });
    const launcher = createLauncher(fake.platform);
    const b = profile({ cliConfigRoot: '/Users/test/new' });

    const plan = await launcher.plan(target({ profile: b }));
    expect(callsOf(fake, 'ensureDirectory')).toEqual([]);
    expect(plan.steps.some((step) => step.execution === 'manual' && /Đăng nhập/.test(step.label))).toBe(true);

    await launcher.launch(plan);
    expect(callsOf(fake, 'ensureDirectory')).toEqual([['/Users/test/new']]);
  });

  it('reports a failed Terminal launch', async () => {
    const launcher = createLauncher(fakePlatform({ openTerminal: async () => false }).platform);

    await expect(launcher.launch(await launcher.plan(target()))).rejects.toThrow(/Terminal/);
  });
});

describe('Codex CLI', () => {
  it('uses CODEX_HOME', async () => {
    const fake = fakePlatform();
    const launcher = createLauncher(fake.platform);
    const codex = profile({ provider: 'codex', cliConfigRoot: '/Users/test/codex-b' });

    await launcher.launch(await launcher.plan(target({ profile: codex })));

    expect(callsOf(fake, 'openTerminal')[0]?.[0]).toMatchObject({ executable: '/bin/codex', extraEnv: { CODEX_HOME: '/Users/test/codex-b' } });
  });
});

describe('Claude Desktop, main app', () => {
  it('asks the CLI to open the folder through a pty and only claims a request', async () => {
    const fake = fakePlatform();
    const launcher = createLauncher(fake.platform);

    const outcome = await launcher.launch(await launcher.plan(target({ mode: 'desktop' })));

    expect(callsOf(fake, 'runInPty')[0]?.slice(0, 2)).toEqual(['/bin/claude', ['--desktop']]);
    expect((callsOf(fake, 'runInPty')[0]?.[2] as RunOptions).cwd).toBe(PROJECT);
    expect(outcome.workspace).toBe('requested');
    expect(outcome.userActionRequired.join()).toContain('đúng folder');
  });

  it('warns when the CLI login is gone after opening Desktop', async () => {
    const fake = fakePlatform({ logins: [JSON.stringify({ loggedIn: true }), JSON.stringify({ loggedIn: false })] });
    const launcher = createLauncher(fake.platform);

    const outcome = await launcher.launch(await launcher.plan(target({ mode: 'desktop' })));

    expect(outcome.warnings.join()).toContain('mất đăng nhập');
  });

  it('does not run --desktop when the CLI is signed out, and falls back to manual', async () => {
    const fake = fakePlatform({ logins: [JSON.stringify({ loggedIn: false })] });
    const launcher = createLauncher(fake.platform);

    const outcome = await launcher.launch(await launcher.plan(target({ mode: 'desktop' })));

    expect(callsOf(fake, 'runInPty')).toEqual([]);
    expect(callsOf(fake, 'openApp')).toEqual([['com.anthropic.claudefordesktop']]);
    expect(outcome.workspace).toBe('manual');
  });

  it('falls back to manual when the CLI refuses', async () => {
    const fake = fakePlatform({ runInPty: async () => ({ ...ok(), exit: 1 }) });
    const launcher = createLauncher(fake.platform);

    const outcome = await launcher.launch(await launcher.plan(target({ mode: 'desktop' })));

    expect(outcome.workspace).toBe('manual');
    expect(outcome.warnings.join()).toContain('từ chối');
  });

  it('opens the app and asks for the folder when there is no CLI', async () => {
    const fake = fakePlatform({ findCli: async () => null });
    const launcher = createLauncher(fake.platform);

    const plan = await launcher.plan(target({ mode: 'desktop' }));
    const outcome = await launcher.launch(plan);

    expect(plan.blocker).toBeNull();
    expect(callsOf(fake, 'openApp')).toHaveLength(1);
    expect(outcome.workspace).toBe('manual');
  });

  it('warns that a profile without an instance does not change the account', async () => {
    const launcher = createLauncher(fakePlatform().platform);
    const b = profile({ cliConfigRoot: '/Users/test/b' });

    const plan = await launcher.plan(target({ mode: 'desktop', profile: b }));

    expect(plan.steps[0]?.warning).toContain('account đang đăng nhập');
  });

  it('blocks with APP_NOT_FOUND when the app is missing', async () => {
    const launcher = createLauncher(fakePlatform({ findApp: async () => null }).platform);

    expect((await launcher.plan(target({ mode: 'desktop' }))).blocker?.code).toBe('APP_NOT_FOUND');
  });
});

describe('Desktop instance (ADR-013, ADR-014)', () => {
  const claudeB = profile({ cliConfigRoot: '/Users/test/claude b', desktopDataDir: '/Users/test/claude desktop b' });
  const codexB = profile({ provider: 'codex', cliConfigRoot: '/Users/test/codex-b', desktopDataDir: '/Users/test/codex-desktop-b' });

  it('opens Claude with both directories and leaves the folder to the user', async () => {
    const fake = fakePlatform();
    const launcher = createLauncher(fake.platform);

    const outcome = await launcher.launch(await launcher.plan(target({ mode: 'desktop', profile: claudeB })));

    expect(callsOf(fake, 'openInstance')[0]?.[0]).toMatchObject({
      appName: 'Claude',
      envName: 'CLAUDE_CONFIG_DIR',
      envValue: '/Users/test/claude b',
      dataDir: '/Users/test/claude desktop b',
    });
    expect(callsOf(fake, 'runInPty')).toEqual([]);
    expect(outcome.workspace).toBe('manual');
    expect(JSON.stringify(outcome)).not.toMatch(/switched/i);
  });

  it('opens ChatGPT with CODEX_HOME', async () => {
    const fake = fakePlatform();
    const launcher = createLauncher(fake.platform);

    await launcher.launch(await launcher.plan(target({ mode: 'desktop', profile: codexB })));

    expect(callsOf(fake, 'openInstance')[0]?.[0]).toMatchObject({ appName: 'ChatGPT', envName: 'CODEX_HOME', envValue: '/Users/test/codex-b' });
  });

  it('needs a confirmation on a Desktop version without evidence', async () => {
    const launcher = createLauncher(fakePlatform({ findApp: async () => ({ ...CLAUDE_APP, version: '9.9.9' }) }).platform);

    const plan = await launcher.plan(target({ mode: 'desktop', profile: claudeB }));

    expect(plan.requiredConfirmations).toHaveLength(1);
    expect(plan.requiredConfirmations[0]?.label).toContain('9.9.9');
  });

  it('needs no confirmation on a version with evidence', async () => {
    const launcher = createLauncher(fakePlatform().platform);

    expect((await launcher.plan(target({ mode: 'desktop', profile: claudeB }))).requiredConfirmations).toEqual([]);
  });

  it.each([
    ['the main app', { pid: 1, dataDir: null }],
    ["another account's window", { pid: 1, dataDir: '/Users/test/other' }],
  ])('asks to quit %s before a first sign-in, and never quits it', async (_name, instance) => {
    const fake = fakePlatform({ runningInstances: async () => [instance], isEmptyDirectory: () => true });
    const launcher = createLauncher(fake.platform);

    const plan = await launcher.plan(target({ mode: 'desktop', profile: claudeB }));

    expect(plan.steps.some((step) => step.warning?.includes('tự tắt'))).toBe(true);
  });

  it('brings a window already open to the front, and starts no second process on its data', async () => {
    const fake = fakePlatform({
      runningInstances: async () => [
        { pid: 1, dataDir: null },
        { pid: 2, dataDir: '/Users/test/claude desktop b' },
      ],
    });
    const launcher = createLauncher(fake.platform);

    const outcome = await launcher.launch(await launcher.plan(target({ mode: 'desktop', profile: claudeB })));

    expect(callsOf(fake, 'openInstance')).toEqual([]);
    expect(callsOf(fake, 'focusProcess')).toEqual([[2]]);
    expect(outcome.warnings).toEqual([]);
  });

  it('still reports the launch when the window cannot be brought forward', async () => {
    const fake = fakePlatform({ runningInstances: async () => [{ pid: 2, dataDir: '/Users/test/claude desktop b' }], focusProcess: async () => false });
    const launcher = createLauncher(fake.platform);

    const outcome = await launcher.launch(await launcher.plan(target({ mode: 'desktop', profile: claudeB })));

    expect(outcome.appOpened).toBe(true);
    expect(outcome.warnings.join()).toContain('Dock');
  });
});

// macOS gives `open -b`, links and `claude --desktop` to the copy that started first (SPIKE-07).
describe('main app beside a window of another account', () => {
  const b = { pid: 2, dataDir: '/Users/test/claude desktop b' };
  const main = { pid: 3, dataDir: null };
  const a = profile();

  it.each([
    ['claude', 'Claude', CLAUDE_APP.executable],
    ['codex', 'ChatGPT', CHATGPT_APP.executable],
  ] as const)('starts the main %s app itself when only that other window runs', async (provider, appName, executable) => {
    const fake = fakePlatform({ runningInstances: async () => [b] });
    const launcher = createLauncher(fake.platform);

    const outcome = await launcher.launch(await launcher.plan(target({ mode: 'desktop', profile: profile({ provider }) })));

    expect(callsOf(fake, 'openDefaultInstance')[0]?.[0]).toMatchObject({ appName, executable });
    expect(callsOf(fake, 'runInPty')).toEqual([]);
    expect(callsOf(fake, 'openApp')).toEqual([]);
    expect(callsOf(fake, 'run').filter(([, args]) => (args as string[])[0] === 'app')).toEqual([]);
    expect(outcome).toMatchObject({ workspace: 'manual', sessionStarted: false });
    expect(outcome.userActionRequired[0]).toContain('folder');
    expect(outcome.warnings.join()).toContain('tự chọn folder');
  });

  it('brings the main app forward when it started after that other window', async () => {
    const fake = fakePlatform({ runningInstances: async () => [b, main] });
    const launcher = createLauncher(fake.platform);

    const outcome = await launcher.launch(await launcher.plan(target({ mode: 'desktop', profile: a })));

    expect(callsOf(fake, 'focusProcess')).toEqual([[3]]);
    expect(callsOf(fake, 'openDefaultInstance')).toEqual([]);
    expect(callsOf(fake, 'runInPty')).toEqual([]);
    expect(outcome.workspace).toBe('manual');
  });

  it('warns before the launch that the folder will not open by itself', async () => {
    const plan = await createLauncher(fakePlatform({ runningInstances: async () => [b] }).platform).plan(target({ mode: 'desktop', profile: a }));

    expect(plan.steps[0]?.warning).toContain('đi nhầm');
    expect(plan.steps.map((step) => step.execution)).toEqual(['conditional', 'manual', 'manual', 'manual']);
  });

  it('keeps the folder command when the main app started first', async () => {
    const fake = fakePlatform({ runningInstances: async () => [main, b] });
    const launcher = createLauncher(fake.platform);

    const outcome = await launcher.launch(await launcher.plan(target({ mode: 'desktop', profile: a })));

    expect(callsOf(fake, 'runInPty')).toHaveLength(1);
    expect(outcome.workspace).toBe('requested');
  });

  it('keeps the folder command when nothing is running', async () => {
    const fake = fakePlatform();
    const launcher = createLauncher(fake.platform);

    await launcher.launch(await launcher.plan(target({ mode: 'desktop', profile: a })));

    expect(callsOf(fake, 'runInPty')).toHaveLength(1);
    expect(callsOf(fake, 'openDefaultInstance')).toEqual([]);
  });

  it('fails clearly when the main app does not start', async () => {
    const launcher = createLauncher(fakePlatform({ runningInstances: async () => [b], openDefaultInstance: async () => false }).platform);

    await expect(launcher.launch(await launcher.plan(target({ mode: 'desktop', profile: a })))).rejects.toMatchObject({ code: 'LAUNCH_FAILED' });
  });
});

describe('an account opened without a project', () => {
  const claudeB = profile({ cliConfigRoot: '/Users/test/claude b', desktopDataDir: '/Users/test/claude desktop b' });
  const noFolder = (outcome: { userActionRequired: string[] }) => outcome.userActionRequired.every((item) => !item.includes('folder'));

  it('starts the CLI at home and never claims a project folder', async () => {
    const fake = fakePlatform();
    const launcher = createLauncher(fake.platform);

    const plan = await launcher.plan(target({ projectPath: null }));
    const outcome = await launcher.launch(plan);

    expect(callsOf(fake, 'openTerminal')[0]?.[0]).toMatchObject({ cwd: '/Users/test' });
    expect(plan.steps[0]?.label).toContain('thư mục home');
    expect(outcome.workspace).toBe('none');
  });

  it.each(['claude', 'codex'] as const)('just opens the main %s app, with no folder command', async (provider) => {
    const fake = fakePlatform();
    const launcher = createLauncher(fake.platform);

    const plan = await launcher.plan(target({ mode: 'desktop', projectPath: null, profile: profile({ provider }) }));
    const outcome = await launcher.launch(plan);

    expect(callsOf(fake, 'openApp')).toHaveLength(1);
    expect(callsOf(fake, 'runInPty')).toEqual([]);
    expect(callsOf(fake, 'run').filter(([, args]) => (args as string[])[0] === 'app')).toEqual([]);
    expect(plan.steps.some((step) => step.warning)).toBe(false);
    expect(noFolder(outcome)).toBe(true);
  });

  it('opens the window of the account and leaves no folder step', async () => {
    const fake = fakePlatform();
    const launcher = createLauncher(fake.platform);

    const outcome = await launcher.launch(await launcher.plan(target({ mode: 'desktop', projectPath: null, profile: claudeB })));

    expect(callsOf(fake, 'openInstance')).toHaveLength(1);
    expect(noFolder(outcome)).toBe(true);
  });

  it('still avoids the window of another account, but has nothing to warn about', async () => {
    const fake = fakePlatform({ runningInstances: async () => [{ pid: 2, dataDir: '/Users/test/claude desktop b' }] });
    const launcher = createLauncher(fake.platform);

    const plan = await launcher.plan(target({ mode: 'desktop', projectPath: null }));
    const outcome = await launcher.launch(plan);

    expect(callsOf(fake, 'openDefaultInstance')).toHaveLength(1);
    expect(callsOf(fake, 'openApp')).toEqual([]);
    expect(plan.steps.some((step) => step.warning)).toBe(false);
    expect(outcome.warnings).toEqual([]);
    expect(noFolder(outcome)).toBe(true);
  });
});

describe('Codex Desktop, main app', () => {
  it('uses codex app PATH and only claims a request', async () => {
    const fake = fakePlatform();
    const launcher = createLauncher(fake.platform);
    const codex = profile({ provider: 'codex' });

    const outcome = await launcher.launch(await launcher.plan(target({ mode: 'desktop', profile: codex })));

    expect(callsOf(fake, 'run').some((call) => JSON.stringify(call[1]) === JSON.stringify(['app', PROJECT]))).toBe(true);
    expect(outcome.workspace).toBe('requested');
  });
});

describe('status', () => {
  const codexServer = (account: unknown) =>
    fakeTool((message, tool) => {
      if (message['method'] === 'initialize') tool.send({ id: message['id'], result: {} });
      if (message['method'] === 'account/read') tool.send({ id: message['id'], result: { account } });
    });

  it('reads login and email for Claude', async () => {
    const status = await createLauncher(fakePlatform().platform).status(profile(), null);

    expect(status).toMatchObject({ login: 'logged_in', loginDetail: 'pro', accountEmail: 'a@example.com', desktopVersionHasEvidence: true });
    expect(status.accountFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports no email for a signed-out Claude profile', async () => {
    const fake = fakePlatform({ logins: [JSON.stringify({ loggedIn: false })] });

    const status = await createLauncher(fake.platform).status(profile(), null);

    expect(status).toMatchObject({ login: 'logged_out', accountEmail: null, accountFingerprint: null });
  });

  it('asks the Codex app server which account is signed in, then stops it', async () => {
    const tool = codexServer({ type: 'chatgpt', email: 'c@example.com', planType: 'team', workspaceName: 'Acme' });
    const fake = fakePlatform({ spawnTool: () => tool });

    const status = await createLauncher(fake.platform).status(profile({ provider: 'codex' }), null);

    expect(status).toMatchObject({ login: 'logged_in', accountEmail: 'c@example.com', loginDetail: 'team, Acme' });
    expect(status.accountFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(tool.killed()).toBe(true);
  });

  it('tells the same Codex email apart across workspaces', async () => {
    const read = async (workspaceName: string) => {
      const fake = fakePlatform({ spawnTool: () => codexServer({ type: 'chatgpt', email: 'c@example.com', planType: 'team', workspaceName }) });
      return (await createLauncher(fake.platform).status(profile({ provider: 'codex' }), null)).accountFingerprint;
    };

    expect(await read('Acme')).not.toBe(await read('Other'));
  });

  it('never claims to know the Codex account when the app server cannot say', async () => {
    for (const tool of [codexServer(null), codexServer({ type: 'apiKey' }), fakeTool((_message, handle) => handle.exit(1))]) {
      const fake = fakePlatform({ spawnTool: () => tool });

      const status = await createLauncher(fake.platform).status(profile({ provider: 'codex' }), null);

      expect(status).toMatchObject({ login: 'logged_in', loginDetail: 'ChatGPT', accountEmail: null, accountFingerprint: null });
    }
  });

  it('does not start the app server for a signed-out Codex profile', async () => {
    const fake = fakePlatform({
      run: async () => ok('Not logged in'),
    });

    await createLauncher(fake.platform).status(profile({ provider: 'codex' }), null);

    expect(callsOf(fake, 'spawnTool')).toEqual([]);
  });
});

describe('unsupported platform', () => {
  it('blocks every launch', async () => {
    const launcher = createLauncher(fakePlatform({ supported: false }).platform);

    expect((await launcher.plan(target())).blocker?.code).toBe('LAUNCH_UNSUPPORTED');
  });
});

describe('sign-in through Terminal, the fallback', () => {
  it('runs the official login in Terminal with the profile env', async () => {
    const fake = fakePlatform();
    const launcher = createLauncher(fake.platform);

    await launcher.openLogin(profile({ cliConfigRoot: '/Users/test/b' }), null);

    expect(callsOf(fake, 'ensureDirectory')).toEqual([['/Users/test/b']]);
    expect(callsOf(fake, 'openTerminal')[0]?.[0]).toMatchObject({
      executable: '/bin/claude',
      args: ['auth', 'login'],
      extraEnv: { CLAUDE_CONFIG_DIR: '/Users/test/b' },
    });
  });
});

describe('Claude sign-in', () => {
  const PAGE = 'https://claude.com/cai/oauth/authorize?state=x';
  const signedOut = JSON.stringify({ loggedIn: false });
  const signedInAs = (email: string) => JSON.stringify({ loggedIn: true, email, orgId: 'org' });

  function setup(url: string | null, logins: string[]) {
    const tool = fakeTool();
    const fake = fakePlatform({
      logins,
      spawnTool: (executable, args, options) => {
        fake.calls.push({ method: 'spawnTool', args: [executable, args, options] });
        return tool;
      },
      captureBrowserRequest: () => ({ command: '/tmp/capture', url: () => url, dispose: () => fake.calls.push({ method: 'dispose', args: [] }) }),
    });
    return { fake, tool, launcher: createLauncher(fake.platform) };
  }
  const b = profile({ cliConfigRoot: '/Users/test/b' });

  it('stands in for the browser and hands the page to AgentHub', async () => {
    const { fake, launcher } = setup(PAGE, [signedOut]);

    const login = await launcher.startLogin(b, null);

    expect(login?.url).toBe(PAGE);
    expect(callsOf(fake, 'ensureDirectory')).toEqual([['/Users/test/b']]);
    expect(callsOf(fake, 'spawnTool')[0]).toEqual([
      '/bin/claude',
      ['auth', 'login'],
      { cwd: '/Users/test/b', extraEnv: { CLAUDE_CONFIG_DIR: '/Users/test/b', BROWSER: '/tmp/capture' } },
    ]);
    expect(callsOf(fake, 'dispose')).toHaveLength(1);
    login?.cancel();
  });

  it('succeeds when the CLI exits cleanly and reports a login', async () => {
    const { tool, launcher } = setup(PAGE, [signedOut, signedInAs('b@example.com')]);

    const login = await launcher.startLogin(b, null);
    tool.exit(0);

    expect(await login?.completed).toBe(true);
  });

  it('fails when the CLI exits with an error', async () => {
    const { tool, launcher } = setup(PAGE, [signedOut]);

    const login = await launcher.startLogin(b, null);
    tool.exit(1);

    expect(await login?.completed).toBe(false);
  });

  it('notices a new login even if the CLI keeps waiting on its prompt', async () => {
    const { tool, launcher } = setup(PAGE, [signedInAs('old@example.com'), signedInAs('new@example.com')]);

    const login = await launcher.startLogin(b, null);

    expect(await login?.completed).toBe(true);
    expect(tool.killed()).toBe(true);
  });

  it('reports a cancelled login as not done', async () => {
    const { tool, launcher } = setup(PAGE, [signedOut]);

    const login = await launcher.startLogin(b, null);
    login?.cancel();

    expect(tool.killed()).toBe(true);
    expect(await login?.completed).toBe(false);
  });

  it('never opens an address outside the provider', async () => {
    for (const address of ['https://evil.example/claude.com', 'http://claude.com/x', 'https://claude.com.evil.example/', 'file:///etc/passwd']) {
      const { tool, launcher } = setup(address, [signedOut]);

      expect(await launcher.startLogin(b, null)).toBeNull();
      expect(tool.killed()).toBe(true);
    }
  });

  it('gives up when the CLI exits without asking for a browser', async () => {
    const { tool, launcher } = setup(null, [signedOut]);

    const started = launcher.startLogin(b, null);
    tool.exit(1);

    expect(await started).toBeNull();
  });

  it('gives up on a sign-in nobody finishes', async () => {
    const tool = fakeTool();
    const fake = fakePlatform({
      logins: [signedOut],
      spawnTool: () => tool,
      captureBrowserRequest: () => ({ command: '/tmp/capture', url: () => PAGE, dispose: () => undefined }),
    });

    const login = await createLauncher(fake.platform, { loginTimeoutMs: 5 }).startLogin(b, null);

    expect(await login?.completed).toBe(false);
    expect(tool.killed()).toBe(true);
  });

  it('reports a missing CLI', async () => {
    const launcher = createLauncher(fakePlatform({ findCli: async () => null }).platform);

    await expect(launcher.startLogin(b, null)).rejects.toMatchObject({ code: 'BIN_NOT_FOUND' });
  });
});

describe('Codex sign-in', () => {
  const PAGE = 'https://auth.openai.com/oauth/authorize?state=x';

  function server(authUrl: unknown = PAGE) {
    const methods: string[] = [];
    let send: (value: unknown) => void = () => undefined;
    const tool = fakeTool((message, handle) => {
      send = handle.send;
      methods.push(message['method'] as string);
      if (message['method'] === 'initialize') handle.send({ id: message['id'], result: {} });
      if (message['method'] === 'account/login/start') handle.send({ id: message['id'], result: { type: 'chatgpt', loginId: 'l', authUrl } });
    });
    return { tool, methods, notify: (params: unknown) => send({ method: 'account/login/completed', params }) };
  }

  const b = profile({ provider: 'codex', cliConfigRoot: '/Users/test/b' });

  it('gets the page from the app server, in the profile of the account', async () => {
    const { tool, methods } = server();
    const fake = fakePlatform({
      spawnTool: (executable, args, options) => {
        fake.calls.push({ method: 'spawnTool', args: [executable, args, options] });
        return tool;
      },
    });

    const login = await createLauncher(fake.platform).startLogin(b, null);

    expect(login?.url).toBe(PAGE);
    expect(methods).toEqual(['initialize', 'initialized', 'account/login/start']);
    expect(callsOf(fake, 'spawnTool')[0]).toEqual(['/bin/codex', ['app-server'], { cwd: '/Users/test/b', extraEnv: { CODEX_HOME: '/Users/test/b' } }]);
    login?.cancel();
  });

  it('reports what the app server says, and then stops it', async () => {
    for (const success of [true, false]) {
      const { tool, notify } = server();
      const login = await createLauncher(fakePlatform({ spawnTool: () => tool }).platform).startLogin(b, null);

      notify({ loginId: 'l', success });

      expect(await login?.completed).toBe(success);
      expect(tool.killed()).toBe(true);
    }
  });

  it('counts a server that dies as a failed login', async () => {
    const { tool } = server();
    const login = await createLauncher(fakePlatform({ spawnTool: () => tool }).platform).startLogin(b, null);

    tool.exit(1);

    expect(await login?.completed).toBe(false);
  });

  it('falls back when the server offers no usable page', async () => {
    for (const tool of [server('https://evil.example/').tool, server(42).tool, fakeTool((_message, handle) => handle.exit(1))]) {
      expect(await createLauncher(fakePlatform({ spawnTool: () => tool }).platform).startLogin(b, null)).toBeNull();
    }
  });
});

describe('usage limits (SPIKE-16)', () => {
  // Shape of Claude CLI 2.1.318 `-p /usage --output-format json`, with the figures changed.
  const claudeReply = (result: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 0, local_command: 'usage', result, ...extra });
  const CLAUDE_TEXT = [
    'You are currently using your subscription to power your Claude Code usage',
    '',
    'Current session: 19% used · resets Nov 4 at 8:19pm (Asia/Saigon)',
    'Current week (all models): 10% used · resets Nov 6 at 11:59pm (Asia/Saigon)',
    'Current week (Sonnet only): 104% used · resets Nov 6 at 11:59pm (Asia/Saigon)',
    '',
    "What's contributing to your usage?",
    '  62%  Start fresh when you switch tasks · run /clear',
  ].join('\n');

  it('reads only the limit lines of Claude /usage', () => {
    const report = parseClaudeUsage(claudeReply(CLAUDE_TEXT));

    expect(report.state).toBe('ok');
    expect(report.limitReached).toBe(true);
    expect(report.windows).toEqual([
      { kind: 'session', label: null, usedPercent: 19, windowMinutes: 300, resetsAt: null, resetsText: 'Nov 4 at 8:19pm (Asia/Saigon)' },
      { kind: 'weekly', label: null, usedPercent: 10, windowMinutes: 10080, resetsAt: null, resetsText: 'Nov 6 at 11:59pm (Asia/Saigon)' },
      { kind: 'other', label: 'Tuần, Sonnet only', usedPercent: 104, windowMinutes: 10080, resetsAt: null, resetsText: 'Nov 6 at 11:59pm (Asia/Saigon)' },
    ]);
  });

  it('says so, instead of showing zero, when Claude gives no figures', () => {
    for (const stdout of ['not json', claudeReply('Total cost: $0.0000'), claudeReply(CLAUDE_TEXT, { local_command: undefined }), claudeReply(CLAUDE_TEXT, { is_error: true })]) {
      const report = parseClaudeUsage(stdout);
      expect(report.state).toBe('unavailable');
      expect(report.windows).toEqual([]);
      expect(report.detail).not.toBeNull();
    }
  });

  it('maps the Codex windows and leaves out ids and reset credits', () => {
    const report = parseCodexUsage({
      accountId: 'acct-secret',
      ordinaryUsageAllowed: true,
      rateLimits: {
        limitId: 'codex',
        primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 1793804279 },
        secondary: { usedPercent: 7, windowDurationMins: 10080, resetsAt: 1794397350 },
        planType: 'team',
        rateLimitReachedType: null,
      },
      rateLimitsByLimitId: {
        codex: { limitId: 'codex' },
        other: { limitId: 'other', limitName: 'GPT-5 Pro', primary: { usedPercent: 3, windowDurationMins: 10080, resetsAt: null } },
      },
      rateLimitResetCredits: { availableCount: 3, credits: [{ id: 'RateLimitResetCredit_x' }] },
    });

    expect(report).toEqual({
      state: 'ok',
      plan: 'team',
      limitReached: false,
      detail: null,
      windows: [
        { kind: 'session', label: null, usedPercent: 42, windowMinutes: 300, resetsAt: '2026-11-04T14:57:59.000Z', resetsText: null },
        { kind: 'weekly', label: null, usedPercent: 7, windowMinutes: 10080, resetsAt: '2026-11-11T11:42:30.000Z', resetsText: null },
        { kind: 'other', label: 'GPT-5 Pro', usedPercent: 3, windowMinutes: 10080, resetsAt: null, resetsText: null },
      ],
    });
    expect(JSON.stringify(report)).not.toMatch(/acct-secret|RateLimitResetCredit/);
  });

  it('marks a Codex limit as reached on the backend flags, not only on percentages', () => {
    const base = { primary: { usedPercent: 60, windowDurationMins: 300, resetsAt: null } };
    expect(parseCodexUsage({ rateLimits: { ...base, rateLimitReachedType: 'rate_limit_reached' } }).limitReached).toBe(true);
    expect(parseCodexUsage({ ordinaryUsageAllowed: false, rateLimits: base }).limitReached).toBe(true);
    expect(parseCodexUsage({ rateLimits: base }).limitReached).toBe(false);
    expect(parseCodexUsage(null).state).toBe('unavailable');
  });

  it('runs Claude /usage in the profile of the account, with hooks and MCP servers off', async () => {
    const fake = fakePlatform({
      run: async (executable, args, options) => {
        fake.calls.push({ method: 'run', args: [executable, args, options] });
        if (args.join(' ') === 'auth status') return ok(JSON.stringify({ loggedIn: true, email: 'a@example.com' }));
        return ok(claudeReply(CLAUDE_TEXT));
      },
    });

    const report = await createLauncher(fake.platform).usage(profile({ cliConfigRoot: '/Users/test/b' }), null);

    expect(report.windows).toHaveLength(3);
    expect(callsOf(fake, 'run').at(-1)).toEqual([
      '/bin/claude',
      CLAUDE_USAGE_ARGS,
      { cwd: '/Users/test/b', extraEnv: { CLAUDE_CONFIG_DIR: '/Users/test/b' }, timeoutMs: 30_000 },
    ]);
    expect(CLAUDE_USAGE_ARGS).toEqual(expect.arrayContaining(['--no-session-persistence', '--strict-mcp-config']));
  });

  it('asks the Codex app server, then stops it', async () => {
    const methods: string[] = [];
    const tool = fakeTool((message, handle) => {
      methods.push(message['method'] as string);
      if (message['method'] === 'initialize') handle.send({ id: message['id'], result: {} });
      if (message['method'] === 'account/rateLimits/read') {
        handle.send({ id: message['id'], result: { rateLimits: { primary: { usedPercent: 5, windowDurationMins: 300, resetsAt: null } } } });
      }
    });

    const report = await createLauncher(fakePlatform({ spawnTool: () => tool }).platform).usage(profile({ provider: 'codex' }), null);

    expect(report.windows[0]).toMatchObject({ kind: 'session', usedPercent: 5 });
    expect(methods).toEqual(['initialize', 'initialized', 'account/rateLimits/read']);
    expect(tool.killed()).toBe(true);
  });

  it('starts nothing for a signed-out account or one whose folder does not exist yet', async () => {
    const signedOut = fakePlatform({ logins: [JSON.stringify({ loggedIn: false })] });
    expect((await createLauncher(signedOut.platform).usage(profile(), null)).state).toBe('logged_out');
    expect(callsOf(signedOut, 'run').map((args) => (args[1] as string[]).join(' '))).toEqual(['auth status']);

    const missing = fakePlatform({ pathKind: () => 'missing' });
    expect((await createLauncher(missing.platform).usage(profile({ cliConfigRoot: '/Users/test/new' }), null)).state).toBe('logged_out');
    expect(callsOf(missing, 'run')).toEqual([]);
    expect(callsOf(missing, 'spawnTool')).toEqual([]);
  });

  it('reports a missing CLI as unavailable', async () => {
    const report = await createLauncher(fakePlatform({ findCli: async () => null }).platform).usage(profile(), null);
    expect(report).toMatchObject({ state: 'unavailable', windows: [] });
  });
});
