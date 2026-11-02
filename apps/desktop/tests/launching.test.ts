import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type LaunchService,
  type Launcher,
  type MetadataStore,
  type PlatformPort,
  type Workspace,
  createLaunchService,
  createWorkspace,
} from '@agenthub/application';
import { DomainError, type LaunchOutcome } from '@agenthub/domain';
import { createContextStore, openMetadataStore } from '@agenthub/persistence';
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

const outcome: LaunchOutcome = { appOpened: true, workspace: 'opened', sessionStarted: false, userActionRequired: [], warnings: [] };

const launcher: Launcher = {
  plan: async () => plan,
  launch: () => {
    launched += 1;
    return launchResult();
  },
  status: async (profile) => ({
    cliPath: '/bin/x',
    cliVersion: '1',
    login: 'logged_in',
    loginDetail: null,
    accountFingerprint: fingerprints.get(profile.alias) ?? null,
    desktopInstalled: true,
    desktopVersion: '1',
    desktopVersionHasEvidence: true,
  }),
  openLogin: async () => undefined,
};

function open(): void {
  store = openMetadataStore(join(root, 'agenthub.sqlite'));
  const paths = createPathInspector();
  const now = (): string => new Date().toISOString();
  workspace = createWorkspace({ store, context: createContextStore(join(root, 'artifacts')), paths, newId: randomUUID, now });
  const platform: PlatformPort = createMacPlatform();
  launching = createLaunchService({
    store,
    launcher,
    platform,
    paths,
    deviceId: () => workspace.getSettings().deviceId,
    newId: randomUUID,
    now,
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
  const project = workspace.addProject({ path: projectDir });
  const task = workspace.createTask({ projectId: project.id, title: 'QA' });
  return { project, task };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agenthub-launching-'));
  projectDir = join(root, 'Dự án thử');
  mkdirSync(projectDir);
  launched = 0;
  plan = { steps: [{ label: 'Mở', execution: 'automatic' }], requiredConfirmations: [], blocker: null, action: { secret: 'command' } };
  launchResult = async () => outcome;
  fingerprints.clear();
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
    expect(Object.keys(profile).sort()).toEqual(['alias', 'cliConfigRoot', 'createdAt', 'desktopDataDir', 'id', 'provider']);
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
    claudeProfile('B', join(root, 'b'));
    fingerprints.set('A', 'same');
    fingerprints.set('B', 'same');

    const status = await launching.profileStatus(a.id);

    expect(status.sameAccountAs).toEqual(['B']);
    expect(status.accountFingerprint).toBeNull();
  });
});

describe('adding an account', () => {
  it('uses what the machine already has for the first account of a provider', () => {
    const account = launching.addAccount({ provider: 'claude' });

    expect(account).toMatchObject({ provider: 'claude', alias: 'Claude', cliConfigRoot: null, desktopDataDir: null });
  });

  it('gives each later account its own folders, so accounts never share a login', () => {
    launching.addAccount({ provider: 'claude' });

    const second = launching.addAccount({ provider: 'claude' });
    const third = launching.addAccount({ provider: 'claude' });

    expect(second.alias).toBe('Claude 2');
    expect(second.cliConfigRoot).toBe(join(root, 'accounts', second.id, 'cli'));
    expect(second.desktopDataDir).toBe(join(root, 'accounts', second.id, 'desktop'));
    expect(third.alias).toBe('Claude 3');
    expect(third.cliConfigRoot).not.toBe(second.cliConfigRoot);
  });

  it('counts Claude and Codex separately', () => {
    launching.addAccount({ provider: 'claude' });

    expect(launching.addAccount({ provider: 'codex' })).toMatchObject({ alias: 'Codex', cliConfigRoot: null });
  });

  it('creates no folder until the account is used', () => {
    launching.addAccount({ provider: 'claude' });
    const second = launching.addAccount({ provider: 'claude' });

    expect(createPathInspector().inspect(second.cliConfigRoot ?? '')).toBe('missing');
  });

  it('takes the default slot again after the default account is removed', () => {
    const first = launching.addAccount({ provider: 'codex' });
    launching.removeProfile(first.id);

    expect(launching.addAccount({ provider: 'codex' }).cliConfigRoot).toBeNull();
  });
});

