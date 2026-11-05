import { z } from 'zod';

import { ACCOUNT_SOURCES, CLIENT_MODES, IpcChannel, LOGIN_BROWSERS, CONTEXT_LANGUAGES, PROVIDERS, THEMES } from './constants';

export { ACCOUNT_SOURCES, CLIENT_MODES, IpcChannel, LOGIN_BROWSERS, CONTEXT_LANGUAGES, PROVIDERS, THEMES };

const MAX_PATH_LENGTH = 4096;
const MAX_LABEL_INPUT = 1000;

const idSchema = z.uuid();
const pathSchema = z
  .string()
  .min(1)
  .max(MAX_PATH_LENGTH)
  .refine((value) => !value.includes('\0'), 'Path contains a NUL byte');
const labelSchema = z.string().max(MAX_LABEL_INPUT);
const noInput = z.undefined();

const profileFieldsSchema = {
  alias: labelSchema,
  cliConfigRoot: pathSchema.nullable(),
  desktopDataDir: pathSchema.nullable(),
};
const launchRequestSchema = z.strictObject({
  projectId: idSchema,
  profileId: idSchema,
  mode: z.enum(CLIENT_MODES),
});

const accountLaunchSchema = z.strictObject({
  profileId: idSchema,
  mode: z.enum(CLIENT_MODES),
});

// Main validates every payload against these before it reaches a use case.
export const ipcInput = {
  [IpcChannel.systemStatus]: noInput,
  [IpcChannel.projectsList]: noInput,
  [IpcChannel.projectsPickFolder]: noInput,
  [IpcChannel.projectsAdd]: z.strictObject({ path: pathSchema, name: labelSchema.optional() }),
  [IpcChannel.projectsUpdate]: z.strictObject({ id: idSchema, name: labelSchema.optional(), path: pathSchema.optional() }),
  [IpcChannel.projectsRemove]: z.strictObject({ id: idSchema }),
  [IpcChannel.projectsUpdateContext]: z.strictObject({
    id: idSchema,
    enabled: z.boolean().optional(),
    language: z.enum(CONTEXT_LANGUAGES).optional(),
    customPath: pathSchema.nullable().optional(),
  }),
  [IpcChannel.projectsOpenContextFolder]: z.strictObject({ id: idSchema }),
  [IpcChannel.settingsGet]: noInput,
  [IpcChannel.settingsUpdate]: z.strictObject({
    theme: z.enum(THEMES).optional(),
    claudeCliPath: pathSchema.nullable().optional(),
    codexCliPath: pathSchema.nullable().optional(),
  }),
  [IpcChannel.settingsOpenDataFolder]: noInput,
  [IpcChannel.profilesList]: noInput,
  [IpcChannel.profilesAdd]: z.strictObject({ provider: z.enum(PROVIDERS), source: z.enum(ACCOUNT_SOURCES) }),
  [IpcChannel.profilesUpdate]: z.strictObject({ id: idSchema, provider: z.enum(PROVIDERS), ...profileFieldsSchema }),
  [IpcChannel.profilesRemove]: z.strictObject({ id: idSchema }),
  [IpcChannel.profilesStatus]: z.strictObject({ id: idSchema }),
  [IpcChannel.profilesUsage]: z.strictObject({ id: idSchema, refresh: z.boolean().optional() }),
  [IpcChannel.profilesMachineAccount]: z.strictObject({ provider: z.enum(PROVIDERS) }),
  [IpcChannel.profilesOpenLogin]: z.strictObject({ id: idSchema }),
  [IpcChannel.profilesLoginState]: z.strictObject({ id: idSchema }),
  [IpcChannel.profilesLoginReopen]: z.strictObject({ id: idSchema, browser: z.enum(LOGIN_BROWSERS) }),
  [IpcChannel.profilesLoginCopyLink]: z.strictObject({ id: idSchema }),
  [IpcChannel.profilesLoginCancel]: z.strictObject({ id: idSchema }),
  [IpcChannel.permissionsSet]: z.strictObject({ projectId: idSchema, profileId: idSchema, allowed: z.boolean() }),
  [IpcChannel.launchPlan]: launchRequestSchema,
  [IpcChannel.launchExecute]: z.strictObject({
    request: launchRequestSchema,
    confirmations: z.array(z.string().max(100)).max(20),
  }),
  [IpcChannel.launchHistory]: z.strictObject({ projectId: idSchema }),
  [IpcChannel.launchConfirmAccount]: z.strictObject({ attemptId: idSchema }),
  [IpcChannel.launchAccountPlan]: accountLaunchSchema,
  [IpcChannel.launchAccountExecute]: z.strictObject({
    request: accountLaunchSchema,
    confirmations: z.array(z.string().max(100)).max(20),
  }),
} as const;

export type IpcInput<C extends keyof typeof ipcInput> = z.infer<(typeof ipcInput)[C]>;

export type ContextLanguageDto = (typeof CONTEXT_LANGUAGES)[number];
export type ThemeDto = (typeof THEMES)[number];
export type ProviderDto = (typeof PROVIDERS)[number];
export type ClientModeDto = (typeof CLIENT_MODES)[number];

