import type { AgentToolsDto, NoteDto, ProfileDto, ProjectDto, ProjectProgressDto, UsageDto } from '@agenthub/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccountAvatar, PROVIDER_LABELS, useAccountLauncher, windowLabel } from './accounts';
import { AccountToolsPage, McpDetails, QuickCommandsPage, SkillLibrary, ToolsOverview, type ToolsView } from './AgentToolsPage';
import { compareText } from '@agenthub/i18n';
import { api, unwrap } from './api';
import { AddProjectDialog } from './ContextSetup';
import { useI18n } from './i18n';
import { Chat, Folder, Gear, Monitor, Plus, Puzzle, Sidebar as SidebarIcon, Terminal } from './icons';
import { LooseChatView, NewLooseChat } from './LooseChats';
import { ProjectPane } from './ProjectPane';
import { SettingsDialog, type SettingsTab } from './SettingsView';
import { Menu, MenuItem, MenuSeparator, Segmented } from './ui';
import { accountsNeedingAttention } from './toolsHealth';
import { highestUsage, resetText, usageTone, windowTitle } from './usage';
import { PROGRESS_STATES } from './ProjectProgress';

// Each read starts the account's CLI, so the sidebar only checks now and then.
const USAGE_REFRESH_MS = 10 * 60_000;
// The open project reads its own every minute; the others are read on focus and now and then.
const PROGRESS_REFRESH_MS = 5 * 60_000;

const SIDEBAR_KEY = 'agenthub.sidebar';
function readSidebar(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== 'closed';
  } catch {
    return true;
  }
}

function usageSummary(i18n: ReturnType<typeof useI18n>, usage: UsageDto): string {
  return usage.windows
    .map((window) => [`${windowTitle(i18n, window)}: ${Math.round(window.usedPercent)}%`, resetText(i18n, window)].filter(Boolean).join(', '))
    .join('\n');
}

type Screen =
  | { kind: 'project'; id: string }
  | { kind: 'loose-chat'; id: string }
  | { kind: 'new-loose-chat' }
  | { kind: 'tools'; view: ToolsView }
  | { kind: 'none' };

