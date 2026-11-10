import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createContextTask, deleteContextTask, deleteContextWorkstream } from '../src/index';

// Backlog I1: deleting a task or a workstream keeps its numbers out of use.

let root: string;
let docs: string;
let locks: string;
const at = new Date('2026-11-10T08:00:00Z');

function write(path: string, content: string): void {
  mkdirSync(join(docs, path, '..'), { recursive: true });
  writeFileSync(join(docs, path), content);
}
const read = (path: string): string => readFileSync(join(docs, path), 'utf8');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agenthub-delete-'));
  docs = join(root, 'docs');
  locks = join(root, 'locks');
  mkdirSync(docs);
  write('README.md', '# Context\n');
  write('Workstreams/a/STATUS.md', '# A\n\n## Tasks\n\n| Task | Status |\n|---|---|\n| TASK-001 First | Done |\n| TASK-002 Pause menu | To do |\n\n## Notes\n\nKeep.\n');
  write('Workstreams/a/Tasks/TASK-001-first.md', '# TASK-001 First\n\nStatus: Done\n');
  write('Workstreams/a/Tasks/TASK-002-pause-menu.md', '# TASK-002 Pause menu\n\nStatus: To do\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('deleting a task', () => {
  it('removes its STATUS row, lists it as deleted and says which file to move to the Trash', () => {
    const result = deleteContextTask(docs, locks, 'Workstreams/a/Tasks/TASK-002-pause-menu.md', 'en', at);
    expect(result).toEqual({ path: join(docs, 'Workstreams/a/Tasks/TASK-002-pause-menu.md'), id: 'TASK-002' });
    const status = read('Workstreams/a/STATUS.md');
    expect(status).not.toContain('| TASK-002 Pause menu | To do |');
    expect(status).toContain('| TASK-001 First | Done |');
    expect(status).toContain('## Notes\n\nKeep.');
    expect(status).toContain('## Deleted tasks\n\n- TASK-002 Pause menu (2026-11-10)');
    // The caller moves the file; deleting the documents' side leaves it in place.
    expect(existsSync(join(docs, 'Workstreams/a/Tasks/TASK-002-pause-menu.md'))).toBe(true);
  });

  it('never hands out the number of a deleted task again, even the highest one', () => {
    deleteContextTask(docs, locks, 'Workstreams/a/Tasks/TASK-002-pause-menu.md', 'vi', at);
    rmSync(join(docs, 'Workstreams/a/Tasks/TASK-002-pause-menu.md'));
    const created = createContextTask(docs, locks, { workstream: 'Workstreams/a', title: 'Next', goal: 'g', language: 'vi' });
    expect(created.id).toBe('TASK-003');
    expect(read('Workstreams/a/STATUS.md')).toContain('## Task đã xoá\n\n- TASK-002 Pause menu (2026-11-10)');
  });

  it('adds later deletions under the same heading', () => {
    deleteContextTask(docs, locks, 'Workstreams/a/Tasks/TASK-002-pause-menu.md', 'en', at);
    deleteContextTask(docs, locks, 'Workstreams/a/Tasks/TASK-001-first.md', 'en', at);
    const status = read('Workstreams/a/STATUS.md');
    expect(status.match(/## Deleted tasks/g)).toHaveLength(1);
    expect(status).toContain('- TASK-002 Pause menu (2026-11-10)\n- TASK-001 First (2026-11-10)');
  });
});

describe('deleting a workstream', () => {
  it('lists its task numbers in the README and says which folder to move to the Trash', () => {
    const result = deleteContextWorkstream(docs, locks, 'Workstreams/a', 'en', at);
    expect(result.path).toBe(join(docs, 'Workstreams/a'));
    expect(read('README.md')).toContain('## Deleted workstreams\n\n- A (`Workstreams/a`, 2026-11-10): TASK-001, TASK-002');
    rmSync(join(docs, 'Workstreams/a'), { recursive: true });
    write('Workstreams/b/STATUS.md', '# B\n');
    mkdirSync(join(docs, 'Workstreams/b/Tasks'));
    expect(createContextTask(docs, locks, { workstream: 'Workstreams/b', title: 'New', goal: 'g', language: 'en' }).id).toBe('TASK-003');
  });
});
