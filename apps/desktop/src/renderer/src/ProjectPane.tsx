import type { ProfileDto, ProjectDto } from '@agenthub/contracts';
import { useState } from 'react';
import { api, unwrap } from './api';
import { Folder, More } from './icons';
import { ProjectContext } from './ProjectContext';
import { ProjectLaunch } from './ProjectLaunch';
import { Menu, MenuItem } from './ui';

interface Props {
  project: ProjectDto;
  accounts: ProfileDto[] | undefined;
  onOpenSettings: () => void;
  onChanged: (project: ProjectDto) => void;
  onRemoved: (id: string) => void;
  onError: (message: string | undefined) => void;
}

export function ProjectPane({ project, accounts, onOpenSettings, onChanged, onRemoved, onError }: Props) {
  const [name, setName] = useState(project.name);

  async function attempt<T>(action: () => Promise<T>): Promise<T | undefined> {
    onError(undefined);
    try {
      return await action();
    } catch (reason) {
      onError((reason as Error).message);
      return undefined;
    }
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
    const accepted = window.confirm(
      `Gỡ "${project.name}" khỏi AgentHub?\n\nFolder của project và tài liệu context không bị xoá, nhưng hiện chưa có cách khôi phục project trong app.`,
    );
    if (!accepted) return;
    const done = await attempt(async () => {
      await unwrap(api.removeProject({ id: project.id }));
      return true;
    });
    if (done) onRemoved(project.id);
  }

  return (
    <div className="stack page">
      <header className="page-header">
        <div className="header-row">
          <p className="breadcrumb grow" id="project-path">
            <Folder />
            <span className="truncate">{project.path ?? 'Chưa có đường dẫn trên máy này'}</span>
          </p>
          <Menu label="Thao tác với project" triggerClassName="icon-button" align="end" trigger={<More />}>
            {project.pathStatus === 'directory' && (
              <MenuItem icon={<Folder />} onSelect={() => void relink()}>
                Đổi folder
              </MenuItem>
            )}
            <MenuItem tone="danger" onSelect={() => void remove()}>
              Gỡ khỏi AgentHub
            </MenuItem>
          </Menu>
        </div>
        <input
          className="bare-input page-title"
          aria-label="Tên project"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void rename()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        {project.pathStatus !== 'directory' && (
          <div className="banner warning" role="alert">
            <p>Không tìm thấy folder của project. Tài liệu context và lịch sử vẫn còn nguyên.</p>
            <button type="button" onClick={() => void relink()}>
              Chọn lại folder
            </button>
          </div>
        )}
      </header>
      <ProjectLaunch project={project} accounts={accounts} onOpenSettings={onOpenSettings}>
        <ProjectContext project={project} onChanged={onChanged} onError={onError} />
      </ProjectLaunch>
    </div>
  );
}
