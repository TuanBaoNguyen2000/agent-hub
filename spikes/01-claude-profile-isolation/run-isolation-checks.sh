#!/usr/bin/env bash
# SPIKE-01: checks that the default Claude CLI profile and a second profile under
# its own CLAUDE_CONFIG_DIR stay independent. Sends 3 short requests per profile.
# Never reads credential files or the Keychain; account identity is reduced to a
# short hash of `claude auth status` output.
# Usage: run-isolation-checks.sh [fixture-root]   (default: $TMPDIR/agenthub-spike04)
set -uo pipefail

root="${1:-${TMPDIR:-/tmp}/agenthub-spike04}"
b_root="${AGENTHUB_SPIKE_PROFILE_B:-$HOME/.agenthub-spike/claude-b}"
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/local/$(date +%Y%m%d-%H%M%S)"
results="$out/results.txt"
fixture="$root/a-agents-only"

[ -d "$fixture" ] || {
  echo "Missing fixtures; run spikes/04-project-instructions/setup-fixtures.sh first" >&2
  exit 1
}
mkdir -p "$out"

clean=(env -i HOME="$HOME" USER="$USER" LOGNAME="${LOGNAME:-$USER}" PATH="$PATH"
  SHELL="${SHELL:-/bin/zsh}" TMPDIR="${TMPDIR:-/tmp}" LANG="${LANG:-en_US.UTF-8}" TERM=dumb)
run_a() { "${clean[@]}" claude "$@"; }
run_b() { "${clean[@]}" CLAUDE_CONFIG_DIR="$b_root" claude "$@"; }

say() { printf '%s\n' "$*" | tee -a "$results"; }

summarize() {
  python3 -I -c '
import hashlib, json, os, sys
d = json.load(sys.stdin)
identity = (d.get("email") or "") + "|" + (d.get("orgId") or "")
print(json.dumps({
    "loggedIn": d.get("loggedIn"),
    "authMethod": d.get("authMethod"),
    "subscriptionType": d.get("subscriptionType"),
    "configDirectory": (d.get("configDirectory") or "").replace(os.environ["HOME"], "~"),
    "account": hashlib.sha256(identity.encode()).hexdigest()[:12],
}))'
}
field() { python3 -I -c 'import json,sys;print(json.loads(sys.argv[1]).get(sys.argv[2]))' "$1" "$2"; }
session_id() { python3 -I -c 'import json,sys;print(json.load(sys.stdin).get("session_id",""))'; }

status_a="$(run_a auth status 2>/dev/null | summarize)"
status_b="$(run_b auth status 2>/dev/null | summarize)"
acct_a="$(field "$status_a" account)"
acct_b="$(field "$status_b" account)"

say "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
say "claude: $(run_a --version)"
say "== 1. Auth status"
say "A: $status_a"
say "B: $status_b"
if [ "$(field "$status_b" loggedIn)" != True ] || [ "$(field "$status_a" loggedIn)" != True ]; then
  say "STOP: both profiles must be logged in. See README for the login step."
  exit 1
fi
if [ "$acct_a" = "$acct_b" ]; then
  say "RESULT auth: SAME ACCOUNT in both profiles; cannot prove account separation"
else
  say "RESULT auth: PASS, different accounts"
fi

say "== 2. Profile-level instructions"
token_prompt='Without using any tools or reading files, list every token that starts with SPIKE01- and appears in the instructions already loaded into your context. Reply with the tokens only, one per line, or NONE.'
mkdir -p "$b_root"
marker="$b_root/CLAUDE.md"
if [ ! -e "$marker" ]; then
  printf '# SPIKE-01 profile B\n\nProfile token: SPIKE01-B-USER\n' > "$marker"
fi
answer_a="$(cd "$fixture" && run_a -p --tools "" --no-session-persistence "$token_prompt" 2>&1)"
answer_b="$(cd "$fixture" && run_b -p --tools "" --no-session-persistence "$token_prompt" 2>&1)"
say "A: $answer_a"
say "B: $answer_b"
if [ "$answer_a" = NONE ] && [ "$answer_b" = SPIKE01-B-USER ]; then
  say "RESULT instructions: PASS"
else
  say "RESULT instructions: CHECK (expected A=NONE, B=SPIKE01-B-USER)"
fi

say "== 3. Session storage and cross-resume"
sid_a="$(cd "$fixture" && run_a -p --tools "" --output-format json "Reply with the single word ALPHA." 2>/dev/null | session_id)"
sid_b="$(cd "$fixture" && run_b -p --tools "" --output-format json "Reply with the single word BRAVO." 2>/dev/null | session_id)"
# File names only; session contents and credentials are not read.
in_a() { find "$HOME/.claude/projects" -name "$1.jsonl" 2>/dev/null | wc -l | tr -d ' '; }
in_b() { find "$b_root/projects" -name "$1.jsonl" 2>/dev/null | wc -l | tr -d ' '; }
say "session A file count: in A=$(in_a "$sid_a"), in B=$(in_b "$sid_a")"
say "session B file count: in A=$(in_a "$sid_b"), in B=$(in_b "$sid_b")"
cross_ab="$(cd "$fixture" && run_b -p --tools "" --no-session-persistence --resume "$sid_a" "Reply with OK." 2>&1)"; code_ab=$?
cross_ba="$(cd "$fixture" && run_a -p --tools "" --no-session-persistence --resume "$sid_b" "Reply with OK." 2>&1)"; code_ba=$?
say "B resuming A's session: exit=$code_ab, output=$(printf '%s' "$cross_ab" | head -1 | cut -c1-120)"
say "A resuming B's session: exit=$code_ba, output=$(printf '%s' "$cross_ba" | head -1 | cut -c1-120)"
if [ "$(in_a "$sid_a")$(in_b "$sid_a")$(in_a "$sid_b")$(in_b "$sid_b")" = 1001 ] && [ "$code_ab" -ne 0 ] && [ "$code_ba" -ne 0 ]; then
  say "RESULT sessions: PASS"
else
  say "RESULT sessions: CHECK"
fi

say "== 4. Running in parallel"
(cd "$fixture" && run_a -p --tools "" --no-session-persistence "Reply with the single word PARALLEL-A." > "$out/parallel-a.txt" 2>&1; date +%s > "$out/parallel-a.end") &
pid_a=$!
(cd "$fixture" && run_b -p --tools "" --no-session-persistence "Reply with the single word PARALLEL-B." > "$out/parallel-b.txt" 2>&1; date +%s > "$out/parallel-b.end") &
pid_b=$!
started="$(date +%s)"
wait "$pid_a" "$pid_b"
say "started=$started end_a=$(cat "$out/parallel-a.end") end_b=$(cat "$out/parallel-b.end")"
say "A: $(cat "$out/parallel-a.txt")"
say "B: $(cat "$out/parallel-b.txt")"
if [ "$(cat "$out/parallel-a.txt")" = PARALLEL-A ] && [ "$(cat "$out/parallel-b.txt")" = PARALLEL-B ]; then
  say "RESULT parallel: PASS"
else
  say "RESULT parallel: CHECK"
fi

say "== 5. Auth unchanged afterwards"
after_a="$(run_a auth status 2>/dev/null | summarize)"
after_b="$(run_b auth status 2>/dev/null | summarize)"
if [ "$after_a" = "$status_a" ] && [ "$after_b" = "$status_b" ]; then
  say "RESULT auth-after: PASS"
else
  say "RESULT auth-after: CHECK"
  say "A: $after_a"
  say "B: $after_b"
fi

echo
echo "Results: $results"
