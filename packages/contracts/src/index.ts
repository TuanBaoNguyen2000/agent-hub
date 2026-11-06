import { z } from 'zod';

import type { Message } from '@agenthub/i18n';
import { ACCOUNT_SOURCES, CLIENT_MODES, IpcChannel, LOGIN_BROWSERS, CONTEXT_LANGUAGES, PROVIDERS, TASK_STATES, THEMES, UI_LANGUAGES } from './constants';

export { ACCOUNT_SOURCES, CLIENT_MODES, IpcChannel, LOGIN_BROWSERS, CONTEXT_LANGUAGES, PROVIDERS, TASK_STATES, THEMES, UI_LANGUAGES };

// Text the renderer shows in its own language: a key of @agenthub/i18n and its params.
export type MessageDto = Message;

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
const taskRefSchema = z
  .string()
  .min(1)
  .max(1000)
  .regex(/^(?!\.)[^/\0]+\/(?!\.)[^/\0]+\/Tasks\/(?!\.)[^/\0]+\.md$/, 'Not a task document');

// A path inside the documents folder; Main checks it again against the real folder.
const documentPathSchema = z
  .string()
  .min(1)
  .max(1000)
  .refine((value) => !value.includes('\0') && !value.startsWith('/') && !value.split(/[\\/]/).includes('..'), 'Not a document path');
const documentTextSchema = z.string().max(1_000_000);
const shaSchema = z.string().regex(/^[0-9a-f]{64}$/, 'Not a checksum');
const taskEditSchema = z.strictObject({
  title: z.string().max(1000),
  bodies: z.array(z.strictObject({ id: z.number().int().min(0).max(1000), body: documentTextSchema })).max(200),
  added: z.array(z.strictObject({ kind: z.enum(['goal', 'criteria', 'notes']), body: documentTextSchema })).max(3),
});

const noteIdSchema = z.string().regex(/^\d{8}T\d{9}Z-[0-9a-f]{6}(?:-[a-z0-9-]{1,48})?$/, 'Not a note id');
const noteTextSchema = z.string().min(1).max(200_000);

const launchRequestSchema = z.strictObject({
  projectId: idSchema,
  taskRef: taskRefSchema.nullable().optional(),
  useTranscript: z.boolean().optional(),
  purpose: z.literal('refine').optional(),
  profileId: idSchema,
  mode: z.enum(CLIENT_MODES),
});

// Agent Skills names: lowercase letters, digits and single hyphens.
const skillNameSchema = z.string().max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Not a skill name');
const toolSchema = z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('skill'), name: skillNameSchema }), z.strictObject({ kind: z.literal('mcp') })]);

const accountLaunchSchema = z.strictObject({
  profileId: idSchema,
  mode: z.enum(CLIENT_MODES),
});

