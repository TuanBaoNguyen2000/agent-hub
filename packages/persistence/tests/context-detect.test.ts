import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conflictingFiles, contextFiles, copyContextFiles, detectContext, isContextFolder } from '../src/index';

let root: string;

function write(path: string, content = '# x\n'): void {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agenthub-detect-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('detectContext (ADR-020 item 4)', () => {
  it('finds a set by PROJECT_CONTEXT.md, or by README.md beside a workstream folder of any name', () => {
    write('AgentContext/README.md');
    write('AgentContext/Playables/playable005/STATUS.md');
    write('Tools/Notes/PROJECT_CONTEXT.md');
    // README.md alone is any folder's readme, not a set of documents.
    write('Packages/Lib/README.md');

    expect(detectContext(root).found).toEqual([join(root, 'AgentContext'), join(root, 'Tools', 'Notes')]);
    expect(isContextFolder(join(root, 'Packages', 'Lib'))).toBe(false);
  });

  it('never takes the project folder itself, and does not look inside a set it found', () => {
    write('PROJECT_CONTEXT.md');
    write('Ctx/PROJECT_CONTEXT.md');
    write('Ctx/Inner/PROJECT_CONTEXT.md');
    expect(detectContext(root).found).toEqual([join(root, 'Ctx')]);
  });

  it('lists notes in another shape under Docs/ and the instruction files at the root', () => {
    write('AGENTS.md');
    write('CLAUDE.md');
    write('Docs/Continuity.md');
    write('Docs/Handoffs/2026/HANDOFF-11.md');
    write('Docs/GDD.md');
    write('Assets/Docs/STATUS.md');
    write('Sub/AGENTS.md');

    expect(detectContext(root).others).toEqual(['AGENTS.md', 'CLAUDE.md', 'Docs/Continuity.md', 'Docs/Handoffs/2026/HANDOFF-11.md']);
  });

  it('skips hidden and generated folders, and stops three levels down', () => {
    for (const folder of ['.git', 'node_modules', 'Library', 'Temp', 'obj', 'Builds', 'BuildOutput']) write(`${folder}/Ctx/PROJECT_CONTEXT.md`);
    write('a/b/c/PROJECT_CONTEXT.md');
    write('a/b/c/d/PROJECT_CONTEXT.md');
    expect(detectContext(root).found).toEqual([join(root, 'a', 'b', 'c')]);
  });

  it('stays quick in a large Unity project and says when it stopped at its limit', () => {
    for (let a = 0; a < 40; a += 1) for (let b = 0; b < 40; b += 1) mkdirSync(join(root, 'Assets', `Group${a}`, `Item${b}`, 'Textures'), { recursive: true });
    for (let a = 0; a < 200; a += 1) mkdirSync(join(root, 'Library', `Cache${a}`, 'x'), { recursive: true });
    write('AgentContext/PROJECT_CONTEXT.md');

    const started = performance.now();
    const result = detectContext(root);
    const elapsed = performance.now() - started;

    expect(result.found).toEqual([join(root, 'AgentContext')]);
    expect(result.complete).toBe(true);
    expect(elapsed).toBeLessThan(2000);
    expect(detectContext(root, 100).complete).toBe(false);
  });
});

describe('moving context files (ADR-020 item 5)', () => {
  it('lists every file, copies them into a folder with accented names, and reports files already there', () => {
    write('cũ/README.md', 'readme');
    write('cũ/Workstreams/combo/STATUS.md', 'status');
    write('cũ/.DS_Store', 'finder');
    symlinkSync('README.md', join(root, 'cũ', 'link.md'));
    const files = contextFiles(join(root, 'cũ'));
    expect(files).toEqual(['README.md', 'Workstreams/combo/STATUS.md', 'link.md']);

    const target = join(root, 'Tài liệu mới');
    mkdirSync(target);
    expect(conflictingFiles(target, files)).toEqual([]);
    copyContextFiles(join(root, 'cũ'), target, files);

    expect(contextFiles(target)).toEqual(files);
    expect(conflictingFiles(target, files)).toEqual(files);
    expect(() => copyContextFiles(join(root, 'cũ'), target, ['README.md'])).toThrow();
  });
});
