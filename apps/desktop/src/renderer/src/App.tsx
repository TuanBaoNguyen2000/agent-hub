import type { ProfileDto, ProjectDto, TaskDto } from '@agenthub/contracts';
import { useCallback, useEffect, useState } from 'react';
import { AccountAvatar, PROVIDER_LABELS, useAccountLauncher, windowLabel } from './accounts';
import { api, unwrap } from './api';
import { ChevronRight, Folder, Gear, Monitor, Plus, Terminal } from './icons';
import { ProjectPane } from './ProjectPane';
import { SettingsView } from './SettingsView';
import { TaskPane } from './TaskPane';
import { Menu, MenuItem, MenuSeparator } from './ui';
import { confirmDiscard } from './unsaved';

type Screen = { kind: 'project'; id: string } | { kind: 'task'; id: string; projectId: string } | { kind: 'settings' } | { kind: 'none' };

const byName = (a: ProjectDto, b: ProjectDto): number => a.name.localeCompare(b.name, 'vi');

const STATUS_DOT: Partial<Record<TaskDto['status'], string>> = { active: 'active', blocked: 'blocked', done: 'done', archived: 'done' };

function NewTask({ onCreate }: { onCreate: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState('');
  return (
    <form
      className="new-task"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim().length > 0) void onCreate(title).then(() => setTitle(''));
      }}
    >
      <span className="new-task-icon" aria-hidden="true">
        <Plus />
      </span>
      <input aria-label="Task mới" placeholder="Task mới" value={title} onChange={(event) => setTitle(event.target.value)} />
    </form>
  );
}

