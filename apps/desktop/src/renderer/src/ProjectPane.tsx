import type { LaunchAttemptDto, ProfileDto, ProjectContextDto, ProjectDto, ProjectProgressDto, UsageDto } from '@agenthub/contracts';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { MessageKey } from '@agenthub/i18n';
import { api, unwrap } from './api';
import { useI18n } from './i18n';
import { PanelRight } from './icons';
import { SetUpDocsDialog } from './ContextSetup';
import { DocsFoundNotice, ProjectDocs } from './ProjectDocs';
import { DocumentsPanel, readPanelWidth } from './ProjectDocuments';
import { ProjectHandoffs } from './ProjectHandoffs';
import { ProjectHistory } from './ProjectHistory';
import { ProjectLaunch } from './ProjectLaunch';
import { ProgressRow } from './ProjectProgress';
import { ProjectSettings } from './ProjectSettings';
import { ProjectTasks } from './ProjectTasks';
import { TabPanel, Tabs } from './ui';

type Tab = 'overview' | 'tasks' | 'handoffs' | 'history' | 'settings';

const TABS: readonly { value: Tab; label: MessageKey }[] = [
  { value: 'overview', label: 'project.tab.overview' },
  { value: 'tasks', label: 'project.tab.tasks' },
  { value: 'handoffs', label: 'project.tab.handoffs' },
  { value: 'history', label: 'project.tab.history' },
  { value: 'settings', label: 'project.tab.settings' },
];

interface Props {
  project: ProjectDto;
  accounts: ProfileDto[] | undefined;
  usages: Record<string, UsageDto>;
  onOpenSettings: () => void;
  onOpenTools: (profileId?: string) => void;
  // The sidebar shows the same state beside the project (ADR-024 item 2).
  onProgress: (projectId: string, progress: ProjectProgressDto) => void;
  onChanged: (project: ProjectDto) => void;
  onRemoved: (id: string) => void;
  onError: (message: string | undefined) => void;
}

const OPEN_KEY = 'agenthub.documentsPanel.open';
const WIDTH_KEY = 'agenthub.documentsPanel.width';

function readPanelOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === 'open';
  } catch {
    return false;
  }
}

// Only a convenience: the panel opens at its default next time.
function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable.
  }
}

// ADR-024 item 1: sessions and commits happen outside the app, so the state is read again.
const PROGRESS_REFRESH_MS = 60_000;

