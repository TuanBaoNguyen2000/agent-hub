import type { ProjectDto, TaskDto } from '@agenthub/contracts';
import { useCallback, useEffect, useState } from 'react';
import { api, unwrap } from './api';
import { ProjectPane } from './ProjectPane';
import { SettingsView } from './SettingsView';
import { TaskPane } from './TaskPane';
import { confirmDiscard } from './unsaved';

type Screen = { kind: 'project'; id: string } | { kind: 'task'; id: string; projectId: string } | { kind: 'settings' } | { kind: 'none' };

const byName = (a: ProjectDto, b: ProjectDto): number => a.name.localeCompare(b.name, 'vi');

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
      <input aria-label="Task mới" placeholder="+ Task mới, nhấn Enter" value={title} onChange={(event) => setTitle(event.target.value)} />
    </form>
  );
}

export function App() {
  const [projects, setProjects] = useState<ProjectDto[]>();
  const [tasksByProject, setTasksByProject] = useState<Record<string, TaskDto[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [screen, setScreen] = useState<Screen>({ kind: 'none' });
  const [error, setError] = useState<string>();

  const showError = useCallback((message: string | undefined) => setError(message), []);

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
  }, [showError, loadTasks]);

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
        <button type="button" className="primary" onClick={() => void addProject()}>
          Thêm project
        </button>
        <ul className="list grow">
          {projects?.map((project) => {
            const isOpen = expanded.has(project.id);
            return (
              <li key={project.id} className="tree-project">
                <button
                  type="button"
                  className="list-item"
                  aria-expanded={isOpen}
                  aria-current={screen.kind === 'project' && screen.id === project.id ? 'true' : undefined}
                  onClick={() => toggleProject(project)}
                >
                  <span className="chevron" aria-hidden="true">
                    {isOpen ? '▾' : '▸'}
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
                          className="list-item task-title"
                          aria-current={screen.kind === 'task' && screen.id === task.id ? 'true' : undefined}
                          onClick={() => navigate({ kind: 'task', id: task.id, projectId: project.id })}
                        >
                          <span
                            className={`dot ${task.status === 'active' ? 'active' : task.status === 'blocked' ? 'blocked' : task.status === 'done' || task.status === 'archived' ? 'done' : ''}`}
                            aria-hidden="true"
                          />
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
        <button
          type="button"
          className="list-item"
          aria-current={screen.kind === 'settings' ? 'true' : undefined}
          onClick={() => navigate({ kind: 'settings' })}
        >
          Cài đặt
        </button>
      </nav>
      <main className="content">
        {error && (
          <p className="banner error" role="alert">
            {error}
          </p>
        )}
        {screen.kind === 'settings' && <SettingsView onError={showError} />}
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
            <h1>{projects.length === 0 ? 'Chưa có project nào' : 'Chưa chọn project'}</h1>
            <p className="hint">
              {projects.length === 0
                ? 'Thêm folder của một project để bắt đầu. AgentHub không ghi gì vào folder đó.'
                : 'Chọn một project ở cột bên trái.'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
