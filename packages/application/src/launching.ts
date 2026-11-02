import {
  type AccountProfile,
  type ClientMode,
  DomainError,
  type LaunchAttempt,
  type LaunchOutcome,
  type Provider,
  isSamePath,
  requireLabel,
} from '@agenthub/domain';
import type { MetadataStore, PathInspector } from './index';

export const CLI_PATH_KEYS = { claude: 'cli_path_claude', codex: 'cli_path_codex' } as const;

// --- Platform port: everything that touches the OS. Env is always built from an allowlist. ---

export interface RunOptions {
  cwd?: string;
  extraEnv?: Record<string, string>;
  timeoutMs?: number;
}

export interface RunResult {
  exit: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  errorCode: string | null;
}

export interface InstalledApp {
  path: string;
  executable: string;
  version: string | null;
}

export interface PlatformPort {
  readonly supported: boolean;
  findCli(name: string, overridePath: string | null): Promise<string | null>;
  run(executable: string, args: string[], options?: RunOptions): Promise<RunResult>;
  runInPty(executable: string, args: string[], options?: RunOptions): Promise<RunResult>;
  openTerminal(request: { executable: string; args: string[]; cwd: string; extraEnv: Record<string, string> }): Promise<boolean>;
  findApp(bundleName: string): Promise<InstalledApp | null>;
  openApp(bundleId: string): Promise<boolean>;
  openInstance(request: { appName: string; envName: string; envValue: string; dataDir: string; executable: string }): Promise<boolean>;
  isInstanceRunning(executable: string, dataDir: string): Promise<boolean>;
  isDefaultInstanceRunning(executable: string): Promise<boolean>;
  defaultDesktopDataDirs(): string[];
  ensureDirectory(path: string): void;
  isEmptyDirectory(path: string): boolean;
  pathKind(path: string): 'directory' | 'file' | 'missing' | 'relative';
  homeDirectory(): string;
}

// --- Launcher port: provider knowledge lives behind this. ---

export type StepExecution = 'automatic' | 'conditional' | 'manual';

export interface PlannedStep {
  label: string;
  execution: StepExecution;
  warning?: string;
}

export interface RequiredConfirmation {
  id: string;
  label: string;
}

export interface LaunchPlan {
  steps: PlannedStep[];
  requiredConfirmations: RequiredConfirmation[];
  blocker: { code: 'BIN_NOT_FOUND' | 'APP_NOT_FOUND' | 'LAUNCH_UNSUPPORTED' | 'PROFILE_INVALID'; message: string } | null;
  // Opaque to this layer and never sent to the renderer.
  action: unknown;
}

export interface LaunchTarget {
  profile: AccountProfile;
  mode: ClientMode;
  projectPath: string;
  cliOverride: string | null;
}

export interface ProfileStatus {
  cliPath: string | null;
  cliVersion: string | null;
  login: 'logged_in' | 'logged_out' | 'unknown';
  loginDetail: string | null;
  // Compared from a hash; the identity itself never leaves the adapter.
  accountFingerprint: string | null;
  desktopInstalled: boolean;
  desktopVersion: string | null;
  desktopVersionHasEvidence: boolean;
}

export interface Launcher {
  plan(target: LaunchTarget): Promise<LaunchPlan>;
  launch(plan: LaunchPlan): Promise<LaunchOutcome>;
  status(profile: AccountProfile, cliOverride: string | null): Promise<ProfileStatus>;
  openLogin(profile: AccountProfile, cliOverride: string | null): Promise<void>;
}

// --- Use cases ---

export interface LaunchServiceDependencies {
  store: MetadataStore;
  launcher: Launcher;
  platform: PlatformPort;
  paths: PathInspector;
  deviceId: () => string;
  newId: () => string;
  now: () => string;
  // Where AgentHub keeps the folders of an extra account; the user never has to see them.
  accountDirectories: (accountId: string) => { cli: string; desktop: string };
}

export interface LaunchRequest {
  taskId: string;
  profileId: string;
  mode: ClientMode;
}

export type PermissionState = 'allowed' | 'denied' | 'unset';

export interface LaunchPreview {
  plan: LaunchPlan;
  permission: PermissionState;
  projectName: string;
  profileAlias: string;
}

export type LaunchHistoryEntry = LaunchAttempt & { profileAlias: string };

export interface ProfileInput {
  provider: Provider;
  alias: string;
  cliConfigRoot: string | null;
  desktopDataDir: string | null;
}

export type ProfileStatusView = ProfileStatus & { sameAccountAs: string[] };

