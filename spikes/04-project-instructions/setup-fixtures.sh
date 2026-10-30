#!/usr/bin/env bash
# Creates SPIKE-04 fixture projects outside this repository.
# Usage: setup-fixtures.sh [fixture-root]   (default: $TMPDIR/agenthub-spike04)
set -euo pipefail

root="${1:-${TMPDIR:-/tmp}/agenthub-spike04}"

# Parent instruction files would also load and contaminate the result.
dir="$(cd "$(dirname "$root")" 2>/dev/null && pwd || echo /)"
while [ "$dir" != "/" ]; do
  for f in CLAUDE.md AGENTS.md .claude/CLAUDE.md CLAUDE.local.md; do
    if [ -e "$dir/$f" ]; then
      echo "Refusing: $dir/$f is above the fixture root" >&2
      exit 1
    fi
  done
  dir="$(dirname "$dir")"
done

marker=".agenthub-spike04"
if [ -d "$root" ] && [ -n "$(ls -A "$root")" ] && [ ! -e "$root/$marker" ]; then
  echo "Refusing: $root is not empty and was not created by this script" >&2
  exit 1
fi
rm -rf "$root"
mkdir -p "$root"
touch "$root/$marker"

make_variant() {
  local name="$1"
  mkdir -p "$root/$name"
  git -C "$root/$name" init -q
}

# A: AGENTS.md only
make_variant a-agents-only
printf '# Fixture A\n\nProject token: SPIKE04-A-AGENTS\n' > "$root/a-agents-only/AGENTS.md"

# B: CLAUDE.md and AGENTS.md, no import
make_variant b-both-no-import
printf '# Fixture B\n\nProject token: SPIKE04-B-CLAUDE\n' > "$root/b-both-no-import/CLAUDE.md"
printf '# Fixture B\n\nProject token: SPIKE04-B-AGENTS\n' > "$root/b-both-no-import/AGENTS.md"

# C: CLAUDE.md imports AGENTS.md (AgentHub's own layout)
make_variant c-claude-imports-agents
printf '# Fixture C\n\nProject token: SPIKE04-C-CLAUDE\n\n@AGENTS.md\n' > "$root/c-claude-imports-agents/CLAUDE.md"
printf '# Fixture C\n\nProject token: SPIKE04-C-AGENTS\n' > "$root/c-claude-imports-agents/AGENTS.md"

echo "$root"
