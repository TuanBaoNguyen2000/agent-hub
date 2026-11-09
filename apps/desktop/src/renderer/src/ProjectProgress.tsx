import type { ClientModeDto, ProfileDto, ProjectProgressDto, UsageDto } from '@agenthub/contracts';
import { useEffect, useRef, useState } from 'react';
import type { MessageKey } from '@agenthub/i18n';
import { AccountAvatar, PROVIDER_LABELS, orderAccounts, readiness } from './accounts';
import { api, unwrap } from './api';
import { useI18n } from './i18n';
import { More } from './icons';
import { Dialog, Menu, MenuItem, StatusText, type StatusTone } from './ui';
import { highestUsage } from './usage';

// ADR-024 item 9: from this share of a limit on, the account the work is in is about to stop.
export const QUOTA_WARNING_PERCENT = 85;

export const PROGRESS_STATES: Record<ProjectProgressDto['state'], { text: MessageKey; tone: StatusTone }> = {
  saved: { text: 'progress.saved', tone: 'ok' },
  unsaved: { text: 'progress.unsaved', tone: 'warning' },
  none: { text: 'progress.none', tone: 'neutral' },
};

const POLL_MS = 3_000;

interface RowProps {
  progress: ProjectProgressDto | undefined;
  checkpointPrompt: string | undefined;
  usages: Record<string, UsageDto>;
  onSwitch: () => void;
  onOpenTask: (ref: string) => void;
  onError: (message: string | undefined) => void;
}

