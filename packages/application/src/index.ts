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

import { CLI_PATH_KEYS } from './launching';

export * from './launching';

export interface StorageStatus {
  engineVersion: string;
  schemaVersion: number;
}

// path and contextPath belong to this device; contextPath null means the default folder.
export type StoredProject = Project & { path: string | null; contextPath: string | null };

export interface ProjectRepository {
  listActive(deviceId: string): StoredProject[];
  get(id: string, deviceId: string): StoredProject | undefined;
  insert(project: Project, location: { id: string; deviceId: string; path: string }): void;
  rename(id: string, name: string, updatedAt: string): void;
  setLocation(projectId: string, location: { id: string; deviceId: string; path: string }, updatedAt: string): void;
  setContext(id: string, deviceId: string, context: Project['context'], contextPath: string | null, updatedAt: string): void;
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
}

export type ProjectView = Omit<StoredProject, 'context' | 'contextPath'> & {
  pathStatus: PathStatus | 'unset';
  context: ProjectContextView;
};

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
  newId: () => string;
  now: () => string;
}

const DEVICE_ID_KEY = 'device_id';
const THEME_KEY = 'theme';

export type Workspace = ReturnType<typeof createWorkspace>;

export function createWorkspace({ store, paths, defaultContextDirectory, ensureDirectory, newId, now }: WorkspaceDependencies) {
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

  function toView({ context, contextPath, ...project }: StoredProject): ProjectView {
    const path = contextPath ?? defaultContextDirectory(project.id);
    return {
      ...project,
      pathStatus: project.path === null ? 'unset' : paths.inspect(project.path),
      context: { ...context, path, custom: contextPath !== null, pathStatus: paths.inspect(path) },
    };
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
    contextFolder(id: string): string {
      const view = toView(requireProject(id));
      if (!view.context.enabled) throw new DomainError('VALIDATION_FAILED', 'Project này chưa bật tài liệu context.');
      if (!view.context.custom) ensureDirectory(view.context.path);
      else if (view.context.pathStatus !== 'directory') {
        throw new DomainError('PROJECT_PATH_MISSING', 'Không tìm thấy folder tài liệu. Hãy chọn lại nơi lưu.');
      }
      return view.context.path;
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
