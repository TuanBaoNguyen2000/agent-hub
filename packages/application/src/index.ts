import {
  type AccountProfile,
  DomainError,
  type LaunchAttempt,
  type LaunchOutcome,
  type LaunchStatus,
  type Project,
  type Task,
  type TaskStatus,
  folderNameOf,
  isSamePath,
  requireLabel,
} from '@agenthub/domain';

import { CLI_PATH_KEYS } from './launching';

export * from './launching';

export interface StorageStatus {
  engineVersion: string;
  schemaVersion: number;
}

export type StoredProject = Project & { path: string | null };

export interface ProjectRepository {
  listActive(deviceId: string): StoredProject[];
  get(id: string, deviceId: string): StoredProject | undefined;
  insert(project: Project, location: { id: string; deviceId: string; path: string }): void;
  rename(id: string, name: string, updatedAt: string): void;
  setLocation(projectId: string, location: { id: string; deviceId: string; path: string }, updatedAt: string): void;
  markRemoved(id: string, removedAt: string): void;
}

export interface TaskRepository {
  list(projectId: string): Task[];
  get(id: string): Task | undefined;
  insert(task: Task): void;
  update(task: Task): void;
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
  list(taskId: string): LaunchAttempt[];
  get(id: string): LaunchAttempt | undefined;
  insert(attempt: Pick<LaunchAttempt, 'id' | 'taskId' | 'profileId' | 'mode' | 'status' | 'createdAt'>): void;
  finish(id: string, status: LaunchStatus, errorCode: string | null, outcome: LaunchOutcome | null): void;
  confirmAccount(id: string, at: string): void;
}

export interface MetadataStore {
  readonly projects: ProjectRepository;
  readonly tasks: TaskRepository;
  readonly settings: SettingsRepository;
  readonly profiles: ProfileRepository;
  readonly permissions: PermissionRepository;
  readonly launches: LaunchRepository;
  status(): StorageStatus;
  close(): void;
}

export type ContextDocumentName = 'project' | 'task' | 'decisions';

export interface ContextAddress {
  projectId: string;
  taskId?: string;
  document: ContextDocumentName;
}

export interface ContextDocument {
  content: string;
  // Content checksum; null while the document has never been saved.
  revision: string | null;
  modifiedAt: string | null;
}

export interface ContextStore {
  read(address: ContextAddress): ContextDocument;
  write(address: ContextAddress, content: string, expectedRevision: string | null): ContextDocument;
}

export type PathStatus = 'directory' | 'not_directory' | 'missing' | 'not_absolute';

export interface PathInspector {
  inspect(path: string): PathStatus;
}

export type ProjectView = StoredProject & { pathStatus: PathStatus | 'unset' };

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
  context: ContextStore;
  paths: PathInspector;
  newId: () => string;
  now: () => string;
}

export type ContextReference =
  | { scope: 'project'; projectId: string }
  | { scope: 'task'; taskId: string; document: 'task' | 'decisions' };

const DEVICE_ID_KEY = 'device_id';
const THEME_KEY = 'theme';

export type Workspace = ReturnType<typeof createWorkspace>;

export function createWorkspace({ store, context, paths, newId, now }: WorkspaceDependencies) {
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

  function requireTask(id: string): Task {
    const task = store.tasks.get(id);
    if (!task) throw new DomainError('NOT_FOUND', 'Không tìm thấy task.');
    return task;
  }

  function toView(project: StoredProject): ProjectView {
    return { ...project, pathStatus: project.path === null ? 'unset' : paths.inspect(project.path) };
  }

  function addressOf(reference: ContextReference): ContextAddress {
    if (reference.scope === 'project') {
      return { projectId: requireProject(reference.projectId).id, document: 'project' };
    }
    const task = requireTask(reference.taskId);
    return { projectId: task.projectId, taskId: task.id, document: reference.document };
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

    // Only hides the project: its tasks and artifacts stay, and its folder is never touched.
    removeProject(id: string): void {
      requireProject(id);
      store.projects.markRemoved(id, now());
    },

    listTasks(projectId: string): Task[] {
      requireProject(projectId);
      return store.tasks.list(projectId);
    },

    createTask(input: { projectId: string; title: string; objective?: string | undefined }): Task {
      requireProject(input.projectId);
      const timestamp = now();
      const task: Task = {
        id: newId(),
        projectId: input.projectId,
        title: requireLabel(input.title, 'Tiêu đề task'),
        objective: input.objective ?? '',
        acceptanceCriteria: '',
        status: 'backlog',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store.tasks.insert(task);
      return task;
    },

    updateTask(input: {
      id: string;
      title?: string | undefined;
      objective?: string | undefined;
      acceptanceCriteria?: string | undefined;
      status?: TaskStatus | undefined;
    }): Task {
      const current = requireTask(input.id);
      const updated: Task = {
        ...current,
        title: input.title === undefined ? current.title : requireLabel(input.title, 'Tiêu đề task'),
        objective: input.objective ?? current.objective,
        acceptanceCriteria: input.acceptanceCriteria ?? current.acceptanceCriteria,
        status: input.status ?? current.status,
        updatedAt: now(),
      };
      store.tasks.update(updated);
      return updated;
    },

    readContext(reference: ContextReference): ContextDocument {
      return context.read(addressOf(reference));
    },

    saveContext(reference: ContextReference, content: string, expectedRevision: string | null): ContextDocument {
      return context.write(addressOf(reference), content, expectedRevision);
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
