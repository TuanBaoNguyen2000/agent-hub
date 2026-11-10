import { type Message, msg } from '@agenthub/domain';
import { stateGroup } from './task-document';
import type { ContextIssue, ContextIssueKind, ContextOverview, ContextTask, GitObservation } from './index';

// TDD §7.7 and §9.3: warnings about context that may be out of date. They inform and never block;
// Git and the documents are observations, not proof of what an agent did (§10.2).

export type ContextWarningKind = 'branch_mismatch' | 'commits_after_handoff' | 'no_handoff' | 'old_handoff' | 'uncommitted' | ContextIssueKind;

export interface ContextWarning {
  kind: ContextWarningKind;
  // null when it concerns the whole project rather than one task or workstream.
  taskRef: string | null;
  workstream: string | null;
  message: Message;
}

export const OLD_HANDOFF_DAYS = 7;

// The same grouping as the task screen (ADR-021 item 4), so warnings and the list agree.
export const isDone = (task: ContextTask): boolean => stateGroup(task.state) === 'done';
export const isActive = (task: ContextTask): boolean => stateGroup(task.state) === 'active';

const day = 24 * 60 * 60 * 1000;

function issueMessage(issue: ContextIssue, overview: ContextOverview): Message {
  const workstream = overview.workstreams.find((item) => item.slug === issue.workstream);
  const name = workstream?.title ?? issue.workstream ?? '';
  switch (issue.kind) {
    case 'no_project_context':
      return msg('context.issue.noProjectContext');
    case 'no_workstream':
      return msg('context.issue.noWorkstream');
    case 'no_status':
      return msg('context.issue.noStatus', { name });
    case 'no_tasks':
      return msg('context.issue.noTasks', { name });
    case 'no_handoff_log': {
      const task = workstream?.tasks.find((item) => item.ref === issue.taskRef);
      return msg('context.issue.noHandoffLog', { task: task?.id ?? issue.taskRef ?? '' });
    }
    case 'duplicate_task_id': {
      const task = workstream?.tasks.find((item) => item.ref === issue.taskRef);
      return msg('context.issue.duplicateTaskId', { task: task?.id ?? issue.taskRef ?? '', other: issue.detail ?? '' });
    }
    case 'state_mismatch': {
      const task = workstream?.tasks.find((item) => item.ref === issue.taskRef);
      return msg('context.issue.stateMismatch', { task: task?.id ?? issue.taskRef ?? '', file: task?.state ?? '', table: issue.detail ?? '' });
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
      message: msg('context.warning.uncommitted'),
    });
  }
  for (const workstream of overview.workstreams) {
    if (git.state === 'repo' && workstream.branch && git.branch !== workstream.branch) {
      warnings.push({
        kind: 'branch_mismatch',
        taskRef: null,
        workstream: workstream.slug,
        message: msg('context.warning.branchMismatch', { workstream: workstream.title, expected: workstream.branch, actual: git.branch ?? 'detached HEAD' }),
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
          message: msg('context.warning.commitsAfterHandoff', { task: task.id }),
        });
      } else if (isActive(task) && task.lastHandoff === null) {
        warnings.push({ kind: 'no_handoff', taskRef: task.ref, workstream: workstream.slug, message: msg('context.warning.noHandoff', { task: task.id }) });
      } else if (isActive(task) && handoffAt !== null && now.getTime() - handoffAt > OLD_HANDOFF_DAYS * day) {
        warnings.push({
          kind: 'old_handoff',
          taskRef: task.ref,
          workstream: workstream.slug,
          message: msg('context.warning.oldHandoff', { task: task.id, days: OLD_HANDOFF_DAYS }),
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