export function App() {
  const { t, tr, locale, chatLocale } = useI18n();
  const byName = (a: ProjectDto, b: ProjectDto): number => compareText(locale, a.name, b.name);
  const [projects, setProjects] = useState<ProjectDto[]>();
  const [accounts, setAccounts] = useState<ProfileDto[]>();
  const [usages, setUsages] = useState<Record<string, UsageDto>>({});
  // ADR-024 item 2: whether each project's work is saved, as a dot beside it.
  const [progress, setProgress] = useState<Record<string, ProjectProgressDto>>({});
  const reportProgress = useCallback((id: string, value: ProjectProgressDto) => setProgress((current) => ({ ...current, [id]: value })), []);
  const [looseChats, setLooseChats] = useState<NoteDto[]>();
  const [screen, setScreen] = useState<Screen>({ kind: 'none' });
  const [error, setError] = useState<string>();
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(readSidebar);
  const [mode, setMode] = useState<'projects' | 'notes'>('projects');
  const [adding, setAdding] = useState<string | null>(null);
  // ADR-029: every account's skills and MCP server, for the sidebar's dots and the tools pages.
  const [tools, setTools] = useState<AgentToolsDto>();

  const showError = useCallback((message: string | undefined) => setError(message), []);
  const launcher = useAccountLauncher(showError);

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

  const loadTools = useCallback(async () => {
    try {
      setTools(await unwrap(api.getAgentTools()));
    } catch (reason) {
      showError((reason as Error).message);
    }
  }, [showError]);

  const reloadAccounts = useCallback(() => {
    void loadAccounts().then(() => loadTools());
  }, [loadAccounts, loadTools]);

  // Agents add loose chats through MCP, so the list is read again when the window regains focus.
  const loadLooseChats = useCallback(async () => {
    try {
      setLooseChats(await unwrap(api.listLooseChats()));
    } catch (reason) {
      showError((reason as Error).message);
    }
  }, [showError]);

  useEffect(() => {
    void loadLooseChats();
    const reload = (): void => void loadLooseChats();
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [loadLooseChats]);

  const accountIds = accounts?.map((account) => account.id).join(',') ?? '';
  useEffect(() => {
    if (!accountIds) return;
    const ids = accountIds.split(',');
    const read = (): void => {
      for (const id of ids) {
        unwrap(api.getProfileUsage({ id })).then(
          (usage) => setUsages((current) => ({ ...current, [id]: usage })),
          () => undefined,
        );
      }
    };
    read();
    const timer = setInterval(read, USAGE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [accountIds]);

  const projectIds = projects?.map((project) => project.id).join(',') ?? '';
  useEffect(() => {
    if (!projectIds) return;
    const read = (): void => {
      for (const id of projectIds.split(',')) {
        unwrap(api.getProjectProgress({ id })).then(
          (value) => reportProgress(id, value),
          () => undefined,
        );
      }
    };
    read();
    window.addEventListener('focus', read);
    const timer = setInterval(read, PROGRESS_REFRESH_MS);
    return () => {
      window.removeEventListener('focus', read);
      clearInterval(timer);
    };
  }, [projectIds, reportProgress]);

  // Each project's chat language may follow the app's, which Settings can change. Only on a
  // change: the first list comes from the load below, and reading twice could undo a newer update.
  const shownChat = useRef(chatLocale);
  useEffect(() => {
    if (shownChat.current === chatLocale) return;
    shownChat.current = chatLocale;
    unwrap(api.listProjects()).then(
      (loaded) => setProjects((current) => (current ? loaded.sort(byName) : current)),
      () => undefined,
    );
    // Read again only when the chat language changes.
  }, [chatLocale]);

  useEffect(() => {
    unwrap(api.listProjects()).then(
      (loaded) => {
        setProjects(loaded);
        const first = loaded[0];
        if (first) setScreen({ kind: 'project', id: first.id });
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
  }, [showError, loadAccounts]);

  // The tools are read when the app starts and whenever a tools page opens; installs update them.
  useEffect(() => {
    void loadTools();
  }, [loadTools]);

  function navigate(next: Screen): void {
    setError(undefined);
    if (next.kind === 'tools' && (screen.kind !== 'tools' || next.view.kind === 'overview')) void loadTools();
    setScreen(next);
    if (next.kind === 'project') setMode('projects');
    if (next.kind === 'loose-chat' || next.kind === 'new-loose-chat') setMode('notes');
  }

  const openSettings = useCallback((tab: SettingsTab = 'general') => setSettingsTab(tab), []);

  // Cmd+B shows or hides the sidebar and Cmd+, opens Settings, as in Claude, Codex and most editors.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key === 'b') {
        event.preventDefault();
        setSidebarOpen((open) => !open);
      } else if (event.key === ',') {
        event.preventDefault();
        setSettingsTab((tab) => tab ?? 'general');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? 'open' : 'closed');
    } catch {
      // Only a convenience: the sidebar opens again next time.
    }
  }, [sidebarOpen]);

  // ADR-023 item 1: the folder first, then a dialog that says what it holds and asks.
  async function addProject(): Promise<void> {
    setError(undefined);
    try {
      const path = await unwrap(api.pickProjectFolder());
      if (path) setAdding(path);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  function added(project: ProjectDto): void {
    setAdding(null);
    setProjects((current) => [...(current ?? []), project].sort(byName));
    navigate({ kind: 'project', id: project.id });
  }

  const selectedProject = screen.kind === 'project' ? projects?.find((project) => project.id === screen.id) : undefined;
  const selectedNote = screen.kind === 'loose-chat' ? looseChats?.find((note) => note.id === screen.id) : undefined;
  const toolsAccount = screen.kind === 'tools' && screen.view.kind === 'account' ? accounts?.find((account) => account.id === (screen.view as { id: string }).id) : undefined;
  const needingTools = accountsNeedingAttention(tools);
  const title =
    selectedProject?.name ??
    selectedNote?.title ??
    (screen.kind === 'new-loose-chat' ? t('looseChat.new') : screen.kind === 'tools' ? (toolsAccount ? tr(toolsAccount.name) : t('tools.title')) : '');
  const openTools = (view: ToolsView): void => navigate({ kind: 'tools', view });

  return (
    <div className={`layout${sidebarOpen ? '' : ' sidebar-hidden'}`}>
      <header className="titlebar">
        <button
          type="button"
          className="icon-button titlebar-button"
          aria-label={t(sidebarOpen ? 'nav.hideSidebar' : 'nav.showSidebar')}
          title={`${t(sidebarOpen ? 'nav.hideSidebar' : 'nav.showSidebar')} (⌘B)`}
          aria-expanded={sidebarOpen}
          aria-controls="sidebar"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          <SidebarIcon />
        </button>
        <div className="titlebar-title">
          {title && <span className="titlebar-name truncate">{title}</span>}
          {selectedProject && (
            <span className="titlebar-path truncate" id="project-path" title={selectedProject.path ?? undefined}>
              {selectedProject.path ?? t('project.noPath')}
            </span>
          )}
        </div>
      </header>
      <nav className="sidebar" id="sidebar" aria-label={t('nav.label')} hidden={!sidebarOpen}>
        <div className="sidebar-switch">
          <Segmented
            label={t('nav.show')}
            value={mode}
            options={[
              { value: 'projects', label: t('nav.projects') },
              { value: 'notes', label: t('looseChat.section') },
            ]}
            onChange={setMode}
          />
        </div>
        {mode === 'projects' ? (
          <button type="button" className="nav-item new-item" onClick={() => void addProject()}>
            <span className="nav-icon">
              <Plus />
            </span>
            {t('nav.addProject')}
          </button>
        ) : (
          <button
            type="button"
            className="nav-item new-item"
            aria-current={screen.kind === 'new-loose-chat' ? 'true' : undefined}
            onClick={() => navigate({ kind: 'new-loose-chat' })}
          >
            <span className="nav-icon">
              <Plus />
            </span>
            {t('looseChat.add')}
          </button>
        )}
        <div className="sidebar-scroll">
          {mode === 'projects' && (
            <>
              <ul className="list">
                {projects?.map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      className="nav-item"
                      aria-current={screen.kind === 'project' && screen.id === project.id ? 'true' : undefined}
                      title={project.path ?? undefined}
                      onClick={() => navigate({ kind: 'project', id: project.id })}
                    >
                      <span className="nav-icon">
                        <Folder />
                      </span>
                      <span className="grow truncate">{project.name}</span>
                      {progress[project.id] && progress[project.id]?.state !== 'saved' && (
                        <span
                          className={`progress-dot ${progress[project.id]?.state}`}
                          role="img"
                          aria-label={t(PROGRESS_STATES[progress[project.id]?.state ?? 'none'].text)}
                          title={t(PROGRESS_STATES[progress[project.id]?.state ?? 'none'].text)}
                        />
                      )}
                      {project.pathStatus !== 'directory' && (
                        <span className="badge warning" title={t('nav.folderMissing')}>
                          !
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {projects?.length === 0 && <p className="sidebar-empty">{t('projects.empty')}</p>}
            </>
          )}
          {mode === 'notes' && (
            <>
              <ul className="list">
                {looseChats?.map((note) => (
                  <li key={note.id}>
                    <button
                      type="button"
                      className="nav-item"
                      data-testid="loose-chat"
                      aria-current={screen.kind === 'loose-chat' && screen.id === note.id ? 'true' : undefined}
                      onClick={() => navigate({ kind: 'loose-chat', id: note.id })}
                    >
                      <span className="nav-icon">
                        <Chat />
                      </span>
                      <span className="grow truncate">{note.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {looseChats?.length === 0 && <p className="sidebar-empty">{t('nav.noLooseChats')}</p>}
            </>
          )}
        </div>
        <div className="sidebar-footer">
          <button
            type="button"
            className="nav-item"
            aria-current={screen.kind === 'tools' && screen.view.kind !== 'account' ? 'true' : undefined}
            onClick={() => openTools({ kind: 'overview' })}
          >
            <span className="nav-icon">
              <Puzzle />
            </span>
            <span className="grow truncate">{t('tools.title')}</span>
            {needingTools.length > 0 && (
              <span className="tools-count" title={t('tools.overview.attention', { count: needingTools.length })}>
                <span className="progress-dot unsaved" aria-hidden="true" />
                {needingTools.length}
              </span>
            )}
          </button>
          <p className="sidebar-label">{t('nav.accounts')}</p>
          <ul className="list" aria-label={t('nav.accounts')}>
            {accounts?.map((account) => (
              <li key={account.id}>
                {/* Opening an account from here is one click away; its tools are under Agent tools (ADR-029). */}
                <Menu
                  label={t('nav.openAccountNamed', { account: tr(account.name) })}
                  triggerClassName="nav-item account-item"
                  trigger={
                    <>
                      <AccountAvatar account={account} size="sm" />
                      <span className="grow truncate">{tr(account.name)}</span>
                      {needingTools.includes(account.id) && (
                        <span className="progress-dot unsaved" role="img" aria-label={t('tools.needsAttention')} title={t('tools.needsAttention')} />
                      )}
                      <UsageChip usage={usages[account.id]} />
                    </>
                  }
                >
                  <MenuItem icon={<Monitor />} description={`${PROVIDER_LABELS[account.provider]} · ${windowLabel(t, account)}`} onSelect={() => launcher.launch(account, 'desktop')}>
                    {t('launch.openDesktop')}
                  </MenuItem>
                  <MenuItem icon={<Terminal />} description={t('nav.atHome')} onSelect={() => launcher.launch(account, 'cli')}>
                    {t('launch.openTerminal')}
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem icon={<Puzzle />} onSelect={() => openTools({ kind: 'account', id: account.id })}>
                    {t('nav.accountTools')}
                  </MenuItem>
                  <MenuItem icon={<Gear />} onSelect={() => openSettings('accounts')}>
                    {t('accounts.manage')}
                  </MenuItem>
                </Menu>
              </li>
            ))}
            {accounts?.length === 0 && (
              <li>
                <button type="button" className="nav-item muted" onClick={() => openSettings('accounts')}>
                  <span className="nav-icon">
                    <Plus />
                  </span>
                  {t('accounts.add')}
                </button>
              </li>
            )}
          </ul>
          <button type="button" className="nav-item" aria-current={settingsTab ? 'true' : undefined} title={`${t('settings.title')} (⌘,)`} onClick={() => openSettings()}>
            <span className="nav-icon">
              <Gear />
            </span>
            {t('settings.title')}
          </button>
        </div>
      </nav>
      <main className="main">
        {error && (
          <p className="banner error main-banner" role="alert">
            {error}
          </p>
        )}
        {screen.kind === 'project' && selectedProject && (
          <ProjectPane
            key={selectedProject.id}
            project={selectedProject}
            accounts={accounts}
            usages={usages}
            onProgress={reportProgress}
            onOpenSettings={() => openSettings('accounts')}
            onOpenTools={(profileId) => openTools(profileId ? { kind: 'account', id: profileId } : { kind: 'overview' })}
            onError={showError}
            onChanged={(updated) => setProjects((current) => current?.map((project) => (project.id === updated.id ? updated : project)).sort(byName))}
            onRemoved={(id) => {
              const remaining = projects?.filter((project) => project.id !== id) ?? [];
              setProjects(remaining);
              setScreen(remaining[0] ? { kind: 'project', id: remaining[0].id } : { kind: 'none' });
            }}
          />
        )}
        {screen.kind !== 'project' && (
          <div className="page-scroll">
            <div className="content-inner">
              {screen.kind === 'loose-chat' && (
                <LooseChatView
                  key={screen.id}
                  id={screen.id}
                  projects={projects ?? []}
                  onMoved={(projectId) => {
                    void loadLooseChats();
                    navigate({ kind: 'project', id: projectId });
                  }}
                  onError={showError}
                />
              )}
              {screen.kind === 'new-loose-chat' && (
                <NewLooseChat
                  onSaved={(note) => {
                    void loadLooseChats();
                    navigate({ kind: 'loose-chat', id: note.id });
                  }}
                  onError={showError}
                />
              )}
              {screen.kind === 'tools' && screen.view.kind === 'overview' && (
                <ToolsOverview tools={tools} onTools={setTools} onError={showError} accounts={accounts} onView={openTools} />
              )}
              {screen.kind === 'tools' && screen.view.kind === 'account' && toolsAccount && (
                <AccountToolsPage
                  key={toolsAccount.id}
                  tools={tools}
                  onTools={setTools}
                  onError={showError}
                  account={toolsAccount}
                  usage={usages[toolsAccount.id]}
                  onBack={() => openTools({ kind: 'overview' })}
                  onLaunch={launcher.launch}
                  onManage={() => openSettings('accounts')}
                  onOpenMcp={() => openTools({ kind: 'mcp' })}
                />
              )}
              {screen.kind === 'tools' && screen.view.kind === 'library' && (
                <SkillLibrary tools={tools} onTools={setTools} onError={showError} onBack={() => openTools({ kind: 'overview' })} />
              )}
              {screen.kind === 'tools' && screen.view.kind === 'mcp' && <McpDetails onError={showError} onBack={() => openTools({ kind: 'overview' })} />}
              {screen.kind === 'tools' && screen.view.kind === 'commands' && <QuickCommandsPage onBack={() => openTools({ kind: 'overview' })} />}
              {screen.kind === 'none' && projects !== undefined && (
                <div className="empty">
                  <span className="empty-icon" aria-hidden="true">
                    <Folder />
                  </span>
                  <h1>{t(projects.length === 0 ? 'nav.emptyTitle' : 'nav.noneSelected')}</h1>
                  <p className="hint">{t(projects.length === 0 ? 'nav.emptyHint' : 'nav.noneSelectedHint')}</p>
                  {projects.length === 0 && (
                    <button type="button" className="primary" onClick={() => void addProject()}>
                      {t('nav.chooseFolder')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      {adding && <AddProjectDialog path={adding} defaultLanguage={locale} onClose={() => setAdding(null)} onAdded={added} />}
      {settingsTab && <SettingsDialog tab={settingsTab} onTab={setSettingsTab} onClose={() => setSettingsTab(null)} onAccountsChanged={reloadAccounts} />}
      {launcher.view}
    </div>
  );
}

function UsageChip({ usage }: { usage: UsageDto | undefined }) {
  const i18n = useI18n();
  const highest = highestUsage(usage);
  if (!usage || highest === null) return null;
  const tone = usage.limitReached ? 'full' : usageTone(highest);
  // ADR-024 item 5: which limit the figure is, "Week 71%" rather than a bare number.
  const tightest = usage.windows.reduce((a, b) => (b.usedPercent > a.usedPercent ? b : a));
  return (
    <span className={`usage-chip ${tone}`} title={usageSummary(i18n, usage)} data-testid="usage-chip">
      {windowTitle(i18n, tightest)} {Math.round(highest)}%
    </span>
  );
}
