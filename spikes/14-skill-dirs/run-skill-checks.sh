#!/usr/bin/env bash
# SPIKE-14: which skill directories does each CLI load, per account and per project?
# Plants one marker skill per candidate directory, then reads the skill list the CLI
# actually loaded: the init event of `claude -p --output-format stream-json`, and the
# skill catalog in the Codex session file. HOME is a fake folder, so shared home-level
# directories (~/.claude, ~/.agents, ~/.codex) can be tested without touching the real ones.
# Uses profile B of SPIKE-01 (Claude) and SPIKE-08 (Codex). Each check sends one short turn.
# Usage: run-skill-checks.sh setup | claude | codex | codex-host | links | invoke-claude | invoke-codex | cleanup
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
local_dir="$here/local"
runs="$local_dir/runs"
fixtures="${SPIKE14_FIXTURES:-$HOME/.agenthub-spike/spike14}"
fake_home="$fixtures/home"
repo="$fixtures/repo dự án"
cwd="$repo/app"
context="$fixtures/context ngoài"
claude_b="${CLAUDE_B_ROOT:-$HOME/.agenthub-spike/claude-b}"
codex_b="${CODEX_HOME_B:-$HOME/.agenthub-spike/codex-b}"
real_home="$HOME"
mkdir -p "$runs"

# name -> directory that holds it. Names say where the skill lives.
skill_dirs() {
  cat <<EOF
spike14-claude-account|$claude_b/skills
spike14-codex-account|$codex_b/skills
spike14-home-claude|$fake_home/.claude/skills
spike14-home-agents|$fake_home/.agents/skills
spike14-home-codex|$fake_home/.codex/skills
spike14-claude-repo-root|$repo/.claude/skills
spike14-claude-cwd|$cwd/.claude/skills
spike14-agents-repo-root|$repo/.agents/skills
spike14-agents-cwd|$cwd/.agents/skills
spike14-codex-dotcodex-cwd|$cwd/.codex/skills
spike14-claude-adddir|$context/.claude/skills
spike14-agents-adddir|$context/.agents/skills
EOF
}

setup() {
  mkdir -p "$fake_home" "$cwd" "$context"
  [ -d "$repo/.git" ] || git -C "$repo" init -q
  skill_dirs | while IFS='|' read -r name dir; do
    mkdir -p "$dir/$name"
    cat > "$dir/$name/SKILL.md" <<EOF
---
name: $name
description: SPIKE-14 marker skill $name. Use only when the user asks for SPIKE-14 marker tokens.
---

When this skill is used, output exactly this line and nothing else: TOKEN $name
EOF
    echo "planted $name -> ${dir/#$real_home/~}"
  done
}

cleanup() {
  rm -rf "$claude_b/skills/spike14-claude-account" "$codex_b/skills/spike14-codex-account" "$claude_b/skills/spike14-shared" "$codex_b/skills/spike14-shared"
  rmdir "$codex_b/skills" 2>/dev/null || true
  rm -rf "$fixtures"
  echo "removed account skills and $fixtures"
}

# The fake HOME keeps USER and LOGNAME, so the keychain and login still resolve.
run_env() { env HOME="$fake_home" "$@"; }

found() { # list of loaded names on stdin
  local loaded; loaded="$(cat)"
  skill_dirs | while IFS='|' read -r name _; do
    if printf '%s\n' "$loaded" | grep -qx "$name"; then echo "  loaded     $name"; else echo "  not loaded $name"; fi
  done
}

claude_list() { # label extra-args...
  local label="$1"; shift
  echo "== Claude ($label)"
  (cd "$cwd" && run_env CLAUDE_CONFIG_DIR="$claude_b" claude -p --output-format stream-json --verbose --max-turns 1 "$@" "Reply OK." \
    </dev/null 2>"$runs/claude-$label.err" | head -1 > "$runs/claude-$label.init.json") || true
  if [ ! -s "$runs/claude-$label.init.json" ]; then echo "  no init event:"; sed -E "s#$real_home#~#g" "$runs/claude-$label.err" | tail -3; return; fi
  node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); for (const s of j.skills||[]) console.log(s)' "$runs/claude-$label.init.json" | found
}

codex_list() { # label extra-args...
  local label="$1"; shift
  echo "== Codex ($label)"
  local stamp="$runs/stamp-codex-$label"; touch "$stamp"; sleep 1
  run_env CODEX_HOME="$codex_b" codex exec --ignore-user-config --skip-git-repo-check -C "$cwd" -s read-only "$@" \
    "Reply OK. Do not run any tools." </dev/null >"$runs/codex-$label.out" 2>&1 || true
  local session; session="$(find "$codex_b/sessions" -name '*.jsonl' -newer "$stamp" -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)"
  if [ -z "$session" ]; then echo "  no session file:"; sed -E "s#$real_home#~#g" "$runs/codex-$label.out" | tail -3; return; fi
  cp "$session" "$runs/codex-$label.session.jsonl"
  # The skill catalog is part of the instructions sent to the model; collect every marker name.
  grep -o 'spike14-[a-z-]*' "$session" | sort -u | found
  # Keep the skill roots table (short names r0, r1… map to directories) for the evidence.
  codex_roots "$session" > "$runs/codex-$label.roots.txt"
  sed 's/^/  root /' "$runs/codex-$label.roots.txt"
}

