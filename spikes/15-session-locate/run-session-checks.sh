#!/usr/bin/env bash
# SPIKE-15: locate the newest session of a project folder per account, then have an agent of
# the other provider read it. Uses profile B of SPIKE-01 (Claude) and SPIKE-08 (Codex).
# Each session is one short turn that asks the agent to remember a code word, so the
# transcript content is known and harmless.
# Usage: run-session-checks.sh sessions | locate | read | cleanup
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
runs="$here/local/runs"
fixtures="${SPIKE15_FIXTURES:-$HOME/.agenthub-spike/spike15}"
claude_b="${CLAUDE_B_ROOT:-$HOME/.agenthub-spike/claude-b}"
codex_b="${CODEX_HOME_B:-$HOME/.agenthub-spike/codex-b}"
mkdir -p "$runs"

src="$fixtures/src dự án"                # the project folder
sibling="$fixtures/src-dự-án"            # different folder, same Claude directory name
sub="$src/app"                           # a subfolder of the project
nfd="$(node -e 'process.stdout.write(process.argv[1].normalize("NFD"))' "$fixtures/nfd dự án")"  # name stored decomposed
long="$fixtures/$(printf 'thu-muc-rat-dai-%.0s' {1..14})end"   # longer than Claude's 200-char directory names
target="$fixtures/target"
ids="$runs/ids.txt"

claude_turn() { # label folder marker [resume-id]
  local label="$1" dir="$2" marker="$3" resume=()
  [ -n "${4:-}" ] && resume=(--resume "$4")
  local id
  id="$(cd "$dir" && CLAUDE_CONFIG_DIR="$claude_b" claude -p --output-format json ${resume[@]+"${resume[@]}"} \
    "Remember the code word $marker. Reply with just OK." </dev/null 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).session_id))')"
  echo "claude $label $marker $id" | tee -a "$ids"
  sleep 2
}

codex_turn() { # label folder marker [resume-id]
  local label="$1" dir="$2" marker="$3"
  local cmd=(codex exec --json --ignore-user-config --skip-git-repo-check -s read-only -C "$dir")
  [ -n "${4:-}" ] && cmd=(codex exec resume --json --ignore-user-config --skip-git-repo-check "$4")
  local id
  id="$(cd "$dir" && CODEX_HOME="$codex_b" "${cmd[@]}" "Remember the code word $marker. Reply with just OK. Do not run any tools." \
    </dev/null 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const l of s.split("\n")){try{const j=JSON.parse(l);if(j.type==="thread.started"){console.log(j.thread_id);return}}catch{}}console.log("none")})')"
  echo "codex $label $marker $id" | tee -a "$ids"
  sleep 2
}

sessions() {
  mkdir -p "$src" "$sibling" "$sub" "$nfd" "$long" "$target"
  : > "$ids"
  for p in claude codex; do
    local turn="${p}_turn"
    $turn src-1 "$src" "AMBER-$p"
    $turn src-2 "$src" "BIRCH-$p"
    $turn sibling "$sibling" "CEDAR-$p"
    $turn nfd "$nfd" "DUNE-$p"
    $turn long "$long" "EMBER-$p"
  done
  # Resume the first session after the others, so the newest activity is in an older session.
  claude_turn src-1-resumed "$src" "FJORD-claude" "$(awk '$1=="claude" && $2=="src-1"{print $4}' "$ids")"
  codex_turn src-1-resumed "$src" "FJORD-codex" "$(awk '$1=="codex" && $2=="src-1"{print $4}' "$ids")"
  # The subfolder last: newest only when subfolders are included.
  claude_turn sub "$sub" "GROVE-claude"
  codex_turn sub "$sub" "GROVE-codex"
}

show() { # json from locate.mjs -> newest path, id, count, time
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const c=j.candidates[0]||{};console.log(`  ${j.method}: ${j.count} found in ${j.ms} ms; newest ${(c.sessionId||c.threadId||"-")} ${c.exactDirName===false?"(dir name not the plain encoding) ":""}${c.projectDir?("dir "+c.projectDir.length+" chars"):""}`)})'
}

locate() {
  cat "$ids"
  for folder in "$src" "$sibling" "$nfd" "$long"; do
    # Look the folder up by its NFC spelling, as AgentHub would store it.
    local nfc; nfc="$(node -e 'process.stdout.write(process.argv[1].normalize("NFC"))' "$folder")"
    echo "== ${nfc#$fixtures/}"
    node "$here/locate.mjs" claude "$claude_b" "$nfc" | show
    node "$here/locate.mjs" codex-db "$codex_b" "$nfc" | show
    node "$here/locate.mjs" codex-scan "$codex_b" "$nfc" | show
  done
  echo "== src dự án, with subfolders"
  node "$here/locate.mjs" claude "$claude_b" "$src" --subfolders | show
  node "$here/locate.mjs" codex-db "$codex_b" "$src" --subfolders | show
  node "$here/locate.mjs" codex-scan "$codex_b" "$src" --subfolders | show
}

newest() { node "$here/locate.mjs" "$1" "$2" "$src" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).candidates[0].path))'; }

read_prompt() { echo "The file $1 is the JSONL transcript of an earlier agent session. Read only its last 40 lines (for example with tail -n 40), do not open any other file, and report the code word the user most recently asked to remember. Reply with the code word only."; }

read_cross() {
  local claude_file codex_file
  claude_file="$(newest claude "$claude_b")"
  codex_file="$(newest codex-db "$codex_b")"
  echo "== Codex (read-only sandbox) reads the newest Claude session of src"
  CODEX_HOME="$codex_b" codex exec --ephemeral --ignore-user-config --skip-git-repo-check -s read-only -C "$target" \
    "$(read_prompt "$claude_file")" </dev/null 2>/dev/null | tail -2
  echo "== Claude reads the newest Codex session of src, no extra permission"
  (cd "$target" && CLAUDE_CONFIG_DIR="$claude_b" claude -p "$(read_prompt "$codex_file")" </dev/null 2>&1 | tail -3 | sed -E "s#$HOME#~#g")
  echo "== Claude reads it with --add-dir=<session folder>"
  (cd "$target" && CLAUDE_CONFIG_DIR="$claude_b" claude -p "--add-dir=$(dirname "$codex_file")" "$(read_prompt "$codex_file")" </dev/null 2>&1 | tail -3)
}

cleanup() {
  # Session files of the spike folders stay in profile B; remove only the fixtures.
  rm -rf "$fixtures"
  echo "removed $fixtures"
}

case "${1:-}" in
  sessions) sessions ;;
  locate) locate ;;
  read) read_cross ;;
  cleanup) cleanup ;;
  *) echo "Usage: $0 sessions | locate | read | cleanup" >&2; exit 2 ;;
esac
