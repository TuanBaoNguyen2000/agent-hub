import {
  type AccountProfile,
  CONTEXT_LANGUAGES,
  type ContextLanguage,
  DomainError,
  type LaunchAttempt,
  type LaunchOutcome,
  type LaunchStatus,
  type Project,
  type Locale,
  folderNameOf,
  isSamePath,
  requireLabel,
} from '@agenthub/domain';
import { LOCALES, formatDateTime, isLocale } from '@agenthub/i18n';

import { type ContextWarning, contextWarnings, findTask } from './context-view';
import { CHAT_LANGUAGE_KEY, UI_LANGUAGE_KEY, chatLanguageOf, promptIn, uiLanguageOf } from './languages';
import {
  STATE_WORDS,
  type TaskDocument,
  type TaskEdit,
  type TaskState,
  applyTaskEdit,
  contextScaffold,
  parseTaskDocument,
  setStatusState,
  setTaskFileState,
  stateGroup,
  taskSlug,
  verifiedHandoff,
  workstreamStatusDocument,
} from './task-document';
import { CLI_PATH_KEYS, isInside } from './launching';

export * from './agent-tools';
export * from './context-view';
export * from './languages';
export * from './task-document';
export * from './launching';

export interface StorageStatus {
  engineVersion: string;
  schemaVersion: number;
}

// path and contextPath belong to this device; contextPath null means the default folder.
// contextDetectedAt: when the project folder on this device was last searched for documents it
// already has (ADR-020 item 4); null until then, and again after the folder changes.
export type StoredProject = Project & { path: string | null; contextPath: string | null; contextDetectedAt: string | null };

export interface ProjectRepository {
  listActive(deviceId: string): StoredProject[];
  get(id: string, deviceId: string): StoredProject | undefined;
  insert(project: Project, location: { id: string; deviceId: string; path: string }): void;
  rename(id: string, name: string, updatedAt: string): void;
  setLocation(projectId: string, location: { id: string; deviceId: string; path: string }, updatedAt: string): void;
  setContext(id: string, deviceId: string, context: Project['context'], contextPath: string | null, updatedAt: string): void;
  setChatLanguage(id: string, language: Locale | null, updatedAt: string): void;
  markContextDetected(id: string, deviceId: string, at: string): void;
  markRemoved(id: string, removedAt: string): void;
}

