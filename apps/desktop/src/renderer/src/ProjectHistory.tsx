import type { LaunchAttemptDto } from '@agenthub/contracts';
import { api, unwrap } from './api';

const LAUNCH_LABELS = {
  planned: 'Đang mở',
  launched: 'Đã mở',
  manual_step: 'Đã mở',
  failed: 'Thất bại',
} as const;

interface Props {
  history: LaunchAttemptDto[];
  onChanged: () => void;
  onError: (message: string | undefined) => void;
}

// The project's earlier launches (ADR-020 item 2): only shown when the user opens this tab.
export function ProjectHistory({ history, onChanged, onError }: Props) {
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
    <section className="settings-group" aria-label="Lịch sử mở">
      <div className="settings-group-header">
        <div className="grow settings-row-text">
          <h2>Lịch sử mở</h2>
          <p className="hint">AgentHub không thấy app đang dùng account nào; bạn xác nhận khi đã kiểm tra trong app.</p>
        </div>
      </div>
      {history.length === 0 && <p className="settings-empty hint">Project này chưa được mở lần nào.</p>}
      <ul className="settings-list">
        {history.map((attempt) => (
          <li key={attempt.id} className="history-item">
            <span className="grow">
              {new Date(attempt.createdAt).toLocaleString('vi-VN')} — {attempt.profileAlias}, {attempt.mode === 'cli' ? 'Terminal' : 'Desktop'}:{' '}
              {LAUNCH_LABELS[attempt.status]}
              {attempt.errorCode ? ` (${attempt.errorCode})` : ''}
              {attempt.taskRef ? ` · ${attempt.taskRef.split('/').at(-1)?.replace(/\.md$/, '')}` : ''}
            </span>
            {/* Never says "switched": AgentHub cannot observe which account an app uses (TDD §8.4). */}
            {attempt.accountConfirmedAt ? <span className="badge">Bạn đã xác nhận account</span> : <span className="badge manual">Account chưa xác minh</span>}
            {!attempt.accountConfirmedAt && attempt.status !== 'failed' && (
              <button type="button" onClick={() => void confirmAccount(attempt.id)}>
                Xác nhận đúng account
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
