import type { ClientModeDto, LaunchAttemptDto, LaunchPreviewDto, LaunchResultDto, ProfileDto, ProjectDto } from '@agenthub/contracts';
import { type ReactNode, useEffect, useState } from 'react';
import { AccountAvatar, PROVIDER_LABELS, needsDecision, windowLabel } from './accounts';
import type { MessageKey } from '@agenthub/i18n';
import { api, unwrap } from './api';
import { useI18n } from './i18n';
import { ChevronUpDown, Gear, Monitor, Terminal } from './icons';
import { Menu, MenuItem, MenuSeparator } from './ui';

const WORKSPACE_LABELS: Record<'opened' | 'requested' | 'manual', MessageKey> = {
  opened: 'launch.result.opened',
  requested: 'launch.result.requested',
  manual: 'launch.result.manual',
};

interface Props {
  project: ProjectDto;
  accounts: ProfileDto[] | undefined;
  onOpenSettings: () => void;
  // Settings, at the Agent tools section.
  onOpenTools: () => void;
  // The task the next launch points the agent at; null leaves the choice to the agent.
  taskRef: string | null;
  // The project's earlier launches, newest first: the account last used is picked again.
  history: LaunchAttemptDto[];
  // After each launch, so the page reloads the history.
  onLaunched: () => void;
  // The task line, shown under the launch bar.
  taskSummary?: ReactNode;
  // 'refine': the agent fills in the task instead of resuming it (ADR-021 item 7).
  purpose?: 'refine' | 'init';
}

