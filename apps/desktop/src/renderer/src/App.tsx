import type { NoteDto, ProfileDto, ProjectDto, UsageDto } from '@agenthub/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccountAvatar, PROVIDER_LABELS, useAccountLauncher, windowLabel } from './accounts';
import { compareText } from '@agenthub/i18n';
import { api, unwrap } from './api';
import { useI18n } from './i18n';
import { Chat, Folder, Gear, Monitor, Plus, Terminal } from './icons';
import { LooseChatView, NewLooseChat } from './LooseChats';
import { ProjectPane } from './ProjectPane';
import { SettingsView } from './SettingsView';
import { Menu, MenuItem, MenuSeparator } from './ui';
import { highestUsage, resetText, usageTone, windowTitle } from './usage';

// Each read starts the account's CLI, so the sidebar only checks now and then.
const USAGE_REFRESH_MS = 10 * 60_000;

function usageSummary(i18n: ReturnType<typeof useI18n>, usage: UsageDto): string {
  return usage.windows
    .map((window) => [`${windowTitle(i18n, window)}: ${Math.round(window.usedPercent)}%`, resetText(i18n, window)].filter(Boolean).join(', '))
    .join('\n');
}

type Screen =
  | { kind: 'project'; id: string }
  | { kind: 'loose-chat'; id: string }
  | { kind: 'new-loose-chat' }
  // section: where the page opens, such as the Agent tools a launch points to.
  | { kind: 'settings'; section?: 'tools' }
  | { kind: 'none' };

export function App() {
  const { t, tr, locale, chatLocale } = useI18n();
  const byName = (a: ProjectDto, b: ProjectDto): number => compareText(locale, a.name, b.name);
  const [projects, setProjects] = useState<ProjectDto[]>();
  const [accounts, setAccounts] = useState<ProfileDto[]>();
  const [usages, setUsages] = useState<Record<string, UsageDto>>({});
  const [looseChats, setLooseChats] = useState<NoteDto[]>();
  const [screen, setScreen] = useState<Screen>({ kind: 'none' });
  const [error, setError] = useState<string>();

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

  const reloadAccounts = useCallback(() => void loadAccounts(), [loadAccounts]);

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

  function navigate(next: Screen): void {
    setError(undefined);
    setScreen(next);
  }

  async function addProject(): Promise<void> {
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

  const selectedProject = screen.kind === 'project' ? projects?.find((project) => project.id === screen.id) : undefined;

  return (
    <div className="layout">
      <nav className="sidebar" aria-label={t('nav.label')}>
        <div className="sidebar-header">
          <span className="brand">AgentHub</span>
        </div>
        <div className="sidebar-scroll">
          <section className="sidebar-section" aria-labelledby="sidebar-projects">
            <div className="sidebar-section-header">
              <p className="sidebar-label grow" id="sidebar-projects">
                {t('nav.projects')}
              </p>
              <button type="button" className="icon-button sidebar-add" aria-label={t('nav.addProject')} title={t('nav.addProject')} onClick={() => void addProject()}>
                <Plus />
              </button>
            </div>
            <ul className="list">
              {projects?.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className="nav-item"
                    aria-current={screen.kind === 'project' && screen.id === project.id ? 'true' : undefined}
                    onClick={() => navigate({ kind: 'project', id: project.id })}
                  >
                    <span className="nav-icon">
                      <Folder />
                    </span>
                    <span className="grow truncate">{project.name}</span>
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
          </section>
          <section className="sidebar-section" aria-labelledby="sidebar-loose-chats">
            <div className="sidebar-section-header">
              <p className="sidebar-label grow" id="sidebar-loose-chats">
                {t('looseChat.section')}
              </p>
              <button
                type="button"
                className="icon-button sidebar-add"
                aria-label={t('looseChat.add')}
                title={t('looseChat.add')}
                aria-current={screen.kind === 'new-loose-chat' ? 'true' : undefined}
                onClick={() => navigate({ kind: 'new-loose-chat' })}
              >
                <Plus />
              </button>
            </div>
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
          </section>
        </div>
        <div className="sidebar-footer">
          <p className="sidebar-label">Accounts</p>
          <ul className="list" aria-label={t('nav.openAccount')}>
            {accounts?.map((account) => (
              <li key={account.id}>
                <Menu
                  label={t('nav.openAccountNamed', { account: tr(account.name) })}
                  triggerClassName="nav-item account-item"
                  trigger={
                    <>
                      <AccountAvatar account={account} size="sm" />
                      <span className="grow truncate">{tr(account.name)}</span>
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
                  <MenuItem icon={<Gear />} onSelect={() => navigate({ kind: 'settings' })}>
                    {t('accounts.manage')}
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
                  {t('accounts.add')}
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
            {t('settings.title')}
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
          {screen.kind === 'settings' && <SettingsView onError={showError} onAccountsChanged={reloadAccounts} section={screen.section} />}
          {screen.kind === 'project' && selectedProject && (
            <ProjectPane
              key={selectedProject.id}
              project={selectedProject}
              accounts={accounts}
              onOpenSettings={() => navigate({ kind: 'settings' })}
              onOpenTools={() => navigate({ kind: 'settings', section: 'tools' })}
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
      </main>
      {launcher.view}
    </div>
  );
}

function UsageChip({ usage }: { usage: UsageDto | undefined }) {
  const i18n = useI18n();
  const highest = highestUsage(usage);
  if (!usage || highest === null) return null;
  const tone = usage.limitReached ? 'full' : usageTone(highest);
  return (
    <span className={`usage-chip ${tone}`} title={usageSummary(i18n, usage)} data-testid="usage-chip">
      {Math.round(highest)}%
    </span>
  );
}
