import {
  type AccountProfile,
  CONTEXT_LANGUAGES,
  type ClientMode,
  DomainError,
  type LaunchAttempt,
  type LaunchOutcome,
  type Message,
  type Provider,
  accountName,
  isSamePath,
  msg,
  raw,
  requireLabel,
} from '@agenthub/domain';
import { type Locale, translate } from '@agenthub/i18n';
import { type MissingTools, type SkillInstaller, type SkillManifest, createAgentTools } from './agent-tools';
import { contextWarnings, findTask } from './context-view';
import type { ContextDocuments, GitObserver, MetadataStore, NoteStore, PathInspector, StoredProject } from './index';
import { chatLanguageOf, documentLanguageName, promptIn } from './languages';

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
  // Small config files only; null when the file does not exist.
  readTextFile(path: string): string | null;
  // Temp file and rename, so a crash never leaves half a config behind.
  writeTextFile(path: string, content: string): void;
  pathKind(path: string): 'directory' | 'file' | 'missing' | 'relative';
  homeDirectory(): string;
}

// --- Launcher port: provider knowledge lives behind this. ---

export type StepExecution = 'automatic' | 'conditional' | 'manual';

export interface PlannedStep {
  label: Message;
  execution: StepExecution;
  warning?: Message;
}

export interface RequiredConfirmation {
  id: string;
  label: Message;
}

export interface LaunchPlan {
  steps: PlannedStep[];
  requiredConfirmations: RequiredConfirmation[];
  blocker: { code: 'BIN_NOT_FOUND' | 'APP_NOT_FOUND' | 'LAUNCH_UNSUPPORTED' | 'PROFILE_INVALID'; message: Message } | null;
  // Opaque to this layer and never sent to the renderer.
  action: unknown;
}

// What the new session is asked first (TDD §8.2). A CLI takes it as its first prompt; a Desktop
// app cannot, so the user pastes it.
export interface LaunchPrompt {
  text: string;
  // The context folder when it lies outside the project, so the agent may read and write it.
  addDir: string | null;
  // Folders the agent only has to read, such as the one holding a transcript (SPIKE-15). Claude
  // needs them granted; Codex reads outside its workspace already.
  readDirs?: string[];
}

// --- Fallback transcript (ADR-019 item 10): only where a session file is, never what it says. ---

export interface SessionLocation {
  path: string;
  cwd: string;
  updatedAt: string;
}

export interface SessionLocator {
  // configRoot null means the provider's default folder.
  newest(provider: Provider, configRoot: string | null, folder: string): SessionLocation | null;
}

// Shown before opening, for the user to accept or not (§7.6).
export interface TranscriptOffer {
  path: string;
  updatedAt: string;
  sourceProfileId: string;
  sourceAccount: Message;
  provider: Provider;
  // Moving source code between accounts or providers needs the user's eyes (§8.3 item 3).
  otherAccount: boolean;
  otherProvider: boolean;
  checkpointAt: string;
}

export interface LaunchTarget {
  profile: AccountProfile;
  mode: ClientMode;
  // null opens the account on its own: the app without a folder, or Terminal at home.
  projectPath: string | null;
  cliOverride: string | null;
  prompt: LaunchPrompt | null;
}

export interface ProfileStatus {
  cliPath: string | null;
  cliVersion: string | null;
  login: 'logged_in' | 'logged_out' | 'unknown';
  loginDetail: Message | null;
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
  label: Message | null;
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
  detail: Message | null;
}

export type UsageView = UsageReport & { checkedAt: string };

// How a client starts AgentHub's MCP server for one account (SPIKE-10): the shim and its arguments.
export interface McpServerSpec {
  command: string;
  args: string[];
}

export interface McpRegistration {
  // Human names of the config files that need the server added or corrected; empty when done.
  pending: string[];
  // Config files that hold a server under AgentHub's name, current or not.
  registered: string[];
  // Why a config cannot be checked or changed, such as a missing CLI or an unreadable file.
  problems: Message[];
}

