import {
  type AccountProfile,
  CONTEXT_LANGUAGES,
  type ContextLanguage,
  DomainError,
  type LaunchAttempt,
  type LaunchOutcome,
  type LaunchStatus,
  type Project,
  folderNameOf,
  isSamePath,
  requireLabel,
} from '@agenthub/domain';

import { type ContextWarning, contextWarnings, findTask } from './context-view';
import { CLI_PATH_KEYS, isInside } from './launching';

export * from './context-view';
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

export interface MetadataStore {
  readonly projects: ProjectRepository;
  readonly settings: SettingsRepository;
  readonly profiles: ProfileRepository;
  readonly permissions: PermissionRepository;
  readonly launches: LaunchRepository;
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
  // As the workstream's STATUS table says, in the documents' own words.
  state: string | null;
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
export type ContextIssueKind = 'no_project_context' | 'no_workstream' | 'no_status' | 'no_tasks' | 'no_handoff_log';

export interface ContextIssue {
  kind: ContextIssueKind;
  // The workstream's slug, or null for the whole set of documents.
  workstream: string | null;
  taskRef: string | null;
}

export interface ContextOverview {
  initialized: boolean;
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
};

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

export function checkpointPrompt(project: { name: string; context: { enabled: boolean } }): string {
  return project.context.enabled
    ? `Use the context-checkpoint skill now, so another account can continue this work on "${project.name}".`
    : `Write a handoff for this session so another account can continue: goal, what is done (verified, observed or reported), what remains, gotchas, how to verify, and the Git branch and last commit. Save it with the agenthub MCP tool context_save_handoff for project "${project.name}". If that tool is not available, print the handoff as one Markdown block so I can paste it into AgentHub.`;
}

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export interface Settings {
  deviceId: string;
  theme: Theme;
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
    if (status === 'missing') throw new DomainError('PROJECT_PATH_MISSING', 'Không tìm thấy folder này.');
    if (status !== 'directory') throw new DomainError('PROJECT_PATH_INVALID', 'Đường dẫn này không phải là một folder.');
  }

  function requireUnusedPath(path: string, ownProjectId?: string): void {
    const taken = store.projects
      .listActive(deviceId())
      .some((project) => project.id !== ownProjectId && project.path !== null && isSamePath(project.path, path));
    if (taken) throw new DomainError('PROJECT_PATH_DUPLICATE', 'Folder này đã được thêm vào một project khác.');
  }

  function requireProject(id: string): StoredProject {
    const project = store.projects.get(id, deviceId());
    if (!project) throw new DomainError('NOT_FOUND', 'Không tìm thấy project.');
    return project;
  }

  function toView({ context, contextPath, contextDetectedAt, ...project }: StoredProject): ProjectView {
    const path = contextPath ?? defaultContextDirectory(project.id);
    return {
      ...project,
      pathStatus: project.path === null ? 'unset' : paths.inspect(project.path),
      context: { ...context, path, custom: contextPath !== null, pathStatus: paths.inspect(path), detected: contextDetectedAt !== null },
    };
  }

  function contextFolder(id: string): string {
    const view = toView(requireProject(id));
    if (!view.context.enabled) throw new DomainError('VALIDATION_FAILED', 'Project này chưa bật tài liệu context.');
    if (!view.context.custom) ensureDirectory(view.context.path);
    else if (view.context.pathStatus !== 'directory') {
      throw new DomainError('PROJECT_PATH_MISSING', 'Không tìm thấy folder tài liệu. Hãy chọn lại nơi lưu.');
    }
    return view.context.path;
  }

  function getSettings(): Settings {
    const theme = store.settings.get(THEME_KEY);
    return {
      deviceId: deviceId(),
      theme: THEMES.find((known) => known === theme) ?? 'system',
      claudeCliPath: store.settings.get(CLI_PATH_KEYS.claude) || null,
      codexCliPath: store.settings.get(CLI_PATH_KEYS.codex) || null,
    };
  }

