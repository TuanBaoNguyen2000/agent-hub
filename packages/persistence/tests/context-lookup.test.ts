import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContextOverview } from '@agenthub/application';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ContextProjectEntry } from '../src/context-catalog';
import { findContextTasks, foldText, inboxCount, matchProject, taskDetails } from '../src/context-lookup';

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'agenthub-lookup-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const entry = (name: string, path: string, documents = true): ContextProjectEntry => ({
  id: name,
  name,
  language: 'en',
  documents,
  root: path,
  folder: join(path, 'AgentContext'),
  handoffs: join(root, 'handoffs', name),
});

describe('matchProject', () => {
  it('matches through a symbolic link to the project folder', () => {
    mkdirSync(join(root, 'real', 'game', 'src'), { recursive: true });
    symlinkSync(join(root, 'real'), join(root, 'link'), 'dir');
    const game = entry('Game', join(root, 'link', 'game'));
    expect(matchProject([game], join(root, 'real', 'game', 'src'))?.project.name).toBe('Game');
    expect(matchProject([entry('Real', join(root, 'real', 'game'))], join(root, 'link', 'game'))?.project.name).toBe('Real');
  });

  it('ignores the context folder of a project without documents and relative paths', () => {
    const plain = entry('Plain', join(root, 'plain'), false);
    expect(matchProject([plain], join(root, 'plain', 'AgentContext'))?.matched).toBe('root');
    expect(matchProject([{ ...plain, root: join(root, 'elsewhere') }], join(root, 'plain', 'AgentContext'))).toBeNull();
    expect(matchProject([plain], 'plain')).toBeNull();
  });
});

describe('task lookup', () => {
  const overview: ContextOverview = {
    initialized: true,
    filled: true,
    issues: [],
    workstreams: [
      {
        slug: 'Workstreams/main',
        title: 'Main',
        branch: null,
        tasks: [
          { ref: 'Workstreams/main/Tasks/TASK-010-đường-đi.md', id: 'TASK-010', title: 'TASK-010 Đường đi của quái', state: null, criteria: null, lastHandoff: null },
          { ref: 'Workstreams/main/Tasks/TASK-100-menu.md', id: 'TASK-100', title: 'TASK-100 Menu', state: null, criteria: null, lastHandoff: null },
        ],
      },
    ],
  };

  it('folds case and Vietnamese marks', () => {
    expect(foldText('Đường ĐI Trạng Thái')).toBe('duong di trang thai');
    expect(foldText('이어서')).toBe('이어서');
  });

  it('reads numbers without mixing 10 and 100, and title words in any order', () => {
    expect(findContextTasks(overview, '10').map((task) => task.id)).toEqual(['TASK-010']);
    expect(findContextTasks(overview, 'TASK-0100').map((task) => task.id)).toEqual(['TASK-100']);
    expect(findContextTasks(overview, 'qua duong').map((task) => task.id)).toEqual(['TASK-010']);
    expect(findContextTasks(overview, '   ')).toEqual([]);
  });

  it('reads goal, checklist and only the newest handoff entry', () => {
    const text = '# TASK-001 X\nStatus: To do\n\n## Mục tiêu\n\nLàm X.\n\n## Tiêu chí\n\n- [X] A\n* [ ] B\n- not an item\n\n## Handoff log\n\n### 2026-11-10 — A / x\nnew\n#### detail\nmore\n### 2026-11-09 — B / y\nold\n';
    expect(taskDetails(text)).toEqual({ goal: 'Làm X.', criteria: ['[x] A', '[ ] B'], newestHandoff: '### 2026-11-10 — A / x\nnew\n#### detail\nmore' });
    expect(taskDetails('# Only a title\n')).toEqual({ goal: null, criteria: [], newestHandoff: null });
  });

  it('counts Inbox notes, not the archive', () => {
    expect(inboxCount(join(root, 'none'))).toBe(0);
  });
});