export interface Launcher {
  plan(target: LaunchTarget): Promise<LaunchPlan>;
  // Registered under the same name everywhere, as Claude Desktop prefers its own copy (SPIKE-12).
  mcpRegistration(profile: AccountProfile, server: McpServerSpec, cliOverride: string | null): Promise<McpRegistration>;
  registerMcp(profile: AccountProfile, server: McpServerSpec, cliOverride: string | null): Promise<void>;
  // Removes AgentHub's entry from every config of the account, and nothing else.
  unregisterMcp(profile: AccountProfile, cliOverride: string | null): Promise<void>;
  // Where the provider's CLI reads this account's own skills.
  skillsDirectory(profile: AccountProfile): string;
  // A folder the provider reads for every account, so AgentHub must never install there.
  sharedSkillsDirectories(): string[];
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
  skills: SkillInstaller;
  // null when the MCP shim is not available, for example in a test without one.
  mcpServer: (profileId: string) => McpServerSpec | null;
  // Checks a folder the user offers as a skill (Agent Skills format).
  readSkill: (folder: string) => SkillManifest;
  defaultContextDirectory: (projectId: string) => string;
  documents: ContextDocuments;
  git: GitObserver;
  notes: NoteStore;
  handoffDirectory: (projectId: string) => string;
  sessions: SessionLocator;
  deviceId: () => string;
  newId: () => string;
  now: () => string;
  // Where AgentHub keeps the folders of an extra account; the user never has to see them.
  accountDirectories: (accountId: string) => { cli: string; desktop: string };
  // The system's language, for prompts when the user chose none (ADR-020 item 6).
  defaultLocale?: Locale;
}

export interface LaunchRequest {
  projectId: string;
  // A task from the project's documents (ContextTask.ref); the agent is pointed at it.
  taskRef?: string | null | undefined;
  // The user accepted the transcript offer of the preview (§7.6).
  useTranscript?: boolean | undefined;
  // 'refine': the agent fills in the chosen task instead of resuming it (ADR-021 item 7).
  purpose?: 'refine' | 'init' | undefined;
  profileId: string;
  mode: ClientMode;
}

// Opens an account without a project, the way clicking the app would.
export interface AccountLaunchRequest {
  profileId: string;
  mode: ClientMode;
}

export type PermissionState = 'allowed' | 'denied' | 'unset';

export interface LaunchPreview {
  plan: LaunchPlan;
  permission: PermissionState;
  projectName: string;
  profileAlias: Message;
  prompt: string | null;
  transcript: TranscriptOffer | null;
  // The account opens without some tools, as it does not install them itself (ADR-020 item 1).
  missingTools: MissingTools | null;
}

export type LaunchHistoryEntry = LaunchAttempt & { profileAlias: Message };

// The prompt is only kept for this reply, so the UI can show and copy it.
export type LaunchResult = LaunchHistoryEntry & { prompt: string | null };


export const isInside = (child: string, parent: string): boolean => {
  const a = child.normalize('NFC').replace(/\/+$/, '');
  const b = parent.normalize('NFC').replace(/\/+$/, '');
  return a === b || a.startsWith(`${b}/`);
};

export interface ProfileInput {
  provider: Provider;
  alias: string;
  cliConfigRoot: string | null;
  desktopDataDir: string | null;
}

export type ProfileStatusView = ProfileStatus & { sameAccountAs: Message[] };

export type AccountSource = 'machine' | 'separate';

