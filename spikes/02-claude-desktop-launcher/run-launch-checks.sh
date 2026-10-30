#!/usr/bin/env bash
# SPIKE-02: launches Claude Desktop in documented ways, one step at a time, and
# records what the person running it observes. Run from Terminal.app on macOS.
# Usage: run-launch-checks.sh [fixture-root]   (default: $TMPDIR/agenthub-spike04)
set -euo pipefail

root="${1:-${TMPDIR:-/tmp}/agenthub-spike04}"
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/local/$(date +%Y%m%d-%H%M%S)"
log="$out/observations.txt"
bundle="com.anthropic.claudefordesktop"

[ -d "$root/c-claude-imports-agents" ] || {
  echo "Missing fixtures; run spikes/04-project-instructions/setup-fixtures.sh first" >&2
  exit 1
}
mkdir -p "$out"

# Same allowlisted environment as SPIKE-04. claude --desktop refuses redirected
# output, so launch commands below keep the terminal as stdout (no tee).
clean=(env -i HOME="$HOME" USER="$USER" LOGNAME="${LOGNAME:-$USER}" PATH="$PATH"
  SHELL="${SHELL:-/bin/zsh}" TMPDIR="${TMPDIR:-/tmp}" LANG="${LANG:-en_US.UTF-8}" TERM="${TERM:-xterm-256color}")

ask() {
  local answer
  printf '\n%s\n> ' "$1"
  read -r answer < /dev/tty
  printf '%s | %s\n' "$1" "$answer" >> "$log"
}

step() {
  printf '\n=== %s\n$ %s\n' "$1" "$2"
  printf '\n=== %s\n$ %s\n' "$1" "$2" >> "$log"
}

{
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "os: $(sw_vers -productVersion) $(uname -m)"
  echo "claude cli: $("${clean[@]}" claude --version 2>&1)"
  echo "claude desktop: $(defaults read /Applications/Claude.app/Contents/Info CFBundleShortVersionString)"
} > "$out/versions.txt"
cat "$out/versions.txt"

step "1. Open app" "open -b $bundle"
open -b "$bundle"
ask "Claude Desktop có lên foreground không? (y/n + ghi chú)"

dir="$root/c-claude-imports-agents"
step "2. Open workspace (documented: claude --desktop)" "cd $dir && claude --desktop"
status=0; (cd "$dir" && "${clean[@]}" claude --desktop) || status=$?
echo "exit: $status" >> "$log"
ask "Desktop có mở Code session mới trên folder c-claude-imports-agents không? Ghi tên folder và environment đang hiển thị."

prompt="SPIKE02 deep link prompt check"
url="claude://code/new?q=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$prompt")"
step "3. Deep link (documented: claude://code/new?q=)" "open \"$url\""
open "$url"
ask "Desktop có mở trang new session với prompt '$prompt' điền sẵn mà CHƯA gửi không? Folder/environment đang chọn là gì?"

step "4. Resume CLI session in Desktop (documented: claude --desktop --resume)" "claude -p --output-format json ... ; claude --desktop --resume <id>"
json="$(cd "$dir" && "${clean[@]}" claude -p --tools "" --output-format json "Reply with the single word READY.")"
sid="$(printf '%s' "$json" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("session_id",""))')"
echo "session_id: ${sid:-<none>}" | tee -a "$log"
if [ -n "$sid" ]; then
  status=0; (cd "$dir" && "${clean[@]}" claude --desktop --resume "$sid") || status=$?
  echo "exit: $status" >> "$log"
  ask "Desktop có mở đúng session vừa tạo (có câu trả lời READY) không?"
else
  echo "No session_id; skipped" | tee -a "$log"
fi

step "5. (Undocumented) open folder with app" "open -a Claude $root/b-both-no-import"
printf '\nBước này dùng khai báo folder trong Info.plist, không có trong tài liệu. Chạy? (y/N) > '
read -r yn < /dev/tty
if [ "$yn" = y ]; then
  open -a /Applications/Claude.app "$root/b-both-no-import"
  ask "Chuyện gì xảy ra? (mở session trên folder b / chỉ lên foreground / khác)"
else
  echo "skipped" >> "$log"
fi

ask "Account selection: Desktop có cách nào chọn account khi mở bằng các lệnh trên không? (ghi alias, không ghi email)"

echo
echo "Observations: $log"
