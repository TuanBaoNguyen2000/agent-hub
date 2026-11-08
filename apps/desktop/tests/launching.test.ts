import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type GitObservation,
  type LaunchService,
  type LaunchTarget,
  type SessionLocation,
  type Launcher,
  type LoginProcess,
  type MetadataStore,
  type PlatformPort,
  type Workspace,
  createLaunchService,
  createWorkspace,
} from '@agenthub/application';
import { DomainError, type LaunchOutcome, type Message, accountName, raw } from '@agenthub/domain';
import { translate } from '@agenthub/i18n';

// What the user reads, in the language the E2E tests and these expectations use.
const text = (message: Message | undefined): string => (message ? translate('vi', message) : '');
import {
  appendHandoff,
  conflictingFiles,
  contextFiles,
  copyContextFiles,
  detectContext,
  isContextFolder,
  listContext,
  listNotes,
  makeContextFolder,
  moveNote,
  openMetadataStore,
  readContext,
  readContextOverview,
  readNote,
  saveNote,
  writeContext,
} from '@agenthub/persistence';
import { createMacPlatform, createPathInspector, createSkillInstaller, readSkillManifest } from '@agenthub/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const documentPorts = {
  overview: readContextOverview,
  detect: (path: string) => detectContext(path),
  files: contextFiles,
  conflicts: conflictingFiles,
  copy: copyContextFiles,
  list: (folder: string) => listContext(folder),
  read: readContext,
  write: writeContext,
  makeFolder: makeContextFolder,
  isContextFolder,
};

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
let plannedPrompts: (LaunchTarget['prompt'])[] = [];
// Which accounts have AgentHub's MCP server, and whether registering fails.
let mcpRegistered = new Set<string>();
// Registered with an older command, as after the shim moved.
let mcpOutdated = new Set<string>();
let mcpFails = false;
// Newest session per account config folder ('main' for the default one).
let sessionsByRoot = new Map<string, SessionLocation>();
let gitState: GitObservation = { state: 'not_repo', root: null, branch: null, head: null, headAt: null, dirty: null };
const gitObserver = { observe: async () => gitState };
const documents = { ...documentPorts, appendHandoff: (folder: string, ref: string, entry: string) => void appendHandoff(folder, ref, entry) };
let usageReads = 0;
let usagePercent = 10;
let clock = Date.parse('2026-11-04T10:00:00.000Z');

