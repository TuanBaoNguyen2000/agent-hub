import type { ClientModeDto, LaunchAttemptDto, LaunchPreviewDto, ProfileDto, ProjectDto, TaskDto, TaskStatusDto } from '@agenthub/contracts';
import { TASK_STATUSES } from '@agenthub/contracts/constants';
import { useCallback, useEffect, useState } from 'react';
import { api, unwrap } from './api';
import { ContextEditor } from './ContextEditor';
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
  onChanged: (task: TaskDto) => void;
  onOpenSettings: () => void;
}

// Asks only when the user has something to decide; otherwise a click just opens.
function needsDecision(preview: LaunchPreviewDto): boolean {
  return (
    preview.blocker !== null ||
    preview.permission !== 'allowed' ||
    preview.requiredConfirmations.length > 0 ||
    preview.steps.some((step) => step.warning !== undefined)
  );
}

export function TaskPane({ task, project, onChanged, onOpenSettings }: Props) {
  const [title, setTitle] = useState(task.title);
  const [objective, setObjective] = useState(task.objective);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(task.acceptanceCriteria);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<Tab>('context');

  const [accounts, setAccounts] = useState<ProfileDto[]>();
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
    Promise.all([unwrap(api.listProfiles()), refreshHistory()]).then(
      ([loaded, attempts]) => {
        setAccounts(loaded);
        const recent = attempts.find((attempt) => loaded.some((account) => account.id === attempt.profileId));
        setAccountId(recent?.profileId ?? loaded[0]?.id ?? '');
      },
      (reason: unknown) => setError((reason as Error).message),
    );
  }, [refreshHistory]);

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
      if (needsDecision(preview)) {
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
    <div className="stack">
      <header className="stack">
        <input
          className="bare-input"
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
        <div className="row">
          <p className="path grow" id="project-path">
            {project.name} — {project.path}
          </p>
          <select
            aria-label="Trạng thái"
            value={task.status}
            onChange={(event) => void saveFields({ status: event.target.value as TaskStatusDto })}
          >
            {TASK_STATUSES.map((option) => (
              <option key={option} value={option}>
                {STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
      </header>

      {accounts?.length === 0 ? (
        <div className="banner warning">
          <p>Chưa có account nào.</p>
          <button type="button" onClick={onOpenSettings}>
            Thêm account
          </button>
        </div>
      ) : (
        <div className="toolbar" role="group" aria-label="Mở task">
          <select aria-label="Account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {accounts?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.alias}
              </option>
            ))}
          </select>
          {/* Desktop and CLI are the same account opened two ways (TDD §9.2). */}
          <button type="button" className="primary" disabled={!account || busy} onClick={() => void open('desktop')}>
            Mở trong Desktop
          </button>
          <button type="button" className="primary" disabled={!account || busy} onClick={() => void open('cli')}>
            Mở trong Terminal
          </button>
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
