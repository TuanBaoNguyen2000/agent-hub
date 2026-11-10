import type {
  ContextTaskDto,
  ProfileDto,
  ProjectContextDto,
  ProjectDto,
  TaskSectionKindDto,
  TaskStateDto,
  TaskViewDto,
  UsageDto,
} from '@agenthub/contracts';
import { TASK_STATES } from '@agenthub/contracts/constants';
import { LOCALES, type MessageKey, TABLES, translate } from '@agenthub/i18n';
import { type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { api, unwrap } from './api';
import { useExternalChange } from './documentWatch';
import { useI18n } from './i18n';
import { ChevronDown, ChevronRight, Close, More, Plus } from './icons';
import { Markdown } from './Markdown';
import { PasteHandoff } from './ProjectHandoffs';
import { ProjectLaunch } from './ProjectLaunch';
import { skillCommand } from './quickCommands';
import { Dialog, Menu, MenuItem, PathText, Segmented, Select, StatusText, type StatusTone } from './ui';

type I18n = ReturnType<typeof useI18n>;
type TaskSectionDto = TaskViewDto['document']['sections'][number];

export function handoffText({ t, date }: I18n, task: ContextTaskDto): string {
  if (!task.lastHandoff) return t('tasks.noHandoff');
  // A heading with only a date is read as the end of that day; showing 23:59 would mislead.
  const hasTime = /\d{1,2}:\d{2}/.test(task.lastHandoff.heading);
  const when = task.lastHandoff.at ? date(task.lastHandoff.at, hasTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }) : null;
  return when ? `Handoff ${when}` : `Handoff: ${task.lastHandoff.heading}`;
}

export const allTasks = (context: ProjectContextDto | undefined): ContextTaskDto[] =>
  context?.overview.workstreams.flatMap((workstream) => workstream.tasks) ?? [];

export const STATE_LABELS: Record<TaskStateDto, MessageKey> = {
  todo: 'tasks.state.todo',
  active: 'tasks.state.active',
  blocked: 'tasks.state.blocked',
  review: 'tasks.state.review',
  done: 'tasks.state.done',
};

export const STATE_TONES: Record<TaskStateDto, StatusTone> = { active: 'active', blocked: 'warning', review: 'info', todo: 'neutral', done: 'ok' };

// The list puts what needs attention first, as in Linear and GitHub Projects; the board follows
// the workflow from left to right (TASK_STATES order), as a kanban does.
const LIST_ORDER: readonly TaskStateDto[] = ['active', 'blocked', 'review', 'todo', 'done'];
const BOARD_ORDER: readonly TaskStateDto[] = TASK_STATES;

// The words AgentHub writes, in any documents language: only other words need a note. "Chờ" was
// the Vietnamese "To do" before review became a state of its own.
const STANDARD_WORDS = new Set([...LOCALES.flatMap((locale) => TASK_STATES.map((state) => TABLES[locale][STATE_LABELS[state]].toLowerCase())), 'chờ']);

// The same grouping as Main's (ADR-021 item 4), for the list before a task is opened.
const word = (alternatives: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'iu');
const DONE = word('done|xong|complete|completed|hoàn thành|closed|cancell?ed|huỷ|hủy|archived|완료|종료');
const BLOCKED = word('blocked|blocker|on hold|bị chặn|chặn|tạm dừng|막힘|보류|차단');
const REVIEW = word('in[ -]review|review|reviewing|needs review|chờ duyệt|duyệt|đang review|chờ review|검토 중|검토|리뷰');
const ACTIVE = word('in[ -]progress|doing|active|wip|đang làm|đang|진행 중|진행');
export function groupOf(state: string | null): TaskStateDto {
  if (!state) return 'todo';
  if (DONE.test(state)) return 'done';
  if (BLOCKED.test(state)) return 'blocked';
  if (REVIEW.test(state)) return 'review';
  if (ACTIVE.test(state)) return 'active';
  return 'todo';
}

const workstreamOf = (ref: string): string => ref.slice(0, ref.lastIndexOf('/Tasks/'));

interface Props {
  project: ProjectDto;
  context: ProjectContextDto | undefined;
  // Only while the tab is shown: what is not shown is not watched.
  active: boolean;
  // A task another part of the page asks to show, such as a task file in the documents panel.
  focus: { ref: string; at: number } | null;
  onCreateDocs: () => void;
  // Reads the documents again, after AgentHub or an agent changed them.
  onReload: () => Promise<void>;
  // Shows a file in the documents panel.
  onShowFile: (path: string) => void;
  onError: (message: string | undefined) => void;
  accounts: ProfileDto[] | undefined;
  usages: Record<string, UsageDto>;
  onOpenSettings: () => void;
  onOpenTools: (profileId?: string) => void;
  onLaunched: () => void;
}

type View = 'list' | 'board';
const VIEW_KEY = 'agenthub.tasks.view';
const PANEL_WIDTH_KEY = 'agenthub.tasks.panelWidth';
const PANEL_MIN_WIDTH = 320;
// The list or board keeps at least this much room beside the panel.
const MAIN_MIN_WIDTH = 280;

