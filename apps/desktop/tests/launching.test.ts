import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type LaunchService,
  type Launcher,
  type LoginProcess,
  type MetadataStore,
  type PlatformPort,
  type Workspace,
  createLaunchService,
  createWorkspace,
} from '@agenthub/application';
import { DomainError, type LaunchOutcome, accountName } from '@agenthub/domain';
import { openMetadataStore } from '@agenthub/persistence';
import { createMacPlatform, createPathInspector } from '@agenthub/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Real persistence with a scripted launcher: this tests the rules around a launch.
let root: string;
let projectDir: string;
let store: MetadataStore;
let workspace: Workspace;
let launching: LaunchService;
let launched: number;
let plan: Awaited<ReturnType<Launcher['plan']>>;
let launchResult: () => Promise<LaunchOutcome>;
const fingerprints = new Map<string, string | null>();
const emails = new Map<string, string>();
let loginProcesses: (LoginProcess | null)[] = [];
let terminalLogins = 0;
let browserOpens: [string, string][] = [];
let privateBrowser: string | null = 'Google Chrome';

function pendingLogin(url = 'https://claude.com/login'): LoginProcess & { finish: (succeeded: boolean) => void; cancelled: () => boolean } {
  let finish: (succeeded: boolean) => void = () => undefined;
  let cancelled = false;
  const completed = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  return {
    url,
    completed,
    cancel: () => {
      cancelled = true;
      finish(false);
    },
    finish: (succeeded) => finish(succeeded),
    cancelled: () => cancelled,
  };
}

const outcome: LaunchOutcome = { appOpened: true, workspace: 'opened', sessionStarted: false, userActionRequired: [], warnings: [] };

let plannedPaths: (string | null)[] = [];
let usageReads = 0;
let usagePercent = 10;
let clock = Date.parse('2026-11-04T10:00:00.000Z');

const launcher: Launcher = {
  plan: async (target) => {
    plannedPaths.push(target.projectPath);
    return plan;
  },
  launch: () => {
    launched += 1;
    return launchResult();
  },
  status: async (profile) => ({
    cliPath: '/bin/x',
    cliVersion: '1',
    login: 'logged_in',
    loginDetail: null,
    accountEmail: emails.get(profile.alias) ?? null,
    accountFingerprint: fingerprints.get(profile.alias) ?? null,
    desktopInstalled: true,
    desktopVersion: '1',
    desktopVersionHasEvidence: true,
  }),
  usage: async () => {
    usageReads += 1;
    const usedPercent = usagePercent;
    return {
      state: 'ok',
      windows: [{ kind: 'session', label: null, usedPercent, windowMinutes: 300, resetsAt: null, resetsText: null }],
      plan: null,
      limitReached: false,
      detail: null,
    };
  },
  startLogin: async () => loginProcesses.shift() ?? null,
  openLogin: async () => {
    terminalLogins += 1;
  },
};

function open(): void {
  store = openMetadataStore(join(root, 'agenthub.sqlite'));
  const paths = createPathInspector();
  const now = (): string => new Date().toISOString();
  workspace = createWorkspace({
    store,
    paths,
    defaultContextDirectory: (projectId) => join(root, 'projects', projectId, 'context'),
    ensureDirectory: (path) => mkdirSync(path, { recursive: true }),
    newId: randomUUID,
    now,
  });
  const platform: PlatformPort = {
    ...createMacPlatform(),
    openPrivateWindow: async (url) => {
      browserOpens.push(['private', url]);
      return privateBrowser;
    },
    openInDefaultBrowser: async (url) => {
      browserOpens.push(['normal', url]);
      return true;
    },
  };
  launching = createLaunchService({
    store,
    launcher,
    platform,
    paths,
    deviceId: () => workspace.getSettings().deviceId,
    newId: randomUUID,
    now: () => new Date(clock).toISOString(),
    accountDirectories: (id) => ({ cli: join(root, 'accounts', id, 'cli'), desktop: join(root, 'accounts', id, 'desktop') }),
  });
}