export interface MachineAccount {
  available: boolean;
  cliFound: boolean;
  login: ProfileStatus['login'];
  accountEmail: string | null;
  loginDetail: Message | null;
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

export function createLaunchService({
  store,
  launcher,
  platform,
  paths,
  skills,
  mcpServer,
  readSkill,
  defaultContextDirectory,
  documents,
  git,
  notes,
  handoffDirectory,
  sessions,
  deviceId,
  newId,
  now,
  accountDirectories,
  defaultLocale = 'en',
}: LaunchServiceDependencies) {
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
      throw new DomainError('LOGIN_NOT_ACTIVE', 'login.notActive');
    }
    return activeLogin;
  }

  const cliOverride = (provider: Provider): string | null => store.settings.get(CLI_PATH_KEYS[provider]) || null;

  const chatLocale = (project: StoredProject): Locale => chatLanguageOf(store, project, defaultLocale);

  const tools = createAgentTools({ store, launcher, skills, mcpServer, cliOverride, readSkill, isInside, newId, now });

  function requireProfile(id: string): AccountProfile {
    const profile = store.profiles.get(id);
    if (!profile) throw new DomainError('NOT_FOUND', 'error.accountNotFound');
    return profile;
  }

  function validated(input: ProfileInput, ownId?: string): ProfileInput {
    // Empty is allowed: the account then goes by its email.
    const alias = input.alias.trim() === '' ? '' : requireLabel(input.alias, 'field.alias');
    const { cliConfigRoot, desktopDataDir } = input;
    const invalid = (message: Message): DomainError => new DomainError('PROFILE_INVALID', message);

    // ADR-013 and ADR-014: an instance needs both directories, or it shares config with the default account.
    if (desktopDataDir !== null && cliConfigRoot === null) {
      throw invalid(msg('profile.instanceNeedsConfig'));
    }
    for (const path of [cliConfigRoot, desktopDataDir]) {
      if (path === null) continue;
      const kind = platform.pathKind(path);
      if (kind === 'relative') throw invalid(msg('profile.pathNotAbsolute'));
      if (kind === 'file') throw invalid(msg('profile.pathIsFile'));
    }
    if (cliConfigRoot !== null && desktopDataDir !== null && isSamePath(cliConfigRoot, desktopDataDir)) {
      throw invalid(msg('profile.sameFolders'));
    }
    if (desktopDataDir !== null && platform.defaultDesktopDataDirs().some((path) => isSamePath(path, desktopDataDir))) {
      throw invalid(msg('profile.defaultDataDir'));
    }

    for (const other of store.profiles.list()) {
      if (other.id === ownId) continue;
      if (alias !== '' && other.alias === alias) throw invalid(msg('profile.aliasTaken', { alias }));
      if (other.provider === input.provider && (other.cliConfigRoot ?? '') === (cliConfigRoot ?? '')) {
        throw invalid(msg('profile.configTaken', { account: accountName(other) }));
      }
      if (desktopDataDir !== null && other.desktopDataDir !== null && isSamePath(other.desktopDataDir, desktopDataDir)) {
        throw invalid(msg('profile.desktopDirTaken', { account: accountName(other) }));
      }
    }
    return { ...input, alias };
  }

  function requestContext(request: LaunchRequest) {
    const project = store.projects.get(request.projectId, deviceId());
    if (!project) throw new DomainError('NOT_FOUND', 'error.projectNotFound');
    if (project.path === null || paths.inspect(project.path) !== 'directory') {
      throw new DomainError('PROJECT_PATH_MISSING', 'error.projectFolderMissing');
    }
    return { project: { ...project, path: project.path }, profile: requireProfile(request.profileId) };
  }

  function permissionOf(projectId: string, profileId: string): PermissionState {
    const allowed = store.permissions.get(projectId, profileId);
    if (allowed === undefined) return 'unset';
    return allowed ? 'allowed' : 'denied';
  }

  // TDD §8.2. Tasks are not chosen in AgentHub yet, so the agent reads STATUS and asks.
  interface PromptPlan {
    prompt: LaunchPrompt;
    taskRef: string | null;
    // §8.3 item 5: remind about a checkpoint, never block.
    warnings: PlannedStep[];
  }

  async function promptFor(project: StoredProject & { path: string }, taskRef: string | null, purpose?: 'refine' | 'init'): Promise<PromptPlan | null> {
    if (!project.context.enabled) {
      if (taskRef) throw new DomainError('VALIDATION_FAILED', 'launch.noDocsNoTask');
      // §8.2: without documents, the newest saved handoff is the context.
      const folder = handoffDirectory(project.id);
      const latest = notes.list(folder)[0];
      if (!latest) return null;
      const file = `${folder}/${latest.id}.md`;
      const text = promptIn(chatLocale(project), 'prompt.handoff', { file });
      return { prompt: { text, addDir: isInside(folder, project.path) ? null : folder }, taskRef: null, warnings: [] };
    }
    const folder = project.contextPath ?? defaultContextDirectory(project.id);
    if (platform.pathKind(folder) !== 'directory') {
      throw new DomainError('PROJECT_PATH_MISSING', 'launch.docsFolderMissing');
    }
    const addDir = isInside(folder, project.path) ? null : folder;
    const locale = chatLocale(project);
    const language = documentLanguageName(CONTEXT_LANGUAGES.includes(project.context.language) ? project.context.language : 'en');
    const initialised = platform.pathKind(`${folder}/README.md`) === 'file';
    // ADR-023 item 2: an empty layout AgentHub wrote still needs context-init to fill it.
    if (!initialised || purpose === 'init' || (!taskRef && !documents.overview(folder).filled)) {
      if (taskRef && !initialised) throw new DomainError('NOT_FOUND', 'launch.docsNotCreated');
      // Notes the project already keeps in another shape are linked, not copied (ADR-020 item 4).
      const existing = documents.detect(project.path).others.filter((path) => !isInside(`${project.path}/${path}`, folder));
      const text = promptIn(locale, existing.length > 0 ? 'prompt.initWithDocs' : 'prompt.init', { folder, language, docs: existing.join(', ') });
      return { prompt: { text, addDir }, taskRef: null, warnings: [] };
    }
    if (!taskRef) {
      const text = promptIn(locale, 'prompt.resume', { folder });
      return { prompt: { text, addDir }, taskRef: null, warnings: [] };
    }
    const overview = documents.overview(folder);
    const found = findTask(overview, taskRef);
    if (!found) throw new DomainError('NOT_FOUND', 'launch.taskNotFound');
    const observation = await git.observe(project.path);
    const workstream = overview.workstreams.find((item) => item.tasks.includes(found.task));
    const warnings = contextWarnings(overview, observation, new Date(now()))
      .filter((warning) => warning.taskRef === taskRef || (warning.kind === 'branch_mismatch' && warning.workstream === workstream?.slug))
      .map((warning): PlannedStep => ({ label: msg('launch.step.checkContext'), execution: 'manual', warning: warning.message }));
    const text = promptIn(locale, purpose === 'refine' ? 'prompt.refineTask' : 'prompt.resumeTask', { task: found.task.id, ref: taskRef, folder });
    return { prompt: { text, addDir }, taskRef, warnings };
  }

  interface ContextSetup {
    skillsDirectory: string;
    // The shipped skills to link, when the account installs its tools by itself.
    installSkills: string[];
    mcp: McpServerSpec | null;
    steps: PlannedStep[];
    missing: MissingTools | null;
  }

  // An account set to install its tools gets the shipped skills and the MCP server when it opens
  // a project; any other account is only told what it lacks (ADR-020 item 1). The user's own
  // skills of the same name are left alone either way.
  async function contextSetup(profile: AccountProfile, mode: ClientMode): Promise<ContextSetup> {
    const directory = launcher.skillsDirectory(profile);
    const state = skills.inspect(directory, skills.builtin);
    const missingSkills = skills.builtin.filter((name) => state[name] === 'missing');
    const foreign = skills.builtin.filter((name) => state[name] === 'foreign');
    const auto = tools.autoInstallOf(profile);
    const steps: PlannedStep[] = [];
    if (foreign.length > 0) {
      steps.push({
        label: msg('launch.step.keepForeign'),
        execution: 'automatic',
        warning: msg('launch.warning.foreignSkills', { directory, names: foreign.join(', ') }),
      });
    }
    for (const leaked of tools.leaked()) {
      steps.push({
        label: msg('launch.step.checkSharedSkills'),
        execution: 'manual',
        warning: msg('tools.leaked', { directory: leaked.directory, names: leaked.names.join(', ') }),
      });
    }

    const server = mcpServer(profile.id);
    let mcpPending = false;
    if (server) {
      const registration = await launcher.mcpRegistration(profile, server, cliOverride(profile.provider));
      for (const problem of registration.problems) {
        steps.push({ label: msg('launch.step.registerMcpManual'), execution: 'manual', warning: msg('launch.warning.mcpProblem', { problem }) });
      }
      mcpPending = registration.pending.length > 0;
    }

    if (!auto) {
      const lacking = missingSkills.length > 0 || mcpPending;
      if (lacking) {
        const names = missingSkills.join(', ');
        const what =
          missingSkills.length > 0 && mcpPending
            ? msg('launch.lacking.both', { names })
            : missingSkills.length > 0
              ? msg('launch.lacking.skills', { names })
              : msg('launch.lacking.mcp');
        steps.push({ label: msg('launch.step.checkTools'), execution: 'manual', warning: msg('launch.warning.missingTools', { what }) });
      }
      return {
        skillsDirectory: directory,
        installSkills: [],
        mcp: null,
        steps,
        missing: lacking ? { skills: missingSkills, mcp: mcpPending } : null,
      };
    }

    if (missingSkills.length > 0) steps.push({ label: msg('launch.step.installSkills', { names: missingSkills.join(', ') }), execution: 'automatic' });
    if (mcpPending) {
      const desktopNote =
        mode === 'desktop' && profile.desktopDataDir !== null
          ? { warning: msg('launch.warning.restartDesktopForMcp') }
          : {};
      steps.push({ label: msg('launch.step.registerMcp'), execution: 'automatic', ...desktopNote });
    }
    return { skillsDirectory: directory, installSkills: missingSkills, mcp: mcpPending ? server : null, steps, missing: null };
  }

  // The newest checkpoint the documents or handoffs record: the selected task's, else any.
  function lastCheckpoint(project: StoredProject, taskRef: string | null): number | null {
    if (!project.context.enabled) {
      const newest = notes.list(handoffDirectory(project.id))[0];
      return newest ? Date.parse(newest.createdAt) : null;
    }
    const folder = project.contextPath ?? defaultContextDirectory(project.id);
    if (platform.pathKind(folder) !== 'directory') return null;
    const tasks = documents.overview(folder).workstreams.flatMap((workstream) => workstream.tasks);
    const times = tasks
      .filter((task) => taskRef === null || task.ref === taskRef)
      .map((task) => (task.lastHandoff?.at ? Date.parse(task.lastHandoff.at) : Number.NaN))
      .filter((time) => !Number.isNaN(time));
    return times.length > 0 ? Math.max(...times) : null;
  }

  // ADR-019 item 10: a session of this folder, in any account allowed here, that went on after
  // the last checkpoint. Without any checkpoint there is nothing to compare, so no offer.
  function transcriptOffer(project: StoredProject & { path: string }, target: AccountProfile, taskRef: string | null): TranscriptOffer | null {
    const checkpoint = lastCheckpoint(project, taskRef);
    if (checkpoint === null) return null;
    let best: { location: SessionLocation; profile: AccountProfile } | null = null;
    for (const candidate of store.profiles.list()) {
      if (store.permissions.get(project.id, candidate.id) !== true) continue;
      const location = sessions.newest(candidate.provider, candidate.cliConfigRoot, project.path);
      if (location && (!best || location.updatedAt > best.location.updatedAt)) best = { location, profile: candidate };
    }
    // A minute of slack: the checkpoint itself is written from inside that session.
    if (!best || Date.parse(best.location.updatedAt) <= checkpoint + 60_000) return null;
    return {
      path: best.location.path,
      updatedAt: best.location.updatedAt,
      sourceProfileId: best.profile.id,
      sourceAccount: accountName(best.profile),
      provider: best.profile.provider,
      otherAccount: best.profile.id !== target.id,
      otherProvider: best.profile.provider !== target.provider,
      checkpointAt: new Date(checkpoint).toISOString(),
    };
  }

  function withTranscript(prompt: LaunchPrompt, offer: TranscriptOffer, documentsOn: boolean, locale: Locale): LaunchPrompt {
    const params = {
      provider: offer.provider === 'claude' ? 'Claude' : 'Codex',
      account: offer.sourceAccount,
      at: offer.updatedAt,
      path: offer.path,
      write: msg(documentsOn ? 'prompt.transcript.writeCheckpoint' : 'prompt.transcript.saveHandoff'),
    };
    const text = `${prompt.text} ${translate(locale, 'prompt.transcript', params)}`;
    const folder = offer.path.slice(0, offer.path.lastIndexOf('/'));
    return { ...prompt, text, readDirs: [...(prompt.readDirs ?? []), folder] };
  }

  async function preparedPlan(request: LaunchRequest) {
    const { project, profile } = requestContext(request);
    if (request.purpose === 'refine' && !request.taskRef) throw new DomainError('VALIDATION_FAILED', 'launch.refineNeedsTask');
    const promptPlan = await promptFor(project, request.taskRef ?? null, request.purpose);
    const offer = promptPlan ? transcriptOffer(project, profile, promptPlan.taskRef) : null;
    const prompt =
      promptPlan && offer && request.useTranscript
        ? withTranscript(promptPlan.prompt, offer, project.context.enabled, chatLocale(project))
        : (promptPlan?.prompt ?? null);
    const plan = await launcher.plan({
      profile,
      mode: request.mode,
      projectPath: project.path,
      cliOverride: cliOverride(profile.provider),
      prompt,
    });
    // Every project gets the tools: without documents, MCP is how a session saves its handoff.
    const setup = !plan.blocker ? await contextSetup(profile, request.mode) : null;
    const merged: LaunchPlan = {
      ...plan,
      steps: [...(promptPlan?.warnings ?? []), ...(setup?.steps ?? []), ...plan.steps],
    };
    return { project, profile, prompt, taskRef: promptPlan?.taskRef ?? null, plan: merged, setup, offer };
  }

  async function preview(request: LaunchRequest): Promise<LaunchPreview> {
    const { project, profile, prompt, plan, offer, setup } = await preparedPlan(request);
    return {
      plan,
      permission: permissionOf(project.id, profile.id),
      projectName: project.name,
      profileAlias: accountName(profile),
      prompt: prompt?.text ?? null,
      transcript: offer,
      missingTools: setup?.missing ?? null,
    };
  }

  function previewAccount(request: AccountLaunchRequest): Promise<LaunchPlan> {
    const profile = requireProfile(request.profileId);
    return launcher.plan({ profile, mode: request.mode, projectPath: null, cliOverride: cliOverride(profile.provider), prompt: null });
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
        throw new DomainError('PROFILE_INVALID', 'profile.providerFixed');
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
      const sameAccountAs: Message[] = [];
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
        if (!(await platform.openInDefaultBrowser(url))) throw new DomainError('LAUNCH_FAILED', 'login.browserFailed');
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
      if (!store.projects.get(input.projectId, deviceId())) throw new DomainError('NOT_FOUND', 'error.projectNotFound');
      requireProfile(input.profileId);
      store.permissions.set(input.projectId, input.profileId, input.allowed);
    },

    preview,

    async execute(request: LaunchRequest, confirmations: string[]): Promise<LaunchResult> {
      const { project, profile, plan, prompt, taskRef, setup } = await preparedPlan(request);
      const permission = permissionOf(project.id, profile.id);

      if (permission !== 'allowed') {
        throw new DomainError('PROFILE_NOT_ALLOWED', 'launch.notAllowed', { account: accountName(profile), project: project.name });
      }
      if (plan.blocker) throw new DomainError(plan.blocker.code, plan.blocker.message);
      const missing = plan.requiredConfirmations.find((item) => !confirmations.includes(item.id));
      if (missing) throw new DomainError('CONFIRMATION_REQUIRED', missing.label);

      const attempt = {
        id: newId(),
        projectId: project.id,
        taskRef,
        profileId: profile.id,
        mode: request.mode,
        status: 'planned' as const,
        createdAt: now(),
      };
      // Recorded first, so a crash during launch still leaves a trace.
      store.launches.insert(attempt);

      try {
        if (setup && setup.installSkills.length > 0) skills.install(setup.skillsDirectory, setup.installSkills);
        // MCP is a convenience: the prompt still names the folder, so a failure only warns.
        let mcpWarning: Message | null = null;
        if (setup?.mcp) {
          try {
            await launcher.registerMcp(profile, setup.mcp, cliOverride(profile.provider));
          } catch (error) {
            mcpWarning = msg('launch.mcpFailed', { reason: error instanceof DomainError ? error.detail : raw((error as Error).message) });
          }
        }
        const launched = await launcher.launch(plan);
        const outcome = mcpWarning ? { ...launched, warnings: [...launched.warnings, mcpWarning] } : launched;
        const status = outcome.userActionRequired.length > 0 ? 'manual_step' : 'launched';
        store.launches.finish(attempt.id, status, null, outcome);
      } catch (error) {
        const code = error instanceof DomainError ? error.code : 'LAUNCH_FAILED';
        store.launches.finish(attempt.id, 'failed', code, null);
        throw error;
      }
      return { ...(store.launches.get(attempt.id) as LaunchAttempt), profileAlias: accountName(profile), prompt: prompt?.text ?? null };
    },

    previewAccount,

    // The Agent tools screen of Settings (ADR-020 item 1).
    tools,

    // No project means no source code to grant, so no permission check. History belongs to
    // projects, so this launch leaves none.
    async openAccount(request: AccountLaunchRequest, confirmations: string[]): Promise<LaunchOutcome> {
      const plan = await previewAccount(request);
      if (plan.blocker) throw new DomainError(plan.blocker.code, plan.blocker.message);
      const missing = plan.requiredConfirmations.find((item) => !confirmations.includes(item.id));
      if (missing) throw new DomainError('CONFIRMATION_REQUIRED', missing.label);
      const outcome = await launcher.launch(plan);
      return { ...outcome, workspace: 'none' };
    },

    listLaunches(projectId: string): LaunchHistoryEntry[] {
      // Removed profiles keep their history, so aliases come from all rows the store can still name.
      const aliases = new Map(store.profiles.list().map((profile) => [profile.id, accountName(profile)]));
      return store.launches.list(projectId).map((attempt) => ({
        ...attempt,
        profileAlias: aliases.get(attempt.profileId) ?? msg('account.removed'),
      }));
    },

    confirmAccount(attemptId: string): void {
      if (!store.launches.get(attemptId)) throw new DomainError('NOT_FOUND', 'launch.attemptNotFound');
      store.launches.confirmAccount(attemptId, now());
    },
  };
}
