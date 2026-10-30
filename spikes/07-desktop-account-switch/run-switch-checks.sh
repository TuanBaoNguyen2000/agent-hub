#!/usr/bin/env bash
# SPIKE-07: checks whether a second Claude Desktop instance with its own data
# directory can hold another account, so switching needs no logout/login.
# The mechanism is undocumented. Never touches the default instance or its data,
# never modifies Claude.app, never reads file contents in the data directory.
# The user signs in; about 5 short requests are sent. Run from Terminal.app.
# Sign-in callbacks reach the default instance while it runs, so sign in once with
# `login` after quitting it, then reopen it and run the checks.
# `code` repeats only the Code tab checks, with and without CLAUDE_CONFIG_DIR.
# Usage: run-switch-checks.sh [login|code|stop]
set -uo pipefail

data_dir="${AGENTHUB_SPIKE_DESKTOP_B:-$HOME/.agenthub-spike/claude-desktop-b}"
b_root="${AGENTHUB_SPIKE_PROFILE_B:-$HOME/.agenthub-spike/claude-b}"
fixture="${TMPDIR:-/tmp}/agenthub-spike04/a-agents-only"
app=/Applications/Claude.app
bundle_exe="$app/Contents/MacOS/Claude"

# Main process of the second instance only: the flag must follow the executable,
# which excludes the default instance and every helper process.
instance_pid() {
  ps -axo pid=,args= | grep -F "$bundle_exe --user-data-dir=$data_dir" | grep -v grep | awk '{print $1}'
}
default_count() {
  ps -axo args= | grep -F "$bundle_exe" | grep -vF -- "--user-data-dir=" | grep -v grep | wc -l | tr -d ' '
}
stop_instance() {
  local pid waited=0
  pid="$(instance_pid)"
  if [ -z "$pid" ]; then
    echo "Instance B is not running"
    return 0
  fi
  if [ "$(printf '%s\n' "$pid" | wc -l | tr -d ' ')" != 1 ]; then
    echo "More than one match; not stopping anything: $pid" >&2
    return 1
  fi
  kill -TERM "$pid"
  while [ -n "$(instance_pid)" ] && [ "$waited" -lt 20 ]; do
    sleep 1
    waited=$((waited + 1))
  done
  if [ -n "$(instance_pid)" ]; then
    echo "Instance B still running after ${waited}s" >&2
    return 1
  fi
  echo "Instance B stopped after ${waited}s"
}

if [ "${1:-}" = stop ]; then
  stop_instance
  exit $?
fi

here="$(cd "$(dirname "$0")" && pwd)"
out="$here/local/$(date +%Y%m%d-%H%M%S)"
log="$out/observations.txt"
marker="$out/marker"

[ -d "$fixture" ] || {
  echo "Missing fixtures; run spikes/04-project-instructions/setup-fixtures.sh first" >&2
  exit 1
}
[ -z "$(instance_pid)" ] || {
  echo "Instance B is already running; run: $0 stop" >&2
  exit 1
}
if [ "${1:-}" = login ] && [ "$(default_count)" != 0 ]; then
  echo "Quit the default Claude Desktop first; a sign-in callback would reach it instead" >&2
  exit 1
fi
mkdir -p "$out" "$data_dir"
touch "$marker"

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
say() { printf '%s\n' "$*" | tee -a "$log"; }
summarize() {
  python3 -I -c '
import hashlib, json, sys
d = json.load(sys.stdin)
identity = (d.get("email") or "") + "|" + (d.get("orgId") or "")
print("loggedIn=%s plan=%s account=%s" % (d.get("loggedIn"), d.get("subscriptionType"), hashlib.sha256(identity.encode()).hexdigest()[:12]))'
}
# File names only: where session files were written since $1. A scratch workspace
# counts as other; this repo's own agent sessions are left out.
session_counts() {
  local since="$1" root fixture_count other_count
  for root in "$HOME/.claude/projects" "$b_root/projects" "$data_dir"; do
    fixture_count="$(find "$root" -name '*.jsonl' -path '*agenthub-spike04*' -newer "$since" 2>/dev/null | wc -l | tr -d ' ')"
    other_count="$(find "$root" -name '*.jsonl' -not -path '*agenthub-spike04*' -not -path '*agent-hub*' -newer "$since" 2>/dev/null | wc -l | tr -d ' ')"
    say "new session files in ${root/#$HOME/~}: fixture=$fixture_count other=$other_count"
  done
}
# Profile B's CLAUDE.md holds a token from SPIKE-01, so the answer shows which
# config root the Code tab loaded without reading any file.
code_check() {
  local mark="$out/marker-$1"
  touch "$mark"
  echo "Trong cửa sổ MỚI, mở tab Code, tạo session MỚI, chọn đúng folder: $fixture"
  echo "Kiểm tra folder hiển thị là a-agents-only, không phải scratch, rồi gửi nguyên văn:"
  echo "Without using any tools or reading files, list every token that starts with SPIKE01- and appears in the instructions already loaded into your context. Reply with the tokens only, one per line, or NONE."
  ask "Code tab trả lời gì? Folder đúng là a-agents-only không? Có đòi đăng nhập lại không?"
  echo "Trong session đó gõ /status."
  ask "/status báo account nào (A/B), hay không hỗ trợ? (chỉ ghi alias, không ghi email)"
  session_counts "$mark"
}
# Launched without a terminal on purpose: a launcher in Electron Main has none.
open_instance() {
  local status=0
  open -n -a "$app" "$@" --args "--user-data-dir=$data_dir" < /dev/null > /dev/null 2>&1 || status=$?
  say "open exit: $status"
  sleep 5
  say "instance B main processes: $(instance_pid | wc -l | tr -d ' '); default instance main processes: $(default_count)"
}

