import type { NoteWithContentDto, ProjectContextDto, ProjectDto } from '@agenthub/contracts';
import { useState } from 'react';
import { api, unwrap } from './api';
import { CopyButton } from './CopyButton';
import { useI18n } from './i18n';
import { Disclosure } from './ui';

interface Props {
  project: ProjectDto;
  context: ProjectContextDto | undefined;
  onReload: () => void;
  onError: (message: string | undefined) => void;
}

export const noteDate = ({ date }: ReturnType<typeof useI18n>, iso: string): string => date(iso, { dateStyle: 'short', timeStyle: 'short' });

// Only for a project without documents (ADR-023): with documents, handoffs live in each task's
// Handoff log, shown and pasted in the task panel.
export function ProjectHandoffs(props: Props) {
  if (!props.context || props.project.context.enabled) return null;
  return <NoteHandoffs {...props} context={props.context} />;
}

// "Thêm handoff" for one task: an entry an agent printed in a chat that cannot reach the files.
export function PasteHandoff({ project, task, onAdded, onError }: { project: ProjectDto; task: { ref: string; id: string }; onAdded: () => Promise<void> | void; onError: (message: string | undefined) => void }) {
  const { t } = useI18n();
  const [entry, setEntry] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function add(): Promise<void> {
    if (entry.trim() === '') return;
    setSaving(true);
    onError(undefined);
    try {
      await unwrap(api.addHandoff({ id: project.id, taskRef: task.ref, entry }));
      setEntry('');
      setSaved(true);
      await onAdded();
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Disclosure summary={t('handoffs.add')} className="handoff-paste">
      <div className="stack">
        <p className="hint">{t('handoffs.pasteHint', { task: task.id })}</p>
        <textarea
          aria-label={t('handoffs.content')}
          rows={6}
          value={entry}
          placeholder={'### 2026-11-05 14:00 — account / agent\n- **Done:** …\n- **Remaining:** …'}
          onChange={(event) => {
            setEntry(event.target.value);
            setSaved(false);
          }}
        />
        <div className="row">
          <button type="button" className="primary" disabled={saving || entry.trim() === ''} onClick={() => void add()}>
            {t('handoffs.add')}
          </button>
          {saved && (
            <span className="hint" role="status">
              {t('handoffs.added', { task: task.id })}
            </span>
          )}
        </div>
      </div>
    </Disclosure>
  );
}

// TDD §7.5: a project without documents moves its context as one summary per handoff. AgentHub
// keeps them; the next session reads the newest, which the opening prompt points to.
function NoteHandoffs({ project, context, onReload, onError }: Props & { context: ProjectContextDto }) {
  const i18n = useI18n();
  const { t } = i18n;
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
    <section className="settings-group" aria-label={t('handoffs.region')}>
      <div className="settings-group-header">
        <div className="grow settings-row-text">
          <h2>Handoff</h2>
          <p className="hint">{t('handoffs.summaryHint')}</p>
        </div>
        <CopyButton text={context.checkpointPrompt} label={t('handoffs.copySummary')} />
      </div>
      {handoffs.length === 0 && <p className="settings-empty hint">{t('handoffs.empty')}</p>}
      {handoffs.length > 0 && (
        <ul className="settings-list" aria-label={t('handoffs.list')}>
          {handoffs.map((note, index) => (
            <li key={note.id} className="note-row" data-testid="project-handoff">
              <button type="button" className="note-summary" aria-expanded={open?.id === note.id} onClick={() => void show(note.id)}>
                <span className="grow truncate">{note.title}</span>
                {index === 0 && <span className="badge ok">{t('handoffs.newest')}</span>}
                <span className="hint">
                  {noteDate(i18n, note.createdAt)} · {note.source}
                </span>
              </button>
              {open?.id === note.id && <pre className="note-text">{open.content}</pre>}
            </li>
          ))}
        </ul>
      )}
      <Disclosure summary={t('handoffs.add')} className="settings-row handoff-form">
        <div className="stack">
          <p className="hint">{t('handoffs.pasteSummary')}</p>
          <input aria-label={t('handoffs.titleField')} placeholder={t('handoffs.titlePlaceholder')} value={title} onChange={(event) => setTitle(event.target.value)} />
          <textarea aria-label={t('handoffs.content')} rows={6} value={content} onChange={(event) => setContent(event.target.value)} />
          <div className="row">
            <button type="button" className="primary" disabled={saving || content.trim() === ''} onClick={() => void save()}>
              {t('handoffs.save')}
            </button>
          </div>
        </div>
      </Disclosure>
    </section>
  );
}