// ADR-024 item 2: one line at the top of the overview that says whether the work is saved.
export function ProgressRow({ progress, checkpointPrompt, usages, onSwitch, onOpenTask, onError }: RowProps) {
  const { t, tr, date } = useI18n();
  const [copied, setCopied] = useState(false);
  if (!progress) return null;
  const state = PROGRESS_STATES[progress.state];
  const checkpoint = progress.checkpoint;
  const session = progress.session;
  const sourceUsage = session ? usages[session.profileId] : undefined;
  const highest = highestUsage(sourceUsage);
  const nearLimit = session !== null && (sourceUsage?.limitReached || (highest !== null && highest >= QUOTA_WARNING_PERCENT));

  async function copyCheckpoint(): Promise<void> {
    if (!checkpointPrompt) return;
    try {
      await unwrap(api.copyText({ text: checkpointPrompt }));
      setCopied(true);
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  const saved = checkpoint
    ? [date(checkpoint.at), checkpoint.author, checkpoint.taskTitle].filter((part): part is string => Boolean(part)).join(' · ')
    : null;
  const why =
    progress.state === 'unsaved'
      ? progress.sessionAfter && session
        ? t('progress.sessionAfter', { provider: PROVIDER_LABELS[session.provider], account: session.account, at: date(session.at) })
        : progress.commitAfter
          ? t('progress.commitAfter', { at: date(progress.commitAfter) })
          : null
      : null;

  return (
    <section className="progress-row" aria-label={t('progress.title')} data-testid="progress-row">
      <div className="progress-main">
        <StatusText tone={state.tone}>{t(state.text)}</StatusText>
        <span className="progress-detail">
          {why && <span>{why}</span>}
          {saved ? <span className="hint">{t('progress.lastSaved', { detail: saved })}</span> : <span className="hint">{t('progress.noneHint')}</span>}
        </span>
        <button type="button" className="primary" onClick={onSwitch}>
          {t('progress.switch')}
        </button>
        <Menu label={t('progress.more')} trigger={<More />} triggerClassName="icon-button" align="end">
          <MenuItem onSelect={() => void copyCheckpoint()}>{t(copied ? 'common.copied' : 'progress.copyCheckpoint')}</MenuItem>
          {checkpoint?.taskRef && <MenuItem onSelect={() => onOpenTask(checkpoint.taskRef as string)}>{t('progress.openTask')}</MenuItem>}
        </Menu>
      </div>
      {nearLimit && session && (
        <div className="progress-quota" role="status">
          <span className="grow">
            {sourceUsage?.limitReached
              ? t('progress.limitReached', { account: tr(session.account) })
              : t('progress.nearLimit', { account: tr(session.account), percent: Math.round(highest ?? 0) })}
          </span>
          <button type="button" className="small" onClick={() => void copyCheckpoint()}>
            {t(copied ? 'common.copied' : 'progress.saveNow')}
          </button>
        </div>
      )}
    </section>
  );
}

export interface SwitchLaunch {
  profileId: string;
  mode: ClientModeDto;
  useTranscript: boolean;
}

interface DialogProps {
  projectId: string;
  progress: ProjectProgressDto;
  accounts: ProfileDto[];
  usages: Record<string, UsageDto>;
  checkpointPrompt: string | undefined;
  onLaunch: (launch: SwitchLaunch) => void;
  onClose: () => void;
  onError: (message: string | undefined) => void;
}

type Way = 'save' | 'now';

// ADR-024 item 3: pick the account, and either wait for the old session to save or go now.
export function SwitchDialog({ projectId, progress, accounts, usages, checkpointPrompt, onLaunch, onClose, onError }: DialogProps) {
  const { t, tr } = useI18n();
  const source = progress.session;
  const sourceFull = source ? readiness(usages[source.profileId]) === 'full' : false;
  const ordered = orderAccounts(accounts, usages, source?.profileId ?? null);
  const [targetId, setTargetId] = useState(ordered[0]?.id ?? '');
  const canSave = progress.state === 'unsaved' && source !== null && Boolean(checkpointPrompt);
  const [way, setWay] = useState<Way>(canSave && !sourceFull ? 'save' : 'now');
  const [waiting, setWaiting] = useState(false);
  const baseline = useRef(progress.checkpoint?.at ?? null);
  const target = accounts.find((account) => account.id === targetId);

  function go(useTranscript: boolean): void {
    if (!target) return;
    onLaunch({ profileId: target.id, mode: target.preferredMode, useTranscript });
    onClose();
  }

  async function start(): Promise<void> {
    if (!target) return;
    if (way === 'now') {
      go(progress.sessionAfter);
      return;
    }
    try {
      await unwrap(api.copyText({ text: checkpointPrompt as string }));
      setWaiting(true);
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  // ADR-024 item 3: once a newer handoff appears, the new account opens without another click.
  useEffect(() => {
    if (!waiting) return;
    let live = true;
    const check = async (): Promise<void> => {
      try {
        const now = await unwrap(api.getProjectProgress({ id: projectId }));
        const at = now.checkpoint?.at ?? null;
        if (live && at !== null && (baseline.current === null || Date.parse(at) > Date.parse(baseline.current))) go(false);
      } catch (reason) {
        if (live) onError((reason as Error).message);
      }
    };
    const timer = setInterval(() => void check(), POLL_MS);
    window.addEventListener('focus', check);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
    // Starts once per wait.
  }, [waiting]);

  const targetName = target ? tr(target.name) : '';
  const sourceName = source ? tr(source.account) : '';

  if (waiting) {
    return (
      <Dialog
        label={t('switch.title')}
        title={t('switch.waitingTitle', { account: targetName })}
        onClose={onClose}
        actions={
          <>
            <button type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="button" className="primary" onClick={() => go(true)}>
              {t('switch.dontWait')}
            </button>
          </>
        }
      >
        <div className="stack" role="status">
          <p>{t('switch.waiting', { source: sourceName, target: targetName })}</p>
          <p className="hint">{t('switch.waitingHint')}</p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      label={t('switch.title')}
      title={t('switch.title')}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="primary" disabled={!target} onClick={() => void start()}>
            {way === 'save' ? t('switch.startSave') : t('switch.startNow', { account: targetName })}
          </button>
        </>
      }
    >
      <div className="stack switch-dialog">
        <fieldset className="switch-accounts">
          <legend className="field-label">{t('switch.to')}</legend>
          {ordered.map((account) => (
            <label key={account.id} className="switch-account">
              <input type="radio" name="switch-target" checked={account.id === targetId} onChange={() => setTargetId(account.id)} />
              <AccountAvatar account={account} size="sm" />
              <span className="grow truncate">{tr(account.name)}</span>
              <SwitchUsage account={account} usage={usages[account.id]} source={account.id === source?.profileId} />
            </label>
          ))}
        </fieldset>
        {canSave ? (
          <fieldset className="switch-ways">
            <legend className="field-label">{t('switch.how')}</legend>
            <label className="choice">
              <input type="radio" name="switch-way" checked={way === 'save'} onChange={() => setWay('save')} />
              <span className="settings-row-text">
                <span>{t('switch.save')}</span>
                <span className="hint">{t('switch.saveHint', { source: sourceName })}</span>
              </span>
            </label>
            <label className="choice">
              <input type="radio" name="switch-way" checked={way === 'now'} onChange={() => setWay('now')} />
              <span className="settings-row-text">
                <span>{t('switch.now')}</span>
                <span className="hint">{t(progress.transcriptConsent === 'never' ? 'switch.nowHintNoTranscript' : 'switch.nowHint')}</span>
              </span>
            </label>
            {sourceFull && <p className="hint">{t('switch.sourceFull', { account: sourceName })}</p>}
          </fieldset>
        ) : (
          <p className="hint">{t(progress.state === 'none' ? 'switch.nothingSaved' : 'switch.allSaved')}</p>
        )}
      </div>
    </Dialog>
  );
}

function SwitchUsage({ account, usage, source }: { account: ProfileDto; usage: UsageDto | undefined; source: boolean }) {
  const { t } = useI18n();
  const state = readiness(usage);
  const highest = highestUsage(usage);
  return (
    <span className="hint switch-usage">
      {source && `${t('switch.current')} · `}
      {state === 'full' ? t('launch.state.full') : state === 'loggedOut' ? t('launch.state.loggedOut') : highest !== null ? t('switch.used', { percent: Math.round(highest) }) : t('launch.state.unknown')}
      {` · ${PROVIDER_LABELS[account.provider]}`}
    </span>
  );
}
