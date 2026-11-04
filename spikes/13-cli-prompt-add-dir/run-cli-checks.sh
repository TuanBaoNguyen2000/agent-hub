#!/usr/bin/env bash
# SPIKE-13: does each CLI take an initial prompt (with hostile characters) from a launch
# script shaped like the product's Terminal.app script, and does --add-dir let the agent
# write a folder outside the workspace? Uses profile B of SPIKE-01 (Claude) and SPIKE-08
# (Codex). Each check sends one short agent turn.
# Usage: run-cli-checks.sh prompt-claude | prompt-codex | add-dir-claude | add-dir-codex | all
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
local_dir="$here/local"
# Fixtures live outside any repo, so no parent CLAUDE.md or AGENTS.md is picked up. Each run
# gets a fresh workspace, so folder trust is asked again and can be observed.
fixtures="${SPIKE13_FIXTURES:-$HOME/.agenthub-spike/spike13}"
workspace="$fixtures/ws $(date +%H%M%S) dự án"
context="$fixtures/context ngoài"
runs="$local_dir/runs"
claude_b="${CLAUDE_B_ROOT:-$HOME/.agenthub-spike/claude-b}"
codex_b="${CODEX_HOME_B:-$HOME/.agenthub-spike/codex-b}"
mkdir -p "$workspace" "$context" "$runs"

# Single-quote for sh, like shellQuote in packages/platform.
q() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

# The marker carries every character that a careless launcher would break or execute.
marker='SPIKE13 "double" '\''single'\'' $(touch INJECTED) `touch INJECTED2` $HOME ; & | \ tiếng Việt
dòng hai'
prompt="Reply with exactly the text between <<< and >>>, unchanged, and nothing else. Do not run any tools. <<<$marker>>>"

# A launch script shaped like the product's: env -i, every value quoted, then the tool.
launch_script() { # executable env-name env-value args...
  local executable="$1" name="$2" value="$3"
  shift 3
  # Same allowlist as packages/platform: HOME USER LOGNAME SHELL TMPDIR LANG, plus PATH.
  local line="/usr/bin/env -i HOME=$(q "$HOME") USER=$(q "$USER") LOGNAME=$(q "$USER") SHELL=/bin/zsh TMPDIR=$(q "$TMPDIR") LANG=en_US.UTF-8 PATH=$(q "$(dirname "$(command -v node)"):/usr/bin:/bin") $name=$(q "$value") TERM=xterm-256color $(q "$executable")"
  for arg in "$@"; do line="$line $(q "$arg")"; done
  printf '#!/bin/zsh -f\ncd -- %s || exit 126\n%s\n' "$(q "$workspace")" "$line"
}

