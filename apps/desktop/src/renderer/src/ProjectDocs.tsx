import type { ProjectContextDto, ProjectDto } from '@agenthub/contracts';
import { type ReactNode, useState } from 'react';
import { api, unwrap } from './api';
import { CopyButton } from './CopyButton';
import { useI18n } from './i18n';
import { PathText, StatusText } from './ui';

function gitText(t: ReturnType<typeof useI18n>['t'], git: ProjectContextDto['git']): string {
  if (git.state === 'not_repo') return t('docs.git.notRepo');
  if (git.state === 'unknown') return t('docs.git.unknown');
  const parts = [git.branch ? `Branch ${git.branch}` : 'Detached HEAD'];
  if (git.head) parts.push(git.head.slice(0, 7));
  if (git.dirty) parts.push(t('docs.git.dirty'));
  return parts.join(' · ');
}

// Problems AgentHub can fix itself by writing the empty layout (ADR-023 item 2).
const FIXABLE = new Set(['no_project_context', 'no_workstream', 'no_status']);

interface Props {
  project: ProjectDto;
  context: ProjectContextDto | undefined;
  onChanged: (project: ProjectDto) => void;
  // Opens the dialog that asks where the documents are (ADR-023 item 1).
  onSetUp: () => void;
  // Reads the documents and Git again.
  onCheck: () => Promise<void>;
  onShowTasks: () => void;
  // The next launch asks the agent to fill the documents in (context-init).
  onFill: () => void;
  onError: (message: string | undefined) => void;
}

// The documents card on the overview: Not used, Ready, Needs filling or Has problems, each with
// what to do next (ADR-023 item 2).
export function ProjectDocs({ project, context, onChanged, onSetUp, onCheck, onShowTasks, onFill, onError }: Props) {
  const i18n = useI18n();
  const { t, tr, date } = i18n;
  const [checkedAt, setCheckedAt] = useState<Date>();
  const [busy, setBusy] = useState(false);
  const settings = project.context;

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    onError(undefined);
    try {
      await action();
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const check = () =>
    run(async () => {
      await onCheck();
      setCheckedAt(new Date());
    });

  const scaffold = () =>
    run(async () => {
      onChanged(await unwrap(api.scaffoldProjectContext({ id: project.id })));
      await onCheck();
    });

  const openFolder = () => run(async () => void (await unwrap(api.openContextFolder({ id: project.id }))));

  const header = (state: { tone: 'ok' | 'warning' | 'neutral' | 'active'; text: string }, actions: ReactNode, hint?: ReactNode) => (
    <div className="settings-group-header">
      <div className="grow settings-row-text">
        <h2 className="docs-title">
          {t('settings.docs.title')}
          <StatusText tone={state.tone}>{state.text}</StatusText>
        </h2>
        {hint}
        {settings.enabled && (
          <span className="path" data-testid="context-path">
            <PathText path={settings.path} />
          </span>
        )}
      </div>
      <div className="row nowrap">{actions}</div>
    </div>
  );

  if (!settings.enabled) {
    return (
      <section className="settings-group" aria-label={t('settings.docs.title')}>
        {header(
          { tone: 'neutral', text: t('docs.state.off') },
          <button type="button" className="primary" onClick={onSetUp}>
            {t('docs.create')}
          </button>,
          <p className="hint">{t('docs.offHint')}</p>,
        )}
      </section>
    );
  }

  if (settings.pathStatus !== 'directory') {
    return (
      <section className="settings-group" aria-label={t('settings.docs.title')}>
        {header(
          { tone: 'warning', text: t('docs.state.problem') },
          <button type="button" className="primary" onClick={onSetUp}>
            {t('docs.chooseAgain')}
          </button>,
          <p className="warning-text">{t('settings.docs.folderGone')}</p>,
        )}
      </section>
    );
  }

  if (!context) return null;
  const { overview, warnings, git } = context;

  if (!overview.initialized) {
    return (
      <section className="settings-group" aria-label={t('settings.docs.title')}>
        {header(
          { tone: 'warning', text: t('docs.state.problem') },
          <button type="button" className="primary" disabled={busy} onClick={() => void scaffold()}>
            {t('docs.scaffold')}
          </button>,
          <p className="hint">{t('docs.noLayout')}</p>,
        )}
      </section>
    );
  }

  const tasks = overview.workstreams.reduce((count, workstream) => count + workstream.tasks.length, 0);
  const projectWarnings = warnings.filter((warning) => warning.taskRef === null);
  const taskWarnings = warnings.length - projectWarnings.length;
  const fixable = warnings.some((warning) => FIXABLE.has(warning.kind));
  const state = fixable
    ? { tone: 'warning' as const, text: t('docs.state.problem') }
    : !overview.filled
      ? { tone: 'active' as const, text: t('docs.state.needsFilling') }
      : { tone: 'ok' as const, text: t('docs.state.ready') };

  return (
    <section className="settings-group" aria-label={t('settings.docs.title')}>
      {header(
        state,
        <>
          <button type="button" disabled={busy} onClick={() => void check()}>
            {t('docs.check')}
          </button>
          <button type="button" disabled={busy} onClick={() => void openFolder()}>
            {t('docs.openFolder')}
          </button>
        </>,
        <p className="hint" data-testid="context-summary">
          {overview.workstreams.length} workstream · {tasks} task
        </p>,
      )}
      {!overview.filled && (
        <div className="settings-row">
          <p className="hint grow">{t('docs.fillHint')}</p>
          <button type="button" className="primary" onClick={onFill}>
            {t('docs.fill')}
          </button>
        </div>
      )}
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
          {fixable && (
            <button type="button" disabled={busy} onClick={() => void scaffold()}>
              {t('docs.fixMissing')}
            </button>
          )}
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
        <p className="hint grow">{t('handoffs.checkpointHint')}</p>
        <CopyButton text={context.checkpointPrompt} label={t('handoffs.copyCheckpoint')} />
      </div>
      {overview.filled && (
        <div className="settings-row">
          <p className="hint grow">{t('docs.reconcileHint')}</p>
          {/* An agent compares the documents with the code; AgentHub only checks their layout (ADR-020 item 3). */}
          <CopyButton text={i18n.prompt(project.chatLocale, 'prompt.reconcile', { path: settings.path })} label={t('docs.copyReconcile')} />
          <button type="button" className="small" onClick={onFill}>
            {t('docs.refill')}
          </button>
        </div>
      )}
    </section>
  );
}

interface NoticeProps {
  count: number;
  onSetUp: () => void;
  onClose: () => void;
}

// ADR-023 item 1: documents found in a project added before the dialog asked. AgentHub only says
// so; the user decides in the same dialog as when adding a project.
export function DocsFoundNotice({ count, onSetUp, onClose }: NoticeProps) {
  const { t } = useI18n();
  return (
    <div className="banner notice" role="group" aria-label={t('docs.found')}>
      <p>{t('docs.found.ask', { count })}</p>
      <div className="row">
        <button type="button" className="primary" onClick={onSetUp}>
          {t('docs.found.review')}
        </button>
        <button type="button" onClick={onClose}>
          {t('docs.found.skip')}
        </button>
      </div>
    </div>
  );
}
