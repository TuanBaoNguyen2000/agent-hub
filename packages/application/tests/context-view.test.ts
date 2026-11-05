import { translate } from '@agenthub/i18n';
import { describe, expect, it } from 'vitest';
import { type ContextOverview, type ContextTask, type GitObservation, contextWarnings, isActive, isDone } from '../src/index';

const now = new Date('2026-11-05T12:00:00.000Z');
const git = (overrides: Partial<GitObservation> = {}): GitObservation => ({
  state: 'repo',
  root: '/p',
  branch: 'main',
  head: 'abc',
  headAt: '2026-11-05T09:00:00.000Z',
  dirty: false,
  ...overrides,
});

function task(id: string, state: string | null, handoffAt: string | null | undefined): ContextTask {
  return {
    ref: `Workstreams/w/Tasks/${id}.md`,
    id,
    title: id,
    state,
    lastHandoff: handoffAt === undefined ? null : { heading: 'x', at: handoffAt },
  };
}

const overview = (tasks: ContextTask[], branch: string | null = 'main'): ContextOverview => ({
  initialized: true,
  workstreams: [{ slug: 'w', title: 'Combo', branch, tasks }],
  issues: [],
});

const kinds = (overviewValue: ContextOverview, observation = git()) =>
  contextWarnings(overviewValue, observation, now).map((warning) => [warning.kind, warning.taskRef?.split('/').at(-1) ?? null]);

describe('task state words', () => {
  it.each([
    ['in progress', true, false],
    ['Đang làm', true, false],
    ['done', false, true],
    ['Xong', false, true],
    ['undone ideas', false, false],
    ['blocked', false, false],
  ])('reads %j', (state, active, done) => {
    const value = task('T', state, undefined);
    expect([isActive(value), isDone(value)]).toEqual([active, done]);
  });
});

describe('contextWarnings (TDD §7.7, §9.3)', () => {
  it('stays quiet when the handoff is newer than the last commit and the branch matches', () => {
    expect(kinds(overview([task('TASK-001', 'in progress', '2026-11-05T10:00:00.000Z')]))).toEqual([]);
  });

  it('flags commits newer than the handoff, but not for a finished task', () => {
    const tasks = [task('TASK-001', 'in progress', '2026-11-05T08:00:00.000Z'), task('TASK-002', 'done', '2026-11-01T00:00:00.000Z')];
    expect(kinds(overview(tasks))).toEqual([['commits_after_handoff', 'TASK-001.md']]);
  });

  it('flags a task in progress with no handoff, or one older than a week', () => {
    const tasks = [task('TASK-001', 'in progress', undefined), task('TASK-002', 'đang làm', '2026-10-20T00:00:00.000Z')];
    expect(kinds(overview(tasks), git({ headAt: null }))).toEqual([
      ['no_handoff', 'TASK-001.md'],
      ['old_handoff', 'TASK-002.md'],
    ]);
  });

  it('flags a branch other than the one STATUS names, and a detached HEAD', () => {
    expect(kinds(overview([], 'feature/combo'))).toEqual([['branch_mismatch', null]]);
    expect(translate('vi', contextWarnings(overview([]), git({ branch: null }), now)[0]?.message ?? 'missing')).toContain('detached HEAD');
  });

  it('mentions uncommitted changes once for the project', () => {
    expect(kinds(overview([]), git({ dirty: true }))).toEqual([['uncommitted', null]]);
  });

  it('says nothing about Git when the folder is not a repository or Git is unknown', () => {
    const tasks = [task('TASK-001', 'in progress', '2026-11-05T08:00:00.000Z')];
    for (const state of ['not_repo', 'unknown'] as const) {
      expect(kinds(overview(tasks, 'feature/x'), git({ state, branch: null, headAt: null, dirty: null }))).toEqual([]);
    }
  });

  it('lists what is missing from the documents first, named by workstream and task', () => {
    const value: ContextOverview = {
      ...overview([task('TASK-001', null, undefined)]),
      issues: [
        { kind: 'no_project_context', workstream: null, taskRef: null },
        { kind: 'no_status', workstream: 'w', taskRef: null },
        { kind: 'no_handoff_log', workstream: 'w', taskRef: 'Workstreams/w/Tasks/TASK-001.md' },
      ],
    };
    expect(contextWarnings(value, git(), now).map((warning) => [warning.kind, translate('vi', warning.message)])).toEqual([
      ['no_project_context', 'Tài liệu thiếu PROJECT_CONTEXT.md.'],
      ['no_status', 'Workstream "Combo" thiếu STATUS.md.'],
      ['no_handoff_log', 'TASK-001 thiếu mục "Handoff log".'],
    ]);
  });
});
