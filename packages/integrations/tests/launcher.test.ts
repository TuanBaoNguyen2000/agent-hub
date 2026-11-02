import type { InstalledApp, LaunchTarget, PlatformPort, RunOptions, RunResult } from '@agenthub/application';
import type { AccountProfile } from '@agenthub/domain';
import { describe, expect, it } from 'vitest';
import { createLauncher } from '../src/index';

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
    isInstanceRunning: async () => false,
    isDefaultInstanceRunning: async () => false,
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

  it('asks to quit the main app before a first sign-in, and never quits it', async () => {
    const fake = fakePlatform({ isDefaultInstanceRunning: async () => true, isEmptyDirectory: () => true });
    const launcher = createLauncher(fake.platform);

    const plan = await launcher.plan(target({ mode: 'desktop', profile: claudeB }));

    expect(plan.steps.some((step) => step.warning?.includes('tự tắt'))).toBe(true);
  });

  it('does not start a second process on a data directory already in use', async () => {
    const fake = fakePlatform({ isInstanceRunning: async () => true });
    const launcher = createLauncher(fake.platform);

    await launcher.launch(await launcher.plan(target({ mode: 'desktop', profile: claudeB })));

    expect(callsOf(fake, 'openInstance')).toEqual([]);
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
  it('reads login for Claude and gives a fingerprint, not an identity', async () => {
    const status = await createLauncher(fakePlatform().platform).status(profile(), null);

    expect(status).toMatchObject({ login: 'logged_in', loginDetail: 'pro', desktopVersionHasEvidence: true });
    expect(JSON.stringify(status)).not.toContain('example.com');
    expect(status.accountFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never claims to know the Codex account', async () => {
    const status = await createLauncher(fakePlatform().platform).status(profile({ provider: 'codex' }), null);

    expect(status).toMatchObject({ login: 'logged_in', loginDetail: 'ChatGPT', accountFingerprint: null });
  });
});

describe('unsupported platform', () => {
  it('blocks every launch', async () => {
    const launcher = createLauncher(fakePlatform({ supported: false }).platform);

    expect((await launcher.plan(target())).blocker?.code).toBe('LAUNCH_UNSUPPORTED');
  });
});

describe('sign-in', () => {
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
