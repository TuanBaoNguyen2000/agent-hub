#!/usr/bin/env bash
# SPIKE-03: confirms which app is Codex Desktop and launches it in documented
# ways, recording what the person running it observes. Run from Terminal.app.
# Usage: run-launch-checks.sh [fixture-root]   (default: $TMPDIR/agenthub-spike04)
set -euo pipefail

root="${1:-${TMPDIR:-/tmp}/agenthub-spike04}"
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/local/$(date +%Y%m%d-%H%M%S)"
log="$out/observations.txt"
bundle="com.openai.codex"

[ -d "$root/b-both-no-import" ] || {
  echo "Missing fixtures; run spikes/04-project-instructions/setup-fixtures.sh first" >&2
  exit 1
}
mkdir -p "$out"

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
  echo "codex cli: $("${clean[@]}" codex --version 2>&1)"
  echo "app for $bundle: $(mdfind "kMDItemCFBundleIdentifier == '$bundle'" | head -1)"
  echo "app version: $(defaults read /Applications/ChatGPT.app/Contents/Info CFBundleShortVersionString)"
} > "$out/versions.txt"
cat "$out/versions.txt"

step "1. Open app by bundle id" "open -b $bundle"
open -b "$bundle"
ask "App nào lên foreground? Có thấy khu vực Codex (project/thread) trong app không? (ghi chú)"

dir="$root/b-both-no-import"
step "2. Open workspace (documented: codex app PATH)" "codex app $dir"
status=0; "${clean[@]}" codex app "$dir" || status=$?
echo "exit: $status" >> "$log"
ask "App có mở Codex với project/folder b-both-no-import không? Là thread mới hay thread cũ?"

prompt='Without using any tools or reading files, list every token that starts with SPIKE04- and appears in the project instructions already loaded into your context. Reply with the tokens only, one per line, or NONE.'
printf '%s' "$prompt" | pbcopy
step "3. SPIKE-04 check in Codex Desktop" "(prompt đã được copy vào clipboard)"
echo "Trong thread Codex của folder b-both-no-import, dán (Cmd+V) và gửi prompt. Kỳ vọng: chỉ SPIKE04-B-AGENTS."
ask "Codex Desktop trả về token nào? Có chạy lệnh/đọc file không?"

ask "Account: Codex trong app đang dùng cùng account với 'codex login status' không, và có chọn account được khi mở bằng lệnh không? (ghi alias, không ghi email)"

echo
echo "Observations: $log"