export interface SystemStatusDto {
  appVersion: string;
  storage: {
    engineVersion: string;
    schemaVersion: number;
  };
}

type PathStatusDto = 'directory' | 'not_directory' | 'missing' | 'not_absolute';

export interface ProjectDto {
  id: string;
  name: string;
  path: string | null;
  pathStatus: PathStatusDto | 'unset';
  context: {
    enabled: boolean;
    language: ContextLanguageDto;
    path: string;
    custom: boolean;
    pathStatus: PathStatusDto;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SettingsDto {
  deviceId: string;
  theme: ThemeDto;
  dataDirectory: string;
  claudeCliPath: string | null;
  codexCliPath: string | null;
}

export interface ProfileDto {
  id: string;
  provider: ProviderDto;
  // What to call the account everywhere: its email.
  name: string;
  alias: string;
  accountEmail: string | null;
  cliConfigRoot: string | null;
  desktopDataDir: string | null;
  createdAt: string;
}

export interface MachineAccountDto {
  // False once an account in AgentHub already uses the machine's own login.
  available: boolean;
  cliFound: boolean;
  login: 'logged_in' | 'logged_out' | 'unknown';
  accountEmail: string | null;
  loginDetail: string | null;
}

// 'terminal': the CLI's own flow runs in Terminal, so only the login status tells when it ends.
export interface LoginStateDto {
  phase: 'idle' | 'waiting' | 'succeeded' | 'failed' | 'terminal';
  // The browser holding the private window; null when none could be opened that way.
  privateBrowser: string | null;
}

export interface ProfileStatusDto {
  cliPath: string | null;
  cliVersion: string | null;
  login: 'logged_in' | 'logged_out' | 'unknown';
  loginDetail: string | null;
  accountEmail: string | null;
  sameAccountAs: string[];
  desktopInstalled: boolean;
  desktopVersion: string | null;
  desktopVersionHasEvidence: boolean;
}

// Usage limits as the account's own CLI reports them (SPIKE-16).
export interface UsageWindowDto {
  kind: 'session' | 'weekly' | 'other';
  label: string | null;
  usedPercent: number;
  windowMinutes: number | null;
  resetsAt: string | null;
  // The provider's wording when it gives no timestamp, e.g. Claude's "Nov 4 at 8:19pm (Asia/Saigon)".
  resetsText: string | null;
}

export interface UsageDto {
  state: 'ok' | 'logged_out' | 'unavailable';
  windows: UsageWindowDto[];
  plan: string | null;
  limitReached: boolean;
  detail: string | null;
  checkedAt: string;
}

export interface LaunchPreviewDto {
  steps: { label: string; execution: 'automatic' | 'conditional' | 'manual'; warning?: string }[];
  requiredConfirmations: { id: string; label: string }[];
  blocker: { code: string; message: string } | null;
  permission: 'allowed' | 'denied' | 'unset';
  projectName: string;
  profileAlias: string;
}

// Opening an account on its own has no project to ask permission for.
export type AccountLaunchPreviewDto = Pick<LaunchPreviewDto, 'steps' | 'requiredConfirmations' | 'blocker'>;

export interface LaunchOutcomeDto {
  appOpened: boolean;
  workspace: 'opened' | 'requested' | 'manual' | 'none';
  sessionStarted: false;
  userActionRequired: string[];
  warnings: string[];
}

export interface LaunchAttemptDto {
  id: string;
  projectId: string;
  taskRef: string | null;
  profileId: string;
  profileAlias: string;
  mode: ClientModeDto;
  status: 'planned' | 'launched' | 'manual_step' | 'failed';
  errorCode: string | null;
  outcome: LaunchOutcomeDto | null;
  accountConfirmedAt: string | null;
  createdAt: string;
}

export interface IpcOutput {
  [IpcChannel.systemStatus]: SystemStatusDto;
  [IpcChannel.projectsList]: ProjectDto[];
  [IpcChannel.projectsPickFolder]: string | null;
  [IpcChannel.projectsAdd]: ProjectDto;
  [IpcChannel.projectsUpdate]: ProjectDto;
  [IpcChannel.projectsRemove]: null;
  [IpcChannel.projectsUpdateContext]: ProjectDto;
  [IpcChannel.projectsOpenContextFolder]: null;
  [IpcChannel.settingsGet]: SettingsDto;
  [IpcChannel.settingsUpdate]: SettingsDto;
  [IpcChannel.settingsOpenDataFolder]: null;
  [IpcChannel.profilesList]: ProfileDto[];
  [IpcChannel.profilesAdd]: ProfileDto;
  [IpcChannel.profilesUpdate]: ProfileDto;
  [IpcChannel.profilesRemove]: null;
  [IpcChannel.profilesStatus]: ProfileStatusDto;
  [IpcChannel.profilesUsage]: UsageDto;
  [IpcChannel.profilesMachineAccount]: MachineAccountDto;
  [IpcChannel.profilesOpenLogin]: LoginStateDto;
  [IpcChannel.profilesLoginState]: LoginStateDto;
  [IpcChannel.profilesLoginReopen]: LoginStateDto;
  [IpcChannel.profilesLoginCopyLink]: null;
  [IpcChannel.profilesLoginCancel]: null;
  [IpcChannel.permissionsSet]: null;
  [IpcChannel.launchPlan]: LaunchPreviewDto;
  [IpcChannel.launchExecute]: LaunchAttemptDto;
  [IpcChannel.launchHistory]: LaunchAttemptDto[];
  [IpcChannel.launchConfirmAccount]: null;
  [IpcChannel.launchAccountPlan]: AccountLaunchPreviewDto;
  [IpcChannel.launchAccountExecute]: LaunchOutcomeDto;
}

export interface IpcErrorDto {
  code: string;
  message: string;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcErrorDto };

type Reply<C extends keyof IpcOutput> = Promise<IpcResult<IpcOutput[C]>>;

export interface AgentHubApi {
  getSystemStatus(): Reply<typeof IpcChannel.systemStatus>;
  listProjects(): Reply<typeof IpcChannel.projectsList>;
  pickProjectFolder(): Reply<typeof IpcChannel.projectsPickFolder>;
  addProject(input: IpcInput<typeof IpcChannel.projectsAdd>): Reply<typeof IpcChannel.projectsAdd>;
  updateProject(input: IpcInput<typeof IpcChannel.projectsUpdate>): Reply<typeof IpcChannel.projectsUpdate>;
  removeProject(input: IpcInput<typeof IpcChannel.projectsRemove>): Reply<typeof IpcChannel.projectsRemove>;
  updateProjectContext(input: IpcInput<typeof IpcChannel.projectsUpdateContext>): Reply<typeof IpcChannel.projectsUpdateContext>;
  openContextFolder(input: IpcInput<typeof IpcChannel.projectsOpenContextFolder>): Reply<typeof IpcChannel.projectsOpenContextFolder>;
  getSettings(): Reply<typeof IpcChannel.settingsGet>;
  updateSettings(input: IpcInput<typeof IpcChannel.settingsUpdate>): Reply<typeof IpcChannel.settingsUpdate>;
  openDataFolder(): Reply<typeof IpcChannel.settingsOpenDataFolder>;
  listProfiles(): Reply<typeof IpcChannel.profilesList>;
  addAccount(input: IpcInput<typeof IpcChannel.profilesAdd>): Reply<typeof IpcChannel.profilesAdd>;
  updateProfile(input: IpcInput<typeof IpcChannel.profilesUpdate>): Reply<typeof IpcChannel.profilesUpdate>;
  removeProfile(input: IpcInput<typeof IpcChannel.profilesRemove>): Reply<typeof IpcChannel.profilesRemove>;
  getProfileStatus(input: IpcInput<typeof IpcChannel.profilesStatus>): Reply<typeof IpcChannel.profilesStatus>;
  getProfileUsage(input: IpcInput<typeof IpcChannel.profilesUsage>): Reply<typeof IpcChannel.profilesUsage>;
  getMachineAccount(input: IpcInput<typeof IpcChannel.profilesMachineAccount>): Reply<typeof IpcChannel.profilesMachineAccount>;
  openProfileLogin(input: IpcInput<typeof IpcChannel.profilesOpenLogin>): Reply<typeof IpcChannel.profilesOpenLogin>;
  getLoginState(input: IpcInput<typeof IpcChannel.profilesLoginState>): Reply<typeof IpcChannel.profilesLoginState>;
  reopenLogin(input: IpcInput<typeof IpcChannel.profilesLoginReopen>): Reply<typeof IpcChannel.profilesLoginReopen>;
  copyLoginLink(input: IpcInput<typeof IpcChannel.profilesLoginCopyLink>): Reply<typeof IpcChannel.profilesLoginCopyLink>;
  cancelLogin(input: IpcInput<typeof IpcChannel.profilesLoginCancel>): Reply<typeof IpcChannel.profilesLoginCancel>;
  setPermission(input: IpcInput<typeof IpcChannel.permissionsSet>): Reply<typeof IpcChannel.permissionsSet>;
  planLaunch(input: IpcInput<typeof IpcChannel.launchPlan>): Reply<typeof IpcChannel.launchPlan>;
  executeLaunch(input: IpcInput<typeof IpcChannel.launchExecute>): Reply<typeof IpcChannel.launchExecute>;
  listLaunches(input: IpcInput<typeof IpcChannel.launchHistory>): Reply<typeof IpcChannel.launchHistory>;
  confirmLaunchAccount(input: IpcInput<typeof IpcChannel.launchConfirmAccount>): Reply<typeof IpcChannel.launchConfirmAccount>;
  planAccountLaunch(input: IpcInput<typeof IpcChannel.launchAccountPlan>): Reply<typeof IpcChannel.launchAccountPlan>;
  openAccount(input: IpcInput<typeof IpcChannel.launchAccountExecute>): Reply<typeof IpcChannel.launchAccountExecute>;
}