codex_roots() { # session-file
  node - "$1" "$real_home" <<'EOF'
const fs = require('node:fs');
const [file, home] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8');
const roots = new Set();
for (const match of text.matchAll(/- `(r\d+)` = `([^`]*)`/g)) roots.add(`${match[1]} = ${match[2].replaceAll(home, '~')}`);
console.log([...roots].join('\n'));
EOF
}

# Codex with the real HOME: does it pick up ~/.agents/skills/synced (written by Claude Desktop)?
codex_real_home() {
  echo "== Codex (real HOME; roots only)"
  local stamp="$runs/stamp-codex-real"; touch "$stamp"; sleep 1
  CODEX_HOME="$codex_b" codex exec --ignore-user-config --skip-git-repo-check -C "$cwd" -s read-only \
    "Reply OK. Do not run any tools." </dev/null >"$runs/codex-real-home.out" 2>&1 || true
  local session; session="$(find "$codex_b/sessions" -name '*.jsonl' -newer "$stamp" -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)"
  [ -n "$session" ] || { echo "  no session file"; return; }
  codex_roots "$session" | sed 's/^/  root /'
  # Names only of skills listed from home-level roots, to see whether synced skills appear.
  node - "$session" "$real_home" <<'EOF'
const fs = require('node:fs');
const [file, home] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8');
const roots = Object.fromEntries([...text.matchAll(/- `(r\d+)` = `([^`]*)`/g)].map((m) => [m[1], m[2]]));
const names = new Set();
for (const m of text.matchAll(/\n- ([A-Za-z0-9:_-]+): [^\n]*?\(file: (r\d+)\//g)) {
  if ((roots[m[2]] || '').startsWith(`${home}/.agents`)) names.add(`${m[1]} (${roots[m[2]].replace(home, '~')})`);
}
console.log(names.size ? [...names].map((n) => `  from ~/.agents: ${n}`).join('\n') : '  from ~/.agents: none');
EOF
}

invoke_claude() {
  echo "== Claude invokes the project skill"
  (cd "$cwd" && CLAUDE_CONFIG_DIR="$claude_b" claude -p --add-dir="$context" \
    "Use the skill spike14-claude-cwd, then the skill spike14-claude-account, then the skill spike14-claude-adddir. Follow each one. Output only their lines." \
    </dev/null 2>&1 | tail -6)
}

invoke_codex() {
  echo "== Codex uses the account and project skills"
  run_env CODEX_HOME="$codex_b" codex exec --ephemeral --ignore-user-config --skip-git-repo-check -C "$cwd" -s read-only \
    "Use the skill spike14-agents-cwd, then the skill spike14-codex-account. Follow each one. Output only their lines." \
    </dev/null 2>/dev/null | tail -6
}

case "${1:-}" in
  setup) setup ;;
  claude)
    claude_list plain
    claude_list add-dir "--add-dir=$context" ;;
  codex)
    codex_list plain
    codex_list add-dir --add-dir "$context" ;;
  codex-host)
    # skip_host_skill_discovery is "under development" in codex features list.
    codex_list skip-host -c features.skip_host_skill_discovery=true
    codex_real_home ;;
  links)
    # One copy of a skill, linked into both accounts: are symlinked skill folders loaded?
    store="$fixtures/store/spike14-shared"
    mkdir -p "$store"
    printf -- '---\nname: spike14-shared\ndescription: SPIKE-14 marker skill spike14-shared. Use only when the user asks for SPIKE-14 marker tokens.\n---\n\nWhen this skill is used, output exactly this line and nothing else: TOKEN spike14-shared\n' > "$store/SKILL.md"
    mkdir -p "$codex_b/skills"
    ln -sfn "$store" "$claude_b/skills/spike14-shared"
    ln -sfn "$store" "$codex_b/skills/spike14-shared"
    claude_list links >/dev/null
    printf '== Claude (symlinked skill folder): '
    grep -q '"spike14-shared"' "$runs/claude-links.init.json" && echo loaded || echo "not loaded"
    codex_list links >/dev/null
    printf '== Codex (symlinked skill folder): '
    grep -q 'spike14-shared' "$runs/codex-links.session.jsonl" && echo loaded || echo "not loaded" ;;
  invoke-claude) invoke_claude ;;
  invoke-codex) invoke_codex ;;
  cleanup) cleanup ;;
  *) echo "Usage: $0 setup | claude | codex | codex-host | links | invoke-claude | invoke-codex | cleanup" >&2; exit 2 ;;
esac