// Main validates every payload against these before it reaches a use case.
export const ipcInput = {
  [IpcChannel.systemStatus]: noInput,
  [IpcChannel.systemCopyText]: z.strictObject({ text: z.string().min(1).max(20_000) }),
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
    chatLanguage: z.enum(UI_LANGUAGES).nullable().optional(),
  }),
  [IpcChannel.projectsOpenContextFolder]: z.strictObject({ id: idSchema }),
  [IpcChannel.projectsContext]: z.strictObject({ id: idSchema }),
  [IpcChannel.projectsDetectContext]: z.strictObject({ id: idSchema, apply: z.boolean() }),
  [IpcChannel.projectsMoveContext]: z.strictObject({ id: idSchema, customPath: pathSchema.nullable(), move: z.enum(['ask', 'move', 'leave']) }),
  [IpcChannel.projectsReadHandoff]: z.strictObject({ id: idSchema, noteId: noteIdSchema }),
  [IpcChannel.projectsSaveHandoff]: z.strictObject({ id: idSchema, title: labelSchema.optional(), content: noteTextSchema }),
  [IpcChannel.looseChatsList]: noInput,
  [IpcChannel.looseChatsRead]: z.strictObject({ id: noteIdSchema }),
  [IpcChannel.looseChatsSave]: z.strictObject({ title: labelSchema.min(1), content: noteTextSchema }),
  [IpcChannel.looseChatsMove]: z.strictObject({ id: noteIdSchema, projectId: idSchema }),
  [IpcChannel.projectsAddHandoff]: z.strictObject({ id: idSchema, taskRef: taskRefSchema, entry: z.string().min(1).max(200_000) }),
  [IpcChannel.settingsGet]: noInput,
  [IpcChannel.settingsUpdate]: z.strictObject({
    theme: z.enum(THEMES).optional(),
    uiLanguage: z.enum(UI_LANGUAGES).optional(),
    chatLanguage: z.enum(UI_LANGUAGES).nullable().optional(),
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
  [IpcChannel.toolsOverview]: noInput,
  [IpcChannel.toolsInstall]: z.strictObject({ profileId: idSchema, tool: toolSchema }),
  [IpcChannel.toolsUninstall]: z.strictObject({ profileId: idSchema, tool: toolSchema }),
  [IpcChannel.toolsSetAutoInstall]: z.strictObject({ profileId: idSchema, on: z.boolean() }),
  [IpcChannel.toolsAddSkill]: z.strictObject({ path: pathSchema }),
  [IpcChannel.toolsRemoveSkill]: z.strictObject({ name: skillNameSchema }),
  [IpcChannel.mcpInfo]: noInput,
  [IpcChannel.mcpProbe]: z.strictObject({ profileId: idSchema }),
  [IpcChannel.mcpLog]: noInput,
  [IpcChannel.mcpRevealLog]: noInput,
  [IpcChannel.documentsList]: z.strictObject({ id: idSchema }),
  [IpcChannel.documentsRead]: z.strictObject({ id: idSchema, path: documentPathSchema }),
  [IpcChannel.documentsChecksum]: z.strictObject({ id: idSchema, path: documentPathSchema }),
  [IpcChannel.documentsOpen]: z.strictObject({ id: idSchema, path: documentPathSchema }),
  [IpcChannel.documentsWrite]: z.strictObject({ id: idSchema, path: documentPathSchema, content: documentTextSchema, baseSha256: shaSchema.nullable() }),
  [IpcChannel.tasksRead]: z.strictObject({ id: idSchema, ref: taskRefSchema }),
  [IpcChannel.tasksSave]: z.strictObject({ id: idSchema, ref: taskRefSchema, baseSha256: shaSchema, edit: taskEditSchema }),
  [IpcChannel.tasksSetState]: z.strictObject({ id: idSchema, ref: taskRefSchema, state: z.enum(TASK_STATES) }),
  [IpcChannel.tasksCreate]: z.strictObject({ id: idSchema, workstream: documentPathSchema, title: labelSchema.min(1), goal: z.string().max(20_000) }),
} as const;

export type IpcInput<C extends keyof typeof ipcInput> = z.infer<(typeof ipcInput)[C]>;

export type ContextLanguageDto = (typeof CONTEXT_LANGUAGES)[number];
export type UiLanguageDto = (typeof UI_LANGUAGES)[number];
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
    // Whether the project folder was already searched for documents it has (ADR-020 item 4).
    detected: boolean;
  };
  // The project's own chat language, null to follow the app; chatLocale is the one in effect.
  chatLanguage: UiLanguageDto | null;
  chatLocale: UiLanguageDto;
  createdAt: string;
  updatedAt: string;
}

// found: folders in AgentHub's layout; applied: the one the project now uses, if exactly one.
export interface DetectedContextDto {
  project: ProjectDto;
  found: string[];
  others: string[];
  applied: string | null;
}

export type ContextFolderChangeDto =
  | { status: 'done'; project: ProjectDto; moved: number; kept: string | null }
  | { status: 'needs_decision'; project: ProjectDto; files: number }
  | { status: 'conflict'; project: ProjectDto; conflicts: string[] };

export interface SettingsDto {
  deviceId: string;
  theme: ThemeDto;
  uiLanguage: UiLanguageDto;
  // null: prompts follow the interface language.
  chatLanguage: UiLanguageDto | null;
  dataDirectory: string;
  claudeCliPath: string | null;
  codexCliPath: string | null;
}

export interface ProfileDto {
  id: string;
  provider: ProviderDto;
  // What to call the account everywhere: its email.
  name: MessageDto;
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
  loginDetail: MessageDto | null;
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
  loginDetail: MessageDto | null;
  accountEmail: string | null;
  sameAccountAs: MessageDto[];
  desktopInstalled: boolean;
  desktopVersion: string | null;
  desktopVersionHasEvidence: boolean;
}

// Usage limits as the account's own CLI reports them (SPIKE-16).
export interface UsageWindowDto {
  kind: 'session' | 'weekly' | 'other';
  label: MessageDto | null;
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
  detail: MessageDto | null;
  checkedAt: string;
}

// Read back from the agents' documents; free text written by models, shown as plain text only.
export interface ContextTaskDto {
  ref: string;
  id: string;
  title: string;
  state: string | null;
  lastHandoff: { heading: string; at: string | null } | null;
}

