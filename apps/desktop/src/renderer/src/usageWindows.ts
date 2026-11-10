// The 5-hour and weekly windows when the account has them; an account with only another limit,
// such as Codex free's 30 days, shows that one instead of nothing (backlog I5).
export function shownWindows<T extends { kind: string }>(windows: readonly T[]): T[] {
  const known = windows.filter((window) => window.kind !== 'other');
  return (known.length > 0 ? known : windows).slice(0, 2);
}