export function ProjectPane({ project, accounts, usages, onOpenSettings, onOpenTools, onProgress, onChanged, onRemoved, onError }: Props) {
  const { t } = useI18n();
  const idBase = useId();
  const [tab, setTab] = useState<Tab>('overview');
  const [context, setContext] = useState<ProjectContextDto>();
  const [history, setHistory] = useState<LaunchAttemptDto[]>([]);
  const [creating, setCreating] = useState(false);
  // How many sets of documents an old project's folder holds, until the user answers.
  const [notice, setNotice] = useState<number>();
  const [purpose, setPurpose] = useState<'init'>();
  const [docsOpen, setDocsOpen] = useState(readPanelOpen);
  const [docsWidth, setDocsWidth] = useState(readPanelWidth);
  const [docsRequest, setDocsRequest] = useState<{ path: string; at: number } | null>(null);
  const [contextVersion, setContextVersion] = useState(0);
  const [taskFocus, setTaskFocus] = useState<{ ref: string; at: number } | null>(null);
  const [progress, setProgress] = useState<ProjectProgressDto>();
  const launchRef = useRef<HTMLDivElement>(null);
  const searched = useRef(false);

  // Documents and Git change outside the app, so they are read again when the window regains focus.
  // Reads can overlap (focus, a settings change); only the newest one may land.
  const contextRead = useRef(0);
  const loadContext = useCallback(async () => {
    const read = ++contextRead.current;
    try {
      const loaded = await unwrap(api.getProjectContext({ id: project.id }));
      if (read === contextRead.current) {
        setContext(loaded);
        setContextVersion((version) => version + 1);
      }
    } catch (reason) {
      if (read === contextRead.current) onError((reason as Error).message);
    }
    // The checkpoint prompt is written in the project's chat language, so a change reads it again.
  }, [project.id, project.context.enabled, project.context.path, project.chatLocale, onError]);

  useEffect(() => {
    void loadContext();
    window.addEventListener('focus', loadContext);
    return () => window.removeEventListener('focus', loadContext);
  }, [loadContext]);

  // ADR-023 item 6: the documents panel is shown or hidden with ⌘⇧E and remembered on this device.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        setDocsOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => remember(OPEN_KEY, docsOpen ? 'open' : 'closed'), [docsOpen]);
  useEffect(() => remember(WIDTH_KEY, String(docsWidth)), [docsWidth]);

  const loadProgress = useCallback(async () => {
    try {
      const loaded = await unwrap(api.getProjectProgress({ id: project.id }));
      setProgress(loaded);
      onProgress(project.id, loaded);
    } catch {
      // The row stays as it was; the overview shows the context errors.
    }
  }, [project.id, onProgress]);

  useEffect(() => {
    void loadProgress();
    window.addEventListener('focus', loadProgress);
    const timer = setInterval(() => void loadProgress(), PROGRESS_REFRESH_MS);
    return () => {
      window.removeEventListener('focus', loadProgress);
      clearInterval(timer);
    };
    // The documents changing changes the state too.
  }, [loadProgress, contextVersion]);

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

  // ADR-023 item 1: a project added before the dialog asked is searched once, also when it turned
  // documents on before the search existed; documents found there are only announced, and the
  // user decides in the set-up dialog.
  useEffect(() => {
    if (searched.current || project.context.detected || project.pathStatus !== 'directory') return;
    searched.current = true;
    void (async () => {
      try {
        const result = await unwrap(api.detectProjectContext({ id: project.id, apply: false }));
        onChanged(result.project);
        if (result.found.length > 0) setNotice(result.found.length);
      } catch (reason) {
        onError((reason as Error).message);
      }
    })();
  }, [project.id, project.context.detected, project.pathStatus, onChanged, onError]);

  function startCreating(): void {
    setNotice(undefined);
    setCreating(true);
  }

  // Review 2026-11-10: the overview opens an account for the project; the agent says what is in
  // progress and asks (ADR-028). A task of its own is opened from the Task tab. Switching accounts is
  // opening another account here: the launch offers the unsaved work's transcript (ADR-024 item 4).

  async function attempt<T>(action: () => Promise<T>): Promise<T | undefined> {
    onError(undefined);
    try {
      return await action();
    } catch (reason) {
      onError((reason as Error).message);
      return undefined;
    }
  }

  async function relink(): Promise<void> {
    const path = await attempt(() => unwrap(api.pickProjectFolder()));
    if (!path) return;
    const updated = await attempt(() => unwrap(api.updateProject({ id: project.id, path })));
    if (updated) onChanged(updated);
  }

  async function remove(): Promise<void> {
    const accepted = window.confirm(t('project.removeConfirm', { project: project.name }));
    if (!accepted) return;
    const done = await attempt(async () => {
      await unwrap(api.removeProject({ id: project.id }));
      return true;
    });
    if (done) onRemoved(project.id);
  }

  // ADR-023 item 2: this launch asks the agent to fill the documents in, until it is opened.
  const fillSummary = (
    <p className="task-summary" data-testid="launch-purpose">
      <span className="hint">{t('project.launchTask')}</span>
      <span className="grow truncate">{t('docs.fillPurpose')}</span>
      <button type="button" className="link" onClick={() => setPurpose(undefined)}>
        {t('common.cancel')}
      </button>
    </p>
  );

  // ADR-023: with documents, handoffs are in each task's log, so the tab is only for projects without.
  const tabs = TABS.filter((item) => item.value !== 'handoffs' || !project.context.enabled);
  useEffect(() => {
    if (tab === 'handoffs' && project.context.enabled) setTab('overview');
  }, [tab, project.context.enabled]);

  // Overview, Handoff, History and Settings read as pages; Task and Documents fill the pane like an editor.
  const page = (value: Tab, children: ReactNode) => (
    <TabPanel idBase={idBase} value={value} selected={tab} className="panel-page">
      <div className="content-inner">{children}</div>
    </TabPanel>
  );

  return (
    <div className="workspace-split">
    <div className="workspace">
      <div className="workspace-bar">
        <Tabs label={t('project.tabs')} idBase={idBase} value={tab} options={tabs.map((item) => ({ value: item.value, label: t(item.label) }))} onChange={setTab} />
        <button
          type="button"
          className={`icon-button${docsOpen ? ' pressed' : ''}`}
          aria-label={t('documents.toggle')}
          title={`${t('documents.toggle')} (⌘⇧E)`}
          aria-pressed={docsOpen}
          onClick={() => setDocsOpen((open) => !open)}
        >
          <PanelRight />
        </button>
      </div>

      {(project.pathStatus !== 'directory' || notice !== undefined) && (
        <div className="workspace-notices">
          {project.pathStatus !== 'directory' && (
            <div className="banner warning" role="alert">
              <p>{t('project.folderGone')}</p>
              <button type="button" onClick={() => void relink()}>
                {t('project.relink')}
              </button>
            </div>
          )}
          {notice !== undefined && <DocsFoundNotice count={notice} onSetUp={startCreating} onClose={() => setNotice(undefined)} />}
        </div>
      )}

      {page(
        'overview',
        <>
          <ProgressRow
            progress={progress}
            usages={usages}
            onOpenTask={(ref) => {
              setTaskFocus({ ref, at: Date.now() });
              setTab('tasks');
            }}
          />
          <div ref={launchRef} />
          <ProjectLaunch
            project={project}
            accounts={accounts}
            usages={usages}
            onOpenSettings={onOpenSettings}
            onOpenTools={onOpenTools}
            taskRef={null}
            onLaunched={() => {
              setPurpose(undefined);
              void loadHistory();
              void loadContext();
              void loadProgress();
            }}
            {...(purpose === 'init' ? { taskSummary: fillSummary } : {})}
            {...(purpose ? { purpose } : {})}
          />
          <ProjectDocs
            project={project}
            context={context}
            onChanged={onChanged}
            onSetUp={startCreating}
            onCheck={loadContext}
            onShowTasks={(ref) => {
              setTaskFocus({ ref, at: Date.now() });
              setTab('tasks');
            }}
            onFill={() => {
              setPurpose('init');
              launchRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }}
            onError={onError}
          />
        </>,
      )}
      <TabPanel idBase={idBase} value="tasks" selected={tab} className="panel-tasks">
        <ProjectTasks
          project={project}
          context={context}
          active={tab === 'tasks'}
          focus={taskFocus}
          onCreateDocs={startCreating}
          onReload={loadContext}
          onShowFile={(path) => {
            setDocsOpen(true);
            setDocsRequest({ path, at: Date.now() });
          }}
          onError={onError}
          accounts={accounts}
          usages={usages}
          onOpenSettings={onOpenSettings}
          onOpenTools={onOpenTools}
          onLaunched={() => {
            void loadHistory();
            void loadContext();
            void loadProgress();
          }}
        />
      </TabPanel>
      {page(
        'handoffs',
        <ProjectHandoffs project={project} context={context} onReload={() => void loadContext()} onError={onError} />,
      )}
      {page('history', <ProjectHistory history={history} onChanged={() => void loadHistory()} onError={onError} />)}
      {page('settings', <ProjectSettings project={project} onChanged={onChanged} onCreateDocs={startCreating} onError={onError} onRelink={() => void relink()} onRemove={() => void remove()} />)}

    </div>
      {docsOpen && (
        <DocumentsPanel
          project={project}
          version={contextVersion}
          width={docsWidth}
          onWidth={setDocsWidth}
          onClose={() => setDocsOpen(false)}
          onSetUp={startCreating}
          onChanged={loadContext}
          onOpenTask={(ref) => {
            setTaskFocus({ ref, at: Date.now() });
            setTab('tasks');
          }}
          request={docsRequest}
          onError={onError}
        />
      )}
      {creating && (
        <SetUpDocsDialog
          project={project}
          onClose={() => setCreating(false)}
          onDone={(updated) => {
            setCreating(false);
            onChanged(updated);
            setTab('overview');
          }}
        />
      )}
    </div>
  );
}
