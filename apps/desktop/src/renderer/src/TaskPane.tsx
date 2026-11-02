import type { ClientModeDto, LaunchAttemptDto, LaunchPreviewDto, ProfileDto, ProjectDto, TaskDto, TaskStatusDto } from '@agenthub/contracts';
import { TASK_STATUSES } from '@agenthub/contracts/constants';
import { useCallback, useEffect, useState } from 'react';
import { AccountAvatar, PROVIDER_LABELS, needsDecision, windowLabel } from './accounts';
import { api, unwrap } from './api';
import { ContextEditor } from './ContextEditor';
import { ChevronUpDown, Folder, Gear, Monitor, Terminal } from './icons';
import { Menu, MenuItem, MenuSeparator, Select } from './ui';
import { useDirtyForm } from './unsaved';

const STATUS_LABELS: Record<TaskStatusDto, string> = {
  backlog: 'Backlog',
  active: 'Đang làm',
  blocked: 'Bị chặn',
  in_review: 'Đang review',
  done: 'Xong',
  archived: 'Lưu trữ',
};

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

type Tab = 'context' | 'decisions' | 'details' | 'history';
const TABS: { id: Tab; label: string }[] = [
  { id: 'context', label: 'Context' },
  { id: 'decisions', label: 'Quyết định' },
  { id: 'details', label: 'Chi tiết' },
  { id: 'history', label: 'Lịch sử' },
];

interface Props {
  task: TaskDto;
  project: ProjectDto;
  accounts: ProfileDto[] | undefined;
  onChanged: (task: TaskDto) => void;
  onOpenSettings: () => void;
}

const STATUS_OPTIONS = TASK_STATUSES.map((value) => ({
  value,
  label: STATUS_LABELS[value],
  icon: <span className={`dot ${value === 'active' ? 'active' : value === 'blocked' ? 'blocked' : value === 'done' || value === 'archived' ? 'done' : ''}`} />,
}));

export function TaskPane({ task, project, accounts, onChanged, onOpenSettings }: Props) {
  const [title, setTitle] = useState(task.title);
  const [objective, setObjective] = useState(task.objective);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(task.acceptanceCriteria);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<Tab>('context');

  const [accountId, setAccountId] = useState('');
  const [pending, setPending] = useState<{ mode: ClientModeDto; preview: LaunchPreviewDto }>();
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [history, setHistory] = useState<LaunchAttemptDto[]>([]);
  const [last, setLast] = useState<LaunchAttemptDto>();
  const [busy, setBusy] = useState(false);

  useDirtyForm(editing);

  const refreshHistory = useCallback(async () => {
    const loaded = await unwrap(api.listLaunches({ taskId: task.id }));
    setHistory(loaded);
    return loaded;
  }, [task.id]);

  useEffect(() => {
    refreshHistory().catch((reason: unknown) => setError((reason as Error).message));
  }, [refreshHistory]);

  // The account last used for this task, until the user picks another one.
  useEffect(() => {
    if (!accounts || accounts.some((item) => item.id === accountId)) return;
    const recent = history.find((attempt) => accounts.some((item) => item.id === attempt.profileId));
    setAccountId(recent?.profileId ?? accounts[0]?.id ?? '');
  }, [accounts, history, accountId]);

  async function saveFields(fields: { title?: string; objective?: string; acceptanceCriteria?: string; status?: TaskStatusDto }): Promise<void> {
    setError(undefined);
    try {
      const updated = await unwrap(api.updateTask({ id: task.id, ...fields }));
      onChanged(updated);
      setTitle(updated.title);
    } catch (reason) {
      setError((reason as Error).message);
      setTitle(task.title);
    }
  }

  function commit(fields: { title?: string; objective?: string; acceptanceCriteria?: string }): void {
    setEditing(false);
    const changed = Object.entries(fields).some(([key, value]) => task[key as keyof TaskDto] !== value);
    if (changed) void saveFields(fields);
  }

  async function execute(mode: ClientModeDto, confirmations: string[]): Promise<void> {
    setBusy(true);
    setPending(undefined);
    setConfirmed([]);
    try {
      setLast(await unwrap(api.executeLaunch({ request: { taskId: task.id, profileId: accountId, mode }, confirmations })));
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
      const preview = await unwrap(api.planLaunch({ taskId: task.id, profileId: accountId, mode }));
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
    <div className="stack page">
      <header className="page-header">
        <div className="header-row">
          <p className="breadcrumb grow" id="project-path" title={project.path ?? undefined}>
            <Folder />
            <span className="truncate">
              {project.name} — {project.path}
            </span>
          </p>
          <Select
            label="Trạng thái"
            className="pill"
            align="end"
            value={task.status}
            options={STATUS_OPTIONS}
            onChange={(status) => void saveFields({ status })}
          />
        </div>
        <input
          className="bare-input page-title"
          aria-label="Tiêu đề task"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setEditing(true);
          }}
          onBlur={() => commit({ title })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </header>

      {accounts?.length === 0 ? (
        <div className="launch-bar empty-launch">
          <p className="hint grow">Chưa có account nào để mở task này.</p>
          <button type="button" className="primary" onClick={onOpenSettings}>
            Thêm account
          </button>
        </div>
      ) : (
        <div className="launch-bar" role="group" aria-label="Mở task">
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

      <div className="tabs" role="tablist" aria-label="Nội dung task">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Kept mounted while hidden, so switching tabs never loses unsaved text. */}
      <div hidden={tab !== 'context'}>
        <ContextEditor
          key={`${task.id}:task`}
          reference={{ scope: 'task', taskId: task.id, document: 'task' }}
          label="Task context"
          hint="Bối cảnh và trọng tâm hiện tại. Nội dung này không phụ thuộc account nào."
        />
      </div>
      <div hidden={tab !== 'decisions'}>
        <ContextEditor
          key={`${task.id}:decisions`}
          reference={{ scope: 'task', taskId: task.id, document: 'decisions' }}
          label="Quyết định"
          hint="Các quyết định đã chốt và lý do."
        />
      </div>
      <div className="stack" hidden={tab !== 'details'}>
        <label className="field">
          <span className="field-label">Mục tiêu</span>
          <textarea
            rows={3}
            value={objective}
            onChange={(event) => {
              setObjective(event.target.value);
              setEditing(true);
            }}
            onBlur={() => commit({ objective })}
          />
        </label>
        <label className="field">
          <span className="field-label">Tiêu chí hoàn thành</span>
          <textarea
            rows={3}
            value={acceptanceCriteria}
            onChange={(event) => {
              setAcceptanceCriteria(event.target.value);
              setEditing(true);
            }}
            onBlur={() => commit({ acceptanceCriteria })}
          />
        </label>
      </div>
      <div className="stack" hidden={tab !== 'history'}>
        {history.length === 0 && <p className="hint">Task này chưa được mở lần nào.</p>}
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
      </div>
    </div>
  );
}
