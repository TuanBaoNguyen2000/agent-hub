import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendHandoff, insertHandoff, listContext, readContext, sha256, writeContext } from '../src/index';

let dir: string;
let root: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "agenthub context 'thử' "));
  root = join(dir, 'Tài liệu');
  mkdirSync(join(root, 'Workstreams', 'combo', 'Tasks'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# Context\n');
  writeFileSync(join(dir, 'secret.md'), 'secret');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
};

describe('context files', () => {
  it('reads a document with its checksum', () => {
    expect(readContext(root, 'README.md')).toEqual({ content: '# Context\n', sha256: sha256('# Context\n') });
  });

  it('lists documents and folders, without hidden files', () => {
    writeFileSync(join(root, '.DS_Store'), '');
    expect(listContext(root).map((entry) => entry.path)).toEqual(['README.md', 'Workstreams/', 'Workstreams/combo/', 'Workstreams/combo/Tasks/']);
  });

  it.each(['../secret.md', '/etc/hosts', 'Workstreams/../../secret.md', '.git/config', 'a\0b.md'])('refuses the path %j', (path) => {
    expect(codeOf(() => readContext(root, path))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => writeContext(root, path.endsWith('.md') ? path : `${path}.md`, 'x', null))).toBe('VALIDATION_FAILED');
  });

  it('refuses a symlink that leads out of the folder, for reading and for writing through it', () => {
    symlinkSync(join(dir, 'secret.md'), join(root, 'link.md'));
    symlinkSync(dir, join(root, 'out'));

    expect(codeOf(() => readContext(root, 'link.md'))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => writeContext(root, 'out/new.md', 'x', null))).toBe('VALIDATION_FAILED');
    expect(readdirSync(dir).sort()).toEqual(['Tài liệu', 'secret.md']);
  });

  it('writes only Markdown', () => {
    expect(codeOf(() => writeContext(root, 'run.sh', 'rm -rf ~', null))).toBe('VALIDATION_FAILED');
  });

  it('creates a new document and its folders, and refuses to overwrite without the checksum read', () => {
    const created = writeContext(root, 'Workstreams/combo/STATUS.md', '# Status\n', null);
    expect(readFileSync(join(root, 'Workstreams/combo/STATUS.md'), 'utf8')).toBe('# Status\n');

    expect(codeOf(() => writeContext(root, 'Workstreams/combo/STATUS.md', 'mất', null))).toBe('CONTEXT_CONFLICT');
    writeContext(root, 'Workstreams/combo/STATUS.md', '# Status 2\n', created.sha256);
    expect(codeOf(() => writeContext(root, 'Workstreams/combo/STATUS.md', 'cũ', created.sha256))).toBe('CONTEXT_CONFLICT');
    expect(readContext(root, 'Workstreams/combo/STATUS.md').content).toBe('# Status 2\n');
    expect(readdirSync(join(root, 'Workstreams/combo')).filter((name) => name.startsWith('.'))).toEqual([]);
  });
});

describe('handoff log', () => {
  const task = '# TASK-001\n\n## Acceptance criteria\n- x\n\n## Handoff log\n\n### 2026-11-04 — A\n- old\n\n## Notes\nkeep\n';

  it('puts the newest entry first, under the heading, and keeps the rest', () => {
    expect(insertHandoff(task, '### 2026-11-05 — B\n- new')).toBe(
      '# TASK-001\n\n## Acceptance criteria\n- x\n\n## Handoff log\n\n### 2026-11-05 — B\n- new\n\n### 2026-11-04 — A\n- old\n\n## Notes\nkeep\n',
    );
  });

  it('adds the heading when the task has none, and starts a new document', () => {
    expect(insertHandoff('# TASK-002\n', '### e')).toBe('# TASK-002\n\n## Handoff log\n\n### e\n');
    expect(insertHandoff('', '### e')).toBe('## Handoff log\n\n### e\n');
  });

  it('merges with the file on disk and refuses an empty entry', () => {
    writeFileSync(join(root, 'Workstreams/combo/Tasks/TASK-001.md'), task);
    appendHandoff(root, 'Workstreams/combo/Tasks/TASK-001.md', '### 2026-11-05 — B\n- new');
    appendHandoff(root, 'Workstreams/combo/Tasks/TASK-001.md', '### 2026-11-05 — C\n- newer');

    const content = readFileSync(join(root, 'Workstreams/combo/Tasks/TASK-001.md'), 'utf8');
    expect(content.indexOf('— C')).toBeLessThan(content.indexOf('— B'));
    expect(content.indexOf('— B')).toBeLessThan(content.indexOf('— A'));
    expect(codeOf(() => appendHandoff(root, 'Workstreams/combo/Tasks/TASK-001.md', '  '))).toBe('VALIDATION_FAILED');
  });
});
