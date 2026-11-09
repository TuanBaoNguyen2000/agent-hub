import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criteriaProgress, insertHandoff, workstreamTitle, handoffTime, latestHandoff, readContextOverview, statusBranch, taskFileState, taskStates } from '../src/index';

let root: string;

function write(path: string, content: string): void {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agenthub-overview-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('readContextOverview', () => {
  it('reports an empty folder as not set up', () => {
    expect(readContextOverview(root)).toEqual({ initialized: false, filled: false, workstreams: [], issues: [] });
  });

  it('reads workstreams, tasks, their state, branch and newest handoff', () => {
    write('README.md', '# Context');
    write(
      'Workstreams/combo/STATUS.md',
      '# Combo system\n\n- In progress: TASK-001. Branch: feature/combo.\n\n| Task | State |\n|---|---|\n| [TASK-001-combo-counter](Tasks/TASK-001-combo-counter.md) | **in progress** |\n| TASK-002 | done |\n',
    );
    write(
      'Workstreams/combo/Tasks/TASK-001-combo-counter.md',
      '# TASK-001 Combo counter\n\n## Handoff log\n\n### 2026-11-05 14:30 — B / Codex\n- Done\n\n### 2026-11-04 — A\n',
    );
    write('Workstreams/combo/Tasks/TASK-002-ui.md', '# TASK-002 UI\n');
    write('Workstreams/combo/Tasks/notes.md', 'not a task');
    write('Workstreams/.hidden/STATUS.md', '# hidden');

    const overview = readContextOverview(root);

    expect(overview.initialized).toBe(true);
    expect(overview.workstreams).toEqual([
      {
        slug: 'Workstreams/combo',
        title: 'Combo system',
        branch: 'feature/combo',
        tasks: [
          {
            ref: 'Workstreams/combo/Tasks/TASK-001-combo-counter.md',
            id: 'TASK-001',
            title: 'TASK-001 Combo counter',
            state: 'in progress',
            criteria: null,
            lastHandoff: { heading: '2026-11-05 14:30 — B / Codex', at: new Date(2026, 10, 5, 14, 30).toISOString() },
          },
          { ref: 'Workstreams/combo/Tasks/TASK-002-ui.md', id: 'TASK-002', title: 'TASK-002 UI', state: 'done', criteria: null, lastHandoff: null },
        ],
      },
    ]);
  });

  it('copes with a workstream that has no STATUS or tasks', () => {
    mkdirSync(join(root, 'Workstreams', 'trống'), { recursive: true });
    expect(readContextOverview(root).workstreams).toEqual([{ slug: 'Workstreams/trống', title: 'trống', branch: null, tasks: [] }]);
  });
});

describe('the task file\'s own state and checklist (ADR-023 item 4)', () => {
  it('prefers the Status line under the title to the STATUS table', () => {
    write('README.md', '# Context');
    write('Workstreams/a/STATUS.md', '| Task | State |\n|---|---|\n| TASK-001 | To do |\n| TASK-002 | Done |\n');
    write('Workstreams/a/Tasks/TASK-001-x.md', '# TASK-001 X\n\n**Status:** **Blocked**\n\n## Goal\n');
    // A "Status:" inside a section is about something else.
    write('Workstreams/a/Tasks/TASK-002-y.md', '# TASK-002 Y\n\n## Handoff log\n\n### 2026-11-05\n- Status: in progress\n');
    write('Workstreams/a/Tasks/TASK-003-z.md', '# TASK-003 Z\nTrạng thái: Đang làm\n');
    const tasks = readContextOverview(root).workstreams[0]?.tasks ?? [];
    expect(tasks.map((task) => [task.id, task.state])).toEqual([
      ['TASK-001', 'Blocked'],
      ['TASK-002', 'Done'],
      ['TASK-003', 'Đang làm'],
    ]);
  });

  it('counts ticked acceptance criteria, ignoring checklists in other sections', () => {
    expect(taskFileState('# T\n\nStatus:\n')).toBeNull();
    expect(criteriaProgress('# T\n\n## Acceptance criteria\n\n- [x] one\n- [ ] two\n  - [X] nested\n\n## Notes\n- [ ] not counted\n')).toEqual({ done: 2, total: 3 });
    expect(criteriaProgress('# T\n\n## Tiêu chí hoàn thành\n\nchữ thường\n')).toBeNull();
    expect(criteriaProgress('# T\n')).toBeNull();
  });
});

describe('workstream titles', () => {
  it('drops the word STATUS that names the file, keeping the workstream name', () => {
    expect(workstreamTitle('STATUS – Playable005')).toBe('Playable005');
    expect(workstreamTitle('STATUS.md: Combo system')).toBe('Combo system');
    expect(workstreamTitle('Combo system — Status')).toBe('Combo system');
    expect(workstreamTitle('Trạng thái - Chung')).toBe('Chung');
    expect(workstreamTitle('Statusbar redesign')).toBe('Statusbar redesign');
    expect(workstreamTitle('Combo system')).toBe('Combo system');
    expect(workstreamTitle('STATUS')).toBeNull();
    expect(workstreamTitle(null)).toBeNull();
  });

  it('falls back to the folder name when the heading is only STATUS', () => {
    write('README.md', '# Context');
    write('Playables/playable005/STATUS.md', '# STATUS\n');
    write('Playables/playable006/STATUS.md', '# STATUS – Playable 006\n');
    expect(readContextOverview(root).workstreams.map((item) => item.title)).toEqual(['playable005', 'Playable 006']);
  });
});

describe('workstream folders with another name (ADR-020 item 4)', () => {
  it('reads workstreams under any top-level folder that holds them, with the real path as ref', () => {
    write('README.md', '# Context');
    write('Playables/playable005/STATUS.md', '# Playable 005\n\n| Task | State |\n|---|---|\n| TASK-016 | in progress |\n');
    write('Playables/playable005/Tasks/TASK-016-intro.md', '# TASK-016 Intro\n\n## Handoff log\n\n### 2026-11-04 — A\n');
    write('Playables/notes/readme.md', 'no STATUS, still a workstream of this folder');
    write('Docs/Design/spec.md', 'not a workstream folder');
    write('Inbox/20261105T000000000Z-abcdef.md', 'a loose chat');

    const overview = readContextOverview(root);

    expect(overview.workstreams.map((workstream) => [workstream.slug, workstream.title])).toEqual([
      ['Playables/notes', 'notes'],
      ['Playables/playable005', 'Playable 005'],
    ]);
    expect(overview.workstreams[1]?.tasks).toEqual([
      {
        ref: 'Playables/playable005/Tasks/TASK-016-intro.md',
        id: 'TASK-016',
        title: 'TASK-016 Intro',
        state: 'in progress',
        criteria: null,
        lastHandoff: { heading: '2026-11-04 — A', at: new Date(2026, 10, 4, 23, 59, 59).toISOString() },
      },
    ]);
  });
});

describe('checking the documents (ADR-020 item 3)', () => {
  it('reports nothing missing before README.md exists', () => {
    mkdirSync(join(root, 'Workstreams', 'trống'), { recursive: true });
    expect(readContextOverview(root).issues).toEqual([]);
  });

  it('reports a set of documents with no PROJECT_CONTEXT and no workstream', () => {
    write('README.md', '# Context');
    expect(readContextOverview(root).issues).toEqual([
      { kind: 'no_project_context', workstream: null, taskRef: null },
      { kind: 'no_workstream', workstream: null, taskRef: null },
    ]);
  });

  it('reports a workstream without STATUS or tasks, and a task without a Handoff log', () => {
    write('README.md', '# Context');
    write('PROJECT_CONTEXT.md', '# Project');
    mkdirSync(join(root, 'Workstreams', 'trống'), { recursive: true });
    write('Workstreams/combo/STATUS.md', '# Combo');
    write('Workstreams/combo/Tasks/TASK-001-a.md', '# TASK-001\n\n## Handoff log\n');
    write('Workstreams/combo/Tasks/TASK-002-b.md', '# TASK-002\n\n## Notes\n');

    expect(readContextOverview(root).issues).toEqual([
      { kind: 'no_handoff_log', workstream: 'Workstreams/combo', taskRef: 'Workstreams/combo/Tasks/TASK-002-b.md' },
      { kind: 'no_status', workstream: 'Workstreams/trống', taskRef: null },
      { kind: 'no_tasks', workstream: 'Workstreams/trống', taskRef: null },
    ]);
    // A workstream with an empty Tasks/ was just created and is fine.
    mkdirSync(join(root, 'Workstreams', 'trống', 'Tasks'));
    write('Workstreams/trống/STATUS.md', '# Trống');
    expect(readContextOverview(root).issues.map((issue) => issue.kind)).toEqual(['no_handoff_log']);
  });
});

describe('parsing the documents', () => {
  it('reads a bare date as the end of that day, and nonsense as no time', () => {
    expect(handoffTime('2026-11-04 — A')).toBe(new Date(2026, 10, 4, 23, 59, 59).toISOString());
    expect(handoffTime('yesterday')).toBeNull();
  });

  it('reads the UTC offset of newer entries exactly, and older entries as local time (ADR-026)', () => {
    expect(handoffTime('2026-11-09 17:40+0700 — Claude B / Claude Code')).toBe('2026-11-09T10:40:00.000Z');
    expect(handoffTime('2026-11-09 17:40+07:00 — B')).toBe('2026-11-09T10:40:00.000Z');
    expect(handoffTime('2026-11-09 05:10 -05:30 — B')).toBe('2026-11-09T10:40:00.000Z');
    expect(handoffTime('2026-11-09T10:40:00Z — B')).toBe('2026-11-09T10:40:00.000Z');
    expect(handoffTime('2026-11-09 17:40 — B')).toBe(new Date(2026, 10, 9, 17, 40).toISOString());
    // A number after the time that is not an offset changes nothing.
    expect(handoffTime('2026-11-09 17:40 -2 tasks')).toBe(new Date(2026, 10, 9, 17, 40).toISOString());
  });

  it('only takes a heading inside the Handoff log as a handoff', () => {
    expect(latestHandoff('# T\n### 2026-11-01 — not in the log\n## Handoff log\n\n## Notes\n### 2026-11-02')).toBeNull();
    expect(latestHandoff('# T\n## Handoff log\nfree text\n### 2026-11-03 — A')?.heading).toBe('2026-11-03 — A');
  });

  it('finds the branch however STATUS writes it', () => {
    expect(statusBranch('Branch: main.')).toBe('main');
    expect(statusBranch('- **Branch:** `feature/x-1`')).toBe('feature/x-1');
    expect(statusBranch('- Branch: `feature/x-1`, clean')).toBe('feature/x-1');
    expect(statusBranch('no branch here')).toBeNull();
  });

  it('ignores the separator row of a table', () => {
    expect([...taskStates('| Task | State |\n|---|---|\n| TASK-7 | blocked |')]).toEqual([['TASK-7', 'blocked']]);
  });
});

describe('a Handoff log heading with a note after it', () => {
  it('is read as the log, as the luna documents write it', () => {
    write('README.md', '# Context');
    write('PROJECT_CONTEXT.md', '# Project\n\nx\n');
    write('Playables/p5/STATUS.md', '# P5\n');
    write('Playables/p5/Tasks/TASK-017-x.md', '# TASK-017: X\n\n## Handoff log (newest first)\n### 2026-11-06 – Claude (for Keaton), follow-up\n- done\n');
    const overview = readContextOverview(root);
    expect(overview.workstreams[0]?.tasks[0]?.lastHandoff?.heading).toBe('2026-11-06 – Claude (for Keaton), follow-up');
    expect(overview.issues).toEqual([]);
    expect(latestHandoff('# T\n\n## Handoff log — newest first\n\n### 2026-11-05 A\n')?.heading).toBe('2026-11-05 A');
    // Another heading that only starts with the words is not the log.
    expect(latestHandoff('# T\n\n## Handoff logs archive\n\n### 2026-11-05 A\n')).toBeNull();
  });

  it('gets new entries right under it', () => {
    expect(insertHandoff('# T\n\n## Handoff log (newest first)\n### old\n', '### new\n- x')).toBe('# T\n\n## Handoff log (newest first)\n\n### new\n- x\n\n### old\n');
  });
});
