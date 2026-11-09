// A line diff for small text files such as skills (ADR-026 items 7, 8). Longest common
// subsequence; files too large for that are shown as removed then added.

export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string } | { kind: 'skip'; count: number };

const MAX_CELLS = 4_000_000;

export function lineDiff(before: string, after: string): Exclude<DiffLine, { kind: 'skip' }>[] {
  const a = before === '' ? [] : before.replace(/\r\n/g, '\n').split('\n');
  const b = after === '' ? [] : after.replace(/\r\n/g, '\n').split('\n');
  if (a.length * b.length > MAX_CELLS) {
    return [...a.map((text) => ({ kind: 'del' as const, text })), ...b.map((text) => ({ kind: 'add' as const, text }))];
  }
  // lengths[i][j]: common lines of a[i..] and b[j..].
  const width = b.length + 1;
  const lengths = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i * width + j] = a[i] === b[j] ? (lengths[(i + 1) * width + j + 1] ?? 0) + 1 : Math.max(lengths[(i + 1) * width + j] ?? 0, lengths[i * width + j + 1] ?? 0);
    }
  }
  const lines: Exclude<DiffLine, { kind: 'skip' }>[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i] as string });
      i += 1;
      j += 1;
    } else if ((lengths[(i + 1) * width + j] ?? 0) >= (lengths[i * width + j + 1] ?? 0)) {
      lines.push({ kind: 'del', text: a[i] as string });
      i += 1;
    } else {
      lines.push({ kind: 'add', text: b[j] as string });
      j += 1;
    }
  }
  while (i < a.length) lines.push({ kind: 'del', text: a[i++] as string });
  while (j < b.length) lines.push({ kind: 'add', text: b[j++] as string });
  return lines;
}

// Keeps `context` unchanged lines around each change and folds the rest.
export function foldUnchanged(lines: readonly Exclude<DiffLine, { kind: 'skip' }>[], context = 3): DiffLine[] {
  const near = lines.map(() => false);
  lines.forEach((line, index) => {
    if (line.kind === 'same') return;
    for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k += 1) near[k] = true;
  });
  const folded: DiffLine[] = [];
  let skipped = 0;
  lines.forEach((line, index) => {
    if (line.kind === 'same' && !near[index]) {
      skipped += 1;
      return;
    }
    if (skipped > 0) folded.push({ kind: 'skip', count: skipped });
    skipped = 0;
    folded.push(line);
  });
  if (skipped > 0) folded.push({ kind: 'skip', count: skipped });
  return folded;
}

export type FileChange = 'added' | 'removed' | 'changed' | 'same';

// Which files differ between two versions of a skill, by path.
export function fileChanges(before: readonly { path: string; text: string | null }[], after: readonly { path: string; text: string | null }[]): { path: string; change: FileChange }[] {
  const old = new Map(before.map((file) => [file.path, file.text]));
  const now = new Map(after.map((file) => [file.path, file.text]));
  return [...new Set([...old.keys(), ...now.keys()])].sort().map((path) => ({
    path,
    change: !old.has(path) ? 'added' : !now.has(path) ? 'removed' : old.get(path) === now.get(path) ? 'same' : 'changed',
  }));
}
