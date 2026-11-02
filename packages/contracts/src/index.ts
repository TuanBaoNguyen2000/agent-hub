import { z } from 'zod';

import { CLIENT_MODES, IpcChannel, PROVIDERS, TASK_STATUSES, THEMES } from './constants';

export { CLIENT_MODES, IpcChannel, PROVIDERS, TASK_STATUSES, THEMES };

const MAX_PATH_LENGTH = 4096;
const MAX_LABEL_INPUT = 1000;
const MAX_TEXT_LENGTH = 2_000_000;

const idSchema = z.uuid();
const pathSchema = z
  .string()
  .min(1)
  .max(MAX_PATH_LENGTH)
  .refine((value) => !value.includes('\0'), 'Path contains a NUL byte');
const labelSchema = z.string().max(MAX_LABEL_INPUT);
const textSchema = z.string().max(MAX_TEXT_LENGTH);
const statusSchema = z.enum(TASK_STATUSES);
const noInput = z.undefined();

const profileFieldsSchema = {
  alias: labelSchema,
  cliConfigRoot: pathSchema.nullable(),
  desktopDataDir: pathSchema.nullable(),
};
const launchRequestSchema = z.strictObject({
  taskId: idSchema,
  profileId: idSchema,
  mode: z.enum(CLIENT_MODES),
});

const contextReferenceSchema = z.discriminatedUnion('scope', [
  z.strictObject({ scope: z.literal('project'), projectId: idSchema }),
  z.strictObject({ scope: z.literal('task'), taskId: idSchema, document: z.enum(['task', 'decisions']) }),
]);

// Main validates every payload against these before it reaches a use case.
export const ipcInput = {
  [IpcChannel.systemStatus]: noInput,
  [IpcChannel.projectsList]: noInput,
  [IpcChannel.projectsPickFolder]: noInput,
  [IpcChannel.projectsAdd]: z.strictObject({ path: pathSchema, name: labelSchema.optional() }),
  [IpcChannel.projectsUpdate]: z.strictObject({ id: idSchema, name: labelSchema.optional(), path: pathSchema.optional() }),
  [IpcChannel.projectsRemove]: z.strictObject({ id: idSchema }),
  [IpcChannel.tasksList]: z.strictObject({ projectId: idSchema }),
  [IpcChannel.tasksCreate]: z.strictObject({ projectId: idSchema, title: labelSchema, objective: textSchema.optional() }),
  [IpcChannel.tasksUpdate]: z.strictObject({
    id: idSchema,
    title: labelSchema.optional(),
    objective: textSchema.optional(),
    acceptanceCriteria: textSchema.optional(),
    status: statusSchema.optional(),
  }),
  [IpcChannel.contextGet]: z.strictObject({ reference: contextReferenceSchema }),
  [IpcChannel.contextSave]: z.strictObject({
    reference: contextReferenceSchema,
    content: textSchema,
    expectedRevision: z.string().max(128).nullable(),
  }),
  [IpcChannel.settingsGet]: noInput,
  [IpcChannel.settingsUpdate]: z.strictObject({
    theme: z.enum(THEMES).optional(),
    claudeCliPath: pathSchema.nullable().optional(),
    codexCliPath: pathSchema.nullable().optional(),
  }),
  [IpcChannel.settingsOpenDataFolder]: noInput,
  [IpcChannel.profilesList]: noInput,
  [IpcChannel.profilesAdd]: z.strictObject({ provider: z.enum(PROVIDERS) }),
  [IpcChannel.profilesUpdate]: z.strictObject({ id: idSchema, provider: z.enum(PROVIDERS), ...profileFieldsSchema }),
  [IpcChannel.profilesRemove]: z.strictObject({ id: idSchema }),
  [IpcChannel.profilesStatus]: z.strictObject({ id: idSchema }),
  [IpcChannel.profilesOpenLogin]: z.strictObject({ id: idSchema }),
  [IpcChannel.permissionsSet]: z.strictObject({ projectId: idSchema, profileId: idSchema, allowed: z.boolean() }),
  [IpcChannel.launchPlan]: launchRequestSchema,
  [IpcChannel.launchExecute]: z.strictObject({
    request: launchRequestSchema,
    confirmations: z.array(z.string().max(100)).max(20),
  }),
  [IpcChannel.launchHistory]: z.strictObject({ taskId: idSchema }),
  [IpcChannel.launchConfirmAccount]: z.strictObject({ attemptId: idSchema }),
} as const;

export type IpcInput<C extends keyof typeof ipcInput> = z.infer<(typeof ipcInput)[C]>;

export type TaskStatusDto = (typeof TASK_STATUSES)[number];
export type ThemeDto = (typeof THEMES)[number];
export type ProviderDto = (typeof PROVIDERS)[number];
export type ClientModeDto = (typeof CLIENT_MODES)[number];
export type ContextReferenceDto = z.infer<typeof contextReferenceSchema>;

export interface SystemStatusDto {
  appVersion: string;
  storage: {
    engineVersion: string;
    schemaVersion: number;
  };
}

export interface ProjectDto {
  id: string;
  name: string;
  path: string | null;
  pathStatus: 'directory' | 'not_directory' | 'missing' | 'not_absolute' | 'unset';
  createdAt: string;
  updatedAt: string;
}

