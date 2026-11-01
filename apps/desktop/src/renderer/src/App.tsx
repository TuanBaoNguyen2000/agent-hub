import type { ProjectDto } from '@agenthub/contracts';
import { useCallback, useEffect, useState } from 'react';
import { api, unwrap } from './api';
import { ProjectView } from './ProjectView';
import { SettingsView } from './SettingsView';
import { confirmDiscard } from './unsaved';

type Screen = { kind: 'project'; id: string } | { kind: 'settings' } | { kind: 'none' };

const byName = (a: ProjectDto, b: ProjectDto): number => a.name.localeCompare(b.name, 'vi');

export function App() {
  const [projects, setProjects] = useState<ProjectDto[]>();
  const [screen, setScreen] = useState<Screen>({ kind: 'none' });
  const [error, setError] = useState<string>();

  const showError = useCallback((message: string | undefined) => setError(message), []);

  useEffect(() => {
    unwrap(api.listProjects()).then(
      (loaded) => {
        setProjects(loaded);
        if (loaded[0]) setScreen({ kind: 'project', id: loaded[0].id });
      },
      (reason: unknown) => showError((reason as Error).message),
    );
  }, [showError]);

  function navigate(next: Screen): void {
    if (confirmDiscard()) {
      setError(undefined);
      setScreen(next);
    }
  }

  async function addProject(): Promise<void> {
    if (!confirmDiscard()) return;
    setError(undefined);
    try {
      const path = await unwrap(api.pickProjectFolder());
      if (!path) return;
      const project = await unwrap(api.addProject({ path }));
      setProjects((current) => [...(current ?? []), project].sort(byName));
      setScreen({ kind: 'project', id: project.id });
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  const selected = screen.kind === 'project' ? projects?.find((project) => project.id === screen.id) : undefined;

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
          {projects?.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                className="list-item"
                aria-current={selected?.id === project.id ? 'true' : undefined}
                onClick={() => navigate({ kind: 'project', id: project.id })}
              >
                <span className="grow truncate">{project.name}</span>
                {project.pathStatus !== 'directory' && (
                  <span className="badge warning" title="Không tìm thấy folder">
                    !
                  </span>
                )}
              </button>
            </li>
          ))}
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
        {selected && (
          <ProjectView
            key={selected.id}
            project={selected}
            onError={showError}
            onChanged={(updated) =>
              setProjects((current) =>
                current?.map((project) => (project.id === updated.id ? updated : project)).sort(byName),
              )
            }
            onRemoved={(id) => {
              const remaining = projects?.filter((project) => project.id !== id) ?? [];
              setProjects(remaining);
              setScreen(remaining[0] ? { kind: 'project', id: remaining[0].id } : { kind: 'none' });
            }}
          />
        )}
        {screen.kind !== 'settings' && !selected && projects !== undefined && (
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