const launcher: Launcher = {
  plan: async (target) => {
    plannedPaths.push(target.projectPath);
    plannedPrompts.push(target.prompt);
    return plan;
  },
  skillsDirectory: (profile) => join(profile.cliConfigRoot ?? join(root, 'home', '.claude'), 'skills'),
  sharedSkillsDirectories: () => [join(root, 'home', '.agents', 'skills')],
  mcpRegistration: async (profile) => {
    const config = `${profile.id}/config`;
    if (mcpOutdated.has(profile.id)) return { pending: [config], registered: [config], problems: [] };
    return mcpRegistered.has(profile.id) ? { pending: [], registered: [config], problems: [] } : { pending: [config], registered: [], problems: [] };
  },
  registerMcp: async (profile, server) => {
    if (mcpFails) throw new DomainError('LAUNCH_FAILED', raw('Không đăng ký được MCP cho Claude: boom'));
    expect(server.args).toContain(`--account=${profile.id}`);
    mcpOutdated.delete(profile.id);
    mcpRegistered.add(profile.id);
  },
  unregisterMcp: async (profile) => {
    mcpOutdated.delete(profile.id);
    mcpRegistered.delete(profile.id);
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
    trash: async () => undefined,
    documents,
    git: gitObserver,
    notes: { list: (folder) => listNotes(folder), read: readNote, save: saveNote, move: moveNote },
    handoffDirectory: (projectId) => join(root, 'projects', projectId, 'handoffs'),
    looseChatDirectory: join(root, 'loose-chats'),
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
    // The skills that ship with the app, linked from a copy in the test's own data folder.
    skills: createSkillInstaller({ source: join(__dirname, '..', 'skills'), shared: join(root, 'data', 'skills') }),
    mcpServer: (profileId) => ({ command: join(root, 'bin', 'agenthub-mcp'), args: [`--account=${profileId}`, `--data=${root}`] }),
    readSkill: readSkillManifest,
    defaultContextDirectory: (projectId) => join(root, 'projects', projectId, 'context'),
    documents,
    git: gitObserver,
    notes: { list: (folder) => listNotes(folder), read: readNote, save: saveNote, move: moveNote },
    handoffDirectory: (projectId) => join(root, 'projects', projectId, 'handoffs'),
    sessions: { newest: (_provider, configRoot) => sessionsByRoot.get(configRoot ?? 'main') ?? null },
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
  plannedPrompts = [];
  mcpRegistered = new Set();
  mcpOutdated = new Set();
  mcpFails = false;
  sessionsByRoot = new Map();
  gitState = { state: 'not_repo', root: null, branch: null, head: null, headAt: null, dirty: null };
  usageReads = 0;
  usagePercent = 10;
  clock = Date.parse('2026-11-04T10:00:00.000Z');
  plan = { steps: [{ label: raw('Mở'), execution: 'automatic' }], requiredConfirmations: [], blocker: null, action: { secret: 'command' } };
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

    expect(status.sameAccountAs.map(text)).toEqual(['b@example.com']);
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

    expect(text(accountName(launching.updateProfile({ ...input, alias: 'Công việc' })))).toBe('a@example.com');
  });

  it('never makes up a name for an account it knows nothing about', () => {
    expect(text(accountName(launching.addAccount({ provider: 'codex', source: 'machine' })))).toBe('Codex (chưa rõ account)');
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
    plan = { ...plan, blocker: { code: 'BIN_NOT_FOUND', message: raw('x') } };

    expect(await codeOf(() => launching.execute({ projectId: project.id, profileId: profile.id, mode: 'cli' }, []))).toBe('BIN_NOT_FOUND');
    expect(launched).toBe(0);
  });

  it('requires every confirmation the plan asks for', async () => {
    const { project } = context();
    const profile = claudeProfile('A', join(root, 'a'));
    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: true });
    plan = { ...plan, requiredConfirmations: [{ id: 'risky', label: raw('Vẫn thử?') }] };
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
    plan = { ...plan, requiredConfirmations: [{ id: 'risky', label: raw('Rủi ro') }] };
    expect(await codeOf(() => launching.openAccount({ profileId: profile.id, mode: 'desktop' }, []))).toBe('CONFIRMATION_REQUIRED');
    plan = { ...plan, requiredConfirmations: [], blocker: { code: 'APP_NOT_FOUND', message: raw('Không có app') } };
    expect(await codeOf(() => launching.openAccount({ profileId: profile.id, mode: 'desktop' }, []))).toBe('APP_NOT_FOUND');
    expect(launched).toBe(0);
  });
});

describe('launch history', () => {
  function allowed() {
    const { project } = context();
    const profile = claudeProfile('Cá nhân', join(root, 'ca-nhan'));
    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: true });
    return { project, profile, request: { projectId: project.id, profileId: profile.id, mode: 'desktop' } as const };
  }

  it('records an attempt, unconfirmed, and keeps it across a restart', async () => {
    const { project, request } = allowed();

    const attempt = await launching.execute(request, []);

    expect(attempt).toMatchObject({ status: 'launched', accountConfirmedAt: null, outcome });
    expect(text(attempt.profileAlias)).toBe('Claude (chưa rõ account)');
    store.close();
    open();
    expect(launching.listLaunches(project.id).map((item) => item.id)).toEqual([attempt.id]);
  });

  it('marks an attempt with manual steps as manual_step, not launched', async () => {
    const { request } = allowed();
    launchResult = async () => ({ ...outcome, workspace: 'manual', userActionRequired: [raw('Chọn folder')] });

    expect((await launching.execute(request, [])).status).toBe('manual_step');
  });

  it('records a failed launch with its code', async () => {
    const { project, request } = allowed();
    launchResult = async () => {
      throw new DomainError('LAUNCH_FAILED', raw('Không mở được.'));
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
    expect(text(launching.listLaunches(project.id)[0]?.profileAlias)).toBe('Account đã gỡ');
  });
});

