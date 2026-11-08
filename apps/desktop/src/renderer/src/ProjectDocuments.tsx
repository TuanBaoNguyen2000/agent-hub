import type { DocumentDto, DocumentEntryDto, ProjectDto } from '@agenthub/contracts';
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, unwrap } from './api';
import { useExternalChange } from './documentWatch';
import { useI18n } from './i18n';
import { ChevronDown, ChevronRight, Close, Doc, Folder, Plus, Refresh } from './icons';
import { Markdown } from './Markdown';
import { Dialog, PathText } from './ui';

// ADR-023 item 6: the documents as a folder tree in a panel on the right that every tab of the
// project can show or hide, like the Files pane of Claude and Codex Desktop and of IDEs. Reading
// and editing work as in ADR-021 item 8; deleting and renaming stay in the user's editor.

const WIDTH_KEY = 'agenthub.documentsPanel.width';
const MIN_WIDTH = 280;
const DEFAULT_WIDTH = 620;

export function readPanelWidth(): number {
  try {
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(stored) && stored >= MIN_WIDTH ? stored : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

const isMarkdown = (path: string): boolean => /\.md$/i.test(path);
const nameOf = (path: string): string => path.replace(/\/$/, '').split('/').at(-1) ?? path;
const parentOf = (path: string): string => {
  const trimmed = path.replace(/\/$/, '');
  const at = trimmed.lastIndexOf('/');
  return at < 0 ? '' : `${trimmed.slice(0, at)}/`;
};
// Folders that lead to a path, such as "A/" and "A/B/" for "A/B/c.md".
const ancestors = (path: string): string[] => {
  const parts = path.replace(/\/$/, '').split('/').slice(0, -1);
  return parts.map((_, index) => `${parts.slice(0, index + 1).join('/')}/`);
};
export const TASK_FILE = /(^|\/)Tasks\/TASK-\d+[^/]*\.md$/i;

interface Node {
  entry: DocumentEntryDto;
  children: Node[];
}

function buildTree(entries: readonly DocumentEntryDto[]): Node[] {
  const roots: Node[] = [];
  const folders = new Map<string, Node>();
  for (const entry of entries) {
    const node: Node = { entry, children: [] };
    if (entry.kind === 'folder') folders.set(entry.path, node);
    const parent = folders.get(parentOf(entry.path));
    (parent ? parent.children : roots).push(node);
  }
  // Folders first, as in Finder's list and in editors.
  const sort = (nodes: Node[]): void => {
    nodes.sort((a, b) => (a.entry.kind === b.entry.kind ? a.entry.path.localeCompare(b.entry.path) : a.entry.kind === 'folder' ? -1 : 1));
    for (const node of nodes) sort(node.children);
  };
  sort(roots);
  return roots;
}

interface Props {
  project: ProjectDto;
  // Changes when the project page reads the documents again, so the tree follows.
  version: number;
  width: number;
  onWidth: (width: number) => void;
  onClose: () => void;
  onSetUp: () => void;
  // After a write, so the task list and warnings read the documents again.
  onChanged: () => Promise<void>;
  // A task file opens on the Task tab.
  onOpenTask: (ref: string) => void;
  // A file another part of the page asks to show, such as "open file" on a task.
  request: { path: string; at: number } | null;
  onError: (message: string | undefined) => void;
}

export function DocumentsPanel({ project, version, width, onWidth, onClose, onSetUp, onChanged, onOpenTask, request, onError }: Props) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<DocumentEntryDto[]>();
  const [open, setOpen] = useState<DocumentDto>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');
  // Workstream folders start open, so STATUS.md is one click away; deeper folders start closed.
  const [expanded, setExpanded] = useState<Set<string> | null>(null);

  const loadList = useCallback(async () => {
    if (!project.context.enabled) return;
    try {
      setEntries(await unwrap(api.listDocuments({ id: project.id })));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }, [project.id, project.context.enabled, project.context.path, onError]);

  useEffect(() => {
    void loadList();
  }, [loadList, version]);

  const show = useCallback(
    async (path: string) => {
      onError(undefined);
      try {
        setOpen(await unwrap(api.readDocument({ id: project.id, path })));
        setEditing(false);
        setExpanded((current) => new Set([...(current ?? []), ...ancestors(path)]));
      } catch (reason) {
        onError((reason as Error).message);
      }
    },
    [project.id, onError],
  );

  useEffect(() => {
    if (request) void show(request.path);
  }, [request, show]);

  const changed = useExternalChange(project.id, open?.path ?? null, open?.sha256 ?? null, true);
  useEffect(() => {
    // Reading only: show the new version at once. Editing: the user decides (ADR-021 item 9).
    if (changed && !editing && open) void show(open.path);
  }, [changed, editing, open, show]);

  useEffect(() => {
    if (entries && expanded === null) setExpanded(new Set(entries.filter((entry) => entry.kind === 'folder' && entry.path.split('/').length <= 3 && !/(^|\/)Tasks\/$/.test(entry.path)).map((entry) => entry.path)));
  }, [entries, expanded]);

  const tree = useMemo(() => buildTree(entries ?? []), [entries]);
  const query = filter.trim().toLowerCase();
  // While filtering, every folder holding a match is open and nothing else is shown.
  const matches = useMemo(() => {
    if (query === '') return null;
    const shown = new Set<string>();
    for (const entry of entries ?? []) {
      if (entry.kind === 'file' && entry.path.toLowerCase().includes(query)) {
        shown.add(entry.path);
        for (const folder of ancestors(entry.path)) shown.add(folder);
      }
    }
    return shown;
  }, [entries, query]);

  function startResize(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const max = Math.max(MIN_WIDTH, window.innerWidth * 0.7);
    const move = (moved: PointerEvent): void => onWidth(Math.round(Math.min(max, Math.max(MIN_WIDTH, startWidth + startX - moved.clientX))));
    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
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

  function toggle(path: string): void {
    setExpanded((current) => {
      const next = new Set(current ?? []);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderNodes(nodes: Node[], depth: number) {
    return nodes
      .filter((node) => !matches || matches.has(node.entry.path))
      .map((node) => {
        const { entry } = node;
        const indent = { paddingLeft: `${depth * 14 + 6}px` };
        if (entry.kind === 'folder') {
          const isOpen = matches ? true : (expanded?.has(entry.path) ?? false);
          return (
            <li key={entry.path} role="treeitem" aria-expanded={isOpen} aria-label={nameOf(entry.path)}>
              <button type="button" className="tree-row tree-folder" style={indent} title={entry.path} onClick={() => toggle(entry.path)}>
                <span className="tree-chevron">{isOpen ? <ChevronDown /> : <ChevronRight />}</span>
                <span className="truncate">{nameOf(entry.path)}</span>
              </button>
              {isOpen && node.children.length > 0 && <ul role="group">{renderNodes(node.children, depth + 1)}</ul>}
            </li>
          );
        }
        return (
          <li key={entry.path} role="treeitem" aria-selected={open?.path === entry.path} aria-label={nameOf(entry.path)}>
            <button
              type="button"
              className="tree-row tree-file"
              style={indent}
              aria-current={open?.path === entry.path ? 'true' : undefined}
              disabled={!isMarkdown(entry.path)}
              title={entry.path}
              onClick={() => void show(entry.path)}
            >
              <span className="tree-chevron" />
              <span className="tree-icon">
                <Doc />
              </span>
              <span className="truncate">{nameOf(entry.path)}</span>
            </button>
          </li>
        );
      });
  }

  const taskRef = open && TASK_FILE.test(open.path) ? open.path : null;

  return (
    <aside className="documents-panel" style={{ width }} aria-label={t('documents.region')}>
      <div className="documents-resize" role="separator" aria-orientation="vertical" aria-label={t('documents.resize')} onPointerDown={startResize} />
      <div className="documents-head">
        <h2 className="grow">{t('documents.title')}</h2>
        {project.context.enabled && (
          <>
            <button type="button" className="icon-button" aria-label={t('documents.new')} title={t('documents.new')} onClick={() => setCreating(true)}>
              <Plus />
            </button>
            <button type="button" className="icon-button" aria-label={t('documents.refresh')} title={t('documents.refresh')} onClick={() => void loadList()}>
              <Refresh />
            </button>
          </>
        )}
        <button type="button" className="icon-button" aria-label={t('documents.hide')} title={`${t('documents.hide')} (⌘⇧E)`} onClick={onClose}>
          <Close />
        </button>
      </div>

      {!project.context.enabled ? (
        <div className="documents-empty">
          <p className="hint">{t('documents.noDocs')}</p>
          <button type="button" onClick={onSetUp}>
            {t('docs.create')}
          </button>
        </div>
      ) : (
        <div className={`documents-body${width < 480 ? ' stacked' : ''}`}>
          <section className="documents-viewer" aria-label={t('documents.viewer')}>
            {!open ? (
              <div className="documents-placeholder">
                <span aria-hidden="true">
                  <Folder />
                </span>
                <p>{t('documents.pick')}</p>
              </div>
            ) : (
              <>
                <div className="documents-viewer-head">
                  <div className="grow settings-row-text">
                    <span className="settings-row-label truncate">{nameOf(open.path)}</span>
                    <span className="path" data-testid="document-path">
                      <PathText path={open.path} />
                    </span>
                  </div>
                  {!editing && (
                    <div className="row nowrap">
                      {taskRef && (
                        <button type="button" className="small" onClick={() => onOpenTask(taskRef)}>
                          {t('documents.openTask')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="small"
                        onClick={() => {
                          setDraft(open.content);
                          setEditing(true);
                        }}
                      >
                        {t('tasks.edit')}
                      </button>
                      <button type="button" className="small" onClick={() => void openFile(open.path)}>
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
                <div className="documents-content">
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
                    <Markdown source={open.content} />
                  )}
                </div>
              </>
            )}
          </section>
          <nav className="documents-tree" aria-label={t('documents.files')}>
            <input className="documents-filter" type="search" value={filter} placeholder={t('documents.filter')} aria-label={t('documents.filter')} onChange={(event) => setFilter(event.target.value)} />
            {entries?.length === 0 && <p className="hint documents-note">{t('documents.empty')}</p>}
            {matches?.size === 0 && <p className="hint documents-note">{t('documents.noMatch')}</p>}
            <ul role="tree" aria-label={t('documents.files')}>
              {renderNodes(tree, 0)}
            </ul>
          </nav>
        </div>
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
    </aside>
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
