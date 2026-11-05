import type { LaunchAttemptDto, ProfileDto, ProjectContextDto, ProjectDto } from '@agenthub/contracts';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { api, unwrap } from './api';
import { Folder, More } from './icons';
import { CreateDocsDialog, type DocsNotice, DocsFoundNotice, ProjectDocs } from './ProjectDocs';
import { ProjectHandoffs } from './ProjectHandoffs';
import { ProjectHistory } from './ProjectHistory';
import { ProjectLaunch } from './ProjectLaunch';
import { ProjectSettings } from './ProjectSettings';
import { ProjectTasks, allTasks } from './ProjectTasks';
import { Menu, MenuItem, TabPanel, Tabs } from './ui';

type Tab = 'overview' | 'tasks' | 'handoffs' | 'history' | 'settings';

const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Tổng quan' },
  { value: 'tasks', label: 'Task' },
  { value: 'handoffs', label: 'Handoff' },
  { value: 'history', label: 'Lịch sử' },
  { value: 'settings', label: 'Cài đặt' },
];

interface Props {
  project: ProjectDto;
  accounts: ProfileDto[] | undefined;
  onOpenSettings: () => void;
  onChanged: (project: ProjectDto) => void;
  onRemoved: (id: string) => void;
  onError: (message: string | undefined) => void;
}

export function ProjectPane({ project, accounts, onOpenSettings, onChanged, onRemoved, onError }: Props) {
  const idBase = useId();
  const [tab, setTab] = useState<Tab>('overview');
  const [name, setName] = useState(project.name);
  const [context, setContext] = useState<ProjectContextDto>();
  const [history, setHistory] = useState<LaunchAttemptDto[]>([]);
  const [taskRef, setTaskRef] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<DocsNotice>();
  const chosen = useRef(false);
  const searched = useRef(false);

  // Documents and Git change outside the app, so they are read again when the window regains focus.
  const loadContext = useCallback(async () => {
    try {
      setContext(await unwrap(api.getProjectContext({ id: project.id })));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }, [project.id, project.context.enabled, project.context.path, onError]);

  useEffect(() => {
    void loadContext();
    window.addEventListener('focus', loadContext);
    return () => window.removeEventListener('focus', loadContext);
  }, [loadContext]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await unwrap(api.listLaunches({ projectId: project.id })));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }, [project.id, onError]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // ADR-020 item 4: looks for documents the project already has. Returns whether the user still
  // has to choose or create a place for them.
  const detect = useCallback(async (): Promise<boolean> => {
    try {
      const result = await unwrap(api.detectProjectContext({ id: project.id, apply: true }));
      onChanged(result.project);
      if (result.applied) setNotice({ kind: 'applied', path: result.applied });
      else if (result.found.length > 1) setNotice({ kind: 'choose', found: result.found });
      return result.applied === null && result.found.length <= 1;
    } catch (reason) {
      onError((reason as Error).message);
      return true;
    }
  }, [project.id, onChanged, onError]);

  // Once per device for a project without documents: right after it is added, and for projects
  // added before this search existed.
  useEffect(() => {
    if (searched.current || project.context.detected || project.context.enabled || project.pathStatus !== 'directory') return;
    searched.current = true;
    void detect();
  }, [detect, project.context.detected, project.context.enabled, project.pathStatus]);

  async function startCreating(): Promise<void> {
    setNotice(undefined);
    if (await detect()) setCreating(true);
  }

  // Starts on the task opened last time, until the user picks one; a task gone from the
  // documents falls back to none.
  const tasks = allTasks(context);
  const lastLaunchedTask = history.find((attempt) => attempt.taskRef)?.taskRef ?? null;
  const known = (ref: string | null): boolean => ref === null || tasks.some((task) => task.ref === ref);
  useEffect(() => {
    if (!chosen.current && lastLaunchedTask && known(lastLaunchedTask) && taskRef === null) setTaskRef(lastLaunchedTask);
    else if (!known(taskRef)) setTaskRef(null);
  });
  const selectedTask = tasks.find((task) => task.ref === taskRef);

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

  const taskSummary = project.context.enabled && tasks.length > 0 && (
    <p className="task-summary" data-testid="launch-task">
      <span className="hint">Task cho lần mở:</span>
      <span className="grow truncate">{selectedTask ? selectedTask.title : 'Không chọn (agent hỏi bạn)'}</span>
      <button type="button" className="link" onClick={() => setTab('tasks')}>
        Đổi
      </button>
    </p>
  );

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

      {notice && (
        <DocsFoundNotice
          project={project}
          notice={notice}
          onChanged={onChanged}
          onElsewhere={() => {
            setNotice(undefined);
            setTab('settings');
          }}
          onCreate={() => {
            setNotice(undefined);
            setCreating(true);
          }}
          onClose={() => setNotice(undefined)}
          onError={onError}
        />
      )}

      <Tabs label="Trang project" idBase={idBase} value={tab} options={TABS} onChange={setTab} />

      <TabPanel idBase={idBase} value="overview" selected={tab}>
        <ProjectLaunch
          project={project}
          accounts={accounts}
          onOpenSettings={onOpenSettings}
          taskRef={taskRef}
          history={history}
          onLaunched={() => {
            void loadHistory();
            void loadContext();
          }}
          taskSummary={taskSummary}
        />
        <ProjectDocs
          project={project}
          context={context}
          onChanged={onChanged}
          onCreate={() => void startCreating()}
          onCheck={loadContext}
          onShowTasks={() => setTab('tasks')}
          onError={onError}
        />
      </TabPanel>
      <TabPanel idBase={idBase} value="tasks" selected={tab}>
        <ProjectTasks
          project={project}
          context={context}
          selected={taskRef}
          onSelect={(ref) => {
            chosen.current = true;
            setTaskRef(ref);
          }}
          onCreateDocs={() => void startCreating()}
        />
      </TabPanel>
      <TabPanel idBase={idBase} value="handoffs" selected={tab}>
        <ProjectHandoffs
          project={project}
          context={context}
          selectedTask={selectedTask}
          onPickTask={() => setTab('tasks')}
          onReload={() => void loadContext()}
          onError={onError}
        />
      </TabPanel>
      <TabPanel idBase={idBase} value="history" selected={tab}>
        <ProjectHistory history={history} onChanged={() => void loadHistory()} onError={onError} />
      </TabPanel>
      <TabPanel idBase={idBase} value="settings" selected={tab}>
        <ProjectSettings project={project} onChanged={onChanged} onCreateDocs={() => void startCreating()} onError={onError} />
      </TabPanel>

      {creating && (
        <CreateDocsDialog
          project={project}
          onClose={() => setCreating(false)}
          onCreated={(updated) => {
            setCreating(false);
            onChanged(updated);
            setTab('overview');
          }}
          onError={onError}
        />
      )}
    </div>
  );
}
