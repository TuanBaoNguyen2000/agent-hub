import type {
  ContextTaskDto,
  LaunchAttemptDto,
  ProfileDto,
  ProjectContextDto,
  ProjectDto,
  TaskSectionKindDto,
  TaskStateDto,
  TaskViewDto,
} from '@agenthub/contracts';
import { TASK_STATES } from '@agenthub/contracts/constants';
import { LOCALES, type MessageKey, TABLES } from '@agenthub/i18n';
import { useEffect, useState } from 'react';
import { api, unwrap } from './api';
import { useExternalChange } from './documentWatch';
import { useI18n } from './i18n';
import { Markdown } from './Markdown';
import { ProjectLaunch } from './ProjectLaunch';
import { Dialog, Segmented, Select } from './ui';

type I18n = ReturnType<typeof useI18n>;

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
  done: 'tasks.state.done',
};

// The four words AgentHub writes, in any documents language: only other words need a note.
const STANDARD_WORDS = new Set(LOCALES.flatMap((locale) => TASK_STATES.map((state) => TABLES[locale][STATE_LABELS[state]].toLowerCase())));

// The same grouping as Main's (ADR-021 item 4), for the filter before a task is opened.
const word = (alternatives: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'iu');
const DONE = word('done|xong|complete|completed|hoàn thành|closed|cancell?ed|huỷ|hủy|archived|완료|종료');
const BLOCKED = word('blocked|blocker|on hold|bị chặn|chặn|tạm dừng|막힘|보류|차단');
const ACTIVE = word('in[ -]progress|doing|active|wip|đang làm|đang|진행 중|진행');
export function groupOf(state: string | null): TaskStateDto {
  if (!state) return 'todo';
  if (DONE.test(state)) return 'done';
  if (BLOCKED.test(state)) return 'blocked';
  if (ACTIVE.test(state)) return 'active';
  return 'todo';
}

interface Props {
  project: ProjectDto;
  context: ProjectContextDto | undefined;
  // Only while the tab is shown: what is not shown is not watched.
  active: boolean;
  // The task the next launch points the agent at; null leaves the choice to the agent.
  selected: string | null;
  onSelect: (taskRef: string | null) => void;
  onCreateDocs: () => void;
  // Reads the documents again, after AgentHub or an agent changed them.
  onReload: () => Promise<void>;
  onError: (message: string | undefined) => void;
  accounts: ProfileDto[] | undefined;
  history: LaunchAttemptDto[];
  onOpenSettings: () => void;
  onOpenTools: () => void;
  onLaunched: () => void;
}

type Filter = 'all' | TaskStateDto;