describe('opening with context documents (ADR-019, TDD §8.2)', () => {
  const SKILLS = ['context-capture', 'context-checkpoint', 'context-init', 'context-resume'];

  function allowedProject(cliConfigRoot: string | null = join(root, 'account-b')) {
    const project = workspace.addProject({ path: projectDir });
    const profile = claudeProfile('B', cliConfigRoot);
    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: true });
    return { project, profile, request: { projectId: project.id, profileId: profile.id, mode: 'cli' } as const };
  }

  it('without documents or a handoff, opens with no prompt but still gives the account its tools', async () => {
    const { profile, request } = allowedProject();

    const result = await launching.execute(request, []);

    expect(result.prompt).toBeNull();
    expect(plannedPrompts).toEqual([null]);
    // MCP is how a session of this project saves its handoff (§7.5).
    expect([...mcpRegistered]).toEqual([profile.id]);
    expect(existsSync(join(root, 'account-b', 'skills', 'context-checkpoint'))).toBe(true);
  });

  it('without documents, asks the next session to read the newest handoff, with access to its folder', async () => {
    const { project, request } = allowedProject();
    const folder = join(root, 'projects', project.id, 'handoffs');
    const older = saveNote(folder, { title: 'Cũ', content: 'a', source: 't', now: new Date('2026-11-04T00:00:00Z') });
    const newer = saveNote(folder, { title: 'Mới', content: 'b', source: 't', now: new Date('2026-11-05T00:00:00Z') });

    const result = await launching.execute(request, []);

    expect(result.prompt).toContain(`${folder}/${newer.id}.md`);
    expect(result.prompt).not.toContain(older.id);
    expect(plannedPrompts.at(-1)?.addDir).toBe(folder);
  });

  it('the main account installs nothing by itself: the plan only names what it lacks (ADR-020 item 1)', async () => {
    const { profile, request } = allowedProject(null);

    const preview = await launching.preview(request);
    expect(preview.plan.requiredConfirmations).toEqual([]);
    expect(preview.missingTools).toEqual({ skills: SKILLS, mcp: true });
    expect(preview.plan.steps.map((step) => text(step.warning)).join(' ')).toContain('Công cụ agent');
    const result = await launching.execute(request, []);

    expect(result.status).toBe('launched');
    expect(mcpRegistered.size).toBe(0);
    expect(existsSync(join(root, 'home', '.claude', 'skills'))).toBe(false);

    await launching.tools.setAutoInstall(profile.id, true);
    expect((await launching.preview(request)).missingTools).toBeNull();
    await launching.execute(request, []);
    expect(lstatSync(join(root, 'home', '.claude', 'skills', 'context-resume')).isSymbolicLink()).toBe(true);
    expect([...mcpRegistered]).toEqual([profile.id]);
  });

  it('a separate account installs by default, and can be told not to', async () => {
    const { profile, request } = allowedProject();
    await launching.tools.setAutoInstall(profile.id, false);
    store.close();
    open();

    const preview = await launching.preview(request);
    await launching.execute(request, []);

    expect(preview.missingTools).toEqual({ skills: SKILLS, mcp: true });
    expect(existsSync(join(root, 'account-b', 'skills'))).toBe(false);
  });

  it('says nothing about tools the account already has', async () => {
    const { profile, request } = allowedProject(null);
    await launching.tools.install(profile.id, { kind: 'mcp' });
    for (const name of SKILLS) await launching.tools.install(profile.id, { kind: 'skill', name });

    const preview = await launching.preview(request);

    expect(preview.missingTools).toBeNull();
    expect(preview.plan.steps.some((step) => text(step.warning).includes('Công cụ agent'))).toBe(false);
  });

  it('asks a new session to set up empty documents, in the project language, with access to the folder', async () => {
    const { project, request } = allowedProject();
    const folder = workspace.updateProjectContext({ id: project.id, enabled: true, language: 'vi' }).context.path;

    const preview = await launching.preview(request);
    const result = await launching.execute(request, []);

    expect(preview.prompt).toBe(result.prompt);
    expect(result.prompt).toContain('context-init');
    expect(result.prompt).toContain(folder);
    expect(result.prompt).toContain('Vietnamese');
    expect(result.prompt).not.toContain('Existing docs');
    expect(plannedPrompts.at(-1)).toEqual({ text: result.prompt, addDir: folder });
  });

  it('names notes the project already keeps in another shape, for context-init to link (ADR-020 item 4)', async () => {
    const { project, request } = allowedProject();
    mkdirSync(join(projectDir, 'Docs'));
    writeFileSync(join(projectDir, 'Docs', 'Continuity.md'), '# Continuity');
    writeFileSync(join(projectDir, 'AGENTS.md'), '# Agents');
    workspace.updateProjectContext({ id: project.id, enabled: true });

    const result = await launching.execute(request, []);

    expect(result.prompt).toContain('Existing docs in the project folder: AGENTS.md, Docs/Continuity.md — link and summarise them, do not copy them.');
  });

  it('writes the prompt in the chat language and asks for replies in it; the documents keep their own language (ADR-020 item 6)', async () => {
    const { project, request } = allowedProject();
    workspace.updateProjectContext({ id: project.id, enabled: true, language: 'en' });

    expect((await launching.preview(request)).prompt).toMatch(/^Use the context-init skill/);
    workspace.updateSettings({ chatLanguage: 'vi' });
    const vietnamese = (await launching.preview(request)).prompt ?? '';
    expect(vietnamese).toMatch(/^Dùng skill context-init\. /);
    expect(vietnamese).toContain('Viết bằng tiếng Anh');
    expect(vietnamese).toMatch(/Hãy trả lời tôi bằng tiếng Việt\.$/);

    workspace.updateProjectContext({ id: project.id, chatLanguage: 'ko', language: 'ko' });
    const korean = (await launching.preview(request)).prompt ?? '';
    expect(korean).toContain('context-init 스킬');
    expect(korean).toContain('한국어로 작성');
    expect(korean).toMatch(/한국어로 답해 주세요\.$/);
  });

  it('asks to resume once the documents exist, without --add-dir when they are inside the project', async () => {
    const { project, request } = allowedProject();
    const inside = join(projectDir, 'AgentContext');
    mkdirSync(inside);
    writeFileSync(join(inside, 'README.md'), '# Context');
    writeFileSync(join(inside, 'PROJECT_CONTEXT.md'), '# Project\n\nUnity 6, URP.\n');
    workspace.updateProjectContext({ id: project.id, enabled: true, customPath: inside });

    const result = await launching.execute(request, []);

    expect(result.prompt).toMatch(/^Use the context-resume skill\. Context documents: /);
    expect(plannedPrompts.at(-1)?.addDir).toBeNull();
  });

  it('asks an agent to fill the empty layout AgentHub wrote, and again when the user asks for it (ADR-023 item 2)', async () => {
    const { project, request } = allowedProject();
    workspace.createContext({ id: project.id, location: 'repo', language: 'en' });

    expect((await launching.execute(request, [])).prompt).toMatch(/^Use the context-init skill\. Context documents: .*AgentContext\. If AgentHub already wrote the empty layout/);

    writeFileSync(join(projectDir, 'AgentContext', 'PROJECT_CONTEXT.md'), '# Project\n\nUnity 6.\n');
    expect((await launching.execute(request, [])).prompt).toMatch(/^Use the context-resume skill/);
    expect((await launching.execute({ ...request, purpose: 'init' }, [])).prompt).toMatch(/^Use the context-init skill/);
  });

  it('links the four skills into the account it opens, and only that account', async () => {
    const { project, request } = allowedProject();
    workspace.updateProjectContext({ id: project.id, enabled: true });

    const preview = await launching.preview(request);
    expect(text(preview.plan.steps[0]?.label)).toContain('Cài skill');
    expect(preview.plan.requiredConfirmations).toEqual([]);
    await launching.execute(request, []);

    for (const name of SKILLS) expect(lstatSync(join(root, 'account-b', 'skills', name)).isSymbolicLink()).toBe(true);
    expect(existsSync(join(root, 'home', '.claude', 'skills'))).toBe(false);
    expect((await launching.preview(request)).plan.steps.some((step) => text(step.label).includes('Cài skill'))).toBe(false);
  });

  it('keeps the user\'s own skill of the same name, and warns about skills every account reads', async () => {
    const { project, request } = allowedProject();
    workspace.updateProjectContext({ id: project.id, enabled: true });
    mkdirSync(join(root, 'account-b', 'skills', 'context-resume'), { recursive: true });
    writeFileSync(join(root, 'account-b', 'skills', 'context-resume', 'SKILL.md'), 'mine');
    mkdirSync(join(root, 'home', '.agents', 'skills', 'context-init'), { recursive: true });

    const preview = await launching.preview(request);
    await launching.execute(request, []);

    const warnings = preview.plan.steps.map((step) => text(step.warning)).join(' ');
    expect(warnings).toContain('context-resume');
    expect(warnings).toContain('.agents');
    expect(lstatSync(join(root, 'account-b', 'skills', 'context-resume')).isSymbolicLink()).toBe(false);
  });

  it('stops when a chosen documents folder has gone', async () => {
    const { project, request } = allowedProject();
    const chosen = join(root, 'docs');
    mkdirSync(chosen);
    workspace.updateProjectContext({ id: project.id, enabled: true, customPath: chosen });
    rmSync(chosen, { recursive: true });

    expect(await codeOf(() => launching.execute(request, []))).toBe('PROJECT_PATH_MISSING');
    expect(launched).toBe(0);
  });

  it('registers AgentHub\'s MCP server for the account once, alongside the skills', async () => {
    const { project, profile, request } = allowedProject();
    workspace.updateProjectContext({ id: project.id, enabled: true });

    const preview = await launching.preview(request);
    expect(preview.plan.steps.some((step) => text(step.label).includes('MCP'))).toBe(true);
    await launching.execute(request, []);

    expect([...mcpRegistered]).toEqual([profile.id]);
    expect((await launching.preview(request)).plan.steps.some((step) => text(step.label).includes('MCP'))).toBe(false);
  });

  it('still opens when MCP cannot be registered, and says so', async () => {
    const { project, request } = allowedProject();
    workspace.updateProjectContext({ id: project.id, enabled: true });
    mcpFails = true;

    const result = await launching.execute(request, []);

    expect(result.status).toBe('launched');
    expect(result.outcome?.warnings.map(text).join()).toContain('boom');
  });

  it('asks the agent to fill in a task in an interactive session, never on its own (ADR-021 item 7)', async () => {
    const { project, request } = allowedProject();
    const folder = workspace.updateProjectContext({ id: project.id, enabled: true }).context.path;
    mkdirSync(join(folder, 'Workstreams', 'combo', 'Tasks'), { recursive: true });
    writeFileSync(join(folder, 'README.md'), '# Context');
    const ref = 'Workstreams/combo/Tasks/TASK-001-counter.md';
    writeFileSync(join(folder, ref), '# TASK-001\n## Handoff log\n');

    const result = await launching.execute({ ...request, taskRef: ref, purpose: 'refine' }, []);

    expect(result.prompt).toContain(`context-resume skill for TASK-001 (${ref})`);
    expect(result.prompt).toContain('write testable acceptance criteria');
    expect(result.taskRef).toBe(ref);
    expect(launched).toBe(1);
    expect(await codeOf(() => launching.preview({ ...request, purpose: 'refine' }))).toBe('VALIDATION_FAILED');
  });

  it('points the agent at the chosen task, records it, and reminds about commits newer than its handoff', async () => {
    const { project, request } = allowedProject();
    const folder = workspace.updateProjectContext({ id: project.id, enabled: true }).context.path;
    mkdirSync(join(folder, 'Workstreams', 'combo', 'Tasks'), { recursive: true });
    writeFileSync(join(folder, 'README.md'), '# Context');
    writeFileSync(join(folder, 'Workstreams', 'combo', 'STATUS.md'), '# Combo\n| Task | State |\n|---|---|\n| TASK-001 | in progress |\n');
    const ref = 'Workstreams/combo/Tasks/TASK-001-counter.md';
    writeFileSync(join(folder, ref), '# TASK-001\n## Handoff log\n### 2026-11-01 10:00 — A\n');
    gitState = { state: 'repo', root: projectDir, branch: 'main', head: 'abc', headAt: '2026-11-03T00:00:00.000Z', dirty: true };

    const preview = await launching.preview({ ...request, taskRef: ref });
    const result = await launching.execute({ ...request, taskRef: ref }, []);

    expect(result.prompt).toContain(`context-resume skill for TASK-001 (${ref})`);
    expect(result.taskRef).toBe(ref);
    expect(launching.listLaunches(project.id)[0]?.taskRef).toBe(ref);
    const warnings = preview.plan.steps.map((step) => text(step.warning)).join(' ');
    expect(warnings).toContain('commit mới hơn handoff');
    // Uncommitted changes concern the whole project and stay on the page, not in every launch.
    expect(warnings).not.toContain('chưa commit');
  });

  it('points the agent at a task under a workstream folder with another name', async () => {
    const { project, request } = allowedProject();
    const folder = workspace.updateProjectContext({ id: project.id, enabled: true }).context.path;
    const ref = 'Playables/playable005/Tasks/TASK-016-intro.md';
    mkdirSync(join(folder, 'Playables', 'playable005', 'Tasks'), { recursive: true });
    writeFileSync(join(folder, 'README.md'), '# Context');
    writeFileSync(join(folder, ref), '# TASK-016\n## Handoff log\n');

    const result = await launching.execute({ ...request, taskRef: ref }, []);

    expect(result.prompt).toContain(`context-resume skill for TASK-016 (${ref})`);
  });

  it('refuses a task that is not in the documents, or a task while the documents are off', async () => {
    const { project, request } = allowedProject();
    const ref = 'Workstreams/combo/Tasks/TASK-404.md';
    expect(await codeOf(() => launching.preview({ ...request, taskRef: ref }))).toBe('VALIDATION_FAILED');

    const folder = workspace.updateProjectContext({ id: project.id, enabled: true }).context.path;
    writeFileSync(join(folder, 'README.md'), '# Context');
    expect(await codeOf(() => launching.execute({ ...request, taskRef: ref }, []))).toBe('NOT_FOUND');
    expect(launched).toBe(0);
  });

  describe('fallback transcript (ADR-019 item 10)', () => {
    function withHandoff(at: string) {
      const { project, profile, request } = allowedProject();
      const folder = workspace.updateProjectContext({ id: project.id, enabled: true }).context.path;
      mkdirSync(join(folder, 'Workstreams', 'combo', 'Tasks'), { recursive: true });
      writeFileSync(join(folder, 'README.md'), '# Context');
      writeFileSync(join(folder, 'Workstreams', 'combo', 'Tasks', 'TASK-001-x.md'), `# TASK-001\n## Handoff log\n### ${at} — A\n`);
      return { project, profile, request };
    }
    const session = (path: string, updatedAt: string): SessionLocation => ({ path, cwd: projectDir, updatedAt });

    it('offers the newest session of an allowed account that went on after the last checkpoint', async () => {
      const { project, request } = withHandoff('2026-11-05 10:00');
      const codex = launching.createProfile({ provider: 'codex', alias: 'C', cliConfigRoot: join(root, 'codex-c'), desktopDataDir: null });
      launching.setPermission({ projectId: project.id, profileId: codex.id, allowed: true });
      const notAllowed = claudeProfile('X', join(root, 'x'));
      sessionsByRoot.set(join(root, 'codex-c'), session('/s/codex/rollout-1.jsonl', new Date(2026, 10, 5, 11, 0).toISOString()));
      sessionsByRoot.set(join(root, 'x'), session('/s/x/newer.jsonl', new Date(2026, 10, 5, 12, 0).toISOString()));
      expect(notAllowed.id).toBeTruthy();

      const offer = (await launching.preview(request)).transcript;

      expect(offer).toMatchObject({ path: '/s/codex/rollout-1.jsonl', provider: 'codex', otherAccount: true, otherProvider: true });
    });

    it('offers nothing when the session is not newer than the checkpoint, or there is no checkpoint at all', async () => {
      const { request } = withHandoff('2026-11-05 10:00');
      sessionsByRoot.set(join(root, 'account-b'), session('/s/b.jsonl', new Date(2026, 10, 5, 10, 0, 30).toISOString()));
      expect((await launching.preview(request)).transcript).toBeNull();

      const plainDir = join(root, 'plain');
      mkdirSync(plainDir);
      const plain = workspace.addProject({ path: plainDir });
      launching.setPermission({ projectId: plain.id, profileId: request.profileId, allowed: true });
      sessionsByRoot.set(join(root, 'account-b'), session('/s/b.jsonl', '2030-01-01T00:00:00.000Z'));
      expect((await launching.preview({ ...request, projectId: plain.id })).transcript).toBeNull();
    });

    it('only points the agent at the transcript once the user accepts, granting Claude its folder', async () => {
      const { request } = withHandoff('2026-11-05 10:00');
      sessionsByRoot.set(join(root, 'account-b'), session('/s/claude/proj/abc.jsonl', new Date(2026, 10, 5, 11, 0).toISOString()));

      const declined = await launching.execute(request, []);
      expect(declined.prompt).not.toContain('transcript');

      const accepted = await launching.execute({ ...request, useTranscript: true }, []);
      expect(accepted.prompt).toContain('Its transcript is /s/claude/proj/abc.jsonl');
      expect(accepted.prompt).toContain('tail -n 200');
      expect(accepted.prompt).toContain('context-checkpoint');
      expect(plannedPrompts.at(-1)?.readDirs).toEqual(['/s/claude/proj']);
    });

    it('asks a project without documents to save the missing handoff instead', async () => {
      const { project, request } = allowedProject();
      saveNote(join(root, 'projects', project.id, 'handoffs'), { title: 'h', content: 'x', source: 't', now: new Date('2026-11-05T03:00:00Z') });
      sessionsByRoot.set(join(root, 'account-b'), session('/s/b.jsonl', '2026-11-05T04:00:00.000Z'));

      const result = await launching.execute({ ...request, useTranscript: true }, []);

      expect(result.prompt).toContain('context_save_handoff');
    });
  });
});