{
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "macOS: $(sw_vers -productVersion)"
  echo "claude cli: $(run_a --version)"
  echo "claude desktop: $(defaults read "$app/Contents/Info" CFBundleShortVersionString)"
} | tee "$out/versions.txt"

if [ "${1:-}" = login ]; then
  step "Sign in to account B with the default instance closed"
  open_instance
  echo "Đăng nhập account B trong cửa sổ vừa mở. Trước khi xác nhận trên browser, kiểm tra browser đang ở account B."
  ask "Đăng nhập được không, bằng cách nào? Sau khi đăng nhập, browser quay về cửa sổ đó không? Menu hiện account nào? (A/B)"
  stop_instance | tee -a "$log"
  echo
  echo "Observations: $log"
  exit 0
fi

if [ "${1:-}" = code ]; then
  step "Code tab with only the data directory separated"
  open_instance
  code_check code-data-dir
  stop_instance | tee -a "$log"
  step "Code tab with CLAUDE_CONFIG_DIR passed to the second instance"
  open_instance --env "CLAUDE_CONFIG_DIR=$b_root"
  code_check code-env
  stop_instance | tee -a "$log"
  echo
  echo "Observations: $log"
  exit 0
fi

step "0. Before starting"
say "default instance main processes: $(default_count)"
say "Claude profile A: $(run_a auth status 2>/dev/null | summarize)"
say "Claude profile B: $(run_b auth status 2>/dev/null | summarize)"
echo "Bấm initials ở góc trái dưới trong Claude Desktop để xem menu account."
ask "Menu có sẵn account thứ hai để chọn không? (có/không) Hai account có cùng email không? (có/không; không ghi email)"
ask "Desktop chính đang dùng account nào? (A/B)"

step "1. Open a second instance with its own data directory"
open_instance
say "data dir entries: $(find "$data_dir" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')"
ask "Có cửa sổ Claude thứ hai không? Nó hiện màn hình đăng nhập hay đã vào sẵn account nào? Có hộp thoại Keychain nào không? (ghi nguyên văn)"
ask "Cửa sổ Desktop chính có bị ảnh hưởng không? Account có còn là A không?"

step "2. Second window while the default instance is open"
echo "Mở menu account trong cửa sổ MỚI. Nếu chưa đăng nhập, dừng script và chạy chế độ login trong README."
ask "Cửa sổ mới có giữ đăng nhập không, đang dùng account nào? (A/B)"
ask "Cửa sổ Desktop chính có đổi account, bị đăng xuất hay nhận thông báo đăng nhập không?"

step "3. Both accounts side by side"
echo "Trong mỗi cửa sổ, mở tab Chat, tạo chat mới và gửi: Reply with the single word SPIKE07."
ask "Cả hai có trả lời không? Menu mỗi cửa sổ hiện account nào? Lịch sử chat có tách nhau không?"

step "4. Code tab with only the data directory separated"
code_check code-data-dir

step "5. Quit and reopen: is the login kept, how long does switching take"
stop_instance | tee -a "$log"
say "default instance main processes: $(default_count)"
printf '\nNhấn Enter để mở lại; khi cửa sổ đã dùng được thì nhấn Enter lần nữa.\n> '
read -r _ < /dev/tty
started="$(date +%s)"
open_instance
printf '\nCửa sổ dùng được chưa? Nhấn Enter khi xong.\n> '
read -r _ < /dev/tty
say "seconds from open to ready (includes 5s script wait and reaction time): $(($(date +%s) - started))"
ask "Có phải đăng nhập lại không? Cửa sổ mới dùng account nào? Desktop chính có còn là A không?"

step "6. Which window receives a deep link"
open 'claude://code/new?q=SPIKE07-LINK'
sleep 3
ask "Prompt SPIKE07-LINK hiện ở cửa sổ nào: chính, mới, cả hai, hay không thấy?"

step "7. Code tab and resume with CLAUDE_CONFIG_DIR passed to the second instance"
stop_instance | tee -a "$log"
open_instance --env "CLAUDE_CONFIG_DIR=$b_root"
pid="$(instance_pid)"
say "CLAUDE_CONFIG_DIR visible in instance env: $(ps eww -p "$pid" 2>/dev/null | tr ' ' '\n' | grep -c '^CLAUDE_CONFIG_DIR=')"
code_check code-env
sid="$(cd "$fixture" && run_b -p --tools "" --output-format json "Reply with the single word RESUME-B." 2>/dev/null \
  | python3 -I -c 'import json,sys;print(json.load(sys.stdin).get("session_id",""))')"
if [ -n "$sid" ]; then
  status=0; (cd "$fixture" && run_b --desktop --resume "$sid") || status=$?
  say "exit: $status"
  ask "Session có RESUME-B mở ở cửa sổ nào: chính hay mới? Hay báo lỗi? (ghi nguyên văn lỗi nếu có)"
else
  say "No session_id; skipped"
fi

step "8. Stop the second instance and confirm nothing else changed"
stop_instance | tee -a "$log"
say "default instance main processes: $(default_count)"
say "Claude profile A: $(run_a auth status 2>/dev/null | summarize)"
say "Claude profile B: $(run_b auth status 2>/dev/null | summarize)"
say "data dir size: $(du -sh "$data_dir" 2>/dev/null | cut -f1)"
ask "Desktop chính có còn là account A, và phiên đang mở có còn dùng được không?"

echo
echo "Observations: $log"
