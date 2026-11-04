import type { UsageDto, UsageWindowDto } from '@agenthub/contracts';

// Figures come from the account's own CLI (SPIKE-16): Claude's `/usage`, Codex's app server.

export function windowTitle(window: UsageWindowDto): string {
  if (window.kind === 'session') return 'Phiên 5 giờ';
  if (window.kind === 'weekly') return 'Tuần';
  if (window.label) return window.label;
  if (window.windowMinutes === null) return 'Hạn mức khác';
  return window.windowMinutes % 1440 === 0 ? `${window.windowMinutes / 1440} ngày` : `${Math.round(window.windowMinutes / 60)} giờ`;
}

const timeFormat = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' });

export function resetText(window: UsageWindowDto, now = new Date()): string | null {
  if (window.resetsAt) {
    const at = new Date(window.resetsAt);
    const sameDay = at.toDateString() === now.toDateString();
    return `đặt lại ${sameDay ? timeFormat.format(at) : dateTimeFormat.format(at)}`;
  }
  // Claude words the time itself, in the account's time zone, so it is shown as given.
  return window.resetsText ? `đặt lại ${window.resetsText}` : null;
}

export const usageTone = (percent: number): 'ok' | 'high' | 'full' => (percent >= 100 ? 'full' : percent >= 80 ? 'high' : 'ok');

// The tightest limit decides whether an account can take more work now.
export function highestUsage(usage: UsageDto | undefined): number | null {
  if (!usage || usage.state !== 'ok' || usage.windows.length === 0) return null;
  return Math.max(...usage.windows.map((window) => window.usedPercent));
}

function UsageBar({ window }: { window: UsageWindowDto }) {
  const percent = Math.round(window.usedPercent);
  const reset = resetText(window);
  return (
    <li className="usage-window">
      <div className="usage-window-head">
        <span>{windowTitle(window)}</span>
        <span className="usage-figure">
          <strong>{percent}%</strong>
          {reset && <span className="usage-reset"> · {reset}</span>}
        </span>
      </div>
      <div
        className={`usage-bar ${usageTone(window.usedPercent)}`}
        role="meter"
        aria-label={`${windowTitle(window)}: đã dùng ${percent}%`}
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
  const refresh = (
    <button type="button" className="link-button" onClick={onRefresh} disabled={loading}>
      {loading ? 'Đang cập nhật…' : 'Làm mới'}
    </button>
  );
  if (!usage) {
    return (
      <div className="usage" data-testid="usage">
        <p className="hint">{loading ? 'Đang đọc hạn mức sử dụng…' : 'Chưa đọc hạn mức sử dụng.'}</p>
      </div>
    );
  }
  if (usage.state === 'logged_out') return null;
  const checked = `Cập nhật lúc ${timeFormat.format(new Date(usage.checkedAt))}`;
  if (usage.state === 'unavailable') {
    return (
      <div className="usage" data-testid="usage">
        <p className="hint">
          Không đọc được hạn mức sử dụng. {usage.detail} {refresh}
        </p>
      </div>
    );
  }
  return (
    <div className="usage" data-testid="usage">
      {usage.limitReached && (
        <p className="banner warning" role="status">
          Account này đã chạm hạn mức. Hãy ghi checkpoint trước khi chuyển sang account khác.
        </p>
      )}
      <ul className="usage-windows">
        {usage.windows.map((window, index) => (
          <UsageBar key={`${window.kind}-${window.label ?? ''}-${index}`} window={window} />
        ))}
      </ul>
      <p className="usage-footer">
        {usage.plan ? `Gói ${usage.plan} · ` : ''}
        {checked} · {refresh}
      </p>
    </div>
  );
}