export interface SettingsRepository {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

export interface ProfileRepository {
  list(): AccountProfile[];
  get(id: string): AccountProfile | undefined;
  insert(profile: AccountProfile): void;
  update(profile: AccountProfile): void;
  remove(id: string): void;
}

export interface PermissionRepository {
  get(projectId: string, profileId: string): boolean | undefined;
  set(projectId: string, profileId: string, allowed: boolean): void;
}

export interface LaunchRepository {
  list(projectId: string): LaunchAttempt[];
  get(id: string): LaunchAttempt | undefined;
  insert(attempt: Pick<LaunchAttempt, 'id' | 'projectId' | 'taskRef' | 'profileId' | 'mode' | 'status' | 'createdAt'>): void;
  finish(id: string, status: LaunchStatus, errorCode: string | null, outcome: LaunchOutcome | null): void;
  confirmAccount(id: string, at: string): void;
}

// A skill the user added (ADR-020 item 1); AgentHub keeps its own copy under the same name.
export interface CustomSkill {
  id: string;
  name: string;
  sourcePath: string;
  addedAt: string;
}

export interface SkillRepository {
  list(): CustomSkill[];
  insert(skill: CustomSkill): void;
  remove(name: string): void;
}

export interface ProfileToolsRepository {
  // undefined until the user sets it.
  autoInstall(profileId: string): boolean | undefined;
  setAutoInstall(profileId: string, on: boolean): void;
}

export interface MetadataStore {
  readonly projects: ProjectRepository;
  readonly settings: SettingsRepository;
  readonly profiles: ProfileRepository;
  readonly permissions: PermissionRepository;
  readonly launches: LaunchRepository;
  readonly skills: SkillRepository;
  readonly profileTools: ProfileToolsRepository;
  status(): StorageStatus;
  close(): void;
}

// --- What AgentHub reads back from the agents' documents (ADR-019, TDD §7.2). Read-only. ---

export interface ContextHandoff {
  heading: string;
  // From the heading's date, as local time; a bare date counts as the end of that day.
  at: string | null;
}

export interface ContextTask {
  // Path inside the context folder; this is what launches record as task_ref.
  ref: string;
  id: string;
  title: string;
  // In the documents' own words: the task file's "Status:" line, else the STATUS table (ADR-023).
  state: string | null;
  // Ticked and total acceptance criteria, when the task has a checklist.
  criteria: { done: number; total: number } | null;
  lastHandoff: ContextHandoff | null;
}

export interface ContextWorkstream {
  // Its folder relative to the documents, such as Workstreams/combo or Playables/playable005.
  slug: string;
  title: string;
  // The "Branch:" that STATUS.md names, if any.
  branch: string | null;
  tasks: ContextTask[];
}

// What "Kiểm tra tài liệu" finds missing from the layout of TDD §7.2 (ADR-020 item 3).
// ADR-027: two task files with one number, and a task file whose state the STATUS table contradicts.
export type ContextIssueKind = 'no_project_context' | 'no_workstream' | 'no_status' | 'no_tasks' | 'no_handoff_log' | 'duplicate_task_id' | 'state_mismatch';

export interface ContextIssue {
  kind: ContextIssueKind;
  // The workstream's slug, or null for the whole set of documents.
  workstream: string | null;
  taskRef: string | null;
  // duplicate_task_id: the other task file; state_mismatch: the state the STATUS table writes.
  detail?: string | null;
}

export interface ContextOverview {
  initialized: boolean;
  // false while PROJECT_CONTEXT.md is missing or holds only headings: an agent has to fill it.
  filled: boolean;
  workstreams: ContextWorkstream[];
  // Empty until README.md exists: before that the documents are not set up yet, not broken.
  issues: ContextIssue[];
}

// What a project folder already holds (ADR-020 item 4). found: folders in the layout of §7.2;
// others: notes in another shape, relative to the project folder, for context-init to link.
export interface DetectedContext {
  found: string[];
  others: string[];
  // false when the scan stopped at its limit on folders.
  complete: boolean;
}

export interface ContextDocuments {
  overview(folder: string): ContextOverview;
  detect(projectPath: string): DetectedContext;
  // For moving the documents (ADR-020 item 5): every file, relative to the folder.
  files(folder: string): string[];
  conflicts(folder: string, files: readonly string[]): string[];
  copy(from: string, to: string, files: readonly string[]): void;
  appendHandoff(folder: string, taskRef: string, entry: string): void;
  // ADR-021: AgentHub reads and writes the documents with the same limits and checks as MCP.
  list(folder: string): DocumentEntry[];
  read(folder: string, path: string): { content: string; sha256: string };
  // baseSha256 null only for a new file; a changed file throws CONTEXT_CONFLICT.
  write(folder: string, path: string, content: string, baseSha256: string | null): { sha256: string };
  makeFolder(folder: string, path: string): void;
  isContextFolder(path: string): boolean;
  // ADR-027 item 1: numbers handed out under the lock the MCP server uses too.
  createTask(folder: string, input: { workstream: string; title: string; goal: string; language: ContextLanguage }): { ref: string; id: string };
  renumberTask(folder: string, ref: string, language: ContextLanguage): { ref: string; id: string };
  // ADR-027 item 2: the STATUS table written back from the task files; the rows changed.
  syncStatus(folder: string, workstream: string): number;
}

export interface DocumentEntry {
  // Relative to the documents folder; folders end with "/".
  path: string;
  kind: 'file' | 'folder';
}

export interface TaskView {
  ref: string;
  id: string;
  // The workstream folder, such as Workstreams/combo.
  workstream: string;
  sha256: string;
  content: string;
  document: TaskDocument;
  // As STATUS writes it, and the nearest of the four states.
  state: string | null;
  group: TaskState | null;
}

// Handoffs of a project without documents, and loose chats (TDD §7.5). One file per note.
export interface Note {
  id: string;
  title: string;
  createdAt: string;
  source: string;
}

export type NoteWithContent = Note & { content: string };

export interface NoteStore {
  list(folder: string): Note[];
  read(folder: string, id: string): NoteWithContent;
  save(folder: string, input: { title: string; content: string; source: string; now: Date }): Note;
  move(from: string, id: string, to: string): void;
}

// ADR-017: only root, branch, HEAD and dirty, read without changing anything.
export interface GitObservation {
  state: 'repo' | 'not_repo' | 'unknown';
  root: string | null;
  // null on a detached HEAD.
  branch: string | null;
  head: string | null;
  headAt: string | null;
  dirty: boolean | null;
}

export interface GitObserver {
  observe(path: string): Promise<GitObservation>;
}

export type PathStatus = 'directory' | 'not_directory' | 'missing' | 'not_absolute';

export interface PathInspector {
  inspect(path: string): PathStatus;
}

export interface ProjectContextView {
  enabled: boolean;
  language: ContextLanguage;
  // Where the documents live on this device, resolved from the default when none was chosen.
  path: string;
  custom: boolean;
  pathStatus: PathStatus;
  // Whether the project folder was already searched for documents on this device.
  detected: boolean;
}

export type ProjectView = Omit<StoredProject, 'context' | 'contextPath' | 'contextDetectedAt'> & {
  pathStatus: PathStatus | 'unset';
  context: ProjectContextView;
  // The language prompts for this project are written in: its own, else the app's.
  chatLocale: Locale;
};

// ADR-023 item 1: what the add-project dialog shows before the project exists.
export interface FolderScan {
  path: string;
  name: string;
  found: { path: string; workstreams: number; tasks: number }[];
  others: string[];
  complete: boolean;
  repoContextPath: string;
  repoContextTaken: boolean;
}

// What the user chose for documents when adding a project, or later on its page.
export type ContextLocation = 'repo' | 'app' | 'custom';
export type ContextChoice =
  | { kind: 'none' }
  | { kind: 'existing'; path: string }
  | { kind: 'create'; location: ContextLocation; customPath?: string | undefined; language: ContextLanguage };

// ADR-023 item 3: the folder "in the repo" creates.
export const REPO_CONTEXT_FOLDER = 'AgentContext';
const repoContextPath = (projectPath: string): string => `${projectPath.replace(/[\\/]+$/, '')}/${REPO_CONTEXT_FOLDER}`;

export type ContextFolderChange =
  | { status: 'done'; project: ProjectView; moved: number; kept: string | null }
  | { status: 'needs_decision'; project: ProjectView; files: number }
  | { status: 'conflict'; project: ProjectView; conflicts: string[] };

export interface ProjectContextState {
  overview: ContextOverview;
  git: GitObservation;
  warnings: ContextWarning[];
  // Newest first; only for a project without documents.
  handoffs: Note[];
  // What to paste into the session that is ending, so it saves its context (§7.5).
  checkpointPrompt: string;
}

export function checkpointPrompt(project: { name: string; context: { enabled: boolean } }, locale: Locale = 'en'): string {
  return promptIn(locale, project.context.enabled ? 'prompt.checkpoint' : 'prompt.writeHandoff', { project: project.name });
}

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export interface Settings {
  deviceId: string;
  theme: Theme;
  uiLanguage: Locale;
  // null: prompts follow the interface language.
  chatLanguage: Locale | null;
  claudeCliPath: string | null;
  codexCliPath: string | null;
}

export interface WorkspaceDependencies {
  store: MetadataStore;
  paths: PathInspector;
  // <userData>/projects/<project-id>/context (TDD §6.3).
  defaultContextDirectory: (projectId: string) => string;
  // Creates a folder AgentHub owns; it never writes documents into it (ADR-019).
  ensureDirectory: (path: string) => void;
  // Into the system Trash, never deleted for good (ADR-020 item 5).
  trash: (path: string) => Promise<void>;
  documents: ContextDocuments;
  git: GitObserver;
  notes: NoteStore;
  handoffDirectory: (projectId: string) => string;
  looseChatDirectory: string;
  newId: () => string;
  now: () => string;
  // The system's language, used until the user picks one (ADR-020 item 6).
  defaultLocale?: Locale;
}

const DEVICE_ID_KEY = 'device_id';
const THEME_KEY = 'theme';

export type Workspace = ReturnType<typeof createWorkspace>;

export function createWorkspace({
  store,
  paths,
  defaultContextDirectory,
  ensureDirectory,
  trash,
  documents,
  git,
  notes,
  handoffDirectory,
  looseChatDirectory,
  newId,
  now,
  defaultLocale = 'en',
}: WorkspaceDependencies) {
  function deviceId(): string {
    const existing = store.settings.get(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = newId();
    store.settings.set(DEVICE_ID_KEY, created);
    return created;
  }

  function requireDirectory(path: string): void {
    const status = paths.inspect(path);
    if (status === 'missing') throw new DomainError('PROJECT_PATH_MISSING', 'project.folderMissing');
    if (status !== 'directory') throw new DomainError('PROJECT_PATH_INVALID', 'project.notAFolder');
  }

  function requireUnusedPath(path: string, ownProjectId?: string): void {
    const taken = store.projects
      .listActive(deviceId())
      .some((project) => project.id !== ownProjectId && project.path !== null && isSamePath(project.path, path));
    if (taken) throw new DomainError('PROJECT_PATH_DUPLICATE', 'project.folderTaken');
  }

  function requireProject(id: string): StoredProject {
    const project = store.projects.get(id, deviceId());
    if (!project) throw new DomainError('NOT_FOUND', 'error.projectNotFound');
    return project;
  }

  function toView({ context, contextPath, contextDetectedAt, ...project }: StoredProject): ProjectView {
    const path = contextPath ?? defaultContextDirectory(project.id);
    return {
      ...project,
      pathStatus: project.path === null ? 'unset' : paths.inspect(project.path),
      context: { ...context, path, custom: contextPath !== null, pathStatus: paths.inspect(path), detected: contextDetectedAt !== null },
      chatLocale: chatLanguageOf(store, project, defaultLocale),
    };
  }

  function contextFolder(id: string): string {
    const view = toView(requireProject(id));
    if (!view.context.enabled) throw new DomainError('VALIDATION_FAILED', 'project.docsOff');
    if (!view.context.custom) ensureDirectory(view.context.path);
    else if (view.context.pathStatus !== 'directory') {
      throw new DomainError('PROJECT_PATH_MISSING', 'project.docsFolderMissing');
    }
    return view.context.path;
  }

  // ADR-023 item 2: the layout of TDD §7.2 without content. A file that exists stays as it is;
  // the first workstream only goes into documents that have none.
  function scaffold(folder: string, language: ContextLanguage): void {
    const before = documents.overview(folder);
    const hasWorkstream = before.workstreams.length > 0;
    // A workstream without STATUS.md gets the empty table too.
    for (const issue of before.issues) {
      if (issue.kind !== 'no_status' || issue.workstream === null) continue;
      const title = before.workstreams.find((item) => item.slug === issue.workstream)?.title ?? issue.workstream;
      try {
        documents.write(folder, `${issue.workstream}/STATUS.md`, workstreamStatusDocument(title, language), null);
      } catch (error) {
        if (!(error instanceof DomainError && error.code === 'CONTEXT_CONFLICT')) throw error;
      }
    }
    for (const item of contextScaffold(language)) {
      if (hasWorkstream && item.path.startsWith('Workstreams/')) continue;
      if (item.content === null) {
        documents.makeFolder(folder, item.path);
        continue;
      }
      try {
        documents.write(folder, item.path, item.content, null);
      } catch (error) {
        if (!(error instanceof DomainError && error.code === 'CONTEXT_CONFLICT')) throw error;
      }
    }
  }

  // A new set in the repo needs AgentContext/ to be missing or empty; a set already there is used
  // with "existing" instead, never written into as if it were new.
  function requireFreeRepoFolder(projectPath: string): string {
    const target = repoContextPath(projectPath);
    const status = paths.inspect(target);
    if (status === 'missing') return target;
    if (status !== 'directory') throw new DomainError('VALIDATION_FAILED', 'project.contextFolderTaken', { path: target });
    if (documents.files(target).length > 0) {
      throw new DomainError('VALIDATION_FAILED', 'project.contextFolderTaken', { path: target });
    }
    return target;
  }

  // The documents never go into the project folder itself or a folder above it: AgentHub's
  // README.md and Workstreams/ would land among the code (and a repo's own README.md is kept).
  function requireApartFromProject(projectPath: string | null, path: string): void {
    if (projectPath !== null && (isSamePath(projectPath, path) || isInside(projectPath, path))) {
      throw new DomainError('VALIDATION_FAILED', 'project.contextIsProjectFolder', { path });
    }
  }

  function requireContextFolder(path: string): void {
    requireDirectory(path);
    if (!documents.isContextFolder(path)) throw new DomainError('VALIDATION_FAILED', 'project.notContextFolder', { path });
  }

  function createContext(id: string, input: { location: ContextLocation; customPath?: string | undefined; language: ContextLanguage }): ProjectView {
    const project = requireProject(id);
    if (project.path === null) throw new DomainError('PROJECT_PATH_MISSING', 'project.pickFolderFirst');
    if (!CONTEXT_LANGUAGES.includes(input.language)) throw new DomainError('VALIDATION_FAILED', 'project.badLanguage');
    let contextPath: string | null;
    if (input.location === 'repo') contextPath = requireFreeRepoFolder(project.path);
    else if (input.location === 'custom') {
      if (!input.customPath) throw new DomainError('VALIDATION_FAILED', 'project.pickFolderFirst');
      requireDirectory(input.customPath);
      requireApartFromProject(project.path, input.customPath);
      contextPath = input.customPath;
    } else contextPath = null;
    const folder = contextPath ?? defaultContextDirectory(project.id);
    ensureDirectory(folder);
    const timestamp = now();
    store.projects.setContext(project.id, deviceId(), { enabled: true, language: input.language }, contextPath, timestamp);
    store.projects.markContextDetected(project.id, deviceId(), timestamp);
    scaffold(folder, input.language);
    return toView(requireProject(project.id));
  }

  function useContext(id: string, path: string): ProjectView {
    const project = requireProject(id);
    requireContextFolder(path);
    const timestamp = now();
    store.projects.setContext(project.id, deviceId(), { ...project.context, enabled: true }, path, timestamp);
    store.projects.markContextDetected(project.id, deviceId(), timestamp);
    return toView(requireProject(project.id));
  }

  // The persistence layer speaks English to agents; the user gets a message in their language.
  function guardedWrite(folder: string, path: string, content: string, baseSha256: string | null): { sha256: string } {
    try {
      return documents.write(folder, path, content, baseSha256);
    } catch (error) {
      if (error instanceof DomainError && error.code === 'CONTEXT_CONFLICT') {
        throw new DomainError('CONTEXT_CONFLICT', baseSha256 === null ? 'documents.exists' : 'documents.changed', { path });
      }
      throw error;
    }
  }

  // The lock or STATUS.md stayed busy: another agent is writing; the user can simply try again.
  function busyAsMessage<T>(work: () => T): T {
    try {
      return work();
    } catch (error) {
      if (error instanceof DomainError && error.code === 'CONTEXT_CONFLICT') throw new DomainError('CONTEXT_CONFLICT', 'tasks.busy');
      throw error;
    }
  }

  function readTask(id: string, ref: string): TaskView {
    const folder = contextFolder(id);
    const found = findTask(documents.overview(folder), ref);
    if (!found) throw new DomainError('NOT_FOUND', 'project.taskNotFound');
    const { content, sha256 } = documents.read(folder, ref);
    const workstream = ref.slice(0, ref.lastIndexOf('/Tasks/'));
    return {
      ref,
      id: found.task.id,
      workstream,
      sha256,
      content,
      document: parseTaskDocument(content),
      state: found.task.state,
      group: stateGroup(found.task.state),
    };
  }

  function writeStatus(folder: string, workstream: string, title: string, task: { id: string; title: string }, word: string): void {
    const path = `${workstream}/STATUS.md`;
    // Agents may write STATUS at the same time; a changed file is read again, never overwritten.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let current: { content: string; sha256: string } | null = null;
      try {
        current = documents.read(folder, path);
      } catch (error) {
        if (!(error instanceof DomainError && error.code === 'NOT_FOUND')) throw error;
      }
      try {
        documents.write(folder, path, setStatusState(current?.content ?? null, task, word, title), current?.sha256 ?? null);
        return;
      } catch (error) {
        if (!(error instanceof DomainError && error.code === 'CONTEXT_CONFLICT')) throw error;
      }
    }
    throw new DomainError('CONTEXT_CONFLICT', 'documents.changed', { path });
  }

  function getSettings(): Settings {
    const theme = store.settings.get(THEME_KEY);
    return {
      deviceId: deviceId(),
      theme: THEMES.find((known) => known === theme) ?? 'system',
      uiLanguage: uiLanguageOf(store, defaultLocale),
      chatLanguage: isLocale(store.settings.get(CHAT_LANGUAGE_KEY)) ? (store.settings.get(CHAT_LANGUAGE_KEY) as Locale) : null,
      claudeCliPath: store.settings.get(CLI_PATH_KEYS.claude) || null,
      codexCliPath: store.settings.get(CLI_PATH_KEYS.codex) || null,
    };
  }

  return {
    listProjects(): ProjectView[] {
      return store.projects.listActive(deviceId()).map(toView);
    },

    // ADR-023 item 1: what the dialog shows before adding; nothing is written.
    // projectId: the project the folder already belongs to, when its documents are set up later.
    scanFolder(path: string, projectId?: string): FolderScan {
      requireDirectory(path);
      requireUnusedPath(path, projectId);
      const detected = documents.detect(path);
      const repo = repoContextPath(path);
      let repoContextTaken = false;
      try {
        requireFreeRepoFolder(path);
      } catch {
        repoContextTaken = true;
      }
      return {
        path,
        name: folderNameOf(path),
        found: detected.found.map((folder) => {
          const overview = documents.overview(folder);
          return { path: folder, workstreams: overview.workstreams.length, tasks: overview.workstreams.reduce((count, item) => count + item.tasks.length, 0) };
        }),
        others: detected.others,
        complete: detected.complete,
        repoContextPath: repo,
        repoContextTaken,
      };
    },

    addProject(input: { path: string; name?: string | undefined; context?: ContextChoice | undefined }): ProjectView {
      requireDirectory(input.path);
      requireUnusedPath(input.path);
      const choice = input.context;
      // Checked before the project exists, so a refused choice adds nothing.
      if (choice?.kind === 'existing') requireContextFolder(choice.path);
      if (choice?.kind === 'create' && choice.location === 'repo') requireFreeRepoFolder(input.path);
      if (choice?.kind === 'create' && choice.location === 'custom') {
        requireDirectory(choice.customPath ?? '');
        requireApartFromProject(input.path, choice.customPath ?? '');
      }
      const timestamp = now();
      const project: Project = {
        id: newId(),
        name: requireLabel(input.name ?? folderNameOf(input.path), 'field.projectName'),
        context: { enabled: false, language: 'en' },
        chatLanguage: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store.projects.insert(project, { id: newId(), deviceId: deviceId(), path: input.path });
      if (choice?.kind === 'existing') return useContext(project.id, choice.path);
      if (choice?.kind === 'create') return createContext(project.id, choice);
      // Asked already: the page does not search again.
      if (choice?.kind === 'none') store.projects.markContextDetected(project.id, deviceId(), timestamp);
      return toView(requireProject(project.id));
    },

    createContext: (input: { id: string; location: ContextLocation; customPath?: string | undefined; language: ContextLanguage }): ProjectView => createContext(input.id, input),

    useContext: (input: { id: string; path: string }): ProjectView => useContext(input.id, input.path),

    // Writes the files the documents are missing (ADR-023 item 2), never over one that exists.
    scaffoldContext(id: string): ProjectView {
      const project = requireProject(id);
      scaffold(contextFolder(id), project.context.language);
      return toView(requireProject(id));
    },

    updateProject(input: { id: string; name?: string | undefined; path?: string | undefined }): ProjectView {
      requireProject(input.id);
      const timestamp = now();
      const name = input.name === undefined ? undefined : requireLabel(input.name, 'field.projectName');
      if (input.path !== undefined) {
        requireDirectory(input.path);
        requireUnusedPath(input.path, input.id);
        store.projects.setLocation(input.id, { id: newId(), deviceId: deviceId(), path: input.path }, timestamp);
      }
      if (name !== undefined) store.projects.rename(input.id, name, timestamp);
      return toView(requireProject(input.id));
    },

    // Only hides the project: its documents stay, and its folder is never touched.
    removeProject(id: string): void {
      requireProject(id);
      store.projects.markRemoved(id, now());
    },

    // customPath: a folder the user chose, or null for the default inside AgentHub's data.
    updateProjectContext(input: {
      id: string;
      enabled?: boolean | undefined;
      language?: ContextLanguage | undefined;
      customPath?: string | null | undefined;
      // null goes back to the app's chat language.
      chatLanguage?: Locale | null | undefined;
    }): ProjectView {
      const project = requireProject(input.id);
      if (project.path === null) {
        throw new DomainError('PROJECT_PATH_MISSING', 'project.pickFolderFirst');
      }
      if (input.language !== undefined && !CONTEXT_LANGUAGES.includes(input.language)) {
        throw new DomainError('VALIDATION_FAILED', 'project.badLanguage');
      }
      if (input.chatLanguage !== undefined && input.chatLanguage !== null && !LOCALES.includes(input.chatLanguage)) {
        throw new DomainError('VALIDATION_FAILED', 'project.badLanguage');
      }
      if (input.chatLanguage !== undefined) store.projects.setChatLanguage(project.id, input.chatLanguage, now());
      const contextPath = input.customPath === undefined ? project.contextPath : input.customPath;
      if (contextPath !== null && input.customPath !== undefined) {
        requireDirectory(contextPath);
        requireApartFromProject(project.path, contextPath);
      }
      const context = { enabled: input.enabled ?? project.context.enabled, language: input.language ?? project.context.language };
      if (context.enabled && contextPath === null) ensureDirectory(defaultContextDirectory(project.id));
      store.projects.setContext(project.id, deviceId(), context, contextPath, now());
      return toView(requireProject(project.id));
    },

    // The folder the user opens in their own editor; AgentHub has no document editor (TDD §9.1).
    contextFolder,

    // ADR-020 item 5: another place for the documents. When the old folder has files, the user
    // decides first (move "ask"): move copies them without overwriting anything, then puts the old
    // folder in the Trash if it was AgentHub's own; a folder the user chose is left where it is.
    async changeContextFolder(input: { id: string; customPath: string | null; move: 'ask' | 'move' | 'leave' }): Promise<ContextFolderChange> {
      const project = requireProject(input.id);
      const view = toView(project);
      const from = view.context.path;
      const to = input.customPath ?? defaultContextDirectory(project.id);
      if (input.customPath !== null) {
        requireDirectory(input.customPath);
        requireApartFromProject(project.path, input.customPath);
      }
      if (isSamePath(from, to)) return { status: 'done', project: view, moved: 0, kept: null };
      if (isInside(to, from) || isInside(from, to)) {
        throw new DomainError('VALIDATION_FAILED', 'project.foldersNested');
      }
      const files = paths.inspect(from) === 'directory' ? documents.files(from) : [];
      if (files.length > 0 && input.move === 'ask') return { status: 'needs_decision', project: view, files: files.length };
      const moving = files.length > 0 && input.move === 'move';
      if (moving) {
        const conflicts = documents.conflicts(to, files);
        if (conflicts.length > 0) return { status: 'conflict', project: view, conflicts };
        if (input.customPath === null) ensureDirectory(to);
        documents.copy(from, to, files);
      }
      const timestamp = now();
      store.projects.setContext(project.id, deviceId(), project.context, input.customPath, timestamp);
      if (input.customPath === null && project.context.enabled) ensureDirectory(to);
      let kept: string | null = null;
      if (moving) {
        if (view.context.custom) kept = from;
        else await trash(from);
      }
      return { status: 'done', project: toView(requireProject(project.id)), moved: moving ? files.length : 0, kept };
    },

    // ADR-020 item 4: searches the project folder for documents it already has. With apply, a
    // project without documents that holds exactly one set in AgentHub's layout starts using it,
    // and the page only tells the user; several sets are listed for the user to pick.
    detectContext(input: { id: string; apply: boolean }): { project: ProjectView; found: string[]; others: string[]; applied: string | null } {
      const project = requireProject(input.id);
      if (project.path === null || paths.inspect(project.path) !== 'directory') {
        return { project: toView(project), found: [], others: [], applied: null };
      }
      const view = toView(project);
      const detected = documents.detect(project.path);
      // The set already in use is not news. A project that turned documents on before this search
      // existed may still point at an empty folder; a set found in the repo can replace it.
      const found = view.context.enabled ? detected.found.filter((folder) => !isSamePath(folder, view.context.path)) : detected.found;
      const currentEmpty = !view.context.enabled || view.context.pathStatus !== 'directory' || documents.files(view.context.path).length === 0;
      const timestamp = now();
      store.projects.markContextDetected(project.id, deviceId(), timestamp);
      const only = found.length === 1 ? (found[0] as string) : null;
      const applied = input.apply && currentEmpty && only !== null ? only : null;
      if (applied) store.projects.setContext(project.id, deviceId(), { ...project.context, enabled: true }, applied, timestamp);
      return { project: toView(requireProject(project.id)), found, others: detected.others, applied };
    },

    // What the project page shows: tasks and handoffs read from the documents, Git, warnings.
    async projectContext(id: string): Promise<ProjectContextState> {
      const view = toView(requireProject(id));
      const observation: GitObservation =
        view.path !== null && view.pathStatus === 'directory'
          ? await git.observe(view.path)
          : { state: 'unknown', root: null, branch: null, head: null, headAt: null, dirty: null };
      const readable = view.context.enabled && view.context.pathStatus === 'directory';
      const overview = readable ? documents.overview(view.context.path) : { initialized: false, filled: false, workstreams: [], issues: [] };
      return {
        overview,
        git: observation,
        warnings: readable ? contextWarnings(overview, observation, new Date(now())) : [],
        handoffs: view.context.enabled ? [] : notes.list(handoffDirectory(view.id)),
        checkpointPrompt: checkpointPrompt(view, view.chatLocale),
      };
    },

    readProjectHandoff(input: { id: string; noteId: string }): NoteWithContent {
      return notes.read(handoffDirectory(requireProject(input.id).id), input.noteId);
    },

    // A summary written in a chat that could not save it, pasted by the user (§7.5).
    saveProjectHandoff(input: { id: string; title?: string | undefined; content: string }): Note[] {
      const project = requireProject(input.id);
      if (project.context.enabled) throw new DomainError('VALIDATION_FAILED', 'project.handoffNeedsTask');
      const at = new Date(now());
      notes.save(handoffDirectory(project.id), {
        title: input.title?.trim() || `Handoff ${formatDateTime(uiLanguageOf(store, defaultLocale), at)}`,
        content: input.content,
        source: 'AgentHub (dán)',
        now: at,
      });
      return notes.list(handoffDirectory(project.id));
    },

    listLooseChats: (): Note[] => notes.list(looseChatDirectory),

    readLooseChat: (id: string): NoteWithContent => notes.read(looseChatDirectory, id),

    saveLooseChat(input: { title: string; content: string }): Note {
      return notes.save(looseChatDirectory, { ...input, source: 'AgentHub (dán)', now: new Date(now()) });
    },

    // Into the project's documents (Inbox/, for an agent to turn into a task with context-capture)
    // or, without documents, into its handoffs.
    moveLooseChat(input: { id: string; projectId: string }): void {
      const view = toView(requireProject(input.projectId));
      notes.read(looseChatDirectory, input.id);
      const target = view.context.enabled ? `${contextFolder(view.id)}/Inbox` : handoffDirectory(view.id);
      notes.move(looseChatDirectory, input.id, target);
    },

    // For a handoff written in a chat that cannot reach the files (tab Chat without MCP):
    // the only write AgentHub makes to the documents (ADR-019 item 4).
    addHandoff(input: { id: string; taskRef: string; entry: string }): ProjectContextState['overview'] {
      const folder = contextFolder(input.id);
      if (!findTask(documents.overview(folder), input.taskRef)) throw new DomainError('NOT_FOUND', 'project.taskNotFound');
      documents.appendHandoff(folder, input.taskRef, input.entry);
      return documents.overview(folder);
    },

    // --- Documents and tasks (ADR-021) ---

    listDocuments(id: string): DocumentEntry[] {
      return documents.list(contextFolder(id));
    },

    readDocument(id: string, path: string): { path: string; content: string; sha256: string } {
      return { path, ...documents.read(contextFolder(id), path) };
    },

    // For noticing a change made outside while the user reads or edits (ADR-021 item 9).
    documentChecksum(id: string, path: string): string | null {
      try {
        return documents.read(contextFolder(id), path).sha256;
      } catch (error) {
        if (error instanceof DomainError && error.code === 'NOT_FOUND') return null;
        throw error;
      }
    },

    writeDocument(input: { id: string; path: string; content: string; baseSha256: string | null }): { path: string; sha256: string } {
      const folder = contextFolder(input.id);
      return { path: input.path, ...guardedWrite(folder, input.path, input.content, input.baseSha256) };
    },

    // The absolute path, for opening a document in the user's own editor; it must exist there.
    documentPath(id: string, path: string): string {
      const folder = contextFolder(id);
      documents.read(folder, path);
      return `${folder.replace(/\/+$/, '')}/${path.split(/[\\/]/).filter(Boolean).join('/')}`;
    },

    readTask,

    saveTask(input: { id: string; ref: string; baseSha256: string; edit: TaskEdit }): TaskView {
      const project = requireProject(input.id);
      const folder = contextFolder(input.id);
      const current = readTask(input.id, input.ref);
      if (current.sha256 !== input.baseSha256) throw new DomainError('CONTEXT_CONFLICT', 'documents.changed');
      const updated = applyTaskEdit(current.content, input.edit, project.context.language);
      if (updated !== current.content) guardedWrite(folder, input.ref, updated, current.sha256);
      return readTask(input.id, input.ref);
    },

    setTaskState(input: { id: string; ref: string; state: TaskState }): TaskView {
      const project = requireProject(input.id);
      const folder = contextFolder(input.id);
      const task = readTask(input.id, input.ref);
      const language = project.context.language;
      const word = STATE_WORDS[language][input.state];
      // ADR-023 item 4: the task file says its own state; the STATUS table follows.
      const updated = setTaskFileState(task.content, word);
      if (updated !== task.content) guardedWrite(folder, input.ref, updated, task.sha256);
      const workstream = documents.overview(folder).workstreams.find((item) => item.slug === task.workstream);
      writeStatus(folder, task.workstream, workstream?.title ?? task.workstream, { id: task.id, title: task.document.title || task.id }, word);
      // Done in AgentHub is the user's confirmation, kept where the next agent reads it (item 5).
      if (input.state === 'done' && task.group !== 'done') documents.appendHandoff(folder, input.ref, verifiedHandoff(new Date(now()), language));
      return readTask(input.id, input.ref);
    },

    createTask(input: { id: string; workstream: string; title: string; goal: string }): TaskView {
      const project = requireProject(input.id);
      const folder = contextFolder(input.id);
      const overview = documents.overview(folder);
      const workstream = overview.workstreams.find((item) => item.slug === input.workstream);
      if (!workstream) throw new DomainError('NOT_FOUND', 'tasks.noWorkstream');
      const title = requireLabel(input.title, 'field.taskTitle');
      const { ref } = busyAsMessage(() => documents.createTask(folder, { workstream: workstream.slug, title, goal: input.goal, language: project.context.language }));
      return readTask(input.id, ref);
    },

    // ADR-027 item 1.4: for a task that shares its number with another one.
    renumberTask(input: { id: string; ref: string }): TaskView {
      const project = requireProject(input.id);
      const folder = contextFolder(input.id);
      if (!findTask(documents.overview(folder), input.ref)) throw new DomainError('NOT_FOUND', 'project.taskNotFound');
      const { ref } = busyAsMessage(() => documents.renumberTask(folder, input.ref, project.context.language));
      return readTask(input.id, ref);
    },

    // ADR-027 item 2: only when the user asks, so reading never changes files in the repo.
    syncStatusTable(input: { id: string; workstream: string }): { changed: number } {
      const folder = contextFolder(input.id);
      if (!documents.overview(folder).workstreams.some((item) => item.slug === input.workstream)) throw new DomainError('NOT_FOUND', 'tasks.noWorkstream');
      return { changed: busyAsMessage(() => documents.syncStatus(folder, input.workstream)) };
    },

    // A new workstream beside the others (ADR-023 item 5): its STATUS.md and an empty Tasks/.
    createWorkstream(input: { id: string; title: string }): ContextOverview {
      const project = requireProject(input.id);
      const folder = contextFolder(input.id);
      const title = requireLabel(input.title, 'field.workstreamTitle');
      const overview = documents.overview(folder);
      const group = overview.workstreams[0]?.slug.split('/')[0] ?? 'Workstreams';
      const base = taskSlug(title);
      const taken = new Set(overview.workstreams.map((item) => item.slug.toLowerCase()));
      let slug = `${group}/${base}`;
      for (let index = 2; taken.has(slug.toLowerCase()); index += 1) slug = `${group}/${base}-${index}`;
      guardedWrite(folder, `${slug}/STATUS.md`, workstreamStatusDocument(title, project.context.language), null);
      documents.makeFolder(folder, `${slug}/Tasks`);
      return documents.overview(folder);
    },

    getSettings,

    updateSettings(input: {
      theme?: Theme | undefined;
      uiLanguage?: Locale | undefined;
      chatLanguage?: Locale | null | undefined;
      claudeCliPath?: string | null | undefined;
      codexCliPath?: string | null | undefined;
    }): Settings {
      if (input.theme !== undefined) store.settings.set(THEME_KEY, input.theme);
      if (input.uiLanguage !== undefined) store.settings.set(UI_LANGUAGE_KEY, input.uiLanguage);
      // Empty follows the interface language.
      if (input.chatLanguage !== undefined) store.settings.set(CHAT_LANGUAGE_KEY, input.chatLanguage ?? '');
      // An empty value goes back to automatic discovery.
      if (input.claudeCliPath !== undefined) store.settings.set(CLI_PATH_KEYS.claude, input.claudeCliPath ?? '');
      if (input.codexCliPath !== undefined) store.settings.set(CLI_PATH_KEYS.codex, input.codexCliPath ?? '');
      return getSettings();
    },
  };
}
