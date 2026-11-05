import { describe, expect, it } from 'vitest';
import {
  applyTaskEdit,
  newTaskDocument,
  nextTaskId,
  parseTaskDocument,
  setStatusState,
  stateGroup,
  taskSlug,
  verifiedHandoff,
} from '../src/index';

const TASK = `# TASK-016 Intro

Owner: playable team.

## Goal

A five second intro the player can skip.

## Acceptance criteria

- [x] Tap anywhere skips
- [ ] Runs on Android 10

## Risks

\`\`\`
## not a heading inside code
\`\`\`
Asset size.

## Handoff log

### 2026-11-05 14:00 — Claude / account b
- **Done:** scene set up.
`;

describe('parseTaskDocument', () => {
  it('splits a task into its sections and knows the usual ones in three languages', () => {
    const document = parseTaskDocument(TASK);
    expect(document.title).toBe('TASK-016 Intro');
    expect(document.sections.map((section) => [section.heading, section.kind])).toEqual([
      ['Goal', 'goal'],
      ['Acceptance criteria', 'criteria'],
      ['Risks', 'other'],
      ['Handoff log', 'handoff'],
    ]);
    expect(document.sections[2]?.body).toContain('## not a heading inside code');
    expect(parseTaskDocument('# T\n\n## Mục tiêu\nx\n## Tiêu chí hoàn thành\n## 메모\n').sections.map((section) => section.kind)).toEqual(['goal', 'criteria', 'notes']);
  });
});

describe('applyTaskEdit', () => {
  it('changes only what was edited and leaves everything else byte for byte', () => {
    const document = parseTaskDocument(TASK);
    const criteria = document.sections.find((section) => section.kind === 'criteria');
    const edited = applyTaskEdit(TASK, { title: 'TASK-016 Intro', bodies: [{ id: criteria?.id ?? -1, body: '- [x] Tap anywhere skips\n- [x] Runs on Android 10' }], added: [] }, 'en');

    expect(edited).toBe(TASK.replace('- [ ] Runs on Android 10', '- [x] Runs on Android 10'));
  });

  it('never touches the handoff log, and adds missing sections before it', () => {
    const document = parseTaskDocument(TASK);
    const handoff = document.sections.find((section) => section.kind === 'handoff');
    const edited = applyTaskEdit(
      TASK,
      { title: 'TASK-016 Intro, skippable', bodies: [{ id: handoff?.id ?? -1, body: 'gone' }], added: [{ kind: 'notes', body: 'Ask design about the logo.' }] },
      'vi',
    );

    expect(edited).toContain('# TASK-016 Intro, skippable\n');
    expect(edited).toContain('### 2026-11-05 14:00 — Claude / account b');
    expect(edited.indexOf('## Ghi chú\n\nAsk design about the logo.')).toBeLessThan(edited.indexOf('## Handoff log'));
    expect(parseTaskDocument(edited).sections.map((section) => section.kind)).toEqual(['goal', 'criteria', 'other', 'notes', 'handoff']);
  });

  it('gives a file without a title one, and keeps a missing section from being added twice', () => {
    expect(applyTaskEdit('Some notes.\n', { title: 'TASK-001 New', bodies: [], added: [] }, 'en')).toBe('# TASK-001 New\n\nSome notes.\n');
    const once = applyTaskEdit(TASK, { title: '', bodies: [], added: [{ kind: 'goal', body: 'again' }] }, 'en');
    expect(once).toBe(TASK);
  });
});

describe('a new task', () => {
  it('numbers after the highest id anywhere, and slugs titles in any language', () => {
    expect(nextTaskId(['TASK-003', 'TASK-016', 'TASK-9'])).toBe('TASK-017');
    expect(nextTaskId([])).toBe('TASK-001');
    expect(taskSlug('Màn hình Đăng nhập & "Intro"!')).toBe('man-hinh-dang-nhap-intro');
    expect(taskSlug('인트로')).toBe('task');
  });

  it('starts from a template in the documents language, with an English handoff log', () => {
    const text = newTaskDocument({ id: 'TASK-017', title: 'Outro', goal: 'Thank the player.', language: 'ko' });
    expect(parseTaskDocument(text).sections.map((section) => [section.kind, section.body])).toEqual([
      ['goal', 'Thank the player.'],
      ['criteria', ''],
      ['notes', ''],
      ['handoff', ''],
    ]);
    expect(text).toMatch(/^# TASK-017 Outro\n/);
  });
});

describe('task states in STATUS (ADR-021 item 4)', () => {
  const STATUS = '# Playable 005\n\nBranch: `feature/intro`\n\n| Task | Status | Owner |\n|---|---|---|\n| TASK-016 Intro | **in progress** | a |\n| TASK-017 Outro | todo | b |\n\nNext: polish.\n';

  it('rewrites only the state cell of the task', () => {
    expect(setStatusState(STATUS, { id: 'TASK-016', title: 'Intro' }, 'Done', 'Playable 005')).toBe(STATUS.replace('| **in progress** |', '| Done |'));
  });

  it('adds a row after the other tasks, or a table, or a whole STATUS', () => {
    const added = setStatusState(STATUS, { id: 'TASK-018', title: 'TASK-018 Credits' }, 'To do', 'Playable 005');
    expect(added).toContain('| TASK-017 Outro | todo | b |\n| TASK-018 Credits | To do |\n\nNext: polish.');
    expect(setStatusState('# W\n\nNo table yet.\n', { id: 'TASK-001', title: 'A' }, 'Chờ', 'W')).toBe('# W\n\nNo table yet.\n\n## Tasks\n\n| Task | Status |\n|---|---|\n| TASK-001 A | Chờ |\n');
    expect(setStatusState(null, { id: 'TASK-001', title: 'A' }, '대기', 'Combo')).toContain('# Combo\n\n## Tasks');
  });

  it('does not mistake TASK-1 for TASK-10', () => {
    const status = '| TASK-10 Ten | todo |\n| TASK-1 One | todo |\n';
    expect(setStatusState(status, { id: 'TASK-1', title: 'One' }, 'Done', 'W')).toBe('| TASK-10 Ten | todo |\n| TASK-1 One | Done |\n');
  });

  it('groups what agents wrote into the four states, in three languages', () => {
    expect(['Done', 'xong', '완료', 'cancelled'].map(stateGroup)).toEqual(['done', 'done', 'done', 'done']);
    expect(['Blocked', 'bị chặn', '막힘', 'on hold'].map(stateGroup)).toEqual(['blocked', 'blocked', 'blocked', 'blocked']);
    expect(['In progress', 'Đang làm', '진행 중', 'WIP'].map(stateGroup)).toEqual(['active', 'active', 'active', 'active']);
    expect(['todo', 'Chờ', 'later'].map(stateGroup)).toEqual(['todo', 'todo', 'todo']);
    expect(stateGroup(null)).toBeNull();
  });

  it('writes the user confirmation as a dated handoff entry the overview can read', () => {
    expect(verifiedHandoff(new Date(2026, 10, 6, 9, 5), 'en')).toBe('### 2026-11-06 09:05 — AgentHub\n- **Verified by user in AgentHub:** marked Done.');
  });
});
