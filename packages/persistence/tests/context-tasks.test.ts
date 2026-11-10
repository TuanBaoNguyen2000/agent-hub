import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DomainError } from '@agenthub/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contextLockPath, createContextTask, readContextOverview, renumberContextTask, syncStatusTable, withContextLock } from '../src/index';

// ADR-027: task numbers handed out under a lock, two files with one number, and a STATUS table
// that disagrees with the task files.

let root: string;
let docs: string;
let locks: string;

function write(path: string, content: string): void {
  mkdirSync(join(docs, path, '..'), { recursive: true });
  writeFileSync(join(docs, path), content);
}
const read = (path: string): string => readFileSync(join(docs, path), 'utf8');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agenthub-tasks-'));
  docs = join(root, 'docs');
  locks = join(root, 'locks');
  mkdirSync(docs);
  write('README.md', '# Context');
  write('PROJECT_CONTEXT.md', '# Project\n\nUnity 6.\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('creating tasks', () => {
  it('numbers tasks across every workstream and adds the STATUS row', () => {
    write('Workstreams/a/STATUS.md', '# A\n\n| Task | Status |\n|---|---|\n| TASK-004 Old | Xong |\n');
    write('Workstreams/a/Tasks/TASK-004-old.md', '# TASK-004 Old\n\nStatus: Xong\n\n## Handoff log\n');
    write('Workstreams/b/STATUS.md', '# B\n');
    mkdirSync(join(docs, 'Workstreams/b/Tasks'));

    const first = createContextTask(docs, locks, { workstream: 'Workstreams/b', title: 'Combo  counter', goal: 'Count hits.', language: 'vi' });
    const second = createContextTask(docs, locks, { workstream: 'Workstreams/a', title: 'UI', goal: '', language: 'vi' });

    expect(first).toMatchObject({ id: 'TASK-005', ref: 'Workstreams/b/Tasks/TASK-005-combo-counter.md' });
    expect(second.id).toBe('TASK-006');
    expect(read(first.ref)).toMatch(/^# TASK-005 Combo counter\n\nStatus: Cần làm\n/);
    expect(read('Workstreams/b/STATUS.md')).toContain('| TASK-005 Combo counter | Cần làm |');
    expect(read('Workstreams/a/STATUS.md')).toContain('| TASK-004 Old | Xong |\n| TASK-006 UI | Cần làm |');
    // The lock is released and lives outside the documents.
    expect(existsSync(contextLockPath(locks, docs))).toBe(false);
    expect(readContextOverview(docs).issues).toEqual([]);
  });

  it('keeps the body an agent wrote, under the title and state AgentHub sets', () => {
    write('Workstreams/main/STATUS.md', '# Main\n');
    const body = '# TASK-999 Wrong title\nStatus: Done\n\n## Goal\n\nShip it.\n\n## Acceptance criteria\n\n- [ ] works\n';
    const created = createContextTask(docs, locks, { workstream: 'Workstreams/main', title: 'Ship', goal: '', body, language: 'en' });
    expect(read(created.ref)).toBe('# TASK-001 Ship\n\nStatus: To do\n\n## Goal\n\nShip it.\n\n## Acceptance criteria\n\n- [ ] works\n\n## Handoff log\n');
  });

  it('names the workstreams when the one asked for does not exist', () => {
    write('Workstreams/main/STATUS.md', '# Main\n');
    expect(() => createContextTask(docs, locks, { workstream: 'Workstreams/nope', title: 'X', goal: '', language: 'en' })).toThrow(/Workstreams\/main/);
  });
});

