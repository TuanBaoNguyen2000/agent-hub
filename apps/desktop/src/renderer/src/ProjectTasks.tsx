import type { ContextTaskDto, ProjectContextDto, ProjectDto } from '@agenthub/contracts';

interface Props {
  project: ProjectDto;
  context: ProjectContextDto | undefined;
  selected: string | null;
  onSelect: (taskRef: string | null) => void;
  // For a project without documents: tasks only exist in them.
  onCreateDocs: () => void;
}

export function handoffText(task: ContextTaskDto): string {
  if (!task.lastHandoff) return 'Chưa có handoff';
  // A heading with only a date is read as the end of that day; showing 23:59 would mislead.
  const hasTime = /\d{1,2}:\d{2}/.test(task.lastHandoff.heading);
  const when = task.lastHandoff.at
    ? new Date(task.lastHandoff.at).toLocaleString('vi-VN', hasTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' })
    : null;
  return when ? `Handoff ${when}` : `Handoff: ${task.lastHandoff.heading}`;
}

export const allTasks = (context: ProjectContextDto | undefined): ContextTaskDto[] =>
  context?.overview.workstreams.flatMap((workstream) => workstream.tasks) ?? [];

// Tasks as the agents wrote them in the documents (ADR-019): the one picked here is what the next
// launch points the agent at.
export function ProjectTasks({ project, context, selected, onSelect, onCreateDocs }: Props) {
  if (!project.context.enabled) {
    return (
      <section className="settings-group" aria-label="Task trong tài liệu">
        <div className="settings-row">
          <p className="hint grow">
            Task nằm trong tài liệu context, do agent viết. Project này chưa dùng tài liệu nên ngữ cảnh đi qua handoff tóm tắt.
          </p>
          <button type="button" onClick={onCreateDocs}>
            Tạo tài liệu context
          </button>
        </div>
      </section>
    );
  }
  if (!context) return null;
  const { overview, warnings } = context;
  const tasks = allTasks(context);

  return (
    <section className="settings-group" aria-label="Task trong tài liệu">
      <div className="settings-group-header">
        <div className="grow settings-row-text">
          <h2>Task</h2>
          <p className="hint">Chọn task cho lần mở account tới. Agent đọc task đó và handoff mới nhất của nó.</p>
        </div>
      </div>

      {!overview.initialized && (
        <p className="settings-empty hint">Tài liệu chưa được tạo. Mở một account ở tab Tổng quan: agent dùng context-init và hỏi bạn brief.</p>
      )}
      {overview.initialized && tasks.length === 0 && <p className="settings-empty hint">Tài liệu chưa có task nào.</p>}

      {tasks.length > 0 && (
        <div className="task-list" role="radiogroup" aria-label="Task cho lần mở tới">
          <label className="task-row">
            <input type="radio" name={`task-${project.id}`} checked={selected === null} onChange={() => onSelect(null)} />
            <span className="grow">
              <span className="task-title">Không chọn task</span>
              <span className="hint">Agent đọc STATUS rồi hỏi bạn làm tiếp việc nào.</span>
            </span>
          </label>
          {overview.workstreams.map((workstream) =>
            workstream.tasks.map((task) => {
              const taskWarnings = warnings.filter((warning) => warning.taskRef === task.ref);
              return (
                <label key={task.ref} className="task-row" data-testid="context-task">
                  <input type="radio" name={`task-${project.id}`} checked={selected === task.ref} onChange={() => onSelect(task.ref)} />
                  <span className="grow">
                    <span className="task-title">
                      {task.title}
                      {task.state && <span className="badge">{task.state}</span>}
                    </span>
                    <span className="hint">
                      {workstream.title} · {handoffText(task)}
                    </span>
                    {taskWarnings.map((warning) => (
                      <span key={warning.message} className="warning-text task-warning">
                        {warning.message}
                      </span>
                    ))}
                  </span>
                </label>
              );
            }),
          )}
        </div>
      )}
    </section>
  );
}
