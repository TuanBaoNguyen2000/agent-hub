import type { UsageDto, UsageWindowDto } from '@agenthub/contracts';
import { useI18n } from './i18n';

type I18n = ReturnType<typeof useI18n>;

// Figures come from the account's own CLI (SPIKE-16): Claude's `/usage`, Codex's app server.

export function windowTitle(i18n: I18n, window: UsageWindowDto): string {
  const { t, tr } = i18n;
  if (window.kind === 'session') return t('usage.session');
  if (window.kind === 'weekly') return t('usage.week');
  if (window.label) return tr(window.label);
  if (window.windowMinutes === null) return t('usage.other');
  return window.windowMinutes % 1440 === 0
    ? t('usage.days', { count: window.windowMinutes / 1440 })
    : t('usage.hours', { count: Math.round(window.windowMinutes / 60) });
}

const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
const DATE_TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' };

export function resetText(i18n: I18n, window: UsageWindowDto, now = new Date()): string | null {
  if (window.resetsAt) {
    const at = new Date(window.resetsAt);
    const sameDay = at.toDateString() === now.toDateString();
    return i18n.t('usage.resets', { at: i18n.date(at, sameDay ? TIME : DATE_TIME) });
  }
  // Claude words the time itself, in the account's time zone, so it is shown as given.
  return window.resetsText ? i18n.t('usage.resets', { at: window.resetsText }) : null;
}

export const usageTone = (percent: number): 'ok' | 'high' | 'full' => (percent >= 100 ? 'full' : percent >= 80 ? 'high' : 'ok');

// The tightest limit decides whether an account can take more work now.
export function highestUsage(usage: UsageDto | undefined): number | null {
  if (!usage || usage.state !== 'ok' || usage.windows.length === 0) return null;
  return Math.max(...usage.windows.map((window) => window.usedPercent));
}

function UsageBar({ window }: { window: UsageWindowDto }) {
  const i18n = useI18n();
  const percent = Math.round(window.usedPercent);
  const reset = resetText(i18n, window);
  const title = windowTitle(i18n, window);
  return (
    <li className="usage-window">
      <div className="usage-window-head">
        <span>{title}</span>
        <span className="usage-figure">
          <strong>{percent}%</strong>
          {reset && <span className="usage-reset"> · {reset}</span>}
        </span>
      </div>
      <div
        className={`usage-bar ${usageTone(window.usedPercent)}`}
        role="meter"
        aria-label={i18n.t('usage.meter', { title, percent })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percent, 100)}
      >
        <span style={{ width: `${Math.min(window.usedPercent, 100)}%` }} />
      </div>
    </li>
  );
}

export function UsagePanel({ usage, loading, onRefresh }: { usage: UsageDto | undefined; loading: boolean; onRefresh: () => void }) {
  const { t, tr, date } = useI18n();
  const refresh = (
    <button type="button" className="link-button" onClick={onRefresh} disabled={loading}>
      {loading ? t('usage.refreshing') : t('usage.refresh')}
    </button>
  );
  if (!usage) {
    return (
      <div className="usage" data-testid="usage">
        <p className="hint">{loading ? t('usage.reading') : t('usage.notRead')}</p>
      </div>
    );
  }
  if (usage.state === 'logged_out') return null;
  const checked = t('usage.checkedAt', { at: date(usage.checkedAt, TIME) });
  if (usage.state === 'unavailable') {
    return (
      <div className="usage" data-testid="usage">
        <p className="hint">
          {t('usage.unavailable')} {tr(usage.detail)} {refresh}
        </p>
      </div>
    );
  }
  return (
    <div className="usage" data-testid="usage">
      {usage.limitReached && (
        <p className="banner warning" role="status">
          {t('usage.limitReached')}
        </p>
      )}
      <ul className="usage-windows">
        {usage.windows.map((window, index) => (
          <UsageBar key={`${window.kind}-${index}`} window={window} />
        ))}
      </ul>
      <p className="usage-footer">
        {usage.plan ? `${t('usage.plan', { plan: usage.plan })} · ` : ''}
        {checked} · {refresh}
      </p>
    </div>
  );
}