async function codeOf(action: () => unknown): Promise<string | undefined> {
  try {
    await action();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

const claudeProfile = (alias = 'A', cliConfigRoot: string | null = null, desktopDataDir: string | null = null) =>
  launching.createProfile({ provider: 'claude', alias, cliConfigRoot, desktopDataDir });

function context() {
  return { project: workspace.addProject({ path: projectDir }) };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agenthub-launching-'));
  projectDir = join(root, 'Dự án thử');
  mkdirSync(projectDir);
  launched = 0;
  plannedPaths = [];
  usageReads = 0;
  usagePercent = 10;
  clock = Date.parse('2026-11-04T10:00:00.000Z');
  plan = { steps: [{ label: 'Mở', execution: 'automatic' }], requiredConfirmations: [], blocker: null, action: { secret: 'command' } };
  launchResult = async () => outcome;
  fingerprints.clear();
  emails.clear();
  loginProcesses = [];
  terminalLogins = 0;
  browserOpens = [];
  privateBrowser = 'Google Chrome';
  open();
});

afterEach(() => {
  store.close();
  rmSync(root, { recursive: true, force: true });
});

describe('profiles', () => {
  it('keeps a profile across a restart, with no secret fields', () => {
    const profile = claudeProfile('Cá nhân', join(root, 'claude a'));

    store.close();
    open();

    expect(launching.listProfiles()).toEqual([profile]);
    expect(Object.keys(profile).sort()).toEqual(['accountEmail', 'alias', 'cliConfigRoot', 'createdAt', 'desktopDataDir', 'id', 'provider']);
  });

  it('supports two Claude profiles and an optional second Codex profile', () => {
    claudeProfile('A');
    claudeProfile('B', join(root, 'b'));
    launching.createProfile({ provider: 'codex', alias: 'Work', cliConfigRoot: null, desktopDataDir: null });
    launching.createProfile({ provider: 'codex', alias: 'Personal', cliConfigRoot: join(root, 'codex'), desktopDataDir: null });

    expect(launching.listProfiles()).toHaveLength(4);
  });

  it('rejects two profiles on the same config, which would share an account', async () => {
    claudeProfile('A');

    expect(await codeOf(() => claudeProfile('B'))).toBe('PROFILE_INVALID');

    claudeProfile('C', join(root, 'c'));
    expect(await codeOf(() => claudeProfile('D', join(root, 'c')))).toBe('PROFILE_INVALID');
  });

  it('rejects an instance without a config root, as ADR-013 requires both', async () => {
    expect(await codeOf(() => claudeProfile('B', null, join(root, 'data')))).toBe('PROFILE_INVALID');
  });

  it("rejects the app's default data directory for an instance", async () => {
    const home = process.env['HOME'] ?? '';
    const defaultDir = join(home, 'Library/Application Support/Claude');

    expect(await codeOf(() => claudeProfile('B', join(root, 'b'), defaultDir))).toBe('PROFILE_INVALID');
  });

  it('rejects relative paths and the same folder for both directories', async () => {
    expect(await codeOf(() => claudeProfile('B', 'relative/path'))).toBe('PROFILE_INVALID');
    expect(await codeOf(() => claudeProfile('C', join(root, 'x'), join(root, 'x')))).toBe('PROFILE_INVALID');
  });

  it('does not let a profile change provider', async () => {
    const profile = claudeProfile();

    expect(await codeOf(() => launching.updateProfile({ ...profile, provider: 'codex' }))).toBe('PROFILE_INVALID');
  });

  it('warns when two profiles report the same account, without exposing it', async () => {
    const a = claudeProfile('A');
    const b = claudeProfile('B', join(root, 'b'));
    emails.set('B', 'b@example.com');
    await launching.profileStatus(b.id);
    fingerprints.set('A', 'same');
    fingerprints.set('B', 'same');

    const status = await launching.profileStatus(a.id);

    expect(status.sameAccountAs).toEqual(['b@example.com']);
    expect(status.accountFingerprint).toBeNull();
  });
});

describe('adding an account', () => {
  it('adopts the machine login only when asked to, and without making up a name', () => {
    const account = launching.addAccount({ provider: 'claude', source: 'machine' });

    expect(account).toMatchObject({ provider: 'claude', alias: '', accountEmail: null, cliConfigRoot: null, desktopDataDir: null });
  });

  it('can add a separate account while the machine login is still unclaimed', async () => {
    const separate = launching.addAccount({ provider: 'claude', source: 'separate' });

    expect(separate.cliConfigRoot).toBe(join(root, 'accounts', separate.id, 'cli'));
    expect(separate.desktopDataDir).toBe(join(root, 'accounts', separate.id, 'desktop'));
    expect((await launching.machineAccount('claude')).available).toBe(true);
  });

  it('gives each separate account its own folders, so accounts never share a login', () => {
    const second = launching.addAccount({ provider: 'claude', source: 'separate' });
    const third = launching.addAccount({ provider: 'claude', source: 'separate' });

    expect(third.cliConfigRoot).not.toBe(second.cliConfigRoot);
  });

  it('refuses to adopt the machine login twice', async () => {
    launching.addAccount({ provider: 'claude', source: 'machine' });

    expect(await codeOf(() => launching.addAccount({ provider: 'claude', source: 'machine' }))).toBe('PROFILE_INVALID');
    expect((await launching.machineAccount('claude')).available).toBe(false);
  });

  it('tracks the machine login of Claude and Codex separately', async () => {
    launching.addAccount({ provider: 'claude', source: 'machine' });

    expect((await launching.machineAccount('codex')).available).toBe(true);
  });

  it('reports who the machine is signed in as', async () => {
    emails.set('', 'machine@example.com');

    expect(await launching.machineAccount('codex')).toMatchObject({ login: 'logged_in', accountEmail: 'machine@example.com', cliFound: true });
  });

  it('creates no folder until the account is used', () => {
    const second = launching.addAccount({ provider: 'claude', source: 'separate' });

    expect(createPathInspector().inspect(second.cliConfigRoot ?? '')).toBe('missing');
  });

  it('frees the machine login again after that account is removed', async () => {
    const first = launching.addAccount({ provider: 'codex', source: 'machine' });
    launching.removeProfile(first.id);

    expect((await launching.machineAccount('codex')).available).toBe(true);
  });
});

describe('account names', () => {
  it('learns the email from the CLI and keeps it across a restart', async () => {
    emails.set('', 'a@example.com');
    const account = launching.addAccount({ provider: 'claude', source: 'machine' });

    await launching.profileStatus(account.id);
    store.close();
    open();

    expect(launching.listProfiles()[0]?.accountEmail).toBe('a@example.com');
  });

  it('follows the CLI when a different account signs in', async () => {
    const account = launching.addAccount({ provider: 'claude', source: 'machine' });
    emails.set('', 'a@example.com');
    await launching.profileStatus(account.id);
    emails.set('', 'b@example.com');
    await launching.profileStatus(account.id);

    expect(launching.listProfiles()[0]?.accountEmail).toBe('b@example.com');
  });

  it('goes by the email alone, even with a nickname left from before', async () => {
    const account = launching.addAccount({ provider: 'claude', source: 'machine' });
    emails.set('', 'a@example.com');
    await launching.profileStatus(account.id);
    const input = { id: account.id, provider: 'claude' as const, cliConfigRoot: null, desktopDataDir: null };

    expect(accountName(launching.updateProfile({ ...input, alias: 'Công việc' }))).toBe('a@example.com');
  });

  it('never makes up a name for an account it knows nothing about', () => {
    expect(accountName(launching.addAccount({ provider: 'codex', source: 'machine' }))).toBe('Codex (chưa rõ account)');
  });

  it('lets several accounts go without a nickname', () => {
    launching.addAccount({ provider: 'claude', source: 'separate' });
    launching.addAccount({ provider: 'claude', source: 'separate' });

    expect(launching.listProfiles()).toHaveLength(2);
  });
});

describe('usage limits', () => {
  it('reads once a minute at most, unless asked to refresh', async () => {
    const account = launching.addAccount({ provider: 'claude', source: 'machine' });
    const first = await launching.profileUsage(account.id);
    usagePercent = 40;
    clock += 30_000;
    expect((await launching.profileUsage(account.id)).windows[0]?.usedPercent).toBe(10);
    expect(usageReads).toBe(1);

    expect((await launching.profileUsage(account.id, { refresh: true })).windows[0]?.usedPercent).toBe(40);
    clock += 61_000;
    await launching.profileUsage(account.id);
    expect(usageReads).toBe(3);
    expect(first.checkedAt).toBe('2026-11-04T10:00:00.000Z');
  });

  it('shares one read between callers asking at the same time', async () => {
    const account = launching.addAccount({ provider: 'claude', source: 'machine' });
    await Promise.all([launching.profileUsage(account.id), launching.profileUsage(account.id), launching.profileUsage(account.id)]);
    expect(usageReads).toBe(1);
  });

  it('forgets the figures when the account signs in again or is removed', async () => {
    const account = launching.addAccount({ provider: 'claude', source: 'machine' });
    await launching.profileUsage(account.id);
    await launching.beginLogin(account.id);
    await launching.profileUsage(account.id);
    expect(usageReads).toBe(2);

    launching.removeProfile(account.id);
    expect(await codeOf(() => launching.profileUsage(account.id))).toBe('NOT_FOUND');
  });
});

describe('signing in', () => {
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
  const account = () => launching.addAccount({ provider: 'claude', source: 'separate' });

  it('opens the page in a private window, so the browser cannot pick the account by itself', async () => {
    loginProcesses = [pendingLogin('https://claude.com/x')];

    const state = await launching.beginLogin(account().id);

    expect(state).toEqual({ phase: 'waiting', privateBrowser: 'Google Chrome' });
    expect(browserOpens).toEqual([['private', 'https://claude.com/x']]);
  });

  it('says so when no browser could open a private window', async () => {
    loginProcesses = [pendingLogin()];
    privateBrowser = null;

    expect(await launching.beginLogin(account().id)).toEqual({ phase: 'waiting', privateBrowser: null });
  });

  it('reports the result of the CLI', async () => {
    const done = pendingLogin();
    const failed = pendingLogin();
    loginProcesses = [done, failed];
    const first = account();
    const second = account();

    await launching.beginLogin(first.id);
    done.finish(true);
    await flush();
    expect(launching.loginState(first.id).phase).toBe('succeeded');

    await launching.beginLogin(second.id);
    failed.finish(false);
    await flush();
    expect(launching.loginState(second.id).phase).toBe('failed');
  });

  it('falls back to Terminal when the CLI hands over no page', async () => {
    loginProcesses = [null];
    const { id } = account();

    expect((await launching.beginLogin(id)).phase).toBe('terminal');
    expect(terminalLogins).toBe(1);
    expect(browserOpens).toEqual([]);
    expect(await codeOf(() => launching.loginUrl(id))).toBe('LOGIN_NOT_ACTIVE');
  });

  it('runs one sign-in at a time', async () => {
    const first = pendingLogin();
    loginProcesses = [first, pendingLogin()];
    const a = account();
    const b = account();

    await launching.beginLogin(a.id);
    await launching.beginLogin(b.id);

    expect(first.cancelled()).toBe(true);
    expect(launching.loginState(a.id).phase).toBe('idle');
    expect(launching.loginState(b.id).phase).toBe('waiting');
  });

  it('can reopen the page either way while waiting, and only then', async () => {
    loginProcesses = [pendingLogin('https://claude.com/x')];
    const { id } = account();
    expect(await codeOf(() => launching.reopenLogin(id, 'private'))).toBe('LOGIN_NOT_ACTIVE');

    await launching.beginLogin(id);
    await launching.reopenLogin(id, 'normal');
    await launching.reopenLogin(id, 'private');

    expect(browserOpens.map(([kind]) => kind)).toEqual(['private', 'normal', 'private']);
    expect(launching.loginUrl(id)).toBe('https://claude.com/x');
  });

  it('stops the CLI on cancel, on removing the account and on quitting', async () => {
    const cancelled = pendingLogin();
    const removed = pendingLogin();
    const quit = pendingLogin();
    loginProcesses = [cancelled, removed, quit];
    const { id } = account();

    await launching.beginLogin(id);
    launching.cancelLogin(id);
    expect(cancelled.cancelled()).toBe(true);
    expect(launching.loginState(id).phase).toBe('idle');

    await launching.beginLogin(id);
    launching.removeProfile(id);
    expect(removed.cancelled()).toBe(true);

    await launching.beginLogin(account().id);
    launching.stopLogins();
    expect(quit.cancelled()).toBe(true);
  });
});

describe('launch rules', () => {
  it('refuses until the project and profile pair is allowed', async () => {
    const { project } = context();
    const profile = claudeProfile();
    const request = { projectId: project.id, profileId: profile.id, mode: 'cli' } as const;

    expect((await launching.preview(request)).permission).toBe('unset');
    expect(await codeOf(() => launching.execute(request, []))).toBe('PROFILE_NOT_ALLOWED');

    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: false });
    expect((await launching.preview(request)).permission).toBe('denied');
    expect(await codeOf(() => launching.execute(request, []))).toBe('PROFILE_NOT_ALLOWED');

    expect(launched).toBe(0);
    expect(launching.listLaunches(project.id)).toEqual([]);
  });

  it('keeps a permission per project', async () => {
    const { project } = context();
    const profile = claudeProfile();
    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: true });

    const otherDir = join(root, 'other');
    mkdirSync(otherDir);
    const other = workspace.addProject({ path: otherDir });

    expect((await launching.preview({ projectId: project.id, profileId: profile.id, mode: 'cli' })).permission).toBe('allowed');
    expect((await launching.preview({ projectId: other.id, profileId: profile.id, mode: 'cli' })).permission).toBe('unset');
  });

  it('aborts when the project folder is gone', async () => {
    const { project } = context();
    const profile = claudeProfile();
    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: true });
    renameSync(projectDir, join(root, 'moved'));

    expect(await codeOf(() => launching.execute({ projectId: project.id, profileId: profile.id, mode: 'cli' }, []))).toBe('PROJECT_PATH_MISSING');
  });

  it('refuses when the plan is blocked', async () => {
    const { project } = context();
    const profile = claudeProfile();
    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: true });
    plan = { ...plan, blocker: { code: 'BIN_NOT_FOUND', message: 'x' } };

    expect(await codeOf(() => launching.execute({ projectId: project.id, profileId: profile.id, mode: 'cli' }, []))).toBe('BIN_NOT_FOUND');
    expect(launched).toBe(0);
  });

  it('requires every confirmation the plan asks for', async () => {
    const { project } = context();
    const profile = claudeProfile();
    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: true });
    plan = { ...plan, requiredConfirmations: [{ id: 'risky', label: 'Vẫn thử?' }] };
    const request = { projectId: project.id, profileId: profile.id, mode: 'desktop' } as const;

    expect(await codeOf(() => launching.execute(request, ['other']))).toBe('CONFIRMATION_REQUIRED');
    expect((await launching.execute(request, ['risky'])).status).toBe('launched');
  });
});

