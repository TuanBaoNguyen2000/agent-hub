import type { LaunchAttemptDto } from '@agenthub/contracts';
import type { MessageKey } from '@agenthub/i18n';
import { api, unwrap } from './api';
import { useI18n } from './i18n';

const LAUNCH_LABELS: Record<LaunchAttemptDto['status'], MessageKey> = {
  planned: 'history.status.planned',
  launched: 'history.status.launched',
  manual_step: 'history.status.launched',
  failed: 'history.status.failed',
};

interface Props {
  history: LaunchAttemptDto[];
  onChanged: () => void;
  onError: (message: string | undefined) => void;
}

// The project's earlier launches (ADR-020 item 2): only shown when the user opens this tab.
export function ProjectHistory({ history, onChanged, onError }: Props) {
  const { t, tr, date } = useI18n();
  async function confirmAccount(attemptId: string): Promise<void> {
    onError(undefined);
    try {
      await unwrap(api.confirmLaunchAccount({ attemptId }));
      onChanged();
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  return (
    <section className="settings-group" aria-label={t('history.title')}>
      <div className="settings-group-header">
        <div className="grow settings-row-text">
          <h2>{t('history.title')}</h2>
          <p className="hint">{t('history.hint')}</p>
        </div>
      </div>
      {history.length === 0 && <p className="settings-empty hint">{t('history.empty')}</p>}
      <ul className="settings-list">
        {history.map((attempt) => (
          <li key={attempt.id} className="history-item">
            <span className="grow">
              {date(attempt.createdAt)} — {tr(attempt.profileAlias)}, {attempt.mode === 'cli' ? 'Terminal' : 'Desktop'}:{' '}
              {t(LAUNCH_LABELS[attempt.status])}
              {attempt.errorCode ? ` (${attempt.errorCode})` : ''}
              {attempt.taskRef ? ` · ${attempt.taskRef.split('/').at(-1)?.replace(/\.md$/, '')}` : ''}
            </span>
            {/* Never says "switched": AgentHub cannot observe which account an app uses (TDD §8.4). */}
            {attempt.accountConfirmedAt ? <span className="badge">{t('history.confirmed')}</span> : <span className="badge manual">{t('history.unverified')}</span>}
            {!attempt.accountConfirmedAt && attempt.status !== 'failed' && (
              <button type="button" onClick={() => void confirmAccount(attempt.id)}>
                {t('history.confirm')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
