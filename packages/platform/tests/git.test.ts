import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGitObserver, createMacPlatform } from '../src/index';

let root: string;
let repo: string;

const git = (...args: string[]): string =>
  execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { encoding: 'utf8' }).trim();

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agenthub-git-'));
  repo = join(root, 'Dự án');
  mkdirSync(join(repo, 'src'), { recursive: true });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'src', 'a.txt'), 'a');
  git('add', '.');
  git('commit', '-qm', 'init');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const observer = () => createGitObserver(createMacPlatform());

describe('createGitObserver (ADR-017)', () => {
  it('reads root, branch, HEAD, its time and a clean tree, from a subfolder too', async () => {
    const seen = await observer().observe(join(repo, 'src'));

    expect(seen).toMatchObject({ state: 'repo', branch: 'main', head: git('rev-parse', 'HEAD'), dirty: false });
    expect(seen.root?.normalize('NFC')).toContain('Dự án'.normalize('NFC'));
    expect(Date.parse(seen.headAt ?? '')).toBe(Date.parse(git('log', '-1', '--format=%cI')));
  });

  it('sees untracked and modified files as dirty, without touching the index', async () => {
    writeFileSync(join(repo, 'src', 'a.txt'), 'changed');
    writeFileSync(join(repo, 'new.txt'), 'x');
    const index = statSync(join(repo, '.git', 'index')).mtimeMs;

    expect((await observer().observe(repo)).dirty).toBe(true);
    expect(statSync(join(repo, '.git', 'index')).mtimeMs).toBe(index);
    expect(readdirSync(join(repo, '.git')).filter((name) => name.endsWith('.lock'))).toEqual([]);
  });

  it('reports a detached HEAD as no branch', async () => {
    git('checkout', '-q', '--detach');
    expect(await observer().observe(repo)).toMatchObject({ state: 'repo', branch: null });
  });

  it('reports a folder outside any repository', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'agenthub-plain-'));
    try {
      expect(await observer().observe(plain)).toMatchObject({ state: 'not_repo', branch: null, dirty: null });
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it('treats a repository with no commit yet as having no HEAD', async () => {
    const empty = join(root, 'empty');
    mkdirSync(empty);
    execFileSync('git', ['-C', empty, 'init', '-q', '-b', 'dev']);
    expect(await observer().observe(empty)).toMatchObject({ state: 'repo', branch: 'dev', head: null, headAt: null, dirty: false });
  });

  it('stays unknown, without running anything, when only the Xcode stub of git exists', async () => {
    const runs: string[][] = [];
    const stubbed = createGitObserver({
      findCli: async () => '/usr/bin/git',
      run: async (executable, args) => {
        runs.push([executable, ...args]);
        return { exit: 2, stdout: '', stderr: '', timedOut: false, errorCode: null };
      },
    });

    expect((await stubbed.observe(repo)).state).toBe('unknown');
    expect(runs).toEqual([['/usr/bin/xcode-select', '-p']]);
  });
});
