import type { ClientModeDto, LaunchAttemptDto, LaunchPreviewDto, LaunchResultDto, MessageDto, ProfileDto, ProjectDto, UsageDto } from '@agenthub/contracts';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AccountAvatar, MODE_LABELS, PROVIDER_LABELS, type AccountReadiness, orderAccounts, readiness, windowLabel } from './accounts';
import type { MessageKey } from '@agenthub/i18n';
import { api, unwrap } from './api';
import { useI18n } from './i18n';
import { ChevronDown, Gear, Monitor, Terminal } from './icons';
import { Dialog, Menu, MenuItem, StatusText, type StatusTone } from './ui';
import { usageTone, windowTitle } from './usage';

const WORKSPACE_LABELS: Record<'opened' | 'requested' | 'manual', MessageKey> = {
  opened: 'launch.result.opened',
  requested: 'launch.result.requested',
  manual: 'launch.result.manual',
};

const READINESS: Record<AccountReadiness, { text: MessageKey; tone: StatusTone }> = {
  ready: { text: 'launch.state.ready', tone: 'ok' },
  full: { text: 'launch.state.full', tone: 'warning' },
  loggedOut: { text: 'launch.state.loggedOut', tone: 'warning' },
  unknown: { text: 'launch.state.unknown', tone: 'neutral' },
};

const MODE_ICONS: Record<ClientModeDto, ReactNode> = { desktop: <Monitor />, cli: <Terminal /> };
const other = (mode: ClientModeDto): ClientModeDto => (mode === 'desktop' ? 'cli' : 'desktop');

type TranscriptChoice = 'no' | 'once' | 'always';

// A launch someone else asked for: the switch dialog, or "Continue this task" (ADR-024 items 3, 10).
export interface LaunchRequestView {
  profileId: string;
  mode: ClientModeDto;
  // The user already chose to have the new agent recover the unsaved work.
  useTranscript: boolean;
  // Changes for every request, so the same account can be asked twice.
  at: number;
}

interface Props {
  project: ProjectDto;
  accounts: ProfileDto[] | undefined;
  usages: Record<string, UsageDto>;
  onOpenSettings: () => void;
  // Settings, at the Agent tools section.
  onOpenTools: () => void;
  // The task the next launch points the agent at; null leaves the choice to the agent.
  taskRef: string | null;
  taskTitle?: string | null;
  // The project's earlier launches, newest first; kept for callers, the order comes from usage.
  history?: LaunchAttemptDto[];
  // After each launch, so the page reloads the history and the progress.
  onLaunched: () => void;
  // The task line, shown above the accounts.
  taskSummary?: ReactNode;
  // 'refine': the agent fills in the task instead of resuming it (ADR-021 item 7).
  purpose?: 'refine' | 'init';
  request?: LaunchRequestView | null;
  // The account the work last went on in, listed after the others (ADR-024 item 5).
  sourceId?: string | null;
}

interface Pending {
  account: ProfileDto;
  mode: ClientModeDto;
  preview: LaunchPreviewDto;
}

// ADR-024 item 7: only what the user must decide stops a launch; the rest is told afterwards.
function needsAnswer(preview: LaunchPreviewDto): boolean {
  return (
    preview.blocker !== null ||
    preview.requiredConfirmations.length > 0 ||
    preview.permission !== 'allowed' ||
    (preview.transcript !== null && !preview.transcriptAutomatic) ||
    preview.missingTools !== null
  );
}