describe('launch rules', () => {
  it('refuses until the project and profile pair is allowed', async () => {
    const { task, project } = context();
    const profile = claudeProfile();
    const request = { taskId: task.id, profileId: profile.id, mode: 'cli' } as const;

    expect((await launching.preview(request)).permission).toBe('unset');
    expect(await codeOf(() => launching.execute(request, []))).toBe('PROFILE_NOT_ALLOWED');

    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: false });
    expect((await launching.preview(request)).permission).toBe('denied');
    expect(await codeOf(() => launching.execute(request, []))).toBe('PROFILE_NOT_ALLOWED');

    expect(launched).toBe(0);
    expect(launching.listLaunches(task.id)).toEqual([]);
  });

  it('keeps a permission per project', async () => {
    const { project, task } = context();
    const profile = claudeProfile();
    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: true });

    const otherDir = join(root, 'other');
    mkdirSync(otherDir);
    const other = workspace.addProject({ path: otherDir });
    const otherTask = workspace.createTask({ projectId: other.id, title: 'x' });

    expect((await launching.preview({ taskId: task.id, profileId: profile.id, mode: 'cli' })).permission).toBe('allowed');
    expect((await launching.preview({ taskId: otherTask.id, profileId: profile.id, mode: 'cli' })).permission).toBe('unset');
  });

  it('aborts when the project folder is gone', async () => {
    const { project, task } = context();
    const profile = claudeProfile();
    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: true });
    renameSync(projectDir, join(root, 'moved'));

    expect(await codeOf(() => launching.execute({ taskId: task.id, profileId: profile.id, mode: 'cli' }, []))).toBe('PROJECT_PATH_MISSING');
  });

  it('refuses when the plan is blocked', async () => {
    const { project, task } = context();
    const profile = claudeProfile();
    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: true });
    plan = { ...plan, blocker: { code: 'BIN_NOT_FOUND', message: 'x' } };

    expect(await codeOf(() => launching.execute({ taskId: task.id, profileId: profile.id, mode: 'cli' }, []))).toBe('BIN_NOT_FOUND');
    expect(launched).toBe(0);
  });

  it('requires every confirmation the plan asks for', async () => {
    const { project, task } = context();
    const profile = claudeProfile();
    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: true });
    plan = { ...plan, requiredConfirmations: [{ id: 'risky', label: 'Vẫn thử?' }] };
    const request = { taskId: task.id, profileId: profile.id, mode: 'desktop' } as const;

    expect(await codeOf(() => launching.execute(request, ['other']))).toBe('CONFIRMATION_REQUIRED');
    expect((await launching.execute(request, ['risky'])).status).toBe('launched');
  });
});

describe('launch history', () => {
  function allowed() {
    const { project, task } = context();
    const profile = claudeProfile('Cá nhân');
    launching.setPermission({ projectId: project.id, profileId: profile.id, allowed: true });
    return { task, profile, request: { taskId: task.id, profileId: profile.id, mode: 'desktop' } as const };
  }

  it('records an attempt, unconfirmed, and keeps it across a restart', async () => {
    const { task, request } = allowed();

    const attempt = await launching.execute(request, []);

    expect(attempt).toMatchObject({ status: 'launched', accountConfirmedAt: null, profileAlias: 'Cá nhân', outcome });
    store.close();
    open();
    expect(launching.listLaunches(task.id).map((item) => item.id)).toEqual([attempt.id]);
  });

  it('marks an attempt with manual steps as manual_step, not launched', async () => {
    const { request } = allowed();
    launchResult = async () => ({ ...outcome, workspace: 'manual', userActionRequired: ['Chọn folder'] });

    expect((await launching.execute(request, [])).status).toBe('manual_step');
  });

  it('records a failed launch with its code', async () => {
    const { task, request } = allowed();
    launchResult = async () => {
      throw new DomainError('LAUNCH_FAILED', 'Không mở được.');
    };

    expect(await codeOf(() => launching.execute(request, []))).toBe('LAUNCH_FAILED');

    expect(launching.listLaunches(task.id)[0]).toMatchObject({ status: 'failed', errorCode: 'LAUNCH_FAILED', outcome: null });
  });

  it('records an account confirmation only when the user gives one', async () => {
    const { task, request } = allowed();
    const attempt = await launching.execute(request, []);

    launching.confirmAccount(attempt.id);

    expect(launching.listLaunches(task.id)[0]?.accountConfirmedAt).not.toBeNull();
  });

  it('keeps history after its profile is removed', async () => {
    const { task, profile, request } = allowed();
    await launching.execute(request, []);

    launching.removeProfile(profile.id);

    expect(launching.listProfiles()).toEqual([]);
    expect(launching.listLaunches(task.id)[0]?.profileAlias).toBe('Account đã gỡ');
  });
});
