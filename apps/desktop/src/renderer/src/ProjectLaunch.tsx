import { CONTEXT_TOOLS_CONFIRMATION } from '@agenthub/contracts/constants';
import type { ClientModeDto, LaunchAttemptDto, LaunchPreviewDto, LaunchResultDto, ProfileDto, ProjectDto } from '@agenthub/contracts';
import { type ReactNode, useEffect, useState } from 'react';
import { AccountAvatar, PROVIDER_LABELS, needsDecision, windowLabel } from './accounts';
import { api, unwrap } from './api';
import { ChevronUpDown, Gear, Monitor, Terminal } from './icons';
import { Menu, MenuItem, MenuSeparator } from './ui';

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
  // The task the next launch points the agent at; null leaves the choice to the agent.
  taskRef: string | null;
  // The project's earlier launches, newest first: the account last used is picked again.
  history: LaunchAttemptDto[];
  // After each launch, so the page reloads the history.
  onLaunched: () => void;
  // The task line, shown under the launch bar.
  taskSummary?: ReactNode;
}

// Opens an account at the project's folder.
export function ProjectLaunch({ project, accounts, onOpenSettings, taskRef, history, onLaunched, taskSummary }: Props) {
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

  async function execute(mode: ClientModeDto, confirmations: string[], skipContextTools = false): Promise<void> {
    const transcript = useTranscript && pending?.preview.transcript !== null && pending !== undefined;
    setUseTranscript(false);
    setBusy(true);
    setPending(undefined);
    setConfirmed([]);
    try {
      setLast(await unwrap(api.executeLaunch({ request: { projectId: project.id, taskRef, profileId: accountId, mode, ...(skipContextTools ? { skipContextTools } : {}), ...(transcript ? { useTranscript: true } : {}) }, confirmations })));
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
      const preview = await unwrap(api.planLaunch({ projectId: project.id, taskRef, profileId: accountId, mode }));
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
  // Declining the change to the main config still opens, just without skills and MCP this time.
  const asksForTools = pending?.preview.requiredConfirmations.some((item) => item.id === CONTEXT_TOOLS_CONFIRMATION) ?? false;
  const missingOther =
    pending?.preview.requiredConfirmations.some((item) => item.id !== CONTEXT_TOOLS_CONFIRMATION && !confirmed.includes(item.id)) ?? false;
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

      {taskSummary}

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
          {pending.preview.transcript && (
            <div className="banner warning" role="group" aria-label="Transcript của phiên cũ">
              <p>
                Phiên {pending.preview.transcript.provider === 'claude' ? 'Claude' : 'Codex'} của account "{pending.preview.transcript.sourceAccount}" còn làm tiếp lúc{' '}
                {new Date(pending.preview.transcript.updatedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}, sau checkpoint gần nhất (
                {new Date(pending.preview.transcript.checkpointAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}). Phần đó chưa được ghi lại.
              </p>
              {(pending.preview.transcript.otherAccount || pending.preview.transcript.otherProvider) && (
                <p>
                  Agent mới thuộc {pending.preview.transcript.otherProvider ? 'provider khác' : 'account khác'} sẽ đọc nội dung của phiên đó, có thể gồm source code. Chỉ đồng ý nếu điều này được phép.
                </p>
              )}
              <label className="choice">
                <input type="checkbox" checked={useTranscript} onChange={(event) => setUseTranscript(event.target.checked)} />
                Cho agent mới đọc phần cuối transcript và viết checkpoint bù
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
              {item.label}
            </label>
          ))}
          <div className="row">
            {!pending.preview.blocker && pending.preview.permission === 'allowed' && (
              <button type="button" className="primary" disabled={!canContinue} onClick={() => void execute(pending.mode, confirmed)}>
                Tiếp tục mở
              </button>
            )}
            {asksForTools && !pending.preview.blocker && pending.preview.permission === 'allowed' && (
              <button
                type="button"
                disabled={missingOther || busy}
                onClick={() => void execute(pending.mode, confirmed.filter((id) => id !== CONTEXT_TOOLS_CONFIRMATION), true)}
              >
                Mở mà không cài
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
          {last.prompt && (
            <div className="prompt-box" aria-label="Lời nhắc cho phiên mới" role="group">
              <p className="hint">
                {last.mode === 'cli'
                  ? 'Đã gửi làm prompt đầu tiên của CLI:'
                  : last.copied
                    ? 'Đã copy vào clipboard. Dán vào cuộc trò chuyện mới:'
                    : 'Dán vào cuộc trò chuyện mới:'}
              </p>
              <code className="prompt-text">{last.prompt}</code>
              <button type="button" onClick={() => void copyPrompt(last.prompt as string)}>
                {copiedAgain ? 'Đã copy' : 'Copy lại'}
              </button>
            </div>
          )}
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

    </>
  );
}