# Runs a script in a pseudo-terminal for a while, keeping the screen output, then stops it.
run_in_pty() { # name seconds script
  local name="$1" seconds="$2"
  local script_file="$runs/$name.command"
  printf '%s' "$3" > "$script_file"
  chmod 700 "$script_file"
  # TRUST=1 answers a folder-trust dialog: arrow down to "Yes", then Enter.
  { if [ "${TRUST:-0}" = 1 ]; then sleep 6; printf '\033[B'; sleep 1; printf '\r'; fi; sleep "$seconds"; } \
    | /usr/bin/script -q "$runs/$name.typescript" /bin/zsh -f "$script_file" >/dev/null 2>&1 &
  local pid=$!
  sleep "$seconds"
  pkill -P "$pid" 2>/dev/null || true
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

# Compares the first user message of the newest session file with the prompt we sent.
compare_first_prompt() { # session-file
  node - "$1" "$prompt" <<'EOF'
const fs = require('node:fs');
const [file, expected] = process.argv.slice(2);
const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const texts = [];
for (const entry of lines) {
  // Claude: {type:"user", message:{content:string|[{type:"text",text}]}}
  if (entry.type === 'user' && entry.message) {
    const content = entry.message.content;
    texts.push(typeof content === 'string' ? content : (content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''));
  }
  // Codex: {type:"response_item", payload:{type:"message", role:"user", content:[{type:"input_text", text}]}}
  const payload = entry.payload;
  if (entry.type === 'response_item' && payload && payload.type === 'message' && payload.role === 'user') {
    texts.push((payload.content || []).map((c) => c.text || '').join(''));
  }
}
const exact = texts.some((text) => text === expected);
const contains = texts.some((text) => text.includes(expected));
console.log(`prompt in session: exact=${exact} contained=${contains} (user messages: ${texts.length})`);
EOF
}

newest() { find "$1" -name '*.jsonl' -newer "$2" -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1; }

check_injection() {
  for file in INJECTED INJECTED2; do
    if [ -e "$workspace/$file" ]; then echo "INJECTION: $file was created"; rm -f "$workspace/$file"; else echo "no $file"; fi
  done
}

prompt_claude() {
  echo "== Claude: initial prompt through a launch script (interactive, pty, 45 s)"
  local stamp="$runs/stamp-claude"; touch "$stamp"; sleep 1
  # CLAUDE_ADD_DIR=1 puts --add-dir=<context> before the prompt, as a launcher would.
  local extra=()
  [ "${CLAUDE_ADD_DIR:-0}" = 1 ] && extra=("--add-dir=$context")
  run_in_pty prompt-claude 45 "$(launch_script "$(command -v claude)" CLAUDE_CONFIG_DIR "$claude_b" ${extra[@]+"${extra[@]}"} "$prompt")"
  local session; session="$(newest "$claude_b/projects" "$stamp")"
  if [ -n "$session" ]; then compare_first_prompt "$session"; else echo "no new session file (check $runs/prompt-claude.typescript)"; fi
  check_injection
}

prompt_codex() {
  echo "== Codex: initial prompt through a launch script (interactive, pty, 45 s)"
  local stamp="$runs/stamp-codex"; touch "$stamp"; sleep 1
  # CODEX_SANDBOX_ARGS="" drops -s, to see the folder-trust dialog Codex shows by default.
  local sandbox_args=(-s workspace-write)
  [ "${CODEX_SANDBOX_ARGS-x}" = "" ] && sandbox_args=()
  run_in_pty prompt-codex 45 "$(launch_script "$(command -v codex)" CODEX_HOME "$codex_b" -C "$workspace" ${sandbox_args[@]+"${sandbox_args[@]}"} "$prompt")"
  local session; session="$(newest "$codex_b/sessions" "$stamp")"
  if [ -n "$session" ]; then compare_first_prompt "$session"; else echo "no new session file (check $runs/prompt-codex.typescript)"; fi
  check_injection
}

add_dir_claude() {
  for variant in ${CLAUDE_VARIANTS:-without with}; do
    local target="$context/claude-$variant.md" extra=()
    rm -f "$target"
    # --add-dir takes several values, so "--add-dir DIR PROMPT" would eat the prompt as a
    # second directory. The = form takes exactly one.
    [ "$variant" = with ] && extra=("--add-dir=$context")
    echo "== Claude -p, acceptEdits, $variant --add-dir"
    (cd "$workspace" && CLAUDE_CONFIG_DIR="$claude_b" claude -p --permission-mode acceptEdits ${extra[@]+"${extra[@]}"} \
      "Use the Write tool once to create the file $target with the content 'claude $variant add-dir'. Do not use Bash. Report whether it succeeded and the exact error if not." \
      </dev/null 2>&1 | tail -4 | sed -E "s#$HOME#~#g")
    echo "file created: $([ -e "$target" ] && echo yes || echo no)"
  done
}

add_dir_codex() {
  for variant in without with; do
    local target="$context/codex-$variant.md" extra=()
    rm -f "$target"
    [ "$variant" = with ] && extra=(--add-dir "$context")
    echo "== codex exec, workspace-write, $variant --add-dir"
    CODEX_HOME="$codex_b" codex exec --ephemeral --ignore-user-config --skip-git-repo-check -C "$workspace" -s workspace-write \
      ${extra[@]+"${extra[@]}"} \
      "Run exactly one shell command: touch '$target' . Report the exit status and any error. Do not retry or work around failures." \
      </dev/null 2>/dev/null | tail -3 | sed -E "s#$HOME#~#g"
    echo "file created: $([ -e "$target" ] && echo yes || echo no)"
  done
}

case "${1:-}" in
  prompt-claude) prompt_claude ;;
  prompt-codex) prompt_codex ;;
  add-dir-claude) add_dir_claude ;;
  add-dir-codex) add_dir_codex ;;
  all) prompt_claude; prompt_codex; add_dir_claude; add_dir_codex ;;
  *) echo "Usage: $0 prompt-claude | prompt-codex | add-dir-claude | add-dir-codex | all" >&2; exit 2 ;;
esac
