import { describe, expect, it } from 'vitest';
import { fileChanges, foldUnchanged, lineDiff } from '../src/renderer/src/lineDiff';

// ADR-026 items 7, 8: what the skill viewer shows as changed.
describe('lineDiff', () => {
  it('marks removed and added lines around common ones', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc\nd')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'add', text: 'x' },
      { kind: 'same', text: 'c' },
      { kind: 'add', text: 'd' },
    ]);
    expect(lineDiff('', 'new')).toEqual([{ kind: 'add', text: 'new' }]);
    expect(lineDiff('same\r\n', 'same\n')).toEqual([
      { kind: 'same', text: 'same' },
      { kind: 'same', text: '' },
    ]);
  });

  it('folds long unchanged runs, keeping context around changes', () => {
    const before = Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n');
    const after = before.replace('line 10', 'line ten');
    const folded = foldUnchanged(lineDiff(before, after), 2);
    expect(folded[0]).toEqual({ kind: 'skip', count: 8 });
    expect(folded.filter((line) => line.kind !== 'skip').map((line) => ('text' in line ? line.text : ''))).toEqual(['line 8', 'line 9', 'line 10', 'line ten', 'line 11', 'line 12']);
    expect(folded.at(-1)).toEqual({ kind: 'skip', count: 7 });
  });

  it('lists files added, removed and changed between two versions', () => {
    const before = [
      { path: 'SKILL.md', text: 'v1' },
      { path: 'old.md', text: 'x' },
      { path: 'same.md', text: 's' },
    ];
    const after = [
      { path: 'SKILL.md', text: 'v2' },
      { path: 'same.md', text: 's' },
      { path: 'scripts/a.sh', text: 'echo' },
    ];
    expect(fileChanges(before, after)).toEqual([
      { path: 'SKILL.md', change: 'changed' },
      { path: 'old.md', change: 'removed' },
      { path: 'same.md', change: 'same' },
      { path: 'scripts/a.sh', change: 'added' },
    ]);
  });
});