describe('the lock', () => {
  it('waits while another process holds it, then goes ahead', async () => {
    write('Workstreams/main/STATUS.md', '# Main\n');
    const lock = contextLockPath(locks, docs);
    mkdirSync(locks, { recursive: true });
    // A real second process takes the lock and lets it go after 300 ms.
    const script = `const fs=require('fs');fs.mkdirSync(${JSON.stringify(lock)});process.stdout.write('held');setTimeout(()=>{fs.rmSync(${JSON.stringify(lock)},{recursive:true});process.exit(0)},300);`;
    const holder = spawn(process.execPath, ['-e', script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    await new Promise<void>((resolve) => holder.stdout.once('data', () => resolve()));

    const started = Date.now();
    const created = createContextTask(docs, locks, { workstream: 'Workstreams/main', title: 'After', goal: '', language: 'en' });
    expect(created.id).toBe('TASK-001');
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    await new Promise((resolve) => holder.once('exit', resolve));
  });

  it('gives up with a conflict when the lock stays taken', () => {
    mkdirSync(contextLockPath(locks, docs), { recursive: true });
    const attempt = () => withContextLock(locks, docs, () => 'never', { waitMs: 100 });
    expect(attempt).toThrow(DomainError);
    expect(attempt).toThrow(/Try again/);
  });

  it('takes over a lock left by a process that died', () => {
    const lock = contextLockPath(locks, docs);
    mkdirSync(lock, { recursive: true });
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);
    expect(withContextLock(locks, docs, () => 'done', { waitMs: 100 })).toBe('done');
    expect(existsSync(lock)).toBe(false);
  });

  it('is released when the work fails', () => {
    expect(() =>
      withContextLock(locks, docs, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(existsSync(contextLockPath(locks, docs))).toBe(false);
  });
});

describe('two tasks with one number (ADR-027 item 1.4)', () => {
  it('is reported on both tasks, each naming the other', () => {
    write('Workstreams/a/STATUS.md', '# A\n');
    write('Workstreams/a/Tasks/TASK-002-x.md', '# TASK-002 X\n\n## Handoff log\n');
    write('Workstreams/b/STATUS.md', '# B\n');
    write('Workstreams/b/Tasks/TASK-002-y.md', '# TASK-002 Y\n\n## Handoff log\n');
    expect(readContextOverview(docs).issues).toEqual([
      { kind: 'duplicate_task_id', workstream: 'Workstreams/a', taskRef: 'Workstreams/a/Tasks/TASK-002-x.md', detail: 'Workstreams/b/Tasks/TASK-002-y.md' },
      { kind: 'duplicate_task_id', workstream: 'Workstreams/b', taskRef: 'Workstreams/b/Tasks/TASK-002-y.md', detail: 'Workstreams/a/Tasks/TASK-002-x.md' },
    ]);
  });

  it('renumbers one task, its title, its STATUS row, and leaves the other alone', () => {
    write('Workstreams/a/STATUS.md', '# A\n\n| Task | Status |\n|---|---|\n| TASK-002 Combo | In progress |\n| TASK-002 Menu | To do |\n| TASK-003 Other | Done |\n');
    write('Workstreams/a/Tasks/TASK-002-combo.md', '# TASK-002 Combo\n\nStatus: In progress\n\n## Handoff log\n');
    write('Workstreams/a/Tasks/TASK-002-menu.md', '# TASK-002 Menu\n\nStatus: To do\n\n## Handoff log\n');
    write('Workstreams/a/Tasks/TASK-003-other.md', '# TASK-003 Other\n\nStatus: Done\n\n## Handoff log\n');

    const moved = renumberContextTask(docs, locks, 'Workstreams/a/Tasks/TASK-002-menu.md', 'en');

    expect(moved).toEqual({ ref: 'Workstreams/a/Tasks/TASK-004-menu.md', id: 'TASK-004' });
    expect(existsSync(join(docs, 'Workstreams/a/Tasks/TASK-002-menu.md'))).toBe(false);
    expect(read(moved.ref)).toBe('# TASK-004 Menu\n\nStatus: To do\nRenumbered from TASK-002.\n\n## Handoff log\n');
    expect(read('Workstreams/a/STATUS.md')).toContain('| TASK-002 Combo | In progress |\n| TASK-004 Menu | To do |\n| TASK-003 Other | Done |');
    expect(read('Workstreams/a/Tasks/TASK-002-combo.md')).toContain('# TASK-002 Combo');
    expect(readContextOverview(docs).issues).toEqual([]);
  });

  it('adds a row when the only row with that number is the other task\'s', () => {
    write('Workstreams/a/STATUS.md', '# A\n\n| Task | Status |\n|---|---|\n| TASK-001 First | Done |\n');
    write('Workstreams/a/Tasks/TASK-001-first.md', '# TASK-001 First\n\nStatus: Done\n\n## Handoff log\n');
    write('Workstreams/a/Tasks/TASK-001-second.md', '# TASK-001 Second\n\nStatus: Blocked\n\n## Handoff log\n');
    renumberContextTask(docs, locks, 'Workstreams/a/Tasks/TASK-001-second.md', 'en');
    expect(read('Workstreams/a/STATUS.md')).toContain('| TASK-001 First | Done |\n| TASK-002 Second | Blocked |');
  });
});

describe('the STATUS table against the task files (ADR-027 item 2)', () => {
  beforeEach(() => {
    write(
      'Workstreams/a/STATUS.md',
      '# A\n\n| Task | Status |\n|---|---|\n| TASK-001 One | To do |\n| TASK-002 Two | in progress |\n| TASK-004 Four | To do |\n',
    );
    write('Workstreams/a/Tasks/TASK-001-one.md', '# TASK-001 One\n\nStatus: Blocked\n\n## Handoff log\n');
    // The same state in other words is not a disagreement.
    write('Workstreams/a/Tasks/TASK-002-two.md', '# TASK-002 Two\n\nStatus: Đang làm\n\n## Handoff log\n');
    write('Workstreams/a/Tasks/TASK-003-three.md', '# TASK-003 Three\n\nStatus: In review\n\n## Handoff log\n');
    write('Workstreams/a/Tasks/TASK-004-four.md', '# TASK-004 Four\n\n## Handoff log\n');
  });

  it('reports a task whose file and row give different states, and shows the file\'s', () => {
    const overview = readContextOverview(docs);
    expect(overview.issues).toEqual([{ kind: 'state_mismatch', workstream: 'Workstreams/a', taskRef: 'Workstreams/a/Tasks/TASK-001-one.md', detail: 'To do' }]);
    expect(overview.workstreams[0]?.tasks.map((task) => task.state)).toEqual(['Blocked', 'Đang làm', 'In review', 'To do']);
  });

  it('writes the file\'s state into the table and adds missing rows, only when asked', () => {
    expect(syncStatusTable(docs, 'Workstreams/a')).toBe(2);
    expect(read('Workstreams/a/STATUS.md')).toBe(
      '# A\n\n| Task | Status |\n|---|---|\n| TASK-001 One | Blocked |\n| TASK-002 Two | in progress |\n| TASK-004 Four | To do |\n| TASK-003 Three | In review |\n',
    );
    expect(readContextOverview(docs).issues).toEqual([]);
    expect(syncStatusTable(docs, 'Workstreams/a')).toBe(0);
  });

  it('leaves tasks that share a number until they are renumbered', () => {
    write('Workstreams/a/Tasks/TASK-001-again.md', '# TASK-001 Again\n\nStatus: Done\n\n## Handoff log\n');
    syncStatusTable(docs, 'Workstreams/a');
    expect(read('Workstreams/a/STATUS.md')).toContain('| TASK-001 One | To do |');
  });
});