  return {
    listProjects(): ProjectView[] {
      return store.projects.listActive(deviceId()).map(toView);
    },

    addProject(input: { path: string; name?: string | undefined }): ProjectView {
      requireDirectory(input.path);
      requireUnusedPath(input.path);
      const timestamp = now();
      const project: Project = {
        id: newId(),
        name: requireLabel(input.name ?? folderNameOf(input.path), 'Tên project'),
        context: { enabled: false, language: 'en' },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store.projects.insert(project, { id: newId(), deviceId: deviceId(), path: input.path });
      return toView(requireProject(project.id));
    },

    updateProject(input: { id: string; name?: string | undefined; path?: string | undefined }): ProjectView {
      requireProject(input.id);
      const timestamp = now();
      const name = input.name === undefined ? undefined : requireLabel(input.name, 'Tên project');
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
    }): ProjectView {
      const project = requireProject(input.id);
      if (project.path === null) {
        throw new DomainError('PROJECT_PATH_MISSING', 'Hãy chọn folder của project trên máy này trước.');
      }
      if (input.language !== undefined && !CONTEXT_LANGUAGES.includes(input.language)) {
        throw new DomainError('VALIDATION_FAILED', 'Ngôn ngữ không hợp lệ.');
      }
      const contextPath = input.customPath === undefined ? project.contextPath : input.customPath;
      if (contextPath !== null && input.customPath !== undefined) requireDirectory(contextPath);
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
      if (input.customPath !== null) requireDirectory(input.customPath);
      if (isSamePath(from, to)) return { status: 'done', project: view, moved: 0, kept: null };
      if (isInside(to, from) || isInside(from, to)) {
        throw new DomainError('VALIDATION_FAILED', 'Folder mới và folder cũ nằm trong nhau. Hãy chọn một folder khác.');
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
      const detected = documents.detect(project.path);
      const timestamp = now();
      store.projects.markContextDetected(project.id, deviceId(), timestamp);
      const only = detected.found.length === 1 ? (detected.found[0] as string) : null;
      const applied = input.apply && !project.context.enabled && only !== null ? only : null;
      if (applied) store.projects.setContext(project.id, deviceId(), { ...project.context, enabled: true }, applied, timestamp);
      return { project: toView(requireProject(project.id)), found: detected.found, others: detected.others, applied };
    },

    // What the project page shows: tasks and handoffs read from the documents, Git, warnings.
    async projectContext(id: string): Promise<ProjectContextState> {
      const view = toView(requireProject(id));
      const observation: GitObservation =
        view.path !== null && view.pathStatus === 'directory'
          ? await git.observe(view.path)
          : { state: 'unknown', root: null, branch: null, head: null, headAt: null, dirty: null };
      const readable = view.context.enabled && view.context.pathStatus === 'directory';
      const overview = readable ? documents.overview(view.context.path) : { initialized: false, workstreams: [], issues: [] };
      return {
        overview,
        git: observation,
        warnings: readable ? contextWarnings(overview, observation, new Date(now())) : [],
        handoffs: view.context.enabled ? [] : notes.list(handoffDirectory(view.id)),
        checkpointPrompt: checkpointPrompt(view),
      };
    },

    readProjectHandoff(input: { id: string; noteId: string }): NoteWithContent {
      return notes.read(handoffDirectory(requireProject(input.id).id), input.noteId);
    },

    // A summary written in a chat that could not save it, pasted by the user (§7.5).
    saveProjectHandoff(input: { id: string; title?: string | undefined; content: string }): Note[] {
      const project = requireProject(input.id);
      if (project.context.enabled) throw new DomainError('VALIDATION_FAILED', 'Project này có tài liệu context; hãy thêm handoff vào một task.');
      const at = new Date(now());
      notes.save(handoffDirectory(project.id), {
        title: input.title?.trim() || `Handoff ${at.toLocaleString('vi-VN')}`,
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
      if (!findTask(documents.overview(folder), input.taskRef)) throw new DomainError('NOT_FOUND', 'Không tìm thấy task này trong tài liệu.');
      documents.appendHandoff(folder, input.taskRef, input.entry);
      return documents.overview(folder);
    },

    getSettings,

    updateSettings(input: {
      theme?: Theme | undefined;
      claudeCliPath?: string | null | undefined;
      codexCliPath?: string | null | undefined;
    }): Settings {
      if (input.theme !== undefined) store.settings.set(THEME_KEY, input.theme);
      // An empty value goes back to automatic discovery.
      if (input.claudeCliPath !== undefined) store.settings.set(CLI_PATH_KEYS.claude, input.claudeCliPath ?? '');
      if (input.codexCliPath !== undefined) store.settings.set(CLI_PATH_KEYS.codex, input.codexCliPath ?? '');
      return getSettings();
    },
  };
}