export type LaunchService = ReturnType<typeof createLaunchService>;

const PROVIDER_LABELS: Record<Provider, string> = { claude: 'Claude', codex: 'Codex' };

export function createLaunchService({ store, launcher, platform, paths, deviceId, newId, now, accountDirectories }: LaunchServiceDependencies) {
  const cliOverride = (provider: Provider): string | null => store.settings.get(CLI_PATH_KEYS[provider]) || null;

  function requireProfile(id: string): AccountProfile {
    const profile = store.profiles.get(id);
    if (!profile) throw new DomainError('NOT_FOUND', 'Không tìm thấy account.');
    return profile;
  }

  function validated(input: ProfileInput, ownId?: string): ProfileInput {
    const alias = requireLabel(input.alias, 'Tên account');
    const { cliConfigRoot, desktopDataDir } = input;
    const invalid = (message: string): DomainError => new DomainError('PROFILE_INVALID', message);

    // ADR-013 and ADR-014: an instance needs both directories, or it shares config with the default account.
    if (desktopDataDir !== null && cliConfigRoot === null) {
      throw invalid('Cửa sổ Desktop riêng cần có cả thư mục cấu hình CLI.');
    }
    for (const path of [cliConfigRoot, desktopDataDir]) {
      if (path === null) continue;
      const kind = platform.pathKind(path);
      if (kind === 'relative') throw invalid('Đường dẫn phải là đường dẫn tuyệt đối.');
      if (kind === 'file') throw invalid('Đường dẫn này là một file, không phải thư mục.');
    }
    if (cliConfigRoot !== null && desktopDataDir !== null && isSamePath(cliConfigRoot, desktopDataDir)) {
      throw invalid('Thư mục cấu hình CLI và thư mục dữ liệu Desktop phải khác nhau.');
    }
    if (desktopDataDir !== null && platform.defaultDesktopDataDirs().some((path) => isSamePath(path, desktopDataDir))) {
      throw invalid('Không được dùng thư mục dữ liệu mặc định của app cho instance riêng.');
    }

    for (const other of store.profiles.list()) {
      if (other.id === ownId) continue;
      if (other.alias === alias) throw invalid(`Đã có account tên "${alias}".`);
      if (other.provider === input.provider && (other.cliConfigRoot ?? '') === (cliConfigRoot ?? '')) {
        throw invalid(`Account "${other.alias}" đã dùng cấu hình CLI này.`);
      }
      if (desktopDataDir !== null && other.desktopDataDir !== null && isSamePath(other.desktopDataDir, desktopDataDir)) {
        throw invalid(`Account "${other.alias}" đã dùng thư mục dữ liệu Desktop này.`);
      }
    }
    return { ...input, alias };
  }

  function requestContext(request: LaunchRequest) {
    const task = store.tasks.get(request.taskId);
    if (!task) throw new DomainError('NOT_FOUND', 'Không tìm thấy task.');
    const project = store.projects.get(task.projectId, deviceId());
    if (!project) throw new DomainError('NOT_FOUND', 'Không tìm thấy project.');
    if (project.path === null || paths.inspect(project.path) !== 'directory') {
      throw new DomainError('PROJECT_PATH_MISSING', 'Không tìm thấy folder của project. Hãy chọn lại folder trước.');
    }
    return { task, project: { ...project, path: project.path }, profile: requireProfile(request.profileId) };
  }

  function permissionOf(projectId: string, profileId: string): PermissionState {
    const allowed = store.permissions.get(projectId, profileId);
    if (allowed === undefined) return 'unset';
    return allowed ? 'allowed' : 'denied';
  }

  async function preview(request: LaunchRequest): Promise<LaunchPreview> {
    const { project, profile } = requestContext(request);
    const plan = await launcher.plan({
      profile,
      mode: request.mode,
      projectPath: project.path,
      cliOverride: cliOverride(profile.provider),
    });
    return { plan, permission: permissionOf(project.id, profile.id), projectName: project.name, profileAlias: profile.alias };
  }

  return {
    listProfiles: (): AccountProfile[] => store.profiles.list(),

    createProfile(input: ProfileInput): AccountProfile {
      const profile: AccountProfile = { ...validated(input), id: newId(), createdAt: now() };
      store.profiles.insert(profile);
      return profile;
    },

    // One step for the user: the first account of a provider is whatever the machine already
    // uses, and each later one gets folders of its own, so accounts can never share a login.
    addAccount(input: { provider: Provider }): AccountProfile {
      const existing = store.profiles.list().filter((profile) => profile.provider === input.provider);
      const label = PROVIDER_LABELS[input.provider];
      const taken = new Set(store.profiles.list().map((profile) => profile.alias));
      let alias = label;
      for (let number = 2; taken.has(alias); number += 1) alias = `${label} ${number}`;

      const id = newId();
      const usesDefault = !existing.some((profile) => profile.cliConfigRoot === null);
      const directories = usesDefault ? null : accountDirectories(id);
      const profile: AccountProfile = {
        ...validated({
          provider: input.provider,
          alias,
          cliConfigRoot: directories?.cli ?? null,
          desktopDataDir: directories?.desktop ?? null,
        }),
        id,
        createdAt: now(),
      };
      store.profiles.insert(profile);
      return profile;
    },

    updateProfile(input: { id: string } & ProfileInput): AccountProfile {
      const current = requireProfile(input.id);
      if (input.provider !== current.provider) {
        throw new DomainError('PROFILE_INVALID', 'Không đổi được loại của account đã tạo.');
      }
      const updated: AccountProfile = { ...current, ...validated(input, current.id) };
      store.profiles.update(updated);
      return updated;
    },

    // Only forgets the descriptor: the provider's own login and data stay where they are.
    removeProfile(id: string): void {
      requireProfile(id);
      store.profiles.remove(id);
    },

    async profileStatus(id: string): Promise<ProfileStatusView> {
      const profile = requireProfile(id);
      const status = await launcher.status(profile, cliOverride(profile.provider));
      const sameAccountAs: string[] = [];
      if (status.accountFingerprint !== null) {
        for (const other of store.profiles.list()) {
          if (other.id === profile.id || other.provider !== profile.provider) continue;
          const otherStatus = await launcher.status(other, cliOverride(other.provider));
          if (otherStatus.accountFingerprint === status.accountFingerprint) sameAccountAs.push(other.alias);
        }
      }
      return { ...status, accountFingerprint: null, sameAccountAs };
    },

    async openProfileLogin(id: string): Promise<void> {
      const profile = requireProfile(id);
      await launcher.openLogin(profile, cliOverride(profile.provider));
    },

    setPermission(input: { projectId: string; profileId: string; allowed: boolean }): void {
      if (!store.projects.get(input.projectId, deviceId())) throw new DomainError('NOT_FOUND', 'Không tìm thấy project.');
      requireProfile(input.profileId);
      store.permissions.set(input.projectId, input.profileId, input.allowed);
    },

    preview,

    async execute(request: LaunchRequest, confirmations: string[]): Promise<LaunchHistoryEntry> {
      const { task, project, profile } = requestContext(request);
      const { plan, permission } = await preview(request);

      if (permission !== 'allowed') {
        throw new DomainError('PROFILE_NOT_ALLOWED', `Account "${profile.alias}" chưa được phép dùng project "${project.name}".`);
      }
      if (plan.blocker) throw new DomainError(plan.blocker.code, plan.blocker.message);
      const missing = plan.requiredConfirmations.find((item) => !confirmations.includes(item.id));
      if (missing) throw new DomainError('CONFIRMATION_REQUIRED', missing.label);

      const attempt = {
        id: newId(),
        taskId: task.id,
        profileId: profile.id,
        mode: request.mode,
        status: 'planned' as const,
        createdAt: now(),
      };
      // Recorded first, so a crash during launch still leaves a trace.
      store.launches.insert(attempt);

      try {
        const outcome = await launcher.launch(plan);
        const status = outcome.userActionRequired.length > 0 ? 'manual_step' : 'launched';
        store.launches.finish(attempt.id, status, null, outcome);
      } catch (error) {
        const code = error instanceof DomainError ? error.code : 'LAUNCH_FAILED';
        store.launches.finish(attempt.id, 'failed', code, null);
        throw error;
      }
      return { ...(store.launches.get(attempt.id) as LaunchAttempt), profileAlias: profile.alias };
    },

    listLaunches(taskId: string): LaunchHistoryEntry[] {
      // Removed profiles keep their history, so aliases come from all rows the store can still name.
      const aliases = new Map(store.profiles.list().map((profile) => [profile.id, profile.alias]));
      return store.launches.list(taskId).map((attempt) => ({
        ...attempt,
        profileAlias: aliases.get(attempt.profileId) ?? 'Account đã gỡ',
      }));
    },

    confirmAccount(attemptId: string): void {
      if (!store.launches.get(attemptId)) throw new DomainError('NOT_FOUND', 'Không tìm thấy lần mở này.');
      store.launches.confirmAccount(attemptId, now());
    },
  };
}
