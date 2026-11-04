import {
  type AccountProfile,
  type ClientMode,
  DomainError,
  type LaunchAttempt,
  type LaunchOutcome,
  type Provider,
  accountName,
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

// A long-running tool AgentHub talks to or waits for; stderr is dropped so nothing sensitive is kept.
export interface ToolProcess {
  onLine(listener: (line: string) => void): void;
  write(line: string): void;
  kill(): void;
  readonly exited: Promise<number | null>;
}

// Stands in for the browser a CLI would open, so AgentHub chooses where the page opens.
export interface BrowserCapture {
  command: string;
  url(): string | null;
  dispose(): void;
}

export type LoginBrowser = 'private' | 'normal';

// One running copy of a Desktop app; dataDir is null for the app's default data.
export interface AppInstance {
  pid: number;
  dataDir: string | null;
}

export interface PlatformPort {
  readonly supported: boolean;
  findCli(name: string, overridePath: string | null): Promise<string | null>;
  run(executable: string, args: string[], options?: RunOptions): Promise<RunResult>;
  runInPty(executable: string, args: string[], options?: RunOptions): Promise<RunResult>;
  spawnTool(executable: string, args: string[], options?: RunOptions): ToolProcess;
  captureBrowserRequest(): BrowserCapture;
  // The browser holding the private window, or null if none could open one (Safari has no way to ask).
  openPrivateWindow(url: string): Promise<string | null>;
  openInDefaultBrowser(url: string): Promise<boolean>;
  openTerminal(request: { executable: string; args: string[]; cwd: string; extraEnv: Record<string, string> }): Promise<boolean>;
  findApp(bundleName: string): Promise<InstalledApp | null>;
  openApp(bundleId: string): Promise<boolean>;
  openInstance(request: { appName: string; envName: string; envValue: string; dataDir: string; executable: string }): Promise<boolean>;
  // Starts the app on its default data beside other copies; only when that copy is not running.
  openDefaultInstance(request: { appName: string; executable: string }): Promise<boolean>;
  // Oldest first, which is also the copy macOS picks for `open -b` and links (SPIKE-07).
  runningInstances(executable: string): Promise<AppInstance[]>;
  focusProcess(pid: number): Promise<boolean>;
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
  // null opens the account on its own: the app without a folder, or Terminal at home.
  projectPath: string | null;
  cliOverride: string | null;
}

export interface ProfileStatus {
  cliPath: string | null;
  cliVersion: string | null;
  login: 'logged_in' | 'logged_out' | 'unknown';
  loginDetail: string | null;
  accountEmail: string | null;
  // Tells accounts apart when the same email sits in several organizations or workspaces.
  accountFingerprint: string | null;
  desktopInstalled: boolean;
  desktopVersion: string | null;
  desktopVersionHasEvidence: boolean;
}

// An official CLI waiting for the browser. Only the page address passes through AgentHub;
// the login itself and its tokens stay between the browser and the CLI (ADR-018).
export interface LoginProcess {
  url: string;
  completed: Promise<boolean>;
  cancel(): void;
}

// One usage limit as the provider's own CLI reports it (SPIKE-16). Only percentages and reset
// times cross this port: never tokens, account ids or what the usage was spent on.
export interface UsageWindow {
  kind: 'session' | 'weekly' | 'other';
  // The provider's own name for an 'other' limit, such as a model-specific week.
  label: string | null;
  // Above 100 once a limit is exceeded.
  usedPercent: number;
  windowMinutes: number | null;
  // ISO time when the provider gives a timestamp; otherwise its own wording in resetsText.
  resetsAt: string | null;
  resetsText: string | null;
}

export interface UsageReport {
  // 'unavailable': the CLI is missing, gave no figures (an API-key login, say), or answered in a
  // form this version does not know. The detail says which, so nothing reads as zero usage.
  state: 'ok' | 'logged_out' | 'unavailable';
  windows: UsageWindow[];
  plan: string | null;
  limitReached: boolean;
  detail: string | null;
}

export type UsageView = UsageReport & { checkedAt: string };

export interface Launcher {
  plan(target: LaunchTarget): Promise<LaunchPlan>;
  launch(plan: LaunchPlan): Promise<LaunchOutcome>;
  status(profile: AccountProfile, cliOverride: string | null): Promise<ProfileStatus>;
  // Asks the official CLI, read-only; it spends no tokens of the account (SPIKE-16).
  usage(profile: AccountProfile, cliOverride: string | null): Promise<UsageReport>;
  // Null when the CLI gave no page address, so the caller falls back to openLogin.
  startLogin(profile: AccountProfile, cliOverride: string | null): Promise<LoginProcess | null>;
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

// Opens an account without a task, the way clicking the app would.
export interface AccountLaunchRequest {
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

export type AccountSource = 'machine' | 'separate';

export interface MachineAccount {
  available: boolean;
  cliFound: boolean;
  login: ProfileStatus['login'];
  accountEmail: string | null;
  loginDetail: string | null;
}

export interface LoginState {
  phase: 'idle' | 'waiting' | 'succeeded' | 'failed' | 'terminal';
  privateBrowser: string | null;
}

const IDLE_LOGIN: LoginState = { phase: 'idle', privateBrowser: null };

const USAGE_FRESH_MS = 60_000;

export type LaunchService = ReturnType<typeof createLaunchService>;

interface ActiveLogin {
  profileId: string;
  url: string | null;
  process: LoginProcess | null;
  state: LoginState;
}

export function createLaunchService({ store, launcher, platform, paths, deviceId, newId, now, accountDirectories }: LaunchServiceDependencies) {
  // One at a time: a Codex login always listens on the same local port.
  let activeLogin: ActiveLogin | undefined;
  let loginRequest = 0;
  // Each read starts a CLI, and the sidebar and Settings both ask; kept in memory only.
  const usageCache = new Map<string, UsageView>();
  const usageReads = new Map<string, Promise<UsageView>>();

  function stopActiveLogin(): void {
    loginRequest += 1;
    activeLogin?.process?.cancel();
    activeLogin = undefined;
  }

  function waitingLogin(id: string): ActiveLogin {
    if (activeLogin?.profileId !== id || activeLogin.url === null || activeLogin.state.phase !== 'waiting') {
      throw new DomainError('LOGIN_NOT_ACTIVE', 'Không còn lượt đăng nhập nào đang chờ. Hãy bấm Đăng nhập lại.');
    }
    return activeLogin;
  }

  const cliOverride = (provider: Provider): string | null => store.settings.get(CLI_PATH_KEYS[provider]) || null;

  function requireProfile(id: string): AccountProfile {
    const profile = store.profiles.get(id);
    if (!profile) throw new DomainError('NOT_FOUND', 'Không tìm thấy account.');
    return profile;
  }

  function validated(input: ProfileInput, ownId?: string): ProfileInput {
    // Empty is allowed: the account then goes by its email.
    const alias = input.alias.trim() === '' ? '' : requireLabel(input.alias, 'Tên gợi nhớ');
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
      if (alias !== '' && other.alias === alias) throw invalid(`Đã có account tên "${alias}".`);
      if (other.provider === input.provider && (other.cliConfigRoot ?? '') === (cliConfigRoot ?? '')) {
        throw invalid(`Account "${accountName(other)}" đã dùng cấu hình CLI này.`);
      }
      if (desktopDataDir !== null && other.desktopDataDir !== null && isSamePath(other.desktopDataDir, desktopDataDir)) {
        throw invalid(`Account "${accountName(other)}" đã dùng thư mục dữ liệu Desktop này.`);
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
    return { plan, permission: permissionOf(project.id, profile.id), projectName: project.name, profileAlias: accountName(profile) };
  }

  function previewAccount(request: AccountLaunchRequest): Promise<LaunchPlan> {
    const profile = requireProfile(request.profileId);
    return launcher.plan({ profile, mode: request.mode, projectPath: null, cliOverride: cliOverride(profile.provider) });
  }

  return {
    listProfiles: (): AccountProfile[] => store.profiles.list(),

    createProfile(input: ProfileInput): AccountProfile {
      const profile: AccountProfile = { ...validated(input), accountEmail: null, id: newId(), createdAt: now() };
      store.profiles.insert(profile);
      return profile;
    },

    // What adding an account would pick up from this machine, so the user can choose first.
    async machineAccount(provider: Provider): Promise<MachineAccount> {
      const available = !store.profiles.list().some((profile) => profile.provider === provider && profile.cliConfigRoot === null);
      const machine: AccountProfile = {
        id: 'machine',
        provider,
        alias: '',
        accountEmail: null,
        cliConfigRoot: null,
        desktopDataDir: null,
        createdAt: now(),
      };
      const status = await launcher.status(machine, cliOverride(provider));
      return {
        available,
        cliFound: status.cliPath !== null,
        login: status.login,
        accountEmail: status.accountEmail,
        loginDetail: status.loginDetail,
      };
    },

    // 'machine' adopts the login this machine already has; 'separate' gets folders of its own,
    // so the new login cannot touch any other account.
    addAccount(input: { provider: Provider; source: AccountSource }): AccountProfile {
      const id = newId();
      const directories = input.source === 'separate' ? accountDirectories(id) : null;
      const profile: AccountProfile = {
        ...validated({
          provider: input.provider,
          alias: '',
          cliConfigRoot: directories?.cli ?? null,
          desktopDataDir: directories?.desktop ?? null,
        }),
        accountEmail: null,
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
      if (activeLogin?.profileId === id) stopActiveLogin();
      usageCache.delete(id);
      store.profiles.remove(id);
    },

    // A fresh read unless one from the last minute is at hand; `refresh` always asks again.
    async profileUsage(id: string, { refresh = false }: { refresh?: boolean } = {}): Promise<UsageView> {
      const profile = requireProfile(id);
      const cached = usageCache.get(id);
      if (!refresh && cached && Date.parse(now()) - Date.parse(cached.checkedAt) < USAGE_FRESH_MS) return cached;
      const pending = usageReads.get(id);
      if (pending) return pending;
      const read = launcher
        .usage(profile, cliOverride(profile.provider))
        .then((report): UsageView => {
          const view = { ...report, checkedAt: now() };
          if (store.profiles.get(id)) usageCache.set(id, view);
          return view;
        })
        .finally(() => usageReads.delete(id));
      usageReads.set(id, read);
      return read;
    },

    async profileStatus(id: string): Promise<ProfileStatusView> {
      const profile = requireProfile(id);
      const status = await launcher.status(profile, cliOverride(profile.provider));
      if (status.login === 'logged_in' && status.accountEmail !== null && status.accountEmail !== profile.accountEmail) {
        store.profiles.update({ ...profile, accountEmail: status.accountEmail });
      }
      const sameAccountAs: string[] = [];
      if (status.accountFingerprint !== null) {
        for (const other of store.profiles.list()) {
          if (other.id === profile.id || other.provider !== profile.provider) continue;
          const otherStatus = await launcher.status(other, cliOverride(other.provider));
          if (otherStatus.accountFingerprint === status.accountFingerprint) sameAccountAs.push(accountName(other));
        }
      }
      return { ...status, accountFingerprint: null, sameAccountAs };
    },

    // A private window by default: the browser's usual window would sign in with whichever
    // account it already holds, and offer no choice (SPIKE-01, SPIKE-08, ADR-018).
    async beginLogin(id: string): Promise<LoginState> {
      const profile = requireProfile(id);
      stopActiveLogin();
      // The figures belong to whichever account was signed in before.
      usageCache.delete(id);
      const request = loginRequest;
      const process = await launcher.startLogin(profile, cliOverride(profile.provider));
      if (request !== loginRequest) {
        process?.cancel();
        return IDLE_LOGIN;
      }
      if (!process) {
        await launcher.openLogin(profile, cliOverride(profile.provider));
        const state: LoginState = { phase: 'terminal', privateBrowser: null };
        activeLogin = { profileId: id, url: null, process: null, state };
        return state;
      }

      const login: ActiveLogin = { profileId: id, url: process.url, process, state: { phase: 'waiting', privateBrowser: null } };
      activeLogin = login;
      void process.completed.then((succeeded) => {
        login.state = { ...login.state, phase: succeeded ? 'succeeded' : 'failed' };
      });
      login.state = { ...login.state, privateBrowser: await platform.openPrivateWindow(process.url) };
      return login.state;
    },

    loginState: (id: string): LoginState => (activeLogin?.profileId === id ? activeLogin.state : IDLE_LOGIN),

    async reopenLogin(id: string, browser: LoginBrowser): Promise<LoginState> {
      const login = waitingLogin(id);
      const url = login.url as string;
      if (browser === 'normal') {
        if (!(await platform.openInDefaultBrowser(url))) throw new DomainError('LAUNCH_FAILED', 'Không mở được trình duyệt.');
      } else {
        login.state = { ...login.state, privateBrowser: await platform.openPrivateWindow(url) };
      }
      return login.state;
    },

    loginUrl: (id: string): string => waitingLogin(id).url as string,

    cancelLogin(id: string): void {
      if (activeLogin?.profileId === id) stopActiveLogin();
    },

    stopLogins: stopActiveLogin,

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
        throw new DomainError('PROFILE_NOT_ALLOWED', `Account "${accountName(profile)}" chưa được phép dùng project "${project.name}".`);
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
      return { ...(store.launches.get(attempt.id) as LaunchAttempt), profileAlias: accountName(profile) };
    },

    previewAccount,

    // No project means no source code to grant, so no permission check. History belongs to
    // tasks, so this launch leaves none.
    async openAccount(request: AccountLaunchRequest, confirmations: string[]): Promise<LaunchOutcome> {
      const plan = await previewAccount(request);
      if (plan.blocker) throw new DomainError(plan.blocker.code, plan.blocker.message);
      const missing = plan.requiredConfirmations.find((item) => !confirmations.includes(item.id));
      if (missing) throw new DomainError('CONFIRMATION_REQUIRED', missing.label);
      const outcome = await launcher.launch(plan);
      return { ...outcome, workspace: 'none' };
    },

    listLaunches(taskId: string): LaunchHistoryEntry[] {
      // Removed profiles keep their history, so aliases come from all rows the store can still name.
      const aliases = new Map(store.profiles.list().map((profile) => [profile.id, accountName(profile)]));
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