describe('agent tools (ADR-020 item 1)', () => {
  const SKILLS = ['context-capture', 'context-checkpoint', 'context-init', 'context-resume'];

  function customSkill(name: string, folderName = name, base = join(root, 'my skills')): string {
    const folder = join(base, folderName);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'SKILL.md'), `---\nname: ${name}\ndescription: Một skill riêng.\n---\n# ${name}\n`);
    return folder;
  }

  it('lists the shipped skills and each account, with the main config off by default', async () => {
    const main = claudeProfile('Main');
    const separate = claudeProfile('B', join(root, 'account-b'));

    const view = await launching.tools.view();

    expect(view.skills.map((skill) => [skill.name, skill.kind])).toEqual(SKILLS.map((name) => [name, 'builtin']));
    expect(view.skills.every((skill) => (skill.description ?? '').length > 0)).toBe(true);
    const byId = new Map(view.accounts.map((account) => [account.profileId, account]));
    expect(byId.get(main.id)).toMatchObject({ mainConfig: true, autoInstall: false, mcp: 'missing' });
    expect(byId.get(separate.id)).toMatchObject({ mainConfig: false, autoInstall: true, skillsDirectory: join(root, 'account-b', 'skills') });
    expect(Object.values(byId.get(separate.id)?.skills ?? {})).toEqual(SKILLS.map(() => 'missing'));
    expect(view.leaked).toEqual([]);
  });

  it('installs and removes one tool for one account', async () => {
    const a = claudeProfile('A', join(root, 'account-a'));
    const b = claudeProfile('B', join(root, 'account-b'));

    let state = await launching.tools.install(a.id, { kind: 'skill', name: 'context-init' });
    expect(state.skills['context-init']).toBe('installed');
    expect(state.skills['context-resume']).toBe('missing');
    expect(existsSync(join(root, 'account-b', 'skills'))).toBe(false);

    state = await launching.tools.install(a.id, { kind: 'mcp' });
    expect(state.mcp).toBe('installed');
    expect([...mcpRegistered]).toEqual([a.id]);

    state = await launching.tools.uninstall(a.id, { kind: 'skill', name: 'context-init' });
    expect(state.skills['context-init']).toBe('missing');
    state = await launching.tools.uninstall(a.id, { kind: 'mcp' });
    expect(state.mcp).toBe('missing');
    expect((await launching.tools.account(b.id)).mcp).toBe('missing');
  });

  it('shows an outdated MCP entry as partial, and installing fixes it', async () => {
    const a = claudeProfile('A', join(root, 'account-a'));
    mcpOutdated.add(a.id);

    expect((await launching.tools.account(a.id)).mcp).toBe('partial');
    expect((await launching.tools.install(a.id, { kind: 'mcp' })).mcp).toBe('installed');
  });

  it("leaves the user's own skill of the same name alone, and names skills every account reads", async () => {
    const a = claudeProfile('A', join(root, 'account-a'));
    mkdirSync(join(root, 'account-a', 'skills', 'context-resume'), { recursive: true });
    writeFileSync(join(root, 'account-a', 'skills', 'context-resume', 'SKILL.md'), 'mine');
    mkdirSync(join(root, 'home', '.agents', 'skills', 'context-init'), { recursive: true });

    await launching.tools.uninstall(a.id, { kind: 'skill', name: 'context-resume' });
    await launching.tools.install(a.id, { kind: 'skill', name: 'context-resume' });

    const view = await launching.tools.view();
    expect(view.accounts[0]?.skills['context-resume']).toBe('foreign');
    expect(lstatSync(join(root, 'account-a', 'skills', 'context-resume')).isSymbolicLink()).toBe(false);
    expect(view.leaked).toEqual([{ directory: join(root, 'home', '.agents', 'skills'), names: ['context-init'] }]);
  });

  it('keeps the auto-install choice across a restart', async () => {
    const main = claudeProfile('Main');
    await launching.tools.setAutoInstall(main.id, true);
    store.close();
    open();
    expect((await launching.tools.account(main.id)).autoInstall).toBe(true);
  });

  it("adds a user's skill from a copy, installs it per account, and removes it from every account", async () => {
    const a = claudeProfile('A', join(root, 'account-a'));
    const b = claudeProfile('B', join(root, 'account-b'));
    const folder = customSkill('review-unity');

    const added = launching.tools.addSkill(folder);
    expect(added).toMatchObject({ name: 'review-unity', kind: 'custom', sourcePath: folder });
    // AgentHub works from its own copy, so the original may move.
    rmSync(folder, { recursive: true });
    await launching.tools.install(a.id, { kind: 'skill', name: 'review-unity' });
    await launching.tools.install(b.id, { kind: 'skill', name: 'review-unity' });
    expect((await launching.tools.view()).skills.at(-1)).toMatchObject({ name: 'review-unity', kind: 'custom', description: 'Một skill riêng.' });
    store.close();
    open();
    expect((await launching.tools.account(a.id)).skills['review-unity']).toBe('installed');

    launching.tools.removeSkill('review-unity');

    expect(existsSync(join(root, 'account-a', 'skills', 'review-unity'))).toBe(false);
    expect(existsSync(join(root, 'account-b', 'skills', 'review-unity'))).toBe(false);
    expect(existsSync(join(root, 'data', 'skills', 'review-unity'))).toBe(false);
    expect((await launching.tools.view()).skills.map((skill) => skill.name)).toEqual(SKILLS);
  });

  it('refuses an invalid skill, a taken name, and a skill from the folder every account reads', async () => {
    const invalid = join(root, 'my skills', 'broken');
    mkdirSync(invalid, { recursive: true });
    writeFileSync(join(invalid, 'SKILL.md'), '# no frontmatter');
    launching.tools.addSkill(customSkill('mine'));

    expect(await codeOf(() => launching.tools.addSkill(invalid))).toBe('SKILL_INVALID');
    expect(await codeOf(() => launching.tools.addSkill(customSkill('context-init')))).toBe('SKILL_EXISTS');
    expect(await codeOf(() => launching.tools.addSkill(customSkill('mine', 'mine', join(root, 'again'))))).toBe('SKILL_EXISTS');
    expect(await codeOf(() => launching.tools.addSkill(customSkill('shared', 'shared', join(root, 'home', '.agents', 'skills'))))).toBe('SKILL_INVALID');
    expect(await codeOf(() => launching.tools.removeSkill('context-init'))).toBe('NOT_FOUND');
  });

  it("opening with auto install adds only the shipped skills, not the user's own", async () => {
    const project = workspace.addProject({ path: projectDir });
    const profile = claudeProfile('B', join(root, 'account-b'));
    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: true });
    launching.tools.addSkill(customSkill('mine'));

    await launching.execute({ projectId: project.id, profileId: profile.id, mode: 'cli' }, []);

    const state = await launching.tools.account(profile.id);
    expect(SKILLS.map((name) => state.skills[name])).toEqual(SKILLS.map(() => 'installed'));
    expect(state.skills['mine']).toBe('missing');
  });
});
