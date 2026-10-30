#!/usr/bin/env bash
# Shows how claude/codex resolve when a process does not inherit a terminal's
# PATH, as with an app opened from Finder or the Dock. Sends no provider requests.
set -uo pipefail

gui=(env -i HOME="$HOME" USER="$USER" LOGNAME="$USER" PATH=/usr/bin:/bin:/usr/sbin:/sbin TMPDIR="${TMPDIR:-/tmp}")
tidy() { sed "s#$HOME#~#g"; }

echo "launchctl PATH: $(launchctl getenv PATH | tidy)"

echo "--- GUI-like PATH"
for b in claude codex node; do
  "${gui[@]}" /bin/sh -c "command -v $b || echo '$b: not found'" | tidy
done

echo "--- zsh -lc (login shell)"
"${gui[@]}" /bin/zsh -lc 'command -v claude || echo "claude: not found"; command -v codex || echo "codex: not found"' 2>&1 | tidy

echo "--- zsh -ilc (interactive login shell)"
resolved="$("${gui[@]}" /bin/zsh -ilc 'command -v claude; command -v codex' 2>/dev/null | tail -2)"
printf '%s\n' "$resolved" | tidy

echo "--- resolved absolute paths under GUI-like PATH"
while IFS= read -r exe; do
  [ -n "$exe" ] || continue
  printf '%s: ' "$(basename "$exe")"
  "${gui[@]}" "$exe" --version 2>&1 | head -1
done <<< "$resolved"
