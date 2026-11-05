import type { ContextTaskDto, NoteWithContentDto, ProjectContextDto, ProjectDto } from '@agenthub/contracts';
import { useState } from 'react';
import { api, unwrap } from './api';
import { CopyButton } from './CopyButton';
import { Disclosure } from './ui';

interface Props {
  project: ProjectDto;
  context: ProjectContextDto | undefined;
  // The task chosen in the Task tab, where a pasted handoff goes when the project has documents.
  selectedTask: ContextTaskDto | undefined;
  onPickTask: () => void;
  onReload: () => void;
  onError: (message: string | undefined) => void;
}

export const noteDate = (iso: string): string => new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

export function ProjectHandoffs(props: Props) {
  if (!props.context) return null;
  return props.project.context.enabled ? <TaskHandoffs {...props} context={props.context} /> : <NoteHandoffs {...props} context={props.context} />;
}

// With documents, handoffs live in each task's Handoff log, written by the agent through
// context-checkpoint. "Thêm handoff" pastes an entry from a chat that cannot reach the files.
function TaskHandoffs({ project, context, selectedTask, onPickTask, onReload, onError }: Props & { context: ProjectContextDto }) {
  const [entry, setEntry] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string>();

  async function addHandoff(): Promise<void> {
    if (!selectedTask || entry.trim() === '') return;
    setSaving(true);
    onError(undefined);
    try {
      await unwrap(api.addHandoff({ id: project.id, taskRef: selectedTask.ref, entry }));
      setEntry('');
      setSaved(selectedTask.id);
      onReload();
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-group" aria-label="Handoff của project">
      <div className="settings-group-header">
        <div className="grow settings-row-text">
          <h2>Handoff</h2>
          <p className="hint">
            Trước khi đổi account, dán lời nhắc này vào phiên đang làm: agent chạy context-checkpoint và ghi handoff vào task trong tài liệu.
          </p>
        </div>
        <CopyButton text={context.checkpointPrompt} label="Copy lời nhắc checkpoint" />
      </div>
      <div className="settings-row handoff-form">
        {selectedTask ? (
          <div className="stack grow">
            <p className="hint">
              Dán handoff mà agent viết trong một chat không đọc được file (tab Chat không có MCP). AgentHub chèn nó lên đầu Handoff log của{' '}
              <strong>{selectedTask.id}</strong>.
            </p>
            <textarea
              aria-label="Nội dung handoff"
              rows={6}
              value={entry}
              placeholder={'### 2026-11-05 14:00 — account / agent\n- **Done:** …\n- **Remaining:** …'}
              onChange={(event) => {
                setEntry(event.target.value);
                setSaved(undefined);
              }}
            />
            <div className="row">
              <button type="button" className="primary" disabled={saving || entry.trim() === ''} onClick={() => void addHandoff()}>
                Thêm handoff
              </button>
              {saved && (
                <span className="hint" role="status">
                  Đã thêm vào {saved}.
                </span>
              )}
            </div>
          </div>
        ) : (
          <>
            <p className="hint grow">Để dán một handoff vào tài liệu, chọn task của nó trước.</p>
            <button type="button" onClick={onPickTask}>
              Chọn task
            </button>
          </>
        )}
      </div>
    </section>
  );
}

// TDD §7.5: a project without documents moves its context as one summary per handoff. AgentHub
// keeps them; the next session reads the newest, which the opening prompt points to.
function NoteHandoffs({ project, context, onReload, onError }: Props & { context: ProjectContextDto }) {
  const [open, setOpen] = useState<NoteWithContentDto>();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const { handoffs } = context;

  async function show(noteId: string): Promise<void> {
    if (open?.id === noteId) {
      setOpen(undefined);
      return;
    }
    try {
      setOpen(await unwrap(api.readProjectHandoff({ id: project.id, noteId })));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function save(): Promise<void> {
    setSaving(true);
    onError(undefined);
    try {
      await unwrap(api.saveProjectHandoff({ id: project.id, ...(title.trim() ? { title } : {}), content }));
      setTitle('');
      setContent('');
      onReload();
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-group" aria-label="Handoff của project">
      <div className="settings-group-header">
        <div className="grow settings-row-text">
          <h2>Handoff</h2>
          <p className="hint">
            Project này không bật tài liệu, nên ngữ cảnh đi qua bản tóm tắt. Trước khi đổi account, dán lời nhắc này vào phiên đang làm; agent lưu bản tóm tắt qua MCP. Lần mở sau, agent đọc bản mới nhất.
          </p>
        </div>
        <CopyButton text={context.checkpointPrompt} label="Copy lời nhắc tóm tắt" />
      </div>
      {handoffs.length === 0 && <p className="settings-empty hint">Chưa có handoff nào.</p>}
      {handoffs.length > 0 && (
        <ul className="settings-list" aria-label="Các handoff">
          {handoffs.map((note, index) => (
            <li key={note.id} className="note-row" data-testid="project-handoff">
              <button type="button" className="note-summary" aria-expanded={open?.id === note.id} onClick={() => void show(note.id)}>
                <span className="grow truncate">{note.title}</span>
                {index === 0 && <span className="badge ok">Mới nhất</span>}
                <span className="hint">
                  {noteDate(note.createdAt)} · {note.source}
                </span>
              </button>
              {open?.id === note.id && <pre className="note-text">{open.content}</pre>}
            </li>
          ))}
        </ul>
      )}
      <Disclosure summary="Thêm handoff" className="settings-row handoff-form">
        <div className="stack">
          <p className="hint">Dán bản tóm tắt mà agent in ra khi không lưu được qua MCP.</p>
          <input aria-label="Tiêu đề handoff" placeholder="Tiêu đề (tuỳ chọn)" value={title} onChange={(event) => setTitle(event.target.value)} />
          <textarea aria-label="Nội dung handoff" rows={6} value={content} onChange={(event) => setContent(event.target.value)} />
          <div className="row">
            <button type="button" className="primary" disabled={saving || content.trim() === ''} onClick={() => void save()}>
              Lưu handoff
            </button>
          </div>
        </div>
      </Disclosure>
    </section>
  );
}
