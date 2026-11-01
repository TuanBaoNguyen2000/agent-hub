import type { ProjectDto, TaskDto } from '@agenthub/contracts';
import { useEffect, useState } from 'react';
import { api, unwrap } from './api';
import { ContextEditor } from './ContextEditor';
import { STATUS_LABELS, TaskDetail } from './TaskDetail';
import { confirmDiscard } from './unsaved';

interface Props {
  project: ProjectDto;
  onChanged: (project: ProjectDto) => void;
  onRemoved: (id: string) => void;
  onError: (message: string | undefined) => void;
}

export function ProjectView({ project, onChanged, onRemoved, onError }: Props) {
  const [tasks, setTasks] = useState<TaskDto[]>();
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [newTitle, setNewTitle] = useState('');
  const [name, setName] = useState(project.name);
  const [showContext, setShowContext] = useState(false);

  useEffect(() => {
    let current = true;
    unwrap(api.listTasks({ projectId: project.id })).then(
      (loaded) => {
        if (current) setTasks(loaded);
      },
      (reason: unknown) => onError((reason as Error).message),
    );
    return () => {
      current = false;
    };
  }, [project.id, onError]);

  async function attempt<T>(action: () => Promise<T>): Promise<T | undefined> {
    onError(undefined);
    try {
      return await action();
    } catch (reason) {
      onError((reason as Error).message);
      return undefined;
    }
  }

  async function createTask(): Promise<void> {
    const task = await attempt(() => unwrap(api.createTask({ projectId: project.id, title: newTitle })));
    if (!task) return;
    setTasks((current) => [task, ...(current ?? [])]);
    setNewTitle('');
    setSelectedTaskId(task.id);
  }

  async function rename(): Promise<void> {
    if (name.trim() === project.name) {
      setName(project.name);
      return;
    }
    const updated = await attempt(() => unwrap(api.updateProject({ id: project.id, name })));
    if (updated) {
      onChanged(updated);
      setName(updated.name);
    } else {
      setName(project.name);
    }
  }

  async function relink(): Promise<void> {
    const path = await attempt(() => unwrap(api.pickProjectFolder()));
    if (!path) return;
    const updated = await attempt(() => unwrap(api.updateProject({ id: project.id, path })));
    if (updated) onChanged(updated);
  }

  async function remove(): Promise<void> {
    if (!confirmDiscard()) return;
    const accepted = window.confirm(
      `Gỡ "${project.name}" khỏi AgentHub?\n\nFolder của project không bị xoá. Task và context vẫn được giữ trong dữ liệu của AgentHub, nhưng hiện chưa có cách khôi phục trong app.`,
    );
    if (!accepted) return;
    const done = await attempt(async () => {
      await unwrap(api.removeProject({ id: project.id }));
      return true;
    });
    if (done) onRemoved(project.id);
  }

  const selectedTask = tasks?.find((task) => task.id === selectedTaskId);

  return (
    <div className="stack">
      <header className="stack">
        <label className="field">
          <span className="field-label">Tên project</span>
          <input
            className="title-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </label>
        <p className="path" id="project-path">
          {project.path ?? 'Chưa có đường dẫn trên máy này'}
        </p>
        {project.pathStatus !== 'directory' && (
          <div className="banner warning" role="alert">
            <p>Không tìm thấy folder của project. Task và context vẫn còn nguyên.</p>
            <button type="button" onClick={() => void relink()}>
              Chọn lại folder
            </button>
          </div>
        )}
        <div className="row">
          {project.pathStatus === 'directory' && (
            <button type="button" onClick={() => void relink()}>
              Đổi folder
            </button>
          )}
          <button type="button" onClick={() => void remove()}>
            Gỡ khỏi AgentHub
          </button>
        </div>
      </header>

      {selectedTask ? (
        <TaskDetail
          key={selectedTask.id}
          task={selectedTask}
          onChanged={(updated) =>
            setTasks((current) => current?.map((task) => (task.id === updated.id ? updated : task)))
          }
          onBack={() => {
            if (confirmDiscard()) setSelectedTaskId(undefined);
          }}
        />
      ) : (
        <>
          <section className="stack">
            <h2>Tasks</h2>
            <form
              className="row"
              onSubmit={(event) => {
                event.preventDefault();
                void createTask();
              }}
            >
              <input
                className="grow"
                aria-label="Tiêu đề task mới"
                placeholder="Tiêu đề task mới"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
              />
              <button type="submit" className="primary" disabled={newTitle.trim().length === 0}>
                Tạo task
              </button>
            </form>
            {tasks?.length === 0 && <p className="hint">Project này chưa có task.</p>}
            <ul className="list">
              {tasks?.map((task) => (
                <li key={task.id}>
                  <button type="button" className="list-item" onClick={() => setSelectedTaskId(task.id)}>
                    <span className="grow">{task.title}</span>
                    <span className="badge">{STATUS_LABELS[task.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="stack">
            <button
              type="button"
              className="link"
              aria-expanded={showContext}
              onClick={() => {
                if (!showContext || confirmDiscard()) setShowContext(!showContext);
              }}
            >
              {showContext ? '▾' : '▸'} Project context
            </button>
            {showContext && (
              <ContextEditor
                key={project.id}
                reference={{ scope: 'project', projectId: project.id }}
                label="Project context"
                hint="Kiến trúc, quy ước và ràng buộc chung của project."
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