export type ContextIssueKindDto = 'no_project_context' | 'no_workstream' | 'no_status' | 'no_tasks' | 'no_handoff_log';

export interface ContextOverviewDto {
  initialized: boolean;
  workstreams: { slug: string; title: string; branch: string | null; tasks: ContextTaskDto[] }[];
  issues: { kind: ContextIssueKindDto; workstream: string | null; taskRef: string | null }[];
}

export interface NoteDto {
  id: string;
  title: string;
  createdAt: string;
  source: string;
}

export type NoteWithContentDto = NoteDto & { content: string };

export interface ProjectContextDto {
  overview: ContextOverviewDto;
  git: { state: 'repo' | 'not_repo' | 'unknown'; branch: string | null; head: string | null; headAt: string | null; dirty: boolean | null };
  warnings: {
    kind: 'branch_mismatch' | 'commits_after_handoff' | 'no_handoff' | 'old_handoff' | 'uncommitted' | ContextIssueKindDto;
    taskRef: string | null;
    workstream: string | null;
    message: MessageDto;
  }[];
  handoffs: NoteDto[];
  checkpointPrompt: string;
}

export interface LaunchPreviewDto {
  steps: { label: MessageDto; execution: 'automatic' | 'conditional' | 'manual'; warning?: MessageDto }[];
  requiredConfirmations: { id: string; label: MessageDto }[];
  blocker: { code: string; message: MessageDto } | null;
  permission: 'allowed' | 'denied' | 'unset';
  projectName: string;
  profileAlias: MessageDto;
  // What the new session is asked first; null when the project has no context documents.
  prompt: string | null;
  // A newer session than the last checkpoint, offered for the new agent to read (§7.6).
  transcript: {
    path: string;
    updatedAt: string;
    sourceAccount: MessageDto;
    provider: ProviderDto;
    otherAccount: boolean;
    otherProvider: boolean;
    checkpointAt: string;
  } | null;
  // The account opens without these, as it does not install its tools by itself (ADR-020 item 1).
  missingTools: { skills: string[]; mcp: boolean } | null;
}

// Opening an account on its own has no project to ask permission for.
export type AccountLaunchPreviewDto = Pick<LaunchPreviewDto, 'steps' | 'requiredConfirmations' | 'blocker'>;

// copied: Main put the prompt on the clipboard, for a Desktop app to paste.
export type LaunchResultDto = LaunchAttemptDto & { prompt: string | null; copied: boolean };

export interface LaunchOutcomeDto {
  appOpened: boolean;
  workspace: 'opened' | 'requested' | 'manual' | 'none';
  sessionStarted: false;
  userActionRequired: MessageDto[];
  warnings: MessageDto[];
}

export interface LaunchAttemptDto {
  id: string;
  projectId: string;
  taskRef: string | null;
  profileId: string;
  profileAlias: MessageDto;
  mode: ClientModeDto;
  status: 'planned' | 'launched' | 'manual_step' | 'failed';
  errorCode: string | null;
  outcome: LaunchOutcomeDto | null;
  accountConfirmedAt: string | null;
  createdAt: string;
}

// ADR-021: documents and tasks, read and written by AgentHub with the same checks as MCP.
export interface DocumentEntryDto {
  path: string;
  kind: 'file' | 'folder';
}

export interface DocumentDto {
  path: string;
  content: string;
  sha256: string;
}

export type TaskStateDto = (typeof TASK_STATES)[number];
export type TaskSectionKindDto = 'goal' | 'criteria' | 'notes' | 'handoff' | 'other';

export interface TaskViewDto {
  ref: string;
  id: string;
  workstream: string;
  sha256: string;
  content: string;
  document: { title: string; sections: { id: number; heading: string; level: number; kind: TaskSectionKindDto; body: string }[] };
  state: string | null;
  group: TaskStateDto | null;
}

// The Agent tools screen (ADR-020 item 1): what each account has, read from its own folders.
export type SkillPresenceDto = 'installed' | 'missing' | 'foreign';

export interface AccountToolsDto {
  profileId: string;
  name: MessageDto;
  provider: ProviderDto;
  mainConfig: boolean;
  autoInstall: boolean;
  skillsDirectory: string;
  skills: Record<string, SkillPresenceDto>;
  mcp: 'installed' | 'partial' | 'missing' | 'unknown' | 'unavailable';
  mcpDetail: MessageDto[];
}

export interface ToolSkillDto {
  name: string;
  kind: 'builtin' | 'custom';
  description: string | null;
  sourcePath: string | null;
}

export interface AgentToolsDto {
  skills: ToolSkillDto[];
  accounts: AccountToolsDto[];
  leaked: { directory: string; names: string[] }[];
}