// ADR-021 items 2–7: the project's tasks as the documents hold them, which the user can now read,
// edit, move between states and create, or hand to an agent to fill in.
export function ProjectTasks(props: Props) {
  const { project, context, active, selected, onSelect, onCreateDocs, onReload, onError } = props;
  const i18n = useI18n();
  const { t, tr } = i18n;
  const [filter, setFilter] = useState<Filter>('all');
  const [viewing, setViewing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [refining, setRefining] = useState<string | null>(null);

  const tasks = allTasks(context);
  const shown = viewing && tasks.some((task) => task.ref === viewing) ? viewing : (selected ?? tasks[0]?.ref ?? null);

  if (!project.context.enabled) {
    return (
      <section className="settings-group" aria-label={t('tasks.region')}>
        <div className="settings-row">
          <p className="hint grow">{t('tasks.noDocs')}</p>
          <button type="button" onClick={onCreateDocs}>
            {t('docs.create')}
          </button>
        </div>
      </section>
    );
  }
  if (!context) return null;
  const { overview, warnings } = context;
  const filters: { value: Filter; label: string }[] = [{ value: 'all', label: t('tasks.filter.all') }, ...TASK_STATES.map((value) => ({ value, label: t(STATE_LABELS[value]) }))];

  return (
    <div className="tasks-layout">
      <section className="settings-group tasks-list" aria-label={t('tasks.region')}>
        <div className="settings-group-header">
          <div className="grow settings-row-text">
            <h2>{t('tasks.title')}</h2>
            <p className="hint">{t('tasks.hint')}</p>
          </div>
          {overview.workstreams.length > 0 && (
            <button type="button" onClick={() => setCreating(true)}>
              {t('tasks.create')}
            </button>
          )}
        </div>

        {!overview.initialized && <p className="settings-empty hint">{t('tasks.notCreated')}</p>}
        {overview.initialized && tasks.length === 0 && <p className="settings-empty hint">{t('tasks.empty')}</p>}

        {tasks.length > 0 && (
          <>
            <div className="settings-row">
              <Segmented label={t('tasks.filter')} value={filter} options={filters} onChange={setFilter} />
            </div>
            <p className="settings-row hint launch-choice">
              {selected ? t('tasks.launchTaskIs', { task: tasks.find((task) => task.ref === selected)?.id ?? '' }) : t('tasks.noneHint')}
              {selected && (
                <button type="button" className="link" onClick={() => onSelect(null)}>
                  {t('tasks.none')}
                </button>
              )}
            </p>
            {overview.workstreams.map((workstream) => {
              const visible = workstream.tasks.filter((task) => filter === 'all' || groupOf(task.state) === filter);
              if (visible.length === 0) return null;
              return (
                <div key={workstream.slug} className="task-group">
                  <p className="task-group-title">{workstream.title}</p>
                  <ul className="task-items">
                    {visible.map((task) => {
                      const taskWarnings = warnings.filter((warning) => warning.taskRef === task.ref);
                      return (
                        <li key={task.ref}>
                          <button
                            type="button"
                            className="task-item"
                            data-testid="context-task"
                            aria-current={task.ref === shown ? 'true' : undefined}
                            onClick={() => setViewing(task.ref)}
                          >
                            <span className="task-title">
                              <span className="grow truncate">{task.title}</span>
                              {task.state && <span className={`badge state-${groupOf(task.state)}`}>{task.state}</span>}
                              {task.ref === selected && <span className="badge ok">{t('tasks.forLaunch')}</span>}
                            </span>
                            <span className="hint">{handoffText(i18n, task)}</span>
                            {taskWarnings.map((warning, index) => (
                              <span key={index} className="warning-text task-warning">
                                {tr(warning.message)}
                              </span>
                            ))}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </>
        )}
      </section>

      {shown && (
        <TaskDetail
          key={shown}
          {...props}
          taskRef={shown}
          active={active}
          refining={refining === shown}
          onRefine={(on) => setRefining(on ? shown : null)}
        />
      )}

      {creating && (
        <CreateTaskDialog
          project={project}
          workstreams={overview.workstreams.map((workstream) => ({ value: workstream.slug, label: workstream.title }))}
          onClose={() => setCreating(false)}
          onCreated={async (task, refine) => {
            setCreating(false);
            await onReload();
            setViewing(task.ref);
            setRefining(refine ? task.ref : null);
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

// --- One task: read, edit, state, hand to an agent ---

interface DetailProps extends Props {
  taskRef: string;
  refining: boolean;
  onRefine: (on: boolean) => void;
}

interface Criterion {
  text: string;
  done: boolean;
}

const CRITERION = /^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/;

// A criteria section the form can show as a checklist: only list items and blank lines.
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

const EDITABLE: readonly Exclude<TaskSectionKindDto, 'handoff' | 'other'>[] = ['goal', 'criteria', 'notes'];
const SECTION_LABELS: Record<Exclude<TaskSectionKindDto, 'handoff'>, MessageKey> = {
  goal: 'tasks.section.goal',
  criteria: 'tasks.section.criteria',
  notes: 'tasks.section.notes',
  other: 'tasks.section.other',
};

type Mode = 'view' | 'sections' | 'markdown';

function TaskDetail({ project, taskRef, active, selected, onSelect, onReload, onError, refining, onRefine, ...launch }: DetailProps) {
  const { t } = useI18n();
  const [task, setTask] = useState<TaskViewDto>();
  const [mode, setMode] = useState<Mode>('view');
  const [title, setTitle] = useState('');
  const [bodies, setBodies] = useState<Record<number, string>>({});
  const [added, setAdded] = useState<Record<string, string>>({});
  const [criteria, setCriteria] = useState<Criterion[] | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [saving, setSaving] = useState(false);

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

  const editing = mode !== 'view';
  const changed = useExternalChange(project.id, taskRef, task?.sha256 ?? null, active);
  // While only reading, a change by an agent shows at once (ADR-021 item 7); while editing, the
  // user decides (item 9).
  useEffect(() => {
    if (changed && !editing) {
      void load();
      void onReload();
    }
  }, [changed, editing]);

  if (!task) return null;
  const sections = task.document.sections;

  function startEditing(next: Mode): void {
    if (!task) return;
    setTitle(task.document.title);
    setBodies(Object.fromEntries(sections.map((section) => [section.id, section.body])));
    setAdded({});
    const criteriaSection = sections.find((section) => section.kind === 'criteria');
    setCriteria(criteriaSection ? asChecklist(criteriaSection.body) : []);
    setMarkdown(task.content);
    setMode(next);
  }

  async function save(): Promise<void> {
    if (!task) return;
    setSaving(true);
    onError(undefined);
    try {
      if (mode === 'markdown') {
        await unwrap(api.writeDocument({ id: project.id, path: taskRef, content: markdown, baseSha256: task.sha256 }));
        setTask(await unwrap(api.readTask({ id: project.id, ref: taskRef })));
      } else {
        const criteriaSection = sections.find((section) => section.kind === 'criteria');
        const edited = Object.entries(bodies).map(([id, body]) => ({
          id: Number(id),
          body: criteriaSection && Number(id) === criteriaSection.id && criteria ? checklist(criteria) : body,
        }));
        const missing = EDITABLE.filter((kind) => !sections.some((section) => section.kind === kind))
          .map((kind) => ({ kind, body: kind === 'criteria' && criteria ? checklist(criteria) : (added[kind] ?? '') }))
          .filter((item) => item.body.trim() !== '');
        setTask(await unwrap(api.saveTask({ id: project.id, ref: taskRef, baseSha256: task.sha256, edit: { title, bodies: edited, added: missing } })));
      }
      setMode('view');
      await onReload();
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function changeState(state: TaskStateDto): Promise<void> {
    onError(undefined);
    try {
      setTask(await unwrap(api.setTaskState({ id: project.id, ref: taskRef, state })));
      await onReload();
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function openFile(): Promise<void> {
    try {
      await unwrap(api.openDocument({ id: project.id, path: taskRef }));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  const criteriaSection = sections.find((section) => section.kind === 'criteria');
  const stateOptions = TASK_STATES.map((value) => ({ value, label: t(STATE_LABELS[value]) }));

  return (
    <section className="settings-group task-detail" aria-label={t('tasks.detail')}>
      <div className="settings-group-header">
        <div className="grow settings-row-text">
          <h2>{task.document.title || task.id}</h2>
          <span className="path">{taskRef}</span>
        </div>
        <Select label={t('tasks.stateField')} value={task.group ?? 'todo'} options={stateOptions} onChange={(state) => void changeState(state)} align="end" />
      </div>
      {task.state && !STANDARD_WORDS.has(task.state.toLowerCase()) && (
        <p className="settings-row hint">{t('tasks.stateAsWritten', { state: task.state })}</p>
      )}

      {changed && editing && (
        <div className="banner warning tools-banner" role="alert">
          <p>{t('tasks.changedOutside')}</p>
          <button type="button" onClick={() => void load().then(() => setMode('view'))}>
            {t('tasks.reload')}
          </button>
        </div>
      )}

      {mode === 'view' && (
        <>
          <div className="row task-actions">
            <button type="button" className={taskRef === selected ? '' : 'primary'} onClick={() => onSelect(taskRef === selected ? null : taskRef)}>
              {taskRef === selected ? t('tasks.unuse') : t('tasks.use')}
            </button>
            <button type="button" onClick={() => startEditing('sections')}>
              {t('tasks.edit')}
            </button>
            <button type="button" onClick={() => onRefine(!refining)}>
              {t('tasks.askAgent')}
            </button>
            <button type="button" onClick={() => void openFile()}>
              {t('tasks.openFile')}
            </button>
          </div>
          {refining && (
            <div className="settings-row refine-box" role="group" aria-label={t('tasks.askAgent')}>
              <div className="stack grow">
                <p className="hint">{t('tasks.askAgentHint')}</p>
                <ProjectLaunch project={project} taskRef={taskRef} purpose="refine" {...launch} />
              </div>
            </div>
          )}
          <div className="settings-row">
            {/* The title is already the heading above. */}
            <Markdown source={task.content.replace(/^\s*#[ \t][^\n]*\n?/, '')} className="grow" />
          </div>
        </>
      )}

      {editing && (
        <div className="settings-row task-editor">
          <div className="stack grow">
            <Segmented
              label={t('tasks.editMode')}
              value={mode}
              options={[
                { value: 'sections', label: t('tasks.editSections') },
                { value: 'markdown', label: t('tasks.editMarkdown') },
              ]}
              onChange={(next) => startEditing(next)}
            />
            {mode === 'markdown' ? (
              <>
                <p className="hint warning-text">{t('tasks.markdownWarning')}</p>
                <textarea aria-label={t('tasks.markdownField')} className="code-input" rows={24} value={markdown} onChange={(event) => setMarkdown(event.target.value)} />
              </>
            ) : (
              <>
                <label className="field">
                  <span className="field-label">{t('field.taskTitle')}</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} />
                </label>
                {sections
                  .filter((section) => section.kind !== 'handoff')
                  .map((section) =>
                    section.kind === 'criteria' && criteria ? (
                      <CriteriaEditor key={section.id} items={criteria} onChange={setCriteria} />
                    ) : (
                      <label key={section.id} className="field">
                        <span className="field-label">{section.kind === 'other' || section.kind === 'handoff' ? section.heading : t(SECTION_LABELS[section.kind])}</span>
                        <textarea rows={section.kind === 'goal' ? 3 : 6} value={bodies[section.id] ?? ''} onChange={(event) => setBodies({ ...bodies, [section.id]: event.target.value })} />
                      </label>
                    ),
                  )}
                {EDITABLE.filter((kind) => !sections.some((section) => section.kind === kind)).map((kind) =>
                  kind === 'criteria' && criteria ? (
                    <CriteriaEditor key={kind} items={criteria} onChange={setCriteria} />
                  ) : (
                    <label key={kind} className="field">
                      <span className="field-label">{t(SECTION_LABELS[kind])}</span>
                      <textarea rows={3} value={added[kind] ?? ''} onChange={(event) => setAdded({ ...added, [kind]: event.target.value })} />
                    </label>
                  ),
                )}
                {!criteriaSection || criteria ? null : <p className="hint">{t('tasks.criteriaAsText')}</p>}
                <p className="hint">{t('tasks.handoffKept')}</p>
              </>
            )}
            <div className="row">
              <button type="button" onClick={() => setMode('view')}>
                {t('common.cancel')}
              </button>
              <button type="button" className="primary" disabled={saving || changed} onClick={() => void save()}>
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CriteriaEditor({ items, onChange }: { items: Criterion[]; onChange: (items: Criterion[]) => void }) {
  const { t } = useI18n();
  const update = (index: number, change: Partial<Criterion>): void => onChange(items.map((item, at) => (at === index ? { ...item, ...change } : item)));
  return (
    <fieldset className="field criteria" aria-label={t('tasks.section.criteria')}>
      <legend className="field-label">{t('tasks.section.criteria')}</legend>
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

// --- Creating a task (ADR-021 item 6) ---

function CreateTaskDialog({
  project,
  workstreams,
  onClose,
  onCreated,
  onError,
}: {
  project: ProjectDto;
  workstreams: { value: string; label: string }[];
  onClose: () => void;
  onCreated: (task: TaskViewDto, refine: boolean) => Promise<void>;
  onError: (message: string | undefined) => void;
}) {
  const { t } = useI18n();
  const [workstream, setWorkstream] = useState(workstreams[0]?.value ?? '');
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
