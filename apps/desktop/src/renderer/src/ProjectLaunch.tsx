import type { ClientModeDto, LaunchAttemptDto, LaunchPreviewDto, ProfileDto, ProjectDto } from '@agenthub/contracts';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { AccountAvatar, PROVIDER_LABELS, needsDecision, windowLabel } from './accounts';
import { api, unwrap } from './api';
import { ChevronUpDown, Gear, Monitor, Terminal } from './icons';
import { Menu, MenuItem, MenuSeparator } from './ui';

const LAUNCH_LABELS = {
  planned: 'Đang mở',
  launched: 'Đã mở',
  manual_step: 'Đã mở',
  failed: 'Thất bại',
} as const;

const WORKSPACE_LABELS = {
  opened: 'Đã mở tại folder của project.',
  requested: 'Đã gửi lệnh mở folder; AgentHub không biết app có mở đúng folder không.',
  manual: 'Đã mở app. Bạn cần tự chọn folder trong app.',
  none: '',
} as const;

interface Props {
  project: ProjectDto;
  accounts: ProfileDto[] | undefined;
  onOpenSettings: () => void;
  // Shown between the launch result and the history, which grows over time.
  children?: ReactNode;
}

// Opens an account at the project's folder, and lists the project's earlier launches.
export function ProjectLaunch({ project, accounts, onOpenSettings, children }: Props) {
  const [error, setError] = useState<string>();

  const [accountId, setAccountId] = useState('');
  const [pending, setPending] = useState<{ mode: ClientModeDto; preview: LaunchPreviewDto }>();
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [history, setHistory] = useState<LaunchAttemptDto[]>([]);
  const [last, setLast] = useState<LaunchAttemptDto>();
  const [busy, setBusy] = useState(false);

  const refreshHistory = useCallback(async () => {
    const loaded = await unwrap(api.listLaunches({ projectId: project.id }));
    setHistory(loaded);
    return loaded;
  }, [project.id]);

  useEffect(() => {
    refreshHistory().catch((reason: unknown) => setError((reason as Error).message));
  }, [refreshHistory]);

  // The account last used for this project, until the user picks another one.
  useEffect(() => {
    if (!accounts || accounts.some((item) => item.id === accountId)) return;
    const recent = history.find((attempt) => accounts.some((item) => item.id === attempt.profileId));
    setAccountId(recent?.profileId ?? accounts[0]?.id ?? '');
  }, [accounts, history, accountId]);

  async function execute(mode: ClientModeDto, confirmations: string[]): Promise<void> {
    setBusy(true);
    setPending(undefined);
    setConfirmed([]);
    try {
      setLast(await unwrap(api.executeLaunch({ request: { projectId: project.id, profileId: accountId, mode }, confirmations })));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
    await refreshHistory().catch(() => undefined);
  }

  async function open(mode: ClientModeDto): Promise<void> {
    setError(undefined);
    setLast(undefined);
    try {
      const preview = await unwrap(api.planLaunch({ projectId: project.id, profileId: accountId, mode }));
      if (needsDecision(preview) || preview.permission !== 'allowed') {
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

  async function confirmAccount(attemptId: string): Promise<void> {
    try {
      await unwrap(api.confirmLaunchAccount({ attemptId }));
      await refreshHistory();
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
          <p className="hint grow">Chưa có account nào để mở project này.</p>
          <button type="button" className="primary" onClick={onOpenSettings}>
            Thêm account
          </button>
        </div>
      ) : (
        <div className="launch-bar" role="group" aria-label="Mở project">
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
                    <span className="truncate">{account.name}</span>
                    <span className="account-picker-meta">
                      {PROVIDER_LABELS[account.provider]} · {windowLabel(account)}
                    </span>
                  </span>
                  <span className="select-chevron">
                    <ChevronUpDown />
                  </span>
                </>
              ) : (
                <span className="hint">Chọn account</span>
              )
            }
          >
            {accounts?.map((item) => (
              <MenuItem
                key={item.id}
                icon={<AccountAvatar account={item} size="sm" />}
                description={`${PROVIDER_LABELS[item.provider]} · ${windowLabel(item)}`}
                checked={item.id === accountId}
                onSelect={() => setAccountId(item.id)}
              >
                {item.name}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem icon={<Gear />} onSelect={onOpenSettings}>
              Quản lý account
            </MenuItem>
          </Menu>
          {/* Desktop and CLI are the same account opened two ways (TDD §9.2). */}
          <div className="launch-actions">
            <button type="button" className="primary" disabled={!account || busy} onClick={() => void open('desktop')}>
              <Monitor />
              Mở trong Desktop
            </button>
            <button type="button" className="primary" disabled={!account || busy} onClick={() => void open('cli')}>
              <Terminal />
              Mở trong Terminal
            </button>
          </div>
        </div>
      )}

      {pending && (
        <div className="card" aria-label="Cần bạn quyết định" role="group">
          {pending.preview.blocker && (
            <p className="banner error" role="alert">
              {pending.preview.blocker.message}
            </p>
          )}
          {pending.preview.steps
            .filter((step) => step.warning)
            .map((step) => (
              <p key={step.label} className="banner warning">
                {step.warning}
              </p>
            ))}
          {pending.preview.permission === 'unset' && (
            <div className="banner warning">
              <p>
                Cho account "{pending.preview.profileAlias}" làm việc với project "{pending.preview.projectName}"? Account này sẽ đọc được source code của
                project. AgentHub chỉ hỏi một lần cho mỗi cặp.
              </p>
              <div className="row">
                <button type="button" onClick={() => void answerPermission(true)}>
                  Cho phép
                </button>
                <button type="button" onClick={() => void answerPermission(false)}>
                  Không cho phép
                </button>
              </div>
            </div>
          )}
          {pending.preview.permission === 'denied' && (
            <div className="banner error" role="alert">
              <p>
                Account "{pending.preview.profileAlias}" không được phép dùng project "{pending.preview.projectName}".
              </p>
              <button type="button" onClick={() => void answerPermission(true)}>
                Đổi thành cho phép
              </button>
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
              {item.label}
            </label>
          ))}
          <div className="row">
            {!pending.preview.blocker && pending.preview.permission === 'allowed' && (
              <button type="button" className="primary" disabled={!canContinue} onClick={() => void execute(pending.mode, confirmed)}>
                Tiếp tục mở
              </button>
            )}
            <button type="button" onClick={() => setPending(undefined)}>
              Huỷ
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
        <div className="card" role="status" aria-label="Kết quả lần mở">
          <p>{WORKSPACE_LABELS[last.outcome.workspace]}</p>
          {last.outcome.warnings.map((warning) => (
            <p key={warning} className="banner warning">
              {warning}
            </p>
          ))}
          {last.outcome.userActionRequired.length > 0 && (
            <ul className="todo">
              {last.outcome.userActionRequired.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {children}

      <section className="stack" aria-label="Lịch sử mở">
        <h2>Lịch sử mở</h2>
        {history.length === 0 && <p className="hint">Project này chưa được mở lần nào.</p>}
        <ul className="list">
          {history.map((attempt) => (
            <li key={attempt.id} className="history-item">
              <span className="grow">
                {new Date(attempt.createdAt).toLocaleString('vi-VN')} — {attempt.profileAlias}, {attempt.mode === 'cli' ? 'Terminal' : 'Desktop'}:{' '}
                {LAUNCH_LABELS[attempt.status]}
                {attempt.errorCode ? ` (${attempt.errorCode})` : ''}
              </span>
              {/* Never says "switched": AgentHub cannot observe which account an app uses (TDD §8.4). */}
              {attempt.accountConfirmedAt ? (
                <span className="badge">Bạn đã xác nhận account</span>
              ) : (
                <span className="badge manual">Account chưa xác minh</span>
              )}
              {!attempt.accountConfirmedAt && attempt.status !== 'failed' && (
                <button type="button" onClick={() => void confirmAccount(attempt.id)}>
                  Xác nhận đúng account
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
