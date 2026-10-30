#!/usr/bin/env bash
# SPIKE-05: records what can be verified about the active account on each surface
# and whether a CLI profile affects Claude Desktop. Requires SPIKE-01's profile B.
# Sends 1 request with profile B. Run from Terminal.app.
# Usage: run-account-checks.sh [fixture-root]   (default: $TMPDIR/agenthub-spike04)
set -uo pipefail

root="${1:-${TMPDIR:-/tmp}/agenthub-spike04}"
b_root="${AGENTHUB_SPIKE_PROFILE_B:-$HOME/.agenthub-spike/claude-b}"
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/local/$(date +%Y%m%d-%H%M%S)"
log="$out/observations.txt"
fixture="$root/a-agents-only"

[ -d "$fixture" ] || {
  echo "Missing fixtures; run spikes/04-project-instructions/setup-fixtures.sh first" >&2
  exit 1
}
mkdir -p "$out"

clean=(env -i HOME="$HOME" USER="$USER" LOGNAME="${LOGNAME:-$USER}" PATH="$PATH"
  SHELL="${SHELL:-/bin/zsh}" TMPDIR="${TMPDIR:-/tmp}" LANG="${LANG:-en_US.UTF-8}" TERM="${TERM:-xterm-256color}")
run_a() { "${clean[@]}" claude "$@"; }
run_b() { "${clean[@]}" CLAUDE_CONFIG_DIR="$b_root" claude "$@"; }

ask() {
  local answer
  printf '\n%s\n> ' "$1"
  read -r answer < /dev/tty
  printf '%s | %s\n' "$1" "$answer" >> "$log"
}
step() {
  printf '\n=== %s\n' "$1"
  printf '\n=== %s\n' "$1" >> "$log"
}
summarize() {
  python3 -I -c '
import hashlib, json, sys
d = json.load(sys.stdin)
identity = (d.get("email") or "") + "|" + (d.get("orgId") or "")
print("loggedIn=%s method=%s plan=%s account=%s" % (d.get("loggedIn"), d.get("authMethod"), d.get("subscriptionType"), hashlib.sha256(identity.encode()).hexdigest()[:12]))'
}

{
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "claude cli: $(run_a --version)"
  echo "codex cli: $("${clean[@]}" codex --version)"
  echo "claude desktop: $(defaults read /Applications/Claude.app/Contents/Info CFBundleShortVersionString)"
} | tee "$out/versions.txt"

step "1. What each CLI can report"
{
  echo "Claude profile A: $(run_a auth status 2>/dev/null | summarize)"
  echo "Claude profile B: $(run_b auth status 2>/dev/null | summarize)"
  echo "Codex: $("${clean[@]}" codex login status 2>&1 | head -1)"
} | tee -a "$log"
echo "Claude báo được hash account; Codex chỉ báo phương thức đăng nhập."

step "2. Which account Claude Desktop is using"
echo "Mở menu account trong Claude Desktop để xem account đang đăng nhập."
ask "Desktop đang dùng account nào: A (giống profile mặc định) hay B? Ghi alias, không ghi email."

step "3. Open Desktop from profile B"
status=0; (cd "$fixture" && run_b --desktop) || status=$?
echo "exit: $status" | tee -a "$log"
ask "Desktop có mở không? Account trong menu có đổi không? (kỳ vọng: không đổi)"

step "4. Open a session created by profile B in Desktop"
sid="$(cd "$fixture" && run_b -p --tools "" --output-format json "Reply with the single word BRAVO-DESKTOP." 2>/dev/null \
  | python3 -I -c 'import json,sys;print(json.load(sys.stdin).get("session_id",""))')"
if [ -n "$sid" ]; then
  status=0; (cd "$fixture" && run_b --desktop --resume "$sid") || status=$?
  echo "exit: $status" | tee -a "$log"
  ask "Chuyện gì xảy ra: mở được session có BRAVO-DESKTOP, báo lỗi, hay mở session khác? Account trong menu là gì? (ghi nguyên văn lỗi nếu có)"
else
  echo "No session_id; skipped" | tee -a "$log"
fi

step "5. CLI status afterwards"
{
  echo "Claude profile A: $(run_a auth status 2>/dev/null | summarize)"
  echo "Claude profile B: $(run_b auth status 2>/dev/null | summarize)"
} | tee -a "$log"

echo
echo "Observations: $log"
