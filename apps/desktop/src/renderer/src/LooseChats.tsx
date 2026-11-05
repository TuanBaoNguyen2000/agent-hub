import type { NoteDto, NoteWithContentDto, ProjectDto } from '@agenthub/contracts';
import { useEffect, useState } from 'react';
import { api, unwrap } from './api';
import { CopyButton } from './CopyButton';
import { noteDate } from './ProjectHandoffs';
import { Select } from './ui';

// What another account's chat should be told to pick a loose chat up (TDD §9.4 scenario 5).
const continuePrompt = (note: NoteDto): string =>
  `Read the AgentHub loose chat "${note.title}" with the agenthub MCP tool context_loose_chats (id ${note.id}) and continue from it. Tell me what you understand before doing anything.`;

interface ViewProps {
  id: string;
  projects: ProjectDto[];
  // After the chat went into a project, which the app then opens.
  onMoved: (projectId: string) => void;
  onError: (message: string | undefined) => void;
}

// One chat that belongs to no project (TDD §7.5): saved by an agent through MCP or pasted here, read
// back by any account, and moved into a project when it turns out to belong to one.
export function LooseChatView({ id, projects, onMoved, onError }: ViewProps) {
  const [note, setNote] = useState<NoteWithContentDto | null>();
  const [target, setTarget] = useState('');
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    let current = true;
    setNote(undefined);
    unwrap(api.readLooseChat({ id })).then(
      (loaded) => current && setNote(loaded),
      () => current && setNote(null),
    );
    return () => {
      current = false;
    };
  }, [id]);

  async function move(): Promise<void> {
    if (!target) return;
    setMoving(true);
    onError(undefined);
    try {
      await unwrap(api.moveLooseChat({ id, projectId: target }));
      onMoved(target);
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setMoving(false);
    }
  }

  if (note === undefined) return null;
  if (note === null) {
    return (
      <div className="empty">
        <h1>Không tìm thấy chat rời này</h1>
        <p className="hint">Có thể nó đã được chuyển vào một project.</p>
      </div>
    );
  }

  const projectOptions = projects.map((project) => ({ value: project.id, label: project.name }));

  return (
    <div className="stack page">
      <header className="page-header">
        <p className="breadcrumb">Chat rời</p>
        <h1 className="page-title">{note.title}</h1>
        <p className="hint">
          {noteDate(note.createdAt)} · {note.source}
        </p>
      </header>

      <section className="settings-group" aria-label="Nội dung chat rời">
        <pre className="note-text loose-chat-text">{note.content}</pre>
        <div className="settings-row">
          <p className="hint grow">Dán vào chat của account khác (có MCP của AgentHub) để làm tiếp từ đây.</p>
          <div className="row nowrap">
            <CopyButton text={continuePrompt(note)} label="Copy lời nhắc tiếp tục" />
            <CopyButton text={`# ${note.title}\n\n${note.content}`} label="Copy nội dung" />
          </div>
        </div>
      </section>

      <section className="settings-group" aria-label="Chuyển vào project">
        <div className="settings-group-header">
          <div className="grow settings-row-text">
            <h2>Chuyển vào project</h2>
            <p className="hint">
              Project có tài liệu: chat vào thư mục Inbox/ của tài liệu, để agent biến nó thành task. Project không có tài liệu: chat thành một handoff.
            </p>
          </div>
        </div>
        {projectOptions.length === 0 ? (
          <p className="settings-empty hint">Chưa có project nào.</p>
        ) : (
          <div className="settings-row">
            <Select label="Project đích" value={target} options={[{ value: '', label: 'Chọn project' }, ...projectOptions]} onChange={setTarget} />
            <button type="button" disabled={!target || moving} onClick={() => void move()}>
              Chuyển vào project
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

interface NewProps {
  onSaved: (note: NoteDto) => void;
  onError: (message: string | undefined) => void;
}

export function NewLooseChat({ onSaved, onError }: NewProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    setSaving(true);
    onError(undefined);
    try {
      onSaved(await unwrap(api.saveLooseChat({ title, content })));
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack page">
      <header className="page-header">
        <h1 className="page-title">Chat rời mới</h1>
        <p className="hint">
          Agent tự lưu chat rời bằng skill context-capture (tool MCP context_capture). Ở đây bạn dán ghi chú mà agent in ra khi không lưu được qua MCP.
        </p>
      </header>
      <section className="settings-group" aria-label="Thêm chat rời">
        <div className="settings-row">
          <div className="stack grow">
            <input aria-label="Tiêu đề chat rời" placeholder="Tiêu đề" value={title} onChange={(event) => setTitle(event.target.value)} />
            <textarea aria-label="Nội dung chat rời" rows={10} value={content} onChange={(event) => setContent(event.target.value)} />
            <div className="row">
              <button type="button" className="primary" disabled={saving || title.trim() === '' || content.trim() === ''} onClick={() => void save()}>
                Lưu chat rời
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
