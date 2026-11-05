import type { ContextLanguageDto, ProjectContextDto, ProjectDto } from '@agenthub/contracts';
import { useState } from 'react';
import { api, unwrap } from './api';
import { CopyButton } from './CopyButton';
import { useI18n } from './i18n';
import { LANGUAGE_OPTIONS } from './ProjectSettings';
import { Dialog, Segmented } from './ui';

function gitText(t: ReturnType<typeof useI18n>['t'], git: ProjectContextDto['git']): string {
  if (git.state === 'not_repo') return t('docs.git.notRepo');
  if (git.state === 'unknown') return t('docs.git.unknown');
  const parts = [git.branch ? `Branch ${git.branch}` : 'Detached HEAD'];
  if (git.head) parts.push(git.head.slice(0, 7));
  if (git.dirty) parts.push(t('docs.git.dirty'));
  return parts.join(' · ');
}

interface Props {
  project: ProjectDto;
  context: ProjectContextDto | undefined;
  onChanged: (project: ProjectDto) => void;
  onCreate: () => void;
  // Reads the documents and Git again.
  onCheck: () => Promise<void>;
  onShowTasks: () => void;
  onError: (message: string | undefined) => void;
}

// The documents card on the overview: buttons instead of an on/off switch (ADR-020 item 3).
export function ProjectDocs({ project, context, onChanged, onCreate, onCheck, onShowTasks, onError }: Props) {
  const i18n = useI18n();
  const { t, tr, date } = i18n;
  const [checkedAt, setCheckedAt] = useState<Date>();
  const [checking, setChecking] = useState(false);
  const settings = project.context;

  async function cancelCreate(): Promise<void> {
    onError(undefined);
    try {
      onChanged(await unwrap(api.updateProjectContext({ id: project.id, enabled: false })));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function check(): Promise<void> {
    setChecking(true);
    await onCheck();
    setChecking(false);
    setCheckedAt(new Date());
  }

  async function openFolder(): Promise<void> {
    onError(undefined);
    try {
      await unwrap(api.openContextFolder({ id: project.id }));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  if (!settings.enabled) {
    return (
      <section className="settings-group" aria-label={t('settings.docs.title')}>
        <div className="settings-group-header">
          <div className="grow settings-row-text">
            <h2>{t('settings.docs.title')}</h2>
            <p className="hint">{t('docs.offHint')}</p>
          </div>
          <button type="button" className="primary" onClick={onCreate}>
            {t('docs.create')}
          </button>
        </div>
      </section>
    );
  }

  if (!context) return null;
  const { overview, warnings, git } = context;

  if (!overview.initialized) {
    return (
      <section className="settings-group" aria-label={t('settings.docs.title')}>
        <div className="settings-group-header">
          <div className="grow settings-row-text">
            <h2>{t('settings.docs.title')}</h2>
            <p className="hint">{t('docs.pendingHint')}</p>
            <span className="path" data-testid="context-path">
              {settings.path}
            </span>
            {settings.pathStatus !== 'directory' && <span className="warning-text">{t('settings.docs.folderGone')}</span>}
          </div>
          <div className="row nowrap">
            <button type="button" disabled={checking} onClick={() => void check()}>
              {t('docs.check')}
            </button>
            <button type="button" onClick={() => void cancelCreate()}>
              {t('docs.cancelCreate')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const tasks = overview.workstreams.reduce((count, workstream) => count + workstream.tasks.length, 0);
  const projectWarnings = warnings.filter((warning) => warning.taskRef === null);
  const taskWarnings = warnings.length - projectWarnings.length;

  return (
    <section className="settings-group" aria-label={t('settings.docs.title')}>
      <div className="settings-group-header">
        <div className="grow settings-row-text">
          <h2>{t('settings.docs.title')}</h2>
          <p className="hint" data-testid="context-summary">
            {overview.workstreams.length} workstream · {tasks} task
          </p>
          <span className="path" data-testid="context-path">
            {settings.path}
          </span>
        </div>
        <div className="row nowrap">
          <button type="button" disabled={checking} onClick={() => void check()}>
            {t('docs.check')}
          </button>
          <button type="button" onClick={() => void openFolder()}>
            {t('docs.openFolder')}
          </button>
        </div>
      </div>
      <div className="settings-row">
        <p className="hint grow" data-testid="git-observation">
          {gitText(t, git)}
        </p>
      </div>
      {(projectWarnings.length > 0 || taskWarnings > 0) && (
        <div className="settings-row">
          <div className="stack grow">
            {projectWarnings.length > 0 && (
              <ul className="warning-list" aria-label={t('docs.warnings')}>
                {projectWarnings.map((warning, index) => (
                  <li key={index} className="warning-text">
                    {tr(warning.message)}
                  </li>
                ))}
              </ul>
            )}
            {taskWarnings > 0 && (
              <p className="hint">
                {t('docs.taskWarnings', { count: taskWarnings })}{' '}
                <button type="button" className="link" onClick={onShowTasks}>
                  {t('docs.seeTasks')}
                </button>
              </p>
            )}
          </div>
        </div>
      )}
      {checkedAt && (
        <div className="settings-row">
          <p className="hint grow" role="status">
            {t(warnings.length === 0 ? 'docs.checkedClean' : 'docs.checkedWarnings', {
              at: date(checkedAt, { hour: '2-digit', minute: '2-digit' }),
              count: warnings.length,
            })}
          </p>
        </div>
      )}
      <div className="settings-row">
        <p className="hint grow">{t('docs.reconcileHint')}</p>
        {/* An agent compares the documents with the code; AgentHub only checks their layout (ADR-020 item 3). */}
        <CopyButton text={i18n.prompt(project.chatLocale, 'prompt.reconcile', { path: settings.path })} label={t('docs.copyReconcile')} />
      </div>
    </section>
  );
}

interface CreateProps {
  project: ProjectDto;
  onClose: () => void;
  onCreated: (project: ProjectDto) => void;
  onError: (message: string | undefined) => void;
}

// Chooses where the documents go and their language; the next launch runs context-init.
export function CreateDocsDialog({ project, onClose, onCreated, onError }: CreateProps) {
  const { t } = useI18n();
  const places = [
    { value: 'agenthub', label: t('docs.create.agentHub') },
    { value: 'folder', label: t('docs.create.folder') },
  ] as const;
  const [place, setPlace] = useState<'agenthub' | 'folder'>(project.context.custom ? 'folder' : 'agenthub');
  const [folder, setFolder] = useState<string | null>(project.context.custom ? project.context.path : null);
  const [language, setLanguage] = useState<ContextLanguageDto>(project.context.language);
  const [saving, setSaving] = useState(false);

  async function chooseFolder(): Promise<void> {
    try {
      const path = await unwrap(api.pickProjectFolder());
      if (path) setFolder(path);
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function create(): Promise<void> {
    setSaving(true);
    onError(undefined);
    try {
      const customPath = place === 'folder' ? folder : null;
      onCreated(await unwrap(api.updateProjectContext({ id: project.id, enabled: true, language, customPath })));
    } catch (reason) {
      onError((reason as Error).message);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      label={t('docs.create')}
      title={t('docs.create')}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="primary" disabled={saving || (place === 'folder' && !folder)} onClick={() => void create()}>
            {t('docs.create.submit')}
          </button>
        </>
      }
    >
      <p className="hint">{t('docs.create.hint')}</p>
      <div className="field">
        <span className="field-label">{t('settings.docs.place')}</span>
        <Segmented label={t('settings.docs.place')} value={place} options={places} onChange={setPlace} />
        <span className="hint">{t(place === 'agenthub' ? 'docs.create.agentHubHint' : 'docs.create.folderHint')}</span>
        {place === 'folder' && (
          <div className="row">
            <span className="path grow" data-testid="create-docs-folder">
              {folder ?? t('docs.create.noFolder')}
            </span>
            <button type="button" onClick={() => void chooseFolder()}>
              {t('docs.create.chooseFolder')}
            </button>
          </div>
        )}
      </div>
      <div className="field">
        <span className="field-label">{t('settings.docs.language')}</span>
        <Segmented label={t('settings.docs.language')} value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
      </div>
    </Dialog>
  );
}

export type DocsNotice = { kind: 'applied'; path: string } | { kind: 'choose'; found: string[] };

const inside = (path: string, folder: string | null): boolean => folder !== null && (path === folder || path.startsWith(`${folder}/`));

interface NoticeProps {
  project: ProjectDto;
  notice: DocsNotice;
  onChanged: (project: ProjectDto) => void;
  onElsewhere: () => void;
  onCreate: () => void;
  onClose: () => void;
  onError: (message: string | undefined) => void;
}

// ADR-020 item 4: documents found in the project folder. One set is used at once and only
// announced; several are listed for the user to pick.
export function DocsFoundNotice({ project, notice, onChanged, onElsewhere, onCreate, onClose, onError }: NoticeProps) {
  const { t } = useI18n();
  async function use(path: string): Promise<void> {
    onError(undefined);
    try {
      onChanged(await unwrap(api.updateProjectContext({ id: project.id, enabled: true, customPath: path })));
      onClose();
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  if (notice.kind === 'applied') {
    return (
      <div className="banner notice" role="status" aria-label={t('docs.found')}>
        <p>
          {t('docs.found.applied')} <span className="path">{notice.path}</span>
        </p>
        <p className="hint">
          {t('docs.found.writes')}
          {inside(notice.path, project.path) && ` ${t('docs.found.inRepo')}`}
        </p>
        <div className="row">
          <button type="button" onClick={onElsewhere}>
            {t('docs.found.elsewhere')}
          </button>
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="banner notice" role="group" aria-label={t('docs.found')}>
      <p>{t('docs.found.several', { count: notice.found.length })}</p>
      <ul className="found-list">
        {notice.found.map((path) => (
          <li key={path} className="row nowrap">
            <span className="path grow">{path}</span>
            <button type="button" onClick={() => void use(path)}>
              {t('docs.found.use')}
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" onClick={onCreate}>
          {t('docs.found.createNew')}
        </button>
        <button type="button" onClick={onClose}>
          {t('docs.found.skip')}
        </button>
      </div>
    </div>
  );
}