describe('opening an account without a project', () => {
  it('opens with no project and no permission, leaving no history', async () => {
    const { project } = context();
    const profile = claudeProfile();

    const opened = await launching.openAccount({ profileId: profile.id, mode: 'desktop' }, []);

    expect(plannedPaths).toEqual([null]);
    expect(launched).toBe(1);
    expect(opened.workspace).toBe('none');
    expect(launching.listLaunches(project.id)).toEqual([]);
  });

  it('still needs every confirmation and stops at a blocker', async () => {
    const profile = claudeProfile();
    plan = { ...plan, requiredConfirmations: [{ id: 'risky', label: 'Rủi ro' }] };
    expect(await codeOf(() => launching.openAccount({ profileId: profile.id, mode: 'desktop' }, []))).toBe('CONFIRMATION_REQUIRED');
    plan = { ...plan, requiredConfirmations: [], blocker: { code: 'APP_NOT_FOUND', message: 'Không có app' } };
    expect(await codeOf(() => launching.openAccount({ profileId: profile.id, mode: 'desktop' }, []))).toBe('APP_NOT_FOUND');
    expect(launched).toBe(0);
  });
});

describe('launch history', () => {
  function allowed() {
    const { project } = context();
    const profile = claudeProfile('Cá nhân');
    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: true });
    return { project, profile, request: { projectId: project.id, profileId: profile.id, mode: 'desktop' } as const };
  }

  it('records an attempt, unconfirmed, and keeps it across a restart', async () => {
    const { project, request } = allowed();

    const attempt = await launching.execute(request, []);

    expect(attempt).toMatchObject({ status: 'launched', accountConfirmedAt: null, profileAlias: 'Claude (chưa rõ account)', outcome });
    store.close();
    open();
    expect(launching.listLaunches(project.id).map((item) => item.id)).toEqual([attempt.id]);
  });

  it('marks an attempt with manual steps as manual_step, not launched', async () => {
    const { request } = allowed();
    launchResult = async () => ({ ...outcome, workspace: 'manual', userActionRequired: ['Chọn folder'] });

    expect((await launching.execute(request, [])).status).toBe('manual_step');
  });

  it('records a failed launch with its code', async () => {
    const { project, request } = allowed();
    launchResult = async () => {
      throw new DomainError('LAUNCH_FAILED', 'Không mở được.');
    };

    expect(await codeOf(() => launching.execute(request, []))).toBe('LAUNCH_FAILED');

    expect(launching.listLaunches(project.id)[0]).toMatchObject({ status: 'failed', errorCode: 'LAUNCH_FAILED', outcome: null });
  });

  it('records an account confirmation only when the user gives one', async () => {
    const { project, request } = allowed();
    const attempt = await launching.execute(request, []);

    launching.confirmAccount(attempt.id);

    expect(launching.listLaunches(project.id)[0]?.accountConfirmedAt).not.toBeNull();
  });

  it('keeps history after its profile is removed', async () => {
    const { project, profile, request } = allowed();
    await launching.execute(request, []);

    launching.removeProfile(profile.id);

    expect(launching.listProfiles()).toEqual([]);
    expect(launching.listLaunches(project.id)[0]?.profileAlias).toBe('Account đã gỡ');
  });
});
