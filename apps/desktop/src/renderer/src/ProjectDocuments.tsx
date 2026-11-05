import type { DocumentDto, DocumentEntryDto, ProjectDto } from '@agenthub/contracts';
import { useCallback, useEffect, useState } from 'react';
import { api, unwrap } from './api';
import { useExternalChange } from './documentWatch';
import { useI18n } from './i18n';
import { Markdown } from './Markdown';
import { Dialog } from './ui';

interface Props {
  project: ProjectDto;
  // Only while the tab is shown: what is not shown is not read or watched.
  active: boolean;
  onCreateDocs: () => void;
  // After a write, so the task list and warnings read the documents again.
  onChanged: () => Promise<void>;
  onError: (message: string | undefined) => void;
}

const isMarkdown = (path: string): boolean => /\.md$/i.test(path);
const depthOf = (path: string): number => path.replace(/\/$/, '').split('/').length - 1;
const nameOf = (path: string): string => path.replace(/\/$/, '').split('/').at(-1) ?? path;

// ADR-021 item 8: every Markdown file of the documents, read and edited in AgentHub. Deleting and
// renaming stay in the user's editor or with an agent.
export function ProjectDocuments({ project, active, onCreateDocs, onChanged, onError }: Props) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<DocumentEntryDto[]>();
  const [open, setOpen] = useState<DocumentDto>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadList = useCallback(async () => {
    if (!project.context.enabled) return;
    try {
      setEntries(await unwrap(api.listDocuments({ id: project.id })));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }, [project.id, project.context.enabled, project.context.path, onError]);

  useEffect(() => {
    if (active) void loadList();
  }, [active, loadList]);

  const show = useCallback(
    async (path: string) => {
      onError(undefined);
      try {
        setOpen(await unwrap(api.readDocument({ id: project.id, path })));
        setEditing(false);
      } catch (reason) {
        onError((reason as Error).message);
      }
    },
    [project.id, onError],
  );

  const changed = useExternalChange(project.id, open?.path ?? null, open?.sha256 ?? null, active);
  useEffect(() => {
    // Reading only: show the new version at once. Editing: the user decides (ADR-021 item 9).
    if (changed && !editing && open) void show(open.path);
  }, [changed, editing, open, show]);

  if (!project.context.enabled) {
    return (
      <section className="settings-group" aria-label={t('documents.region')}>
        <div className="settings-row">
          <p className="hint grow">{t('documents.noDocs')}</p>
          <button type="button" onClick={onCreateDocs}>
            {t('docs.create')}
          </button>
        </div>
      </section>
    );
  }

  async function save(): Promise<void> {
    if (!open) return;
    setSaving(true);
    onError(undefined);
    try {
      await unwrap(api.writeDocument({ id: project.id, path: open.path, content: draft, baseSha256: open.sha256 }));
      await show(open.path);
      await onChanged();
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function openFile(path: string): Promise<void> {
    try {
      await unwrap(api.openDocument({ id: project.id, path }));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  return (
    <div className="tasks-layout">
      <section className="settings-group tasks-list" aria-label={t('documents.region')}>
        <div className="settings-group-header">
          <div className="grow settings-row-text">
            <h2>{t('documents.title')}</h2>
            <span className="path">{project.context.path}</span>
          </div>
          <button type="button" onClick={() => setCreating(true)}>
            {t('documents.new')}
          </button>
        </div>
        {entries?.length === 0 && <p className="settings-empty hint">{t('documents.empty')}</p>}
        <ul className="document-tree" aria-label={t('documents.files')}>
          {entries?.map((entry) =>
            entry.kind === 'folder' ? (
              <li key={entry.path} className="document-folder" style={{ paddingLeft: `${depthOf(entry.path) * 14 + 12}px` }}>
                {nameOf(entry.path)}/
              </li>
            ) : (
              <li key={entry.path} style={{ paddingLeft: `${depthOf(entry.path) * 14}px` }}>
                <button
                  type="button"
                  className="task-item document-item"
                  aria-current={open?.path === entry.path ? 'true' : undefined}
                  disabled={!isMarkdown(entry.path)}
                  title={entry.path}
                  onClick={() => void show(entry.path)}
                >
                  {nameOf(entry.path)}
                </button>
              </li>
            ),
          )}
        </ul>
      </section>

      {open && (
        <section className="settings-group task-detail" aria-label={t('documents.viewer')}>
          <div className="settings-group-header">
            <div className="grow settings-row-text">
              <h2>{nameOf(open.path)}</h2>
              <span className="path" data-testid="document-path">
                {open.path}
              </span>
            </div>
            {!editing && (
              <div className="row nowrap">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(open.content);
                    setEditing(true);
                  }}
                >
                  {t('tasks.edit')}
                </button>
                <button type="button" onClick={() => void openFile(open.path)}>
                  {t('tasks.openFile')}
                </button>
              </div>
            )}
          </div>
          {changed && editing && (
            <div className="banner warning tools-banner" role="alert">
              <p>{t('tasks.changedOutside')}</p>
              <button type="button" onClick={() => void show(open.path)}>
                {t('tasks.reload')}
              </button>
            </div>
          )}
          <div className="settings-row">
            {editing ? (
              <div className="stack grow">
                <textarea aria-label={t('tasks.markdownField')} className="code-input" rows={26} value={draft} onChange={(event) => setDraft(event.target.value)} />
                <div className="row">
                  <button type="button" onClick={() => setEditing(false)}>
                    {t('common.cancel')}
                  </button>
                  <button type="button" className="primary" disabled={saving || changed} onClick={() => void save()}>
                    {t('common.save')}
                  </button>
                </div>
              </div>
            ) : (
              <Markdown source={open.content} className="grow" />
            )}
          </div>
        </section>
      )}

      {creating && (
        <NewDocumentDialog
          onClose={() => setCreating(false)}
          onCreate={async (path) => {
            const name = nameOf(path).replace(/\.md$/i, '');
            await unwrap(api.writeDocument({ id: project.id, path, content: `# ${name}\n`, baseSha256: null }));
            setCreating(false);
            await loadList();
            await show(path);
            await onChanged();
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

function NewDocumentDialog({ onClose, onCreate, onError }: { onClose: () => void; onCreate: (path: string) => Promise<void>; onError: (message: string | undefined) => void }) {
  const { t } = useI18n();
  const [path, setPath] = useState('');
  const normalized = path.trim().replace(/^\/+/, '');
  const full = normalized === '' || isMarkdown(normalized) ? normalized : `${normalized}.md`;
  return (
    <Dialog
      label={t('documents.new')}
      title={t('documents.new')}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="primary"
            disabled={full === ''}
            onClick={() => {
              onError(undefined);
              onCreate(full).catch((reason: unknown) => onError((reason as Error).message));
            }}
          >
            {t('documents.create')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">{t('documents.pathField')}</span>
        <input value={path} placeholder="Notes/ideas.md" spellCheck={false} onChange={(event) => setPath(event.target.value)} />
        <span className="hint">{t('documents.pathHint')}</span>
      </label>
    </Dialog>
  );
}