export function App() {
  const [projects, setProjects] = useState<ProjectDto[]>();
  const [tasksByProject, setTasksByProject] = useState<Record<string, TaskDto[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [accounts, setAccounts] = useState<ProfileDto[]>();
  const [screen, setScreen] = useState<Screen>({ kind: 'none' });
  const [error, setError] = useState<string>();

  const showError = useCallback((message: string | undefined) => setError(message), []);
  const launcher = useAccountLauncher(showError);

  const loadTasks = useCallback(
    async (projectId: string) => {
      try {
        const tasks = await unwrap(api.listTasks({ projectId }));
        setTasksByProject((current) => ({ ...current, [projectId]: tasks }));
      } catch (reason) {
        showError((reason as Error).message);
      }
    },
    [showError],
  );

  const loadAccounts = useCallback(async () => {
    try {
      const loaded = await unwrap(api.listProfiles());
      setAccounts(loaded);
      return loaded;
    } catch (reason) {
      showError((reason as Error).message);
      return [];
    }
  }, [showError]);

  const reloadAccounts = useCallback(() => void loadAccounts(), [loadAccounts]);

  function expand(projectId: string): void {
    setExpanded((current) => new Set(current).add(projectId));
    if (!tasksByProject[projectId]) void loadTasks(projectId);
  }

  useEffect(() => {
    unwrap(api.listProjects()).then(
      (loaded) => {
        setProjects(loaded);
        const first = loaded[0];
        if (first) {
          setScreen({ kind: 'project', id: first.id });
          setExpanded(new Set([first.id]));
          void loadTasks(first.id);
        }
      },
      (reason: unknown) => showError((reason as Error).message),
    );
    void loadAccounts().then((loaded) => {
      // An account not yet seen signed in gets its name as soon as the CLI can tell.
      const unnamed = loaded.filter((item) => item.accountEmail === null);
      if (unnamed.length > 0) {
        void Promise.all(unnamed.map((item) => api.getProfileStatus({ id: item.id }))).then(() => loadAccounts());
      }
    });
  }, [showError, loadTasks, loadAccounts]);

  function navigate(next: Screen): void {
    if (confirmDiscard()) {
      setError(undefined);
      setScreen(next);
    }
  }

  function toggleProject(project: ProjectDto): void {
    const isOpenProject = screen.kind === 'project' && screen.id === project.id;
    if (isOpenProject && expanded.has(project.id)) {
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(project.id);
        return next;
      });
      return;
    }
    expand(project.id);
    navigate({ kind: 'project', id: project.id });
  }

  async function addProject(): Promise<void> {
    if (!confirmDiscard()) return;
    setError(undefined);
    try {
      const path = await unwrap(api.pickProjectFolder());
      if (!path) return;
      const project = await unwrap(api.addProject({ path }));
      setProjects((current) => [...(current ?? []), project].sort(byName));
      setTasksByProject((current) => ({ ...current, [project.id]: [] }));
      setExpanded((current) => new Set(current).add(project.id));
      setScreen({ kind: 'project', id: project.id });
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function createTask(projectId: string, title: string): Promise<void> {
    if (!confirmDiscard()) return;
    setError(undefined);
    try {
      const task = await unwrap(api.createTask({ projectId, title }));
      setTasksByProject((current) => ({ ...current, [projectId]: [task, ...(current[projectId] ?? [])] }));
      setScreen({ kind: 'task', id: task.id, projectId });
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  const activeProjectId = screen.kind === 'project' ? screen.id : screen.kind === 'task' ? screen.projectId : undefined;
  const selectedProject = projects?.find((project) => project.id === activeProjectId);
  const selectedTask = screen.kind === 'task' ? tasksByProject[screen.projectId]?.find((task) => task.id === screen.id) : undefined;

  return (
    <div className="layout">
      <nav className="sidebar" aria-label="Projects">
        <div className="sidebar-header">
          <span className="brand">AgentHub</span>
        </div>
        <button type="button" className="nav-item" onClick={() => void addProject()}>
          <span className="nav-icon">
            <Plus />
          </span>
          Thêm project
        </button>
        <div className="sidebar-scroll">
          <p className="sidebar-label">Projects</p>
          <ul className="list">
            {projects?.map((project) => {
              const isOpen = expanded.has(project.id);
              return (
                <li key={project.id} className="tree-project">
                  <button
                    type="button"
                    className="nav-item"
                    aria-expanded={isOpen}
                    aria-current={screen.kind === 'project' && screen.id === project.id ? 'true' : undefined}
                    onClick={() => toggleProject(project)}
                  >
                    <span className="nav-icon chevron" data-open={isOpen}>
                      <ChevronRight />
                    </span>
                    <span className="grow truncate">{project.name}</span>
                    {project.pathStatus !== 'directory' && (
                      <span className="badge warning" title="Không tìm thấy folder">
                        !
                      </span>
                    )}
                  </button>
                  {isOpen && (
                    <ul className="tree-tasks">
                      {tasksByProject[project.id]?.map((task) => (
                        <li key={task.id}>
                          <button
                            type="button"
                            className="nav-item task-title"
                            aria-current={screen.kind === 'task' && screen.id === task.id ? 'true' : undefined}
                            onClick={() => navigate({ kind: 'task', id: task.id, projectId: project.id })}
                          >
                            <span className={`dot ${STATUS_DOT[task.status] ?? ''}`} aria-hidden="true" />
                            <span className="grow truncate">{task.title}</span>
                          </button>
                        </li>
                      ))}
                      <li>
                        <NewTask onCreate={(title) => createTask(project.id, title)} />
                      </li>
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="sidebar-footer">
          <p className="sidebar-label">Accounts</p>
          <ul className="list" aria-label="Mở account">
            {accounts?.map((account) => (
              <li key={account.id}>
                <Menu
                  label={`Mở ${account.name}`}
                  triggerClassName="nav-item account-item"
                  trigger={
                    <>
                      <AccountAvatar account={account} size="sm" />
                      <span className="grow truncate">{account.name}</span>
                    </>
                  }
                >
                  <MenuItem icon={<Monitor />} description={`${PROVIDER_LABELS[account.provider]} · ${windowLabel(account)}`} onSelect={() => launcher.launch(account, 'desktop')}>
                    Mở trong Desktop
                  </MenuItem>
                  <MenuItem icon={<Terminal />} description="Tại thư mục home" onSelect={() => launcher.launch(account, 'cli')}>
                    Mở trong Terminal
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem icon={<Gear />} onSelect={() => navigate({ kind: 'settings' })}>
                    Quản lý account
                  </MenuItem>
                </Menu>
              </li>
            ))}
            {accounts?.length === 0 && (
              <li>
                <button type="button" className="nav-item muted" onClick={() => navigate({ kind: 'settings' })}>
                  <span className="nav-icon">
                    <Plus />
                  </span>
                  Thêm account
                </button>
              </li>
            )}
          </ul>
          <button
            type="button"
            className="nav-item"
            aria-current={screen.kind === 'settings' ? 'true' : undefined}
            onClick={() => navigate({ kind: 'settings' })}
          >
            <span className="nav-icon">
              <Gear />
            </span>
            Cài đặt
          </button>
        </div>
      </nav>
      <main className="content">
        <div className="content-inner">
          {error && (
            <p className="banner error" role="alert">
              {error}
            </p>
          )}
          {screen.kind === 'settings' && <SettingsView onError={showError} onAccountsChanged={reloadAccounts} />}
          {screen.kind === 'project' && selectedProject && (
            <ProjectPane
              key={selectedProject.id}
              project={selectedProject}
              onError={showError}
              onChanged={(updated) =>
                setProjects((current) => current?.map((project) => (project.id === updated.id ? updated : project)).sort(byName))
              }
              onRemoved={(id) => {
                const remaining = projects?.filter((project) => project.id !== id) ?? [];
                setProjects(remaining);
                setScreen(remaining[0] ? { kind: 'project', id: remaining[0].id } : { kind: 'none' });
              }}
            />
          )}
          {screen.kind === 'task' && selectedTask && selectedProject && (
            <TaskPane
              key={selectedTask.id}
              task={selectedTask}
              project={selectedProject}
              accounts={accounts}
              onChanged={(updated) =>
                setTasksByProject((current) => ({
                  ...current,
                  [updated.projectId]: (current[updated.projectId] ?? []).map((task) => (task.id === updated.id ? updated : task)),
                }))
              }
              onOpenSettings={() => navigate({ kind: 'settings' })}
            />
          )}
          {screen.kind === 'none' && projects !== undefined && (
            <div className="empty">
              <span className="empty-icon" aria-hidden="true">
                <Folder />
              </span>
              <h1>{projects.length === 0 ? 'Chưa có project nào' : 'Chưa chọn project'}</h1>
              <p className="hint">
                {projects.length === 0
                  ? 'Thêm folder của một project để bắt đầu. AgentHub không ghi gì vào folder đó.'
                  : 'Chọn một project ở cột bên trái.'}
              </p>
              {projects.length === 0 && (
                <button type="button" className="primary" onClick={() => void addProject()}>
                  Chọn folder
                </button>
              )}
            </div>
          )}
        </div>
      </main>
      {launcher.view}
    </div>
  );
}