function readPanelWidth(): number | null {
  try {
    const stored = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    return Number.isFinite(stored) && stored >= PANEL_MIN_WIDTH ? stored : null;
  } catch {
    return null;
  }
}

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}

// ADR-023 item 5 (after ADR-021 items 2–7): the tasks the documents hold, grouped by state, in a
// list or on a board; one opens in a panel on the right with its properties and sections.
export function ProjectTasks(props: Props) {
  const { project, context, focus, onCreateDocs, onReload, onError } = props;
  const i18n = useI18n();
  const { t } = i18n;
  const [view, setView] = useState<View>(readView);
  const [workstreamFilter, setWorkstreamFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingWorkstream, setCreatingWorkstream] = useState(false);
  // Backlog I1: what the user asked to delete, waiting for the confirmation.
  const [deleting, setDeleting] = useState<{ kind: 'workstream'; slug: string; title: string; tasks: number } | null>(null);
  const [launchFor, setLaunchFor] = useState<{ ref: string; purpose: 'resume' | 'refine' } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<TaskStateDto>>(() => new Set(['done']));
  const [panelWidth, setPanelWidth] = useState<number | null>(readPanelWidth);

  useEffect(() => {
    try {
      if (panelWidth === null) localStorage.removeItem(PANEL_WIDTH_KEY);
      else localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
    } catch {
      // Only a convenience.
    }
  }, [panelWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Only a convenience.
    }
  }, [view]);

  useEffect(() => {
    if (focus) setViewing(focus.ref);
  }, [focus]);

  const tasks = allTasks(context);
  const titles = useMemo(() => new Map(context?.overview.workstreams.map((item) => [item.slug, item.title]) ?? []), [context]);
  const q = query.trim().toLowerCase();
  const visible = tasks.filter(
    (task) => (workstreamFilter === 'all' || workstreamOf(task.ref) === workstreamFilter) && (q === '' || `${task.id} ${task.title}`.toLowerCase().includes(q)),
  );
  const open = viewing && tasks.some((task) => task.ref === viewing) ? viewing : null;

  if (!project.context.enabled) {
    return (
      <div className="tasks-empty-page">
        <p className="hint">{t('tasks.noDocs')}</p>
        <button type="button" className="primary" onClick={onCreateDocs}>
          {t('docs.create')}
        </button>
      </div>
    );
  }
  if (!context) return null;
  const { overview, warnings } = context;

  async function move(ref: string, state: TaskStateDto): Promise<void> {
    const task = tasks.find((item) => item.ref === ref);
    if (!task || groupOf(task.state) === state) return;
    onError(undefined);
    try {
      await unwrap(api.setTaskState({ id: project.id, ref, state }));
      await onReload();
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  const byGroup = (group: TaskStateDto) => visible.filter((task) => groupOf(task.state) === group);
  const workstreamOptions = [{ value: 'all', label: t('tasks.allWorkstreams') }, ...overview.workstreams.map((item) => ({ value: item.slug, label: item.title }))];

  function row(task: ContextTaskDto) {
    const taskWarnings = warnings.filter((warning) => warning.taskRef === task.ref);
    return (
      <li key={task.ref}>
        <button type="button" className="task-row" data-testid="context-task" aria-current={task.ref === open ? 'true' : undefined} onClick={() => setViewing(task.ref)}>
          <span className="task-id">{task.id}</span>
          <span className="task-row-title truncate">{task.title.replace(new RegExp(`^${task.id}[\\s:.-]*`, 'i'), '') || task.title}</span>
          {taskWarnings.length > 0 && (
            <span className="task-warning-mark" title={taskWarnings.map((warning) => i18n.tr(warning.message)).join('\n')}>
              ▲ {taskWarnings.length}
            </span>
          )}
          <span className="task-meta truncate">{titles.get(workstreamOf(task.ref)) ?? workstreamOf(task.ref)}</span>
          <span className="task-meta">{task.criteria ? `${task.criteria.done}/${task.criteria.total}` : ''}</span>
          <span className="task-meta truncate">{handoffText(i18n, task)}</span>
        </button>
      </li>
    );
  }

  return (
    <div className={`tasks-page${open ? ' with-detail' : ''}`}>
      <div className="tasks-main">
        <div className="tasks-toolbar">
          <h2>{t('tasks.title')}</h2>
          <span className="hint">{visible.length}</span>
          <Segmented
            label={t('tasks.view')}
            value={view}
            options={[
              { value: 'list', label: t('tasks.view.list') },
              { value: 'board', label: t('tasks.view.board') },
            ]}
            onChange={setView}
          />
          {overview.workstreams.length > 1 && <Select label={t('tasks.workstream')} value={workstreamFilter} options={workstreamOptions} onChange={setWorkstreamFilter} />}
          <input className="tasks-search" type="search" value={query} placeholder={t('tasks.search')} aria-label={t('tasks.search')} onChange={(event) => setQuery(event.target.value)} />
          <span className="tasks-toolbar-actions">
            {overview.initialized && (
              <button type="button" className="new-workstream" onClick={() => setCreatingWorkstream(true)}>
                {t('tasks.newWorkstream')}
              </button>
            )}
            {overview.workstreams.length > 0 && (
              <button type="button" className="primary" onClick={() => setCreating(true)}>
                <Plus />
                {t('tasks.create')}
              </button>
            )}
            {overview.workstreams.length > 0 && (
              <Menu label={t('tasks.workstreamMenu')} triggerClassName="icon-button" align="end" trigger={<More />}>
                {overview.workstreams.map((item) => (
                  <MenuItem
                    key={item.slug}
                    tone="danger"
                    onSelect={() => setDeleting({ kind: 'workstream', slug: item.slug, title: item.title, tasks: item.tasks.length })}
                  >
                    {t('tasks.deleteWorkstreamNamed', { name: item.title })}
                  </MenuItem>
                ))}
              </Menu>
            )}
          </span>
        </div>

        {!overview.initialized && <p className="tasks-note hint">{t('tasks.notCreated')}</p>}
        {overview.initialized && overview.workstreams.length === 0 && <p className="tasks-note hint">{t('tasks.noWorkstreams')}</p>}
        {overview.workstreams.length > 0 && tasks.length === 0 && <p className="tasks-note hint">{t('tasks.empty')}</p>}

        {tasks.length > 0 && view === 'list' && (
          <div className="tasks-scroll" aria-label={t('tasks.region')} role="region">
            {LIST_ORDER.map((group) => {
              const items = byGroup(group);
              const isCollapsed = collapsed.has(group);
              return (
                <section key={group} className="task-group" aria-label={t(STATE_LABELS[group])}>
                  <button
                    type="button"
                    className="task-group-head"
                    aria-expanded={!isCollapsed}
                    onClick={() =>
                      setCollapsed((current) => {
                        const next = new Set(current);
                        if (next.has(group)) next.delete(group);
                        else next.add(group);
                        return next;
                      })
                    }
                  >
                    <span className="tree-chevron">{isCollapsed ? <ChevronRight /> : <ChevronDown />}</span>
                    <StatusText tone={STATE_TONES[group]}>{t(STATE_LABELS[group])}</StatusText>
                    <span className="hint">{items.length}</span>
                  </button>
                  {!isCollapsed && items.length > 0 && <ul className="task-rows">{items.map(row)}</ul>}
                </section>
              );
            })}
          </div>
        )}

        {tasks.length > 0 && view === 'board' && (
          <div className="task-board" role="region" aria-label={t('tasks.region')}>
            {BOARD_ORDER.map((group) => (
              <BoardColumn key={group} group={group} tasks={byGroup(group)} open={open} titles={titles} onOpen={setViewing} onDrop={(ref) => void move(ref, group)} />
            ))}
          </div>
        )}
      </div>

      {open && (
        <TaskDetail
          key={open}
          {...props}
          taskRef={open}
          workstreamTitle={titles.get(workstreamOf(open)) ?? workstreamOf(open)}
          branch={overview.workstreams.find((item) => item.slug === workstreamOf(open))?.branch ?? null}
          task={tasks.find((item) => item.ref === open) ?? null}
          launch={launchFor?.ref === open ? launchFor.purpose : null}
          onLaunch={(purpose) => setLaunchFor(purpose ? { ref: open, purpose } : null)}
          onClose={() => setViewing(null)}
          onRenumbered={setViewing}
          panelWidth={panelWidth}
          onPanelWidth={setPanelWidth}
        />
      )}

      {creating && (
        <CreateTaskDialog
          project={project}
          workstreams={overview.workstreams.map((workstream) => ({ value: workstream.slug, label: workstream.title }))}
          initial={workstreamFilter === 'all' ? null : workstreamFilter}
          onClose={() => setCreating(false)}
          onCreated={async (task, refine) => {
            setCreating(false);
            await onReload();
            setViewing(task.ref);
            setLaunchFor(refine ? { ref: task.ref, purpose: 'refine' } : null);
          }}
          onError={onError}
        />
      )}
      {deleting && (
        <ConfirmDelete
          title={t('tasks.deleteWorkstreamTitle', { name: deleting.title })}
          body={t('tasks.deleteWorkstreamBody', { count: deleting.tasks })}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await unwrap(api.deleteWorkstream({ id: project.id, workstream: deleting.slug }));
            setDeleting(null);
            if (workstreamFilter === deleting.slug) setWorkstreamFilter('all');
            if (open && workstreamOf(open) === deleting.slug) setViewing(null);
            await onReload();
          }}
          onError={onError}
        />
      )}
      {creatingWorkstream && (
        <CreateWorkstreamDialog
          project={project}
          onClose={() => setCreatingWorkstream(false)}
          onCreated={async () => {
            setCreatingWorkstream(false);
            await onReload();
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

// --- The board: one column per state, a card moves to another state when dropped there ---

const DRAG_TYPE = 'application/x-agenthub-task';

function BoardColumn({
  group,
  tasks,
  open,
  titles,
  onOpen,
  onDrop,
}: {
  group: TaskStateDto;
  tasks: ContextTaskDto[];
  open: string | null;
  titles: Map<string, string>;
  onOpen: (ref: string) => void;
  onDrop: (ref: string) => void;
}) {
  const { t } = useI18n();
  const [over, setOver] = useState(false);
  const accepts = (event: DragEvent): boolean => event.dataTransfer.types.includes(DRAG_TYPE);
  return (
    <section
      className={`board-column${over ? ' drop-target' : ''}`}
      aria-label={t(STATE_LABELS[group])}
      onDragOver={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        const ref = event.dataTransfer.getData(DRAG_TYPE);
        if (ref) onDrop(ref);
      }}
    >
      <header className="board-column-head">
        <StatusText tone={STATE_TONES[group]}>{t(STATE_LABELS[group])}</StatusText>
        <span className="hint">{tasks.length}</span>
      </header>
      <ul className="board-cards">
        {tasks.map((task) => (
          <li key={task.ref}>
            <button
              type="button"
              className="board-card"
              data-testid="context-task"
              draggable
              title={task.title}
              aria-current={task.ref === open ? 'true' : undefined}
              onDragStart={(event) => {
                event.dataTransfer.setData(DRAG_TYPE, task.ref);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => onOpen(task.ref)}
            >
              <span className="task-id">{task.id}</span>
              <span className="board-card-title">{task.title.replace(new RegExp(`^${task.id}[\\s:.-]*`, 'i'), '') || task.title}</span>
              <span className="task-meta">
                {titles.get(workstreamOf(task.ref)) ?? workstreamOf(task.ref)}
                {task.criteria ? ` · ${task.criteria.done}/${task.criteria.total}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- One task: properties, sections edited in place, the handoff log, an agent ---

interface DetailProps extends Props {
  taskRef: string;
  task: ContextTaskDto | null;
  workstreamTitle: string;
  branch: string | null;
  launch: 'resume' | 'refine' | null;
  onLaunch: (purpose: 'resume' | 'refine' | null) => void;
  panelWidth: number | null;
  onPanelWidth: (width: number | null) => void;
  // After "Renumber" (ADR-027): the task lives at a new path.
  onRenumbered: (ref: string) => void;
  onClose: () => void;
}

interface Criterion {
  text: string;
  done: boolean;
}

const CRITERION = /^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/;

// A criteria section shown as a checklist: only list items and blank lines.
function asChecklist(body: string): Criterion[] | null {
  const lines = body.split('\n').filter((line) => line.trim() !== '');
  if (!lines.every((line) => CRITERION.test(line))) return null;
  return lines.map((line) => {
    const match = CRITERION.exec(line) as RegExpExecArray;
    return { text: match[2] as string, done: (match[1] ?? ' ') !== ' ' };
  });
}

const checklist = (items: Criterion[]): string =>
  items
    .filter((item) => item.text.trim() !== '')
    .map((item) => `- [${item.done ? 'x' : ' '}] ${item.text.trim()}`)
    .join('\n');

type EditableKind = Exclude<TaskSectionKindDto, 'handoff' | 'other'>;
const EDITABLE: readonly EditableKind[] = ['goal', 'criteria', 'notes'];
const SECTION_LABELS: Record<Exclude<TaskSectionKindDto, 'handoff'>, MessageKey> = {
  goal: 'tasks.section.goal',
  criteria: 'tasks.section.criteria',
  notes: 'tasks.section.notes',
  other: 'tasks.section.other',
};

// Entries of the handoff log, newest first as agents write them: a heading and what follows.
function handoffEntries(body: string): { heading: string; body: string }[] {
  const entries: { heading: string; body: string }[] = [];
  for (const line of body.split('\n')) {
    const heading = /^#{1,6}[ \t]+(.+?)[ \t#]*$/.exec(line);
    if (heading) entries.push({ heading: heading[1] as string, body: '' });
    else if (entries.length > 0) (entries.at(-1) as { body: string }).body += `${line}\n`;
  }
  return entries;
}

// What is being edited: one section by id, a section the task does not have yet, or the title.
type Editing = { kind: 'section'; id: number } | { kind: 'add'; section: EditableKind } | { kind: 'title' } | { kind: 'markdown' } | null;

function TaskDetail(props: DetailProps) {
  const { project, context, taskRef, task: listed, workstreamTitle, branch, active, onReload, onShowFile, onError, launch, onLaunch, onRenumbered, onClose } = props;
  const { accounts, usages, onOpenSettings, onOpenTools, onLaunched, panelWidth, onPanelWidth } = props;
  const i18n = useI18n();
  const { t } = i18n;
  const [task, setTask] = useState<TaskViewDto>();
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState('');
  const [criteriaDraft, setCriteriaDraft] = useState<Criterion[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ADR-028 item 7.2: what to type in any chat window to continue this task.
  async function copyCommand(text: string): Promise<void> {
    try {
      await unwrap(api.copyText({ text }));
      setNotice(t('tasks.commandCopied', { text }));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }
  // ADR-027: problems only the user can settle, with the button that settles them.
  const fixes = context?.warnings.filter((warning) => warning.taskRef === taskRef && (warning.kind === 'duplicate_task_id' || warning.kind === 'state_mismatch')) ?? [];

  async function load(): Promise<void> {
    try {
      setTask(await unwrap(api.readTask({ id: project.id, ref: taskRef })));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // Once per task; the watch reads it again after a change.
  }, [taskRef]);

  const changed = useExternalChange(project.id, taskRef, task?.sha256 ?? null, active);
  // While only reading, a change by an agent shows at once (ADR-021 item 7); while editing, the
  // user decides (item 9).
  useEffect(() => {
    if (changed && editing === null) {
      void load();
      void onReload();
    }
  }, [changed, editing]);

  // Dragging the left edge sets the width, kept for the next task and the next launch.
  function startResize(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    const aside = event.currentTarget.parentElement;
    const page = aside?.parentElement;
    if (!aside || !page) return;
    const startX = event.clientX;
    const startWidth = aside.getBoundingClientRect().width;
    const max = Math.max(PANEL_MIN_WIDTH, page.clientWidth - MAIN_MIN_WIDTH);
    const move = (moved: PointerEvent): void => onPanelWidth(Math.round(Math.min(max, Math.max(PANEL_MIN_WIDTH, startWidth + startX - moved.clientX))));
    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  const panel = (children?: ReactNode) => (
    <aside className="task-panel" aria-label={t('tasks.detail')} style={panelWidth ? ({ '--task-panel-width': `${panelWidth}px` } as CSSProperties) : undefined}>
      <div
        className="task-panel-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('documents.resize')}
        title={t('documents.resize')}
        onPointerDown={startResize}
        onDoubleClick={() => onPanelWidth(null)}
      />
      {children}
    </aside>
  );

  if (!task) return panel();
  const sections = task.document.sections;

  async function run(action: () => Promise<TaskViewDto>): Promise<void> {
    setSaving(true);
    onError(undefined);
    try {
      setTask(await action());
      setEditing(null);
      await onReload();
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const saveEdit = (edit: { title?: string; bodies?: { id: number; body: string }[]; added?: { kind: EditableKind; body: string }[] }, base = task) =>
    run(() => unwrap(api.saveTask({ id: project.id, ref: taskRef, baseSha256: base.sha256, edit: { title: edit.title ?? base.document.title, bodies: edit.bodies ?? [], added: edit.added ?? [] } })));

  async function renumber(): Promise<void> {
    setSaving(true);
    onError(undefined);
    try {
      const moved = await unwrap(api.renumberTask({ id: project.id, ref: taskRef }));
      await onReload();
      onRenumbered(moved.ref);
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function syncTable(): Promise<void> {
    setSaving(true);
    onError(undefined);
    try {
      const { changed } = await unwrap(api.syncStatusTable({ id: project.id, workstream: workstreamOf(taskRef) }));
      setNotice(t('tasks.synced', { count: changed }));
      await onReload();
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function startSection(section: TaskSectionDto): void {
    setDraft(section.body);
    setCriteriaDraft(section.kind === 'criteria' ? asChecklist(section.body) : null);
    setEditing({ kind: 'section', id: section.id });
  }

  function saveSection(section: TaskSectionDto): void {
    const body = section.kind === 'criteria' && criteriaDraft ? checklist(criteriaDraft) : draft;
    void saveEdit({ bodies: [{ id: section.id, body }] });
  }

  // Ticking a criterion writes the file at once.
  function tick(section: TaskSectionDto, items: Criterion[], index: number, done: boolean): void {
    void saveEdit({ bodies: [{ id: section.id, body: checklist(items.map((item, at) => (at === index ? { ...item, done } : item))) }] });
  }

  async function openFile(): Promise<void> {
    try {
      await unwrap(api.openDocument({ id: project.id, path: taskRef }));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  function openLaunch(purpose: 'resume' | 'refine'): void {
    if (launch === purpose) {
      onLaunch(null);
      return;
    }
    // Review 2026-11-10: no account is put forward; the user picks one from the list.
    onLaunch(purpose);
  }

  const stateOptions = TASK_STATES.map((value) => ({ value, label: t(STATE_LABELS[value]) }));
  const missing = EDITABLE.filter((kind) => !sections.some((section) => section.kind === kind));
  const handoff = sections.find((section) => section.kind === 'handoff');
  const titleText = task.document.title || task.id;

  function sectionView(section: TaskSectionDto) {
    const label = section.kind === 'other' || section.kind === 'handoff' ? section.heading : t(SECTION_LABELS[section.kind]);
    const isEditing = editing?.kind === 'section' && editing.id === section.id;
    const items = section.kind === 'criteria' ? asChecklist(section.body) : null;
    return (
      <section key={section.id} className="task-section" aria-label={label}>
        <div className="task-section-head">
          <h3>{label}</h3>
          {items && items.length > 0 && <span className="hint">{`${items.filter((item) => item.done).length}/${items.length}`}</span>}
          <span className="grow" />
          {!isEditing && editing === null && (
            <button type="button" className="small quiet" aria-label={t('tasks.editSection', { section: label })} onClick={() => startSection(section)}>
              {t('tasks.edit')}
            </button>
          )}
        </div>
        {isEditing ? (
          <div className="stack">
            {section.kind === 'criteria' && criteriaDraft ? (
              <CriteriaEditor items={criteriaDraft} onChange={setCriteriaDraft} />
            ) : (
              <textarea aria-label={label} rows={section.kind === 'goal' ? 4 : 8} value={draft} onChange={(event) => setDraft(event.target.value)} />
            )}
            {section.kind === 'criteria' && !criteriaDraft && <p className="hint">{t('tasks.criteriaAsText')}</p>}
            <div className="row">
              <button type="button" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="primary" disabled={saving || changed} onClick={() => saveSection(section)}>
                {t('common.save')}
              </button>
            </div>
          </div>
        ) : items ? (
          items.length === 0 ? (
            <p className="hint">{t('tasks.noCriteria')}</p>
          ) : (
            <ul className="criteria-view">
              {items.map((item, index) => (
                <li key={index}>
                  <label className="choice">
                    <input type="checkbox" checked={item.done} disabled={saving || editing !== null} aria-label={item.text} onChange={(event) => tick(section, items, index, event.target.checked)} />
                    <span className={item.done ? 'criterion-done' : ''}>{item.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          )
        ) : section.body.trim() === '' ? (
          <p className="hint">{t('tasks.sectionEmpty')}</p>
        ) : (
          <Markdown source={section.body} />
        )}
      </section>
    );
  }

  return panel(
    <>
      <div className="task-panel-head">
        <span className="task-id">{task.id}</span>
        <span className="grow" />
        <Menu label={t('tasks.more')} triggerClassName="icon-button" align="end" trigger={<More />}>
          <MenuItem
            onSelect={() => {
              setDraft(task.content);
              setEditing({ kind: 'markdown' });
            }}
          >
            {t('tasks.editMarkdown')}
          </MenuItem>
          <MenuItem onSelect={() => onShowFile(taskRef)}>{t('tasks.showInDocuments')}</MenuItem>
          <MenuItem onSelect={() => void openFile()}>{t('tasks.openFile')}</MenuItem>
          <MenuItem tone="danger" onSelect={() => setConfirmDelete(true)}>
            {t('tasks.delete')}
          </MenuItem>
        </Menu>
        <button type="button" className="icon-button" aria-label={t('tasks.closeDetail')} onClick={onClose}>
          <Close />
        </button>
      </div>

      <div className="task-panel-body">
        {editing?.kind === 'title' ? (
          <div className="row nowrap">
            <input className="grow" aria-label={t('field.taskTitle')} value={draft} onChange={(event) => setDraft(event.target.value)} />
            <button type="button" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="primary" disabled={saving || changed || draft.trim() === ''} onClick={() => void saveEdit({ title: draft })}>
              {t('common.save')}
            </button>
          </div>
        ) : (
          <h2 className="task-panel-title">
            <button
              type="button"
              className="title-button"
              title={t('tasks.editTitle')}
              disabled={editing !== null}
              onClick={() => {
                setDraft(task.document.title);
                setEditing({ kind: 'title' });
              }}
            >
              {titleText}
            </button>
          </h2>
        )}

        <dl className="task-properties">
          <dt>{t('tasks.stateField')}</dt>
          <dd>
            <Select label={t('tasks.stateField')} value={task.group ?? 'todo'} options={stateOptions} onChange={(state) => void run(() => unwrap(api.setTaskState({ id: project.id, ref: taskRef, state })))} />
            {task.state && !STANDARD_WORDS.has(task.state.toLowerCase()) && <span className="hint">{t('tasks.stateAsWritten', { state: task.state })}</span>}
          </dd>
          <dt>{t('tasks.workstream')}</dt>
          <dd>{workstreamTitle}</dd>
          <dt>Branch</dt>
          <dd>{branch ? <code>{branch}</code> : <span className="hint">{t('tasks.noBranch')}</span>}</dd>
          <dt>{t('tasks.file')}</dt>
          <dd>
            <button type="button" className="link path" onClick={() => onShowFile(taskRef)}>
              <PathText path={taskRef} />
            </button>
          </dd>
          <dt>Handoff</dt>
          <dd>{listed ? handoffText(i18n, listed) : t('tasks.noHandoff')}</dd>
        </dl>

        {fixes.length > 0 && (
          <ul className="task-fixes" aria-label={t('docs.warnings')}>
            {fixes.map((warning, index) => (
              <li key={index} className="row nowrap">
                <span className="warning-text grow">{i18n.tr(warning.message)}</span>
                {warning.kind === 'duplicate_task_id' ? (
                  <button type="button" className="small" disabled={saving || editing !== null} title={t('tasks.renumberHint')} onClick={() => void renumber()}>
                    {t('tasks.renumber')}
                  </button>
                ) : (
                  <button type="button" className="small" disabled={saving} title={t('tasks.syncTableHint')} onClick={() => void syncTable()}>
                    {t('tasks.syncTable')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {notice && (
          <p className="hint" role="status">
            {notice}
          </p>
        )}

        <div className="row task-actions">
          <button type="button" className={launch === 'resume' ? '' : 'primary'} aria-expanded={launch === 'resume'} onClick={() => openLaunch('resume')}>
            {t('tasks.launchWith')}
          </button>
          <button type="button" aria-expanded={launch === 'refine'} onClick={() => openLaunch('refine')}>
            {t('tasks.askAgent')}
          </button>
          <Menu label={t('tasks.copyCommand')} trigger={t('tasks.copyCommand')} align="end">
            <MenuItem description={t('tasks.copyPhraseHint')} onSelect={() => void copyCommand(translate(i18n.chatLocale, 'quick.phrase.resume', { task: task.id }))}>
              {translate(i18n.chatLocale, 'quick.phrase.resume', { task: task.id })}
            </MenuItem>
            <MenuItem description={t('tasks.copySkillHint')} onSelect={() => void copyCommand(skillCommand('context-resume', task.id))}>
              {skillCommand('context-resume', task.id)}
            </MenuItem>
          </Menu>
        </div>
        {launch && (
          <div className="refine-box" role="group" aria-label={t(launch === 'refine' ? 'tasks.askAgent' : 'tasks.launchWith')}>
            <div className="row nowrap refine-head">
              <p className="hint grow">{t(launch === 'refine' ? 'tasks.askAgentHint' : 'tasks.launchHint')}</p>
              <button type="button" className="icon-button" aria-label={t('tasks.closeLaunch')} title={t('tasks.closeLaunch')} onClick={() => onLaunch(null)}>
                <Close />
              </button>
            </div>
            <ProjectLaunch
              project={project}
              taskRef={taskRef}
              taskTitle={task.document.title || task.id}
              {...(launch === 'refine' ? { purpose: 'refine' as const } : {})}
              accounts={accounts}
              usages={usages}
              onOpenSettings={onOpenSettings}
              onOpenTools={onOpenTools}
              onLaunched={onLaunched}
            />
          </div>
        )}

        {changed && editing !== null && (
          <div className="banner warning" role="alert">
            <p>{t('tasks.changedOutside')}</p>
            <button
              type="button"
              onClick={() =>
                void load().then(() => {
                  setEditing(null);
                })
              }
            >
              {t('tasks.reload')}
            </button>
          </div>
        )}

        {editing?.kind === 'markdown' ? (
          <div className="stack">
            <p className="hint warning-text">{t('tasks.markdownWarning')}</p>
            <textarea aria-label={t('tasks.markdownField')} className="code-input" rows={24} value={draft} onChange={(event) => setDraft(event.target.value)} />
            <div className="row">
              <button type="button" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="primary"
                disabled={saving || changed}
                onClick={() =>
                  void run(async () => {
                    await unwrap(api.writeDocument({ id: project.id, path: taskRef, content: draft, baseSha256: task.sha256 }));
                    return unwrap(api.readTask({ id: project.id, ref: taskRef }));
                  })
                }
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {sections.filter((section) => section.kind !== 'handoff').map(sectionView)}
            {missing.map((kind) =>
              editing?.kind === 'add' && editing.section === kind ? (
                <section key={kind} className="task-section" aria-label={t(SECTION_LABELS[kind])}>
                  <div className="task-section-head">
                    <h3>{t(SECTION_LABELS[kind])}</h3>
                  </div>
                  {kind === 'criteria' && criteriaDraft ? (
                    <CriteriaEditor items={criteriaDraft} onChange={setCriteriaDraft} />
                  ) : (
                    <textarea aria-label={t(SECTION_LABELS[kind])} rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} />
                  )}
                  <div className="row">
                    <button type="button" onClick={() => setEditing(null)}>
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      className="primary"
                      disabled={saving || changed}
                      onClick={() => void saveEdit({ added: [{ kind, body: kind === 'criteria' && criteriaDraft ? checklist(criteriaDraft) : draft }] })}
                    >
                      {t('common.save')}
                    </button>
                  </div>
                </section>
              ) : (
                editing === null && (
                  <button
                    key={kind}
                    type="button"
                    className="link add-section"
                    onClick={() => {
                      setDraft('');
                      setCriteriaDraft(kind === 'criteria' ? [{ text: '', done: false }] : null);
                      setEditing({ kind: 'add', section: kind });
                    }}
                  >
                    + {t('tasks.addSection', { section: t(SECTION_LABELS[kind]) })}
                  </button>
                )
              ),
            )}
            <section className="task-section" aria-label="Handoff log">
              <div className="task-section-head">
                <h3>Handoff log</h3>
              </div>
              {!handoff || handoffEntries(handoff.body).length === 0 ? (
                <p className="hint">{t('tasks.noHandoff')}</p>
              ) : (
                <ol className="handoff-timeline">
                  {handoffEntries(handoff.body).map((entry, index) => (
                    <li key={index}>
                      <p className="handoff-heading">{entry.heading}</p>
                      {entry.body.trim() !== '' && <Markdown source={entry.body} />}
                    </li>
                  ))}
                </ol>
              )}
              <p className="hint">{t('tasks.handoffKept')}</p>
              <PasteHandoff
                project={project}
                task={{ ref: taskRef, id: task.id }}
                onAdded={async () => {
                  await load();
                  await onReload();
                }}
                onError={onError}
              />
            </section>
          </>
        )}
      </div>
      {confirmDelete && (
        <ConfirmDelete
          title={t('tasks.deleteTitle', { task: task.id })}
          body={t('tasks.deleteBody', { task: `${task.id} ${task.document.title}`.trim() })}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await unwrap(api.deleteTask({ id: project.id, ref: taskRef }));
            setConfirmDelete(false);
            onClose();
            await onReload();
          }}
          onError={onError}
        />
      )}
    </>,
  );
}

function CriteriaEditor({ items, onChange }: { items: Criterion[]; onChange: (items: Criterion[]) => void }) {
  const { t } = useI18n();
  const update = (index: number, change: Partial<Criterion>): void => onChange(items.map((item, at) => (at === index ? { ...item, ...change } : item)));
  return (
    <fieldset className="field criteria" aria-label={t('tasks.section.criteria')}>
      {items.map((item, index) => (
        <div key={index} className="row nowrap criterion">
          <input type="checkbox" checked={item.done} aria-label={t('tasks.criterionDone', { index: index + 1 })} onChange={(event) => update(index, { done: event.target.checked })} />
          <input className="grow" aria-label={t('tasks.criterion', { index: index + 1 })} value={item.text} onChange={(event) => update(index, { text: event.target.value })} />
          <button type="button" className="small" aria-label={t('tasks.removeCriterion', { index: index + 1 })} onClick={() => onChange(items.filter((_, at) => at !== index))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="small" onClick={() => onChange([...items, { text: '', done: false }])}>
        {t('tasks.addCriterion')}
      </button>
    </fieldset>
  );
}

// --- Creating a task (ADR-021 item 6) and a workstream (ADR-023 item 5) ---

function CreateTaskDialog({
  project,
  workstreams,
  initial,
  onClose,
  onCreated,
  onError,
}: {
  project: ProjectDto;
  workstreams: { value: string; label: string }[];
  initial: string | null;
  onClose: () => void;
  onCreated: (task: TaskViewDto, refine: boolean) => Promise<void>;
  onError: (message: string | undefined) => void;
}) {
  const { t } = useI18n();
  const [workstream, setWorkstream] = useState(initial ?? workstreams[0]?.value ?? '');
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [saving, setSaving] = useState(false);

  async function create(refine: boolean): Promise<void> {
    setSaving(true);
    onError(undefined);
    try {
      await onCreated(await unwrap(api.createTask({ id: project.id, workstream, title, goal })), refine);
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const ready = !saving && workstream !== '' && title.trim() !== '';
  return (
    <Dialog
      label={t('tasks.create')}
      title={t('tasks.create')}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" disabled={!ready} onClick={() => void create(true)}>
            {t('tasks.createAndAsk')}
          </button>
          <button type="button" className="primary" disabled={!ready} onClick={() => void create(false)}>
            {t('tasks.createSubmit')}
          </button>
        </>
      }
    >
      <p className="hint">{t('tasks.createHint')}</p>
      <div className="field">
        <span className="field-label">{t('tasks.workstream')}</span>
        <Select label={t('tasks.workstream')} value={workstream} options={workstreams} onChange={setWorkstream} />
      </div>
      <label className="field">
        <span className="field-label">{t('field.taskTitle')}</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">{t('tasks.section.goal')}</span>
        <textarea rows={4} value={goal} onChange={(event) => setGoal(event.target.value)} />
      </label>
    </Dialog>
  );
}

// Backlog I1: deleting moves files to the system Trash; the number stays listed in the documents.
function ConfirmDelete({ title, body, onClose, onConfirm, onError }: { title: string; body: string; onClose: () => void; onConfirm: () => Promise<void>; onError: (message: string | undefined) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function confirm(): Promise<void> {
    setBusy(true);
    onError(undefined);
    try {
      await onConfirm();
    } catch (reason) {
      onError((reason as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog
      label={title}
      title={title}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="danger-fill" disabled={busy} onClick={() => void confirm()}>
            {t('tasks.deleteConfirm')}
          </button>
        </>
      }
    >
      <p>{body}</p>
      <p className="hint">{t('tasks.deleteNumbersKept')}</p>
    </Dialog>
  );
}

function CreateWorkstreamDialog({ project, onClose, onCreated, onError }: { project: ProjectDto; onClose: () => void; onCreated: () => Promise<void>; onError: (message: string | undefined) => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  async function create(): Promise<void> {
    setSaving(true);
    onError(undefined);
    try {
      await unwrap(api.createWorkstream({ id: project.id, title }));
      await onCreated();
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      label={t('tasks.newWorkstream')}
      title={t('tasks.newWorkstream')}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="primary" disabled={saving || title.trim() === ''} onClick={() => void create()}>
            {t('tasks.createSubmit')}
          </button>
        </>
      }
    >
      <p className="hint">{t('tasks.newWorkstreamHint')}</p>
      <label className="field">
        <span className="field-label">{t('field.workstreamTitle')}</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
    </Dialog>
  );
}