// Opens an account at the project's folder.
export function ProjectLaunch({ project, accounts, onOpenSettings, onOpenTools, taskRef, history, onLaunched, taskSummary, purpose }: Props) {
  const { t, tr, date } = useI18n();
  const [error, setError] = useState<string>();

  const [accountId, setAccountId] = useState('');
  const [pending, setPending] = useState<{ mode: ClientModeDto; preview: LaunchPreviewDto }>();
  const [confirmed, setConfirmed] = useState<string[]>([]);
  // Off until the user ticks it: reading another session's transcript is their call (§7.6).
  const [useTranscript, setUseTranscript] = useState(false);
  const [last, setLast] = useState<LaunchResultDto>();
  const [copiedAgain, setCopiedAgain] = useState(false);
  const [busy, setBusy] = useState(false);

  // The account last used for this project, until the user picks another one.
  useEffect(() => {
    if (!accounts || accounts.some((item) => item.id === accountId)) return;
    const recent = history.find((attempt) => accounts.some((item) => item.id === attempt.profileId));
    setAccountId(recent?.profileId ?? accounts[0]?.id ?? '');
  }, [accounts, history, accountId]);

  async function execute(mode: ClientModeDto, confirmations: string[]): Promise<void> {
    const transcript = useTranscript && pending?.preview.transcript !== null && pending !== undefined;
    setUseTranscript(false);
    setBusy(true);
    setPending(undefined);
    setConfirmed([]);
    try {
      setLast(await unwrap(api.executeLaunch({ request: { projectId: project.id, taskRef, profileId: accountId, mode, ...(purpose ? { purpose } : {}), ...(transcript ? { useTranscript: true } : {}) }, confirmations })));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
    onLaunched();
  }

  async function open(mode: ClientModeDto): Promise<void> {
    setError(undefined);
    setLast(undefined);
    setCopiedAgain(false);
    setUseTranscript(false);
    try {
      const preview = await unwrap(api.planLaunch({ projectId: project.id, taskRef, profileId: accountId, mode, ...(purpose ? { purpose } : {}) }));
      if (needsDecision(preview) || preview.permission !== 'allowed' || preview.transcript !== null) {
        setConfirmed([]);
        setPending({ mode, preview });
      } else {
        await execute(mode, []);
      }
    } catch (reason) {
      setPending(undefined);
      setError((reason as Error).message);
    }
  }

  async function answerPermission(allowed: boolean): Promise<void> {
    if (!pending) return;
    try {
      await unwrap(api.setPermission({ projectId: project.id, profileId: accountId, allowed }));
      await open(pending.mode);
    } catch (reason) {
      setError((reason as Error).message);
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
  const account = accounts?.find((item) => item.id === accountId);

  return (
    <>
      {accounts?.length === 0 ? (
        <div className="launch-bar empty-launch">
          <p className="hint grow">{t('launch.noAccount')}</p>
          <button type="button" className="primary" onClick={onOpenSettings}>
            {t('accounts.add')}
          </button>
        </div>
      ) : (
        <div className="launch-bar" role="group" aria-label={t('launch.bar')}>
          <Menu
            label="Account"
            value={accountId}
            triggerClassName="account-picker"
            disabled={!accounts}
            trigger={
              account ? (
                <>
                  <AccountAvatar account={account} />
                  <span className="account-picker-text">
                    <span className="truncate">{tr(account.name)}</span>
                    <span className="account-picker-meta">
                      {PROVIDER_LABELS[account.provider]} · {windowLabel(t, account)}
                    </span>
                  </span>
                  <span className="select-chevron">
                    <ChevronUpDown />
                  </span>
                </>
              ) : (
                <span className="hint">{t('launch.pickAccount')}</span>
              )
            }
          >
            {accounts?.map((item) => (
              <MenuItem
                key={item.id}
                icon={<AccountAvatar account={item} size="sm" />}
                description={`${PROVIDER_LABELS[item.provider]} · ${windowLabel(t, item)}`}
                checked={item.id === accountId}
                onSelect={() => setAccountId(item.id)}
              >
                {tr(item.name)}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem icon={<Gear />} onSelect={onOpenSettings}>
              {t('accounts.manage')}
            </MenuItem>
          </Menu>
          {/* Desktop and CLI are the same account opened two ways (TDD §9.2). */}
          <div className="launch-actions">
            <button type="button" className="primary" disabled={!account || busy} onClick={() => void open('desktop')}>
              <Monitor />
              {t('launch.openDesktop')}
            </button>
            <button type="button" className="primary" disabled={!account || busy} onClick={() => void open('cli')}>
              <Terminal />
              {t('launch.openTerminal')}
            </button>
          </div>
        </div>
      )}

      {taskSummary}

      {pending && (
        <div className="card" aria-label={t('launch.decide')} role="group">
          {pending.preview.blocker && (
            <p className="banner error" role="alert">
              {tr(pending.preview.blocker.message)}
            </p>
          )}
          {pending.preview.steps
            .filter((step) => step.warning)
            .map((step, index) => (
              <p key={index} className="banner warning">
                {tr(step.warning)}
              </p>
            ))}
          {pending.preview.permission === 'unset' && (
            <div className="banner warning">
              <p>
                {t('launch.permission.ask', { account: pending.preview.profileAlias, project: pending.preview.projectName })}
              </p>
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
              <p>
                {t('launch.permission.denied', { account: pending.preview.profileAlias, project: pending.preview.projectName })}
              </p>
              <button type="button" onClick={() => void answerPermission(true)}>
                {t('launch.permission.change')}
              </button>
            </div>
          )}
          {pending.preview.transcript && (
            <div className="banner warning" role="group" aria-label={t('launch.transcript.region')}>
              <p>
                {t('launch.transcript.offer', {
                  provider: pending.preview.transcript.provider === 'claude' ? 'Claude' : 'Codex',
                  account: pending.preview.transcript.sourceAccount,
                  at: date(pending.preview.transcript.updatedAt),
                  checkpoint: date(pending.preview.transcript.checkpointAt),
                })}
              </p>
              {(pending.preview.transcript.otherAccount || pending.preview.transcript.otherProvider) && (
                <p>
                  {t(pending.preview.transcript.otherProvider ? 'launch.transcript.otherProvider' : 'launch.transcript.otherAccount')}
                </p>
              )}
              <label className="choice">
                <input type="checkbox" checked={useTranscript} onChange={(event) => setUseTranscript(event.target.checked)} />
                {t('launch.transcript.accept')}
              </label>
            </div>
          )}
          {pending.preview.requiredConfirmations.map((item) => (
            <label key={item.id} className="choice">
              <input
                type="checkbox"
                checked={confirmed.includes(item.id)}
                onChange={(event) =>
                  setConfirmed((current) => (event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)))
                }
              />
              {tr(item.label)}
            </label>
          ))}
          <div className="row">
            {!pending.preview.blocker && pending.preview.permission === 'allowed' && (
              <button type="button" className="primary" disabled={!canContinue} onClick={() => void execute(pending.mode, confirmed)}>
                {t('launch.continue')}
              </button>
            )}
            {pending.preview.missingTools && (
              <button type="button" onClick={onOpenTools}>
                {t('launch.openTools')}
              </button>
            )}
            <button type="button" onClick={() => setPending(undefined)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}

      {last?.outcome && (
        <div className="card" role="status" aria-label={t('launch.result')}>
          {last.outcome.workspace !== 'none' && <p>{t(WORKSPACE_LABELS[last.outcome.workspace])}</p>}
          {last.prompt && (
            <div className="prompt-box" aria-label={t('launch.prompt.region')} role="group">
              <p className="hint">
                {last.mode === 'cli'
                  ? t('launch.prompt.sent')
                  : last.copied
                    ? t('launch.prompt.copied')
                    : t('launch.prompt.paste')}
              </p>
              <code className="prompt-text">{last.prompt}</code>
              <button type="button" onClick={() => void copyPrompt(last.prompt as string)}>
                {copiedAgain ? t('common.copied') : t('launch.prompt.copyAgain')}
              </button>
            </div>
          )}
          {last.outcome.warnings.map((warning, index) => (
            <p key={index} className="banner warning">
              {tr(warning)}
            </p>
          ))}
          {last.outcome.userActionRequired.length > 0 && (
            <ul className="todo">
              {last.outcome.userActionRequired.map((item, index) => (
                <li key={index}>{tr(item)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

    </>
  );
}