export interface TaskDto {
  id: string;
  projectId: string;
  title: string;
  objective: string;
  acceptanceCriteria: string;
  status: TaskStatusDto;
  createdAt: string;
  updatedAt: string;
}

export interface ContextDocumentDto {
  content: string;
  revision: string | null;
  modifiedAt: string | null;
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
  alias: string;
  cliConfigRoot: string | null;
  desktopDataDir: string | null;
  createdAt: string;
}

export interface ProfileStatusDto {
  cliPath: string | null;
  cliVersion: string | null;
  login: 'logged_in' | 'logged_out' | 'unknown';
  loginDetail: string | null;
  sameAccountAs: string[];
  desktopInstalled: boolean;
  desktopVersion: string | null;
  desktopVersionHasEvidence: boolean;
}

export interface LaunchPreviewDto {
  steps: { label: string; execution: 'automatic' | 'conditional' | 'manual'; warning?: string }[];
  requiredConfirmations: { id: string; label: string }[];
  blocker: { code: string; message: string } | null;
  permission: 'allowed' | 'denied' | 'unset';
  projectName: string;
  profileAlias: string;
}

export interface LaunchOutcomeDto {
  appOpened: boolean;
  workspace: 'opened' | 'requested' | 'manual' | 'none';
  sessionStarted: false;
  userActionRequired: string[];
  warnings: string[];
}

export interface LaunchAttemptDto {
  id: string;
  taskId: string;
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
  [IpcChannel.tasksList]: TaskDto[];
  [IpcChannel.tasksCreate]: TaskDto;
  [IpcChannel.tasksUpdate]: TaskDto;
  [IpcChannel.contextGet]: ContextDocumentDto;
  [IpcChannel.contextSave]: ContextDocumentDto;
  [IpcChannel.settingsGet]: SettingsDto;
  [IpcChannel.settingsUpdate]: SettingsDto;
  [IpcChannel.settingsOpenDataFolder]: null;
  [IpcChannel.profilesList]: ProfileDto[];
  [IpcChannel.profilesAdd]: ProfileDto;
  [IpcChannel.profilesUpdate]: ProfileDto;
  [IpcChannel.profilesRemove]: null;
  [IpcChannel.profilesStatus]: ProfileStatusDto;
  [IpcChannel.profilesOpenLogin]: null;
  [IpcChannel.permissionsSet]: null;
  [IpcChannel.launchPlan]: LaunchPreviewDto;
  [IpcChannel.launchExecute]: LaunchAttemptDto;
  [IpcChannel.launchHistory]: LaunchAttemptDto[];
  [IpcChannel.launchConfirmAccount]: null;
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
  listTasks(input: IpcInput<typeof IpcChannel.tasksList>): Reply<typeof IpcChannel.tasksList>;
  createTask(input: IpcInput<typeof IpcChannel.tasksCreate>): Reply<typeof IpcChannel.tasksCreate>;
  updateTask(input: IpcInput<typeof IpcChannel.tasksUpdate>): Reply<typeof IpcChannel.tasksUpdate>;
  getContext(input: IpcInput<typeof IpcChannel.contextGet>): Reply<typeof IpcChannel.contextGet>;
  saveContext(input: IpcInput<typeof IpcChannel.contextSave>): Reply<typeof IpcChannel.contextSave>;
  getSettings(): Reply<typeof IpcChannel.settingsGet>;
  updateSettings(input: IpcInput<typeof IpcChannel.settingsUpdate>): Reply<typeof IpcChannel.settingsUpdate>;
  openDataFolder(): Reply<typeof IpcChannel.settingsOpenDataFolder>;
  listProfiles(): Reply<typeof IpcChannel.profilesList>;
  addAccount(input: IpcInput<typeof IpcChannel.profilesAdd>): Reply<typeof IpcChannel.profilesAdd>;
  updateProfile(input: IpcInput<typeof IpcChannel.profilesUpdate>): Reply<typeof IpcChannel.profilesUpdate>;
  removeProfile(input: IpcInput<typeof IpcChannel.profilesRemove>): Reply<typeof IpcChannel.profilesRemove>;
  getProfileStatus(input: IpcInput<typeof IpcChannel.profilesStatus>): Reply<typeof IpcChannel.profilesStatus>;
  openProfileLogin(input: IpcInput<typeof IpcChannel.profilesOpenLogin>): Reply<typeof IpcChannel.profilesOpenLogin>;
  setPermission(input: IpcInput<typeof IpcChannel.permissionsSet>): Reply<typeof IpcChannel.permissionsSet>;
  planLaunch(input: IpcInput<typeof IpcChannel.launchPlan>): Reply<typeof IpcChannel.launchPlan>;
  executeLaunch(input: IpcInput<typeof IpcChannel.launchExecute>): Reply<typeof IpcChannel.launchExecute>;
  listLaunches(input: IpcInput<typeof IpcChannel.launchHistory>): Reply<typeof IpcChannel.launchHistory>;
  confirmLaunchAccount(input: IpcInput<typeof IpcChannel.launchConfirmAccount>): Reply<typeof IpcChannel.launchConfirmAccount>;
}
