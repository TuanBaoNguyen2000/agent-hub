import type { ContextIssue, ContextIssueKind, ContextOverview, ContextTask, GitObservation } from './index';

// TDD §7.7 and §9.3: warnings about context that may be out of date. They inform and never block;
// Git and the documents are observations, not proof of what an agent did (§10.2).

export type ContextWarningKind = 'branch_mismatch' | 'commits_after_handoff' | 'no_handoff' | 'old_handoff' | 'uncommitted' | ContextIssueKind;

export interface ContextWarning {
  kind: ContextWarningKind;
  // null when it concerns the whole project rather than one task or workstream.
  taskRef: string | null;
  workstream: string | null;
  message: string;
}

export const OLD_HANDOFF_DAYS = 7;

// Whole words only; \b would not see Vietnamese letters such as đ.
const word = (alternatives: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'iu');
const DONE = word('done|xong|complete|completed|hoàn thành|closed|cancell?ed|huỷ|hủy|archived');
const ACTIVE = word('in[ -]progress|doing|active|wip|đang làm|đang');

export const isDone = (task: ContextTask): boolean => task.state !== null && DONE.test(task.state);
export const isActive = (task: ContextTask): boolean => task.state !== null && ACTIVE.test(task.state) && !isDone(task);

const day = 24 * 60 * 60 * 1000;

function issueMessage(issue: ContextIssue, overview: ContextOverview): string {
  const workstream = overview.workstreams.find((item) => item.slug === issue.workstream);
  const name = workstream?.title ?? issue.workstream ?? '';
  switch (issue.kind) {
    case 'no_project_context':
      return 'Tài liệu thiếu PROJECT_CONTEXT.md.';
    case 'no_workstream':
      return 'Tài liệu chưa có workstream nào.';
    case 'no_status':
      return `Workstream "${name}" thiếu STATUS.md.`;
    case 'no_tasks':
      return `Workstream "${name}" chưa có task nào trong Tasks/.`;
    case 'no_handoff_log': {
      const task = workstream?.tasks.find((item) => item.ref === issue.taskRef);
      return `${task?.id ?? issue.taskRef ?? ''} thiếu mục "Handoff log".`;
    }
  }
}

export function contextWarnings(overview: ContextOverview, git: GitObservation, now: Date): ContextWarning[] {
  // What is missing from the layout comes first: later warnings read what is there.
  const warnings: ContextWarning[] = overview.issues.map((issue) => ({ ...issue, message: issueMessage(issue, overview) }));
  if (git.state === 'repo' && git.dirty) {
    warnings.push({
      kind: 'uncommitted',
      taskRef: null,
      workstream: null,
      message: 'Có thay đổi chưa commit. Trước khi đổi account, hãy cho agent chạy context-checkpoint.',
    });
  }
  for (const workstream of overview.workstreams) {
    if (git.state === 'repo' && workstream.branch && git.branch !== workstream.branch) {
      warnings.push({
        kind: 'branch_mismatch',
        taskRef: null,
        workstream: workstream.slug,
        message: `STATUS của "${workstream.title}" ghi branch ${workstream.branch}, nhưng folder project đang ở ${git.branch ?? 'detached HEAD'}.`,
      });
    }
    for (const task of workstream.tasks) {
      if (isDone(task)) continue;
      const handoffAt = task.lastHandoff?.at ? Date.parse(task.lastHandoff.at) : null;
      if (handoffAt !== null && git.headAt && Date.parse(git.headAt) > handoffAt) {
        warnings.push({
          kind: 'commits_after_handoff',
          taskRef: task.ref,
          workstream: workstream.slug,
          message: `${task.id}: có commit mới hơn handoff gần nhất; phần việc sau đó chưa được ghi lại.`,
        });
      } else if (isActive(task) && task.lastHandoff === null) {
        warnings.push({ kind: 'no_handoff', taskRef: task.ref, workstream: workstream.slug, message: `${task.id} đang làm nhưng chưa có handoff nào.` });
      } else if (isActive(task) && handoffAt !== null && now.getTime() - handoffAt > OLD_HANDOFF_DAYS * day) {
        warnings.push({
          kind: 'old_handoff',
          taskRef: task.ref,
          workstream: workstream.slug,
          message: `${task.id}: handoff gần nhất đã hơn ${OLD_HANDOFF_DAYS} ngày.`,
        });
      }
    }
  }
  return warnings;
}

export function findTask(overview: ContextOverview, ref: string): { task: ContextTask; branch: string | null } | null {
  for (const workstream of overview.workstreams) {
    const task = workstream.tasks.find((item) => item.ref === ref);
    if (task) return { task, branch: workstream.branch };
  }
  return null;
}
