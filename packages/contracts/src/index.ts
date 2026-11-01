import { z } from 'zod';

import { IpcChannel, TASK_STATUSES, THEMES } from './constants';

export { IpcChannel, TASK_STATUSES, THEMES };

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
  [IpcChannel.settingsUpdate]: z.strictObject({ theme: z.enum(THEMES) }),
  [IpcChannel.settingsOpenDataFolder]: noInput,
} as const;

export type IpcInput<C extends keyof typeof ipcInput> = z.infer<(typeof ipcInput)[C]>;

export type TaskStatusDto = (typeof TASK_STATUSES)[number];
export type ThemeDto = (typeof THEMES)[number];
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
}
