import type { TaskDto, TaskStatusDto } from '@agenthub/contracts';
import { TASK_STATUSES } from '@agenthub/contracts/constants';
import { useState } from 'react';
import { api, unwrap } from './api';
import { ContextEditor } from './ContextEditor';
import { useDirtyForm } from './unsaved';

export const STATUS_LABELS: Record<TaskStatusDto, string> = {
  backlog: 'Backlog',
  active: 'Đang làm',
  blocked: 'Bị chặn',
  in_review: 'Đang review',
  done: 'Xong',
  archived: 'Lưu trữ',
};

interface Props {
  task: TaskDto;
  onChanged: (task: TaskDto) => void;
  onBack: () => void;
}

export function TaskDetail({ task, onChanged, onBack }: Props) {
  const [title, setTitle] = useState(task.title);
  const [objective, setObjective] = useState(task.objective);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(task.acceptanceCriteria);
  const [status, setStatus] = useState(task.status);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const isDirty =
    title !== task.title ||
    objective !== task.objective ||
    acceptanceCriteria !== task.acceptanceCriteria ||
    status !== task.status;
  useDirtyForm(isDirty);

  async function save(): Promise<void> {
    setError(undefined);
    try {
      const updated = await unwrap(api.updateTask({ id: task.id, title, objective, acceptanceCriteria, status }));
      onChanged(updated);
      setTitle(updated.title);
      setSaved(true);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  return (
    <div className="stack">
      <button type="button" className="link" onClick={onBack}>
        ← Danh sách task
      </button>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        onChange={() => setSaved(false)}
      >
        <label className="field">
          <span className="field-label">Tiêu đề</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Trạng thái</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatusDto)}>
            {TASK_STATUSES.map((option) => (
              <option key={option} value={option}>
                {STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Mục tiêu</span>
          <textarea rows={3} value={objective} onChange={(event) => setObjective(event.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Tiêu chí hoàn thành</span>
          <textarea
            rows={3}
            value={acceptanceCriteria}
            onChange={(event) => setAcceptanceCriteria(event.target.value)}
          />
        </label>
        {error && (
          <p className="banner error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button type="submit" className="primary" disabled={!isDirty}>
            Lưu task
          </button>
          <span className="hint" role="status">
            {isDirty ? 'Chưa lưu' : saved ? 'Đã lưu' : ''}
          </span>
        </div>
      </form>
      <ContextEditor
        key={`${task.id}:task`}
        reference={{ scope: 'task', taskId: task.id, document: 'task' }}
        label="Task context"
        hint="Bối cảnh, phạm vi và trọng tâm hiện tại của task."
      />
      <ContextEditor
        key={`${task.id}:decisions`}
        reference={{ scope: 'task', taskId: task.id, document: 'decisions' }}
        label="Quyết định"
        hint="Các quyết định đã chốt và lý do."
      />
    </div>
  );
}