// AgentHub's own MCP server (ADR-019 item 6), as the MCP page in Settings shows it.
export interface McpServerDto {
  name: string;
  version: string;
  // The shim clients start; null when AgentHub could not write it on this machine.
  command: string | null;
  // With <account> standing for each account's id.
  args: string[];
  protocolVersions: string[];
  tools: { name: string; readOnly: boolean }[];
  logFile: string;
}

// One start of the server as an account's client would start it: initialize, tools/list, context_projects.
export interface McpProbeDto {
  ok: boolean;
  durationMs: number;
  serverVersion: string | null;
  protocolVersion: string | null;
  tools: string[];
  // Names of the projects this account sees; null when the call did not answer.
  projects: string[] | null;
  error: MessageDto | null;
}

export interface McpLogDto {
  exists: boolean;
  // The newest lines last.
  lines: string[];
}

export interface IpcOutput {
  [IpcChannel.systemStatus]: SystemStatusDto;
  [IpcChannel.systemCopyText]: null;
  [IpcChannel.projectsList]: ProjectDto[];
  [IpcChannel.projectsPickFolder]: string | null;
  [IpcChannel.projectsAdd]: ProjectDto;
  [IpcChannel.projectsUpdate]: ProjectDto;
  [IpcChannel.projectsRemove]: null;
  [IpcChannel.projectsUpdateContext]: ProjectDto;
  [IpcChannel.projectsOpenContextFolder]: null;
  [IpcChannel.projectsContext]: ProjectContextDto;
  [IpcChannel.projectsDetectContext]: DetectedContextDto;
  [IpcChannel.projectsMoveContext]: ContextFolderChangeDto;
  [IpcChannel.projectsAddHandoff]: ContextOverviewDto;
  [IpcChannel.projectsReadHandoff]: NoteWithContentDto;
  [IpcChannel.projectsSaveHandoff]: NoteDto[];
  [IpcChannel.looseChatsList]: NoteDto[];
  [IpcChannel.looseChatsRead]: NoteWithContentDto;
  [IpcChannel.looseChatsSave]: NoteDto;
  [IpcChannel.looseChatsMove]: null;
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
  [IpcChannel.launchExecute]: LaunchResultDto;
  [IpcChannel.launchHistory]: LaunchAttemptDto[];
  [IpcChannel.launchConfirmAccount]: null;
  [IpcChannel.launchAccountPlan]: AccountLaunchPreviewDto;
  [IpcChannel.launchAccountExecute]: LaunchOutcomeDto;
  [IpcChannel.toolsOverview]: AgentToolsDto;
  [IpcChannel.toolsInstall]: AccountToolsDto;
  [IpcChannel.toolsUninstall]: AccountToolsDto;
  [IpcChannel.toolsSetAutoInstall]: AccountToolsDto;
  [IpcChannel.toolsAddSkill]: AgentToolsDto;
  [IpcChannel.toolsRemoveSkill]: AgentToolsDto;
  [IpcChannel.mcpInfo]: McpServerDto;
  [IpcChannel.mcpProbe]: McpProbeDto;
  [IpcChannel.mcpLog]: McpLogDto;
  [IpcChannel.mcpRevealLog]: null;
  [IpcChannel.documentsList]: DocumentEntryDto[];
  [IpcChannel.documentsRead]: DocumentDto;
  [IpcChannel.documentsChecksum]: string | null;
  [IpcChannel.documentsWrite]: { path: string; sha256: string };
  [IpcChannel.documentsOpen]: null;
  [IpcChannel.tasksRead]: TaskViewDto;
  [IpcChannel.tasksSave]: TaskViewDto;
  [IpcChannel.tasksSetState]: TaskViewDto;
  [IpcChannel.tasksCreate]: TaskViewDto;
}

export interface IpcErrorDto {
  code: string;
  // English, for logs; the renderer shows detail in its own language.
  message: string;
  detail: MessageDto;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcErrorDto };

type Reply<C extends keyof IpcOutput> = Promise<IpcResult<IpcOutput[C]>>;

