import type { ProjectProgressDto, UsageDto } from '@agenthub/contracts';
import type { MessageKey } from '@agenthub/i18n';
import { PROVIDER_LABELS } from './accounts';
import { useI18n } from './i18n';
import { StatusText, type StatusTone } from './ui';
import { highestUsage } from './usage';

// ADR-024 item 9: from this share of a limit on, the account the work is in is about to stop.
export const QUOTA_WARNING_PERCENT = 85;

export const PROGRESS_STATES: Record<ProjectProgressDto['state'], { text: MessageKey; tone: StatusTone }> = {
  saved: { text: 'progress.saved', tone: 'ok' },
  unsaved: { text: 'progress.unsaved', tone: 'warning' },
  none: { text: 'progress.none', tone: 'neutral' },
};

interface RowProps {
  progress: ProjectProgressDto | undefined;
  usages: Record<string, UsageDto>;
  onOpenTask: (ref: string) => void;
}

// ADR-024 item 2: whether the work is saved, to read only (review 2026-11-10: saving is "lưu lại"
// in the running session, switching is opening another account from the list below).
export function ProgressRow({ progress, usages, onOpenTask }: RowProps) {
  const { t, tr, date } = useI18n();
  if (!progress) return null;
  const state = PROGRESS_STATES[progress.state];
  const checkpoint = progress.checkpoint;
  const session = progress.session;
  const sourceUsage = session ? usages[session.profileId] : undefined;
  const highest = highestUsage(sourceUsage);
  const nearLimit = session !== null && (sourceUsage?.limitReached || (highest !== null && highest >= QUOTA_WARNING_PERCENT));


  // Review 2026-11-10: one state, then label and value per line, instead of one dense sentence.
  const after =
    progress.state === 'unsaved'
      ? progress.sessionAfter && session
        ? t('progress.afterSession', { provider: PROVIDER_LABELS[session.provider], account: session.account, at: date(session.at) })
        : progress.commitAfter
          ? t('progress.afterCommit', { at: date(progress.commitAfter) })
          : null
      : null;

  return (
    <section className="progress-row" aria-label={t('progress.title')} data-testid="progress-row">
      <div className="progress-head">
        <StatusText tone={state.tone}>{t(state.text)}</StatusText>
      </div>
      {checkpoint ? (
        <dl className="progress-facts">
          <dt>{t('progress.label.saved')}</dt>
          <dd>{[date(checkpoint.at), checkpoint.author].filter(Boolean).join(' · ')}</dd>
          {checkpoint.taskRef && (
            <>
              <dt>{t('progress.label.task')}</dt>
              <dd>
                <button type="button" className="link" onClick={() => onOpenTask(checkpoint.taskRef as string)}>
                  {checkpoint.taskTitle ?? checkpoint.taskRef}
                </button>
              </dd>
            </>
          )}
          {after && (
            <>
              <dt>{t('progress.label.after')}</dt>
              <dd className="warning-text">{after}</dd>
              {/* Review 2026-11-10: saving is a sentence in that session, not a button here. */}
              <dt />
              <dd className="hint">{t('progress.howToSave')}</dd>
            </>
          )}
        </dl>
      ) : (
        <p className="hint">{t('progress.noneHint')}</p>
      )}
      {nearLimit && session && (
        <div className="progress-quota" role="status">
          <span className="grow">
            {sourceUsage?.limitReached
              ? t('progress.limitReached', { account: tr(session.account) })
              : t('progress.nearLimit', { account: tr(session.account), percent: Math.round(highest ?? 0) })}{' '}
            {t('progress.howToSave')}
          </span>
        </div>
      )}
    </section>
  );
}