// Opens an account at the project's folder: one row per account, with its limits and one button.
export function ProjectLaunch({ project, accounts, usages, onOpenSettings, onOpenTools, taskRef, taskTitle, onLaunched, taskSummary, purpose, request, sourceId = null }: Props) {
  const { t, tr, date } = useI18n();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<Pending>();
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<TranscriptChoice>('no');
  const [last, setLast] = useState<{ result: LaunchResultDto; notes: MessageDto[]; automatic: boolean }>();
  const [copiedAgain, setCopiedAgain] = useState(false);
  const [busy, setBusy] = useState(false);

  async function execute(target: Pending | { account: ProfileDto; mode: ClientModeDto; preview: LaunchPreviewDto }, confirmations: string[], choice: TranscriptChoice): Promise<void> {
    setBusy(true);
    setPending(undefined);
    setConfirmed([]);
    const reads = choice !== 'no' && target.preview.transcript !== null && !target.preview.transcriptAutomatic;
    try {
      const result = await unwrap(
        api.executeLaunch({
          request: {
            projectId: project.id,
            taskRef,
            profileId: target.account.id,
            mode: target.mode,
            ...(purpose ? { purpose } : {}),
            ...(reads ? { useTranscript: true } : {}),
            ...(reads && choice === 'always' ? { rememberTranscript: true } : {}),
          },
          confirmations,
        }),
      );
      // Warnings that needed no answer are told now, beside the result.
      const notes = target.preview.steps.flatMap((step) => (step.warning ? [step.warning] : []));
      setLast({ result, notes, automatic: target.preview.transcriptAutomatic });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
    onLaunched();
  }

  async function open(account: ProfileDto, mode: ClientModeDto, choice: TranscriptChoice = 'no'): Promise<void> {
    setError(undefined);
    setLast(undefined);
    setCopiedAgain(false);
    try {
      const preview = await unwrap(api.planLaunch({ projectId: project.id, taskRef, profileId: account.id, mode, ...(purpose ? { purpose } : {}) }));
      if (needsAnswer(preview)) {
        setConfirmed([]);
        setTranscript(choice);
        setPending({ account, mode, preview });
      } else {
        await execute({ account, mode, preview }, [], choice);
      }
    } catch (reason) {
      setPending(undefined);
      setError((reason as Error).message);
    }
  }

  // Launches asked for elsewhere on the page.
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!request || handled.current === request.at || !accounts) return;
    handled.current = request.at;
    const account = accounts.find((item) => item.id === request.profileId);
    if (account) void open(account, request.mode, request.useTranscript ? 'once' : 'no');
    // Only a new request starts a launch.
  }, [request?.at, accounts]);

  async function answerPermission(allowed: boolean): Promise<void> {
    if (!pending) return;
    try {
      await unwrap(api.setPermission({ projectId: project.id, profileId: pending.account.id, allowed }));
      await open(pending.account, pending.mode, transcript);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  // ADR-024 item 8: the account gets what it lacks right here, still a click of the user's.
  async function installHere(): Promise<void> {
    if (!pending?.preview.missingTools) return;
    const { account, mode } = pending;
    const missing = pending.preview.missingTools;
    setBusy(true);
    try {
      for (const name of missing.skills) await unwrap(api.installTool({ profileId: account.id, tool: { kind: 'skill', name } }));
      if (missing.mcp) await unwrap(api.installTool({ profileId: account.id, tool: { kind: 'mcp' } }));
      await open(account, mode, transcript);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt(text: string): Promise<void> {
    try {
      await unwrap(api.copyText({ text }));
      setCopiedAgain(true);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  const missingConfirmation = pending?.preview.requiredConfirmations.some((item) => !confirmed.includes(item.id)) ?? false;
  const canContinue = pending !== undefined && pending.preview.permission === 'allowed' && !pending.preview.blocker && !missingConfirmation && !busy;
  const ordered = accounts ? orderAccounts(accounts, usages, sourceId) : [];
  const lastResult = last?.result;

  return (
    <>
      {taskSummary}
      {accounts?.length === 0 ? (
        <div className="launch-bar empty-launch">
          <p className="hint grow">{t('launch.noAccount')}</p>
          <button type="button" className="primary" onClick={onOpenSettings}>
            {t('accounts.add')}
          </button>
        </div>
      ) : (
        <ul className="launch-accounts" aria-label={t('launch.bar')}>
          {ordered.map((account, index) => (
            <AccountRow key={account.id} account={account} usage={usages[account.id]} first={index === 0} busy={busy} onOpen={(mode) => void open(account, mode)} />
          ))}
          <li className="launch-accounts-footer">
            <button type="button" className="link" onClick={onOpenSettings}>
              <Gear />
              {t('accounts.manage')}
            </button>
          </li>
        </ul>
      )}

      {pending && (
        <Dialog
          label={t('launch.decide')}
          title={t(taskTitle ? 'launch.planTitleTask' : 'launch.planTitle', { account: tr(pending.account.name), mode: MODE_LABELS[pending.mode], task: taskTitle ?? '' })}
          onClose={() => setPending(undefined)}
          actions={
            <>
              <button type="button" onClick={() => setPending(undefined)}>
                {t('common.cancel')}
              </button>
              {!pending.preview.blocker && pending.preview.permission === 'allowed' && (
                <button type="button" className="primary" disabled={!canContinue} onClick={() => void execute(pending, confirmed, transcript)}>
                  {t('launch.continue')}
                </button>
              )}
            </>
          }
        >
          <div className="stack launch-decide">
            {pending.preview.blocker && (
              <p className="banner error" role="alert">
                {tr(pending.preview.blocker.message)}
              </p>
            )}
            {pending.preview.permission === 'unset' && (
              <div className="banner warning">
                <p>{t('launch.permission.ask', { account: pending.preview.profileAlias, project: pending.preview.projectName })}</p>
                <div className="row">
                  <button type="button" onClick={() => void answerPermission(true)}>
                    {t('launch.permission.allow')}
                  </button>
                  <button type="button" onClick={() => void answerPermission(false)}>
                    {t('launch.permission.deny')}
                  </button>
                </div>
              </div>
            )}
            {pending.preview.permission === 'denied' && (
              <div className="banner error" role="alert">
                <p>{t('launch.permission.denied', { account: pending.preview.profileAlias, project: pending.preview.projectName })}</p>
                <button type="button" onClick={() => void answerPermission(true)}>
                  {t('launch.permission.change')}
                </button>
              </div>
            )}
            {pending.preview.transcript && !pending.preview.transcriptAutomatic && (
              <div className="banner warning" role="radiogroup" aria-label={t('launch.transcript.region')}>
                <p>
                  {t('launch.transcript.offer', {
                    provider: pending.preview.transcript.provider === 'claude' ? 'Claude' : 'Codex',
                    account: pending.preview.transcript.sourceAccount,
                    at: date(pending.preview.transcript.updatedAt),
                    checkpoint: date(pending.preview.transcript.checkpointAt),
                  })}
                </p>
                {(pending.preview.transcript.otherAccount || pending.preview.transcript.otherProvider) && (
                  <p>{t(pending.preview.transcript.otherProvider ? 'launch.transcript.otherProvider' : 'launch.transcript.otherAccount')}</p>
                )}
                {(['no', 'once', 'always'] as const)
                  .filter((choice) => choice !== 'always' || !pending.preview.transcript?.otherProvider)
                  .map((choice) => (
                    <label key={choice} className="choice">
                      <input type="radio" name="transcript" checked={transcript === choice} onChange={() => setTranscript(choice)} />
                      {t(`launch.transcript.${choice}`)}
                    </label>
                  ))}
              </div>
            )}
            {pending.preview.missingTools && (
              <div className="banner warning">
                <p>
                  {t('launch.missingTools', {
                    what: [...pending.preview.missingTools.skills, ...(pending.preview.missingTools.mcp ? ['MCP "agenthub"'] : [])].join(', '),
                  })}
                </p>
                <div className="row">
                  <button type="button" disabled={busy} onClick={() => void installHere()}>
                    {t('launch.installHere')}
                  </button>
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      // Settings opens under this dialog otherwise.
                      setPending(undefined);
                      onOpenTools();
                    }}
                  >
                    {t('launch.openTools')}
                  </button>
                </div>
              </div>
            )}
            {pending.preview.requiredConfirmations.map((item) => (
              <label key={item.id} className="choice">
                <input
                  type="checkbox"
                  checked={confirmed.includes(item.id)}
                  onChange={(event) => setConfirmed((current) => (event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)))}
                />
                {tr(item.label)}
              </label>
            ))}
            {pending.preview.steps
              .filter((step) => step.warning)
              .map((step, index) => (
                <p key={index} className="hint">
                  {tr(step.warning)}
                </p>
              ))}
          </div>
        </Dialog>
      )}

      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}

      {lastResult?.outcome && last && (
        <div className="card" role="status" aria-label={t('launch.result')}>
          <p>
            <strong>{t('launch.opened', { account: lastResult.profileAlias, mode: MODE_LABELS[lastResult.mode] })}</strong>
            {lastResult.outcome.workspace !== 'none' && <span className="hint"> · {t(WORKSPACE_LABELS[lastResult.outcome.workspace])}</span>}
          </p>
          {last.automatic && <p className="hint">{t('launch.transcript.automatic')}</p>}
          {lastResult.prompt && (
            <div className="prompt-box" aria-label={t('launch.prompt.region')} role="group">
              <p className="hint">{lastResult.mode === 'cli' ? t('launch.prompt.sent') : lastResult.copied ? t('launch.prompt.copied') : t('launch.prompt.paste')}</p>
              <code className="prompt-text">{lastResult.prompt}</code>
              <button type="button" onClick={() => void copyPrompt(lastResult.prompt as string)}>
                {copiedAgain ? t('common.copied') : t('launch.prompt.copyAgain')}
              </button>
            </div>
          )}
          {[...last.notes, ...lastResult.outcome.warnings].map((warning, index) => (
            <p key={index} className="banner warning">
              {tr(warning)}
            </p>
          ))}
          {lastResult.outcome.userActionRequired.length > 0 && (
            <ul className="todo">
              {lastResult.outcome.userActionRequired.map((item, index) => (
                <li key={index}>{tr(item)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

// ADR-024 items 5, 7: an account, its limits, and one button that opens it the way it was opened last.
function AccountRow({ account, usage, first, busy, onOpen }: { account: ProfileDto; usage: UsageDto | undefined; first: boolean; busy: boolean; onOpen: (mode: ClientModeDto) => void }) {
  const i18n = useI18n();
  const { t, tr } = i18n;
  const state = READINESS[readiness(usage)];
  const name = tr(account.name);
  const mode = account.preferredMode;
  const windows = usage?.state === 'ok' ? usage.windows.filter((window) => window.kind !== 'other').slice(0, 2) : [];
  return (
    <li className="launch-account">
      <AccountAvatar account={account} />
      <span className="launch-account-text">
        <span className="truncate" title={name}>
          {name}
        </span>
        <span className="hint">
          {PROVIDER_LABELS[account.provider]} · {windowLabel(t, account)}
        </span>
      </span>
      <span className="launch-account-usage">
        {windows.length > 0
          ? windows.map((window) => {
              const title = windowTitle(i18n, window);
              const percent = Math.round(window.usedPercent);
              return (
                <span key={title} className="mini-usage" title={t('usage.meter', { title, percent })}>
                  <span className="mini-usage-label">
                    {title} <strong>{percent}%</strong>
                  </span>
                  <span className={`usage-bar ${usageTone(window.usedPercent)}`} aria-hidden="true">
                    <span style={{ width: `${Math.min(window.usedPercent, 100)}%` }} />
                  </span>
                </span>
              );
            })
          : null}
        <StatusText tone={state.tone}>{t(state.text)}</StatusText>
      </span>
      <span className="split-button">
        <button type="button" className={first ? 'primary' : undefined} disabled={busy} aria-label={t('launch.openAccountMode', { account: name, mode: MODE_LABELS[mode] })} onClick={() => onOpen(mode)}>
          {MODE_ICONS[mode]}
          {t('launch.openMode', { mode: MODE_LABELS[mode] })}
        </button>
        <Menu label={t('launch.moreModes', { account: name })} trigger={<ChevronDown />} triggerClassName={first ? 'primary split-arrow' : 'split-arrow'} align="end" disabled={busy}>
          <MenuItem icon={MODE_ICONS[other(mode)]} onSelect={() => onOpen(other(mode))}>
            {t('launch.openMode', { mode: MODE_LABELS[other(mode)] })}
          </MenuItem>
        </Menu>
      </span>
    </li>
  );
}
