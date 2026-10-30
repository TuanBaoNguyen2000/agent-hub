#!/usr/bin/env bash
# Asks Claude CLI and Codex CLI which fixture tokens are in their loaded project
# instructions. Sends one prompt per variant per CLI using the current default login.
# Usage: run-cli-checks.sh <fixture-root> [out-dir] [claude|codex|all]
# Codex runs with --ignore-user-config so personal config.toml (model, MCP servers,
# fallback filenames) does not affect discovery; auth still comes from CODEX_HOME.
set -euo pipefail

root="${1:?fixture root required}"
here="$(cd "$(dirname "$0")" && pwd)"
out="${2:-$here/local/$(date +%Y%m%d-%H%M%S)}"
only="${3:-all}"
mkdir -p "$out"

# Start each CLI from an allowlisted environment so variables exported by a host
# agent session (CLAUDE_*, ANTHROPIC_*, CODEX_*) cannot change auth or loading.
clean=(env -i HOME="$HOME" USER="$USER" LOGNAME="${LOGNAME:-$USER}" PATH="$PATH"
  SHELL="${SHELL:-/bin/zsh}" TMPDIR="${TMPDIR:-/tmp}" LANG="${LANG:-en_US.UTF-8}" TERM=dumb)

prompt='Without using any tools or reading files, list every token that starts with SPIKE04- and appears in the project instructions already loaded into your context. Reply with the tokens only, one per line, or NONE.'

{
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "os: $(sw_vers -productVersion 2>/dev/null || uname -sr) $(uname -m)"
  echo "claude: $("${clean[@]}" claude --version 2>&1)"
  echo "codex: $("${clean[@]}" codex --version 2>&1)"
  echo "env: allowlisted (HOME USER LOGNAME PATH SHELL TMPDIR LANG TERM)"
} > "$out/versions.txt"

for variant in a-agents-only b-both-no-import c-claude-imports-agents; do
  dir="$root/$variant"
  echo "== $variant"

  if [ "$only" != codex ]; then
    (cd "$dir" && "${clean[@]}" claude -p --tools "" --no-session-persistence "$prompt") \
      > "$out/$variant.claude.txt" 2>&1 || echo "claude exit $?" >> "$out/$variant.claude.txt"
    echo "claude: $(tr '\n' ' ' < "$out/$variant.claude.txt")"
  fi

  if [ "$only" != claude ]; then
    "${clean[@]}" codex exec --ignore-user-config --sandbox read-only --ephemeral --json \
      -C "$dir" -o "$out/$variant.codex.txt" "$prompt" < /dev/null \
      > "$out/$variant.codex.jsonl" 2>&1 || echo "codex exit $?" >> "$out/$variant.codex.txt"
    echo "codex:  $(tr '\n' ' ' < "$out/$variant.codex.txt" 2>/dev/null)"
  fi
done

echo "Raw output: $out"