export interface AgentHubApi {
  getSystemStatus(): Reply<typeof IpcChannel.systemStatus>;
  copyText(input: IpcInput<typeof IpcChannel.systemCopyText>): Reply<typeof IpcChannel.systemCopyText>;
  listProjects(): Reply<typeof IpcChannel.projectsList>;
  pickProjectFolder(): Reply<typeof IpcChannel.projectsPickFolder>;
  addProject(input: IpcInput<typeof IpcChannel.projectsAdd>): Reply<typeof IpcChannel.projectsAdd>;
  updateProject(input: IpcInput<typeof IpcChannel.projectsUpdate>): Reply<typeof IpcChannel.projectsUpdate>;
  removeProject(input: IpcInput<typeof IpcChannel.projectsRemove>): Reply<typeof IpcChannel.projectsRemove>;
  updateProjectContext(input: IpcInput<typeof IpcChannel.projectsUpdateContext>): Reply<typeof IpcChannel.projectsUpdateContext>;
  openContextFolder(input: IpcInput<typeof IpcChannel.projectsOpenContextFolder>): Reply<typeof IpcChannel.projectsOpenContextFolder>;
  getProjectContext(input: IpcInput<typeof IpcChannel.projectsContext>): Reply<typeof IpcChannel.projectsContext>;
  detectProjectContext(input: IpcInput<typeof IpcChannel.projectsDetectContext>): Reply<typeof IpcChannel.projectsDetectContext>;
  moveProjectContext(input: IpcInput<typeof IpcChannel.projectsMoveContext>): Reply<typeof IpcChannel.projectsMoveContext>;
  addHandoff(input: IpcInput<typeof IpcChannel.projectsAddHandoff>): Reply<typeof IpcChannel.projectsAddHandoff>;
  readProjectHandoff(input: IpcInput<typeof IpcChannel.projectsReadHandoff>): Reply<typeof IpcChannel.projectsReadHandoff>;
  saveProjectHandoff(input: IpcInput<typeof IpcChannel.projectsSaveHandoff>): Reply<typeof IpcChannel.projectsSaveHandoff>;
  listLooseChats(): Reply<typeof IpcChannel.looseChatsList>;
  readLooseChat(input: IpcInput<typeof IpcChannel.looseChatsRead>): Reply<typeof IpcChannel.looseChatsRead>;
  saveLooseChat(input: IpcInput<typeof IpcChannel.looseChatsSave>): Reply<typeof IpcChannel.looseChatsSave>;
  moveLooseChat(input: IpcInput<typeof IpcChannel.looseChatsMove>): Reply<typeof IpcChannel.looseChatsMove>;
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
  getAgentTools(): Reply<typeof IpcChannel.toolsOverview>;
  installTool(input: IpcInput<typeof IpcChannel.toolsInstall>): Reply<typeof IpcChannel.toolsInstall>;
  uninstallTool(input: IpcInput<typeof IpcChannel.toolsUninstall>): Reply<typeof IpcChannel.toolsUninstall>;
  setToolsAutoInstall(input: IpcInput<typeof IpcChannel.toolsSetAutoInstall>): Reply<typeof IpcChannel.toolsSetAutoInstall>;
  addSkill(input: IpcInput<typeof IpcChannel.toolsAddSkill>): Reply<typeof IpcChannel.toolsAddSkill>;
  removeSkill(input: IpcInput<typeof IpcChannel.toolsRemoveSkill>): Reply<typeof IpcChannel.toolsRemoveSkill>;
  getMcpServer(): Reply<typeof IpcChannel.mcpInfo>;
  probeMcpServer(input: IpcInput<typeof IpcChannel.mcpProbe>): Reply<typeof IpcChannel.mcpProbe>;
  readMcpLog(): Reply<typeof IpcChannel.mcpLog>;
  revealMcpLog(): Reply<typeof IpcChannel.mcpRevealLog>;
  listDocuments(input: IpcInput<typeof IpcChannel.documentsList>): Reply<typeof IpcChannel.documentsList>;
  readDocument(input: IpcInput<typeof IpcChannel.documentsRead>): Reply<typeof IpcChannel.documentsRead>;
  documentChecksum(input: IpcInput<typeof IpcChannel.documentsChecksum>): Reply<typeof IpcChannel.documentsChecksum>;
  writeDocument(input: IpcInput<typeof IpcChannel.documentsWrite>): Reply<typeof IpcChannel.documentsWrite>;
  openDocument(input: IpcInput<typeof IpcChannel.documentsOpen>): Reply<typeof IpcChannel.documentsOpen>;
  readTask(input: IpcInput<typeof IpcChannel.tasksRead>): Reply<typeof IpcChannel.tasksRead>;
  saveTask(input: IpcInput<typeof IpcChannel.tasksSave>): Reply<typeof IpcChannel.tasksSave>;
  setTaskState(input: IpcInput<typeof IpcChannel.tasksSetState>): Reply<typeof IpcChannel.tasksSetState>;
  createTask(input: IpcInput<typeof IpcChannel.tasksCreate>): Reply<typeof IpcChannel.tasksCreate>;
}
