import type { NoteDto, NoteWithContentDto, ProjectDto } from '@agenthub/contracts';
import { useEffect, useState } from 'react';
import { api, unwrap } from './api';
import { CopyButton } from './CopyButton';
import { useI18n } from './i18n';
import { noteDate } from './ProjectHandoffs';
import { Select } from './ui';

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
  const i18n = useI18n();
  const { t } = i18n;
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
        <h1>{t('looseChat.notFound')}</h1>
        <p className="hint">{t('looseChat.notFoundHint')}</p>
      </div>
    );
  }

  const projectOptions = projects.map((project) => ({ value: project.id, label: project.name }));

  return (
    <div className="stack page">
      <header className="page-header">
        <p className="breadcrumb">{t('looseChat.section')}</p>
        <h1 className="page-title">{note.title}</h1>
        <p className="hint">
          {noteDate(i18n, note.createdAt)} · {note.source}
        </p>
      </header>

      <section className="settings-group" aria-label={t('looseChat.content')}>
        <pre className="note-text loose-chat-text">{note.content}</pre>
        <div className="settings-row">
          <p className="hint grow">{t('looseChat.pasteHint')}</p>
          <div className="row nowrap">
            {/* What another account's chat is told to pick the chat up (TDD §9.4 scenario 5). */}
            <CopyButton text={i18n.prompt(i18n.chatLocale, 'prompt.looseChat', { title: note.title, id: note.id })} label={t('looseChat.copyPrompt')} />
            <CopyButton text={`# ${note.title}\n\n${note.content}`} label={t('looseChat.copyContent')} />
          </div>
        </div>
      </section>

      <section className="settings-group" aria-label={t('looseChat.move')}>
        <div className="settings-group-header">
          <div className="grow settings-row-text">
            <h2>{t('looseChat.move')}</h2>
            <p className="hint">{t('looseChat.moveHint')}</p>
          </div>
        </div>
        {projectOptions.length === 0 ? (
          <p className="settings-empty hint">{t('projects.empty')}</p>
        ) : (
          <div className="settings-row">
            <Select label={t('looseChat.target')} value={target} options={[{ value: '', label: t('looseChat.pickProject') }, ...projectOptions]} onChange={setTarget} />
            <button type="button" disabled={!target || moving} onClick={() => void move()}>
              {t('looseChat.move')}
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
  const { t } = useI18n();
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
        <h1 className="page-title">{t('looseChat.new')}</h1>
        <p className="hint">{t('looseChat.newHint')}</p>
      </header>
      <section className="settings-group" aria-label={t('looseChat.add')}>
        <div className="settings-row">
          <div className="stack grow">
            <input aria-label={t('looseChat.titleField')} placeholder={t('common.title')} value={title} onChange={(event) => setTitle(event.target.value)} />
            <textarea aria-label={t('looseChat.content')} rows={10} value={content} onChange={(event) => setContent(event.target.value)} />
            <div className="row">
              <button type="button" className="primary" disabled={saving || title.trim() === '' || content.trim() === ''} onClick={() => void save()}>
                {t('looseChat.save')}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
