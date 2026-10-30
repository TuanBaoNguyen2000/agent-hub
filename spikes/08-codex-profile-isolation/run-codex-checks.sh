#!/usr/bin/env bash
# SPIKE-08: checks whether a second CODEX_HOME keeps a second ChatGPT account apart
# from the default ~/.codex, for Codex CLI and for a second Codex Desktop instance.
# CODEX_HOME separation is undocumented for multiple accounts; --user-data-dir on
# ChatGPT.app is undocumented. Never reads auth.json or session contents (only
# checks that files exist and counts file names). The user signs in.
# Usage: run-codex-checks.sh cli|desktop|desktop-login|stop
set -uo pipefail

b_home="${AGENTHUB_SPIKE_CODEX_B:-$HOME/.agenthub-spike/codex-b}"
data_dir="${AGENTHUB_SPIKE_CODEX_DESKTOP_B:-$HOME/.agenthub-spike/codex-desktop-b}"
fixture="${TMPDIR:-/tmp}/agenthub-spike04/a-agents-only"
app=/Applications/ChatGPT.app
bundle_exe="$app/Contents/MacOS/ChatGPT"
mode="${1:-}"

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

case "$mode" in
  stop) stop_instance; exit $? ;;
  cli|desktop|desktop-login) ;;
  *) echo "Usage: $0 cli|desktop|desktop-login|stop" >&2; exit 2 ;;
esac

[ -d "$fixture" ] || {
  echo "Missing fixtures; run spikes/04-project-instructions/setup-fixtures.sh first" >&2
  exit 1
}
[ -d "$b_home" ] || {
  echo "Missing $b_home; sign in to profile B first (see README)" >&2
  exit 1
}
if [ "$mode" != cli ] && [ -n "$(instance_pid)" ]; then
  echo "Instance B is already running; run: $0 stop" >&2
  exit 1
fi
if [ "$mode" = desktop-login ] && [ "$(default_count)" != 0 ]; then
  echo "Quit the default ChatGPT app first; a sign-in callback would reach it instead" >&2
  exit 1
fi

here="$(cd "$(dirname "$0")" && pwd)"
out="$here/local/$(date +%Y%m%d-%H%M%S)-$mode"
log="$out/observations.txt"
mkdir -p "$out"

clean=(env -i HOME="$HOME" USER="$USER" LOGNAME="${LOGNAME:-$USER}" PATH="$PATH"
  SHELL="${SHELL:-/bin/zsh}" TMPDIR="${TMPDIR:-/tmp}" LANG="${LANG:-en_US.UTF-8}" TERM="${TERM:-xterm-256color}")
# Profile A is the default ~/.codex. Its personal config.toml fails `codex exec`
# (SPIKE-03), so exec under A skips it; profile B has no config.toml.
run_a() { "${clean[@]}" codex "$@"; }
run_b() { "${clean[@]}" CODEX_HOME="$b_home" codex "$@"; }
exec_a() { run_a exec --ignore-user-config --skip-git-repo-check -s read-only "$@"; }
exec_b() { run_b exec --skip-git-repo-check -s read-only "$@"; }

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
# Existence only; the file is never opened.
auth_file() { [ -e "$1/auth.json" ] && echo present || echo absent; }
thread_id() {
  python3 -I -c '
import json, sys
def find(v):
    if isinstance(v, dict):
        for k, x in v.items():
            if k in ("thread_id", "session_id") and isinstance(x, str):
                return x
            r = find(x)
            if r:
                return r
    elif isinstance(v, list):
        for x in v:
            r = find(x)
            if r:
                return r
    return None
for line in sys.stdin:
    try:
        r = find(json.loads(line))
    except ValueError:
        continue
    if r:
        print(r)
        break'
}
# File names only.
files_with() { find "$1/sessions" -type f -name "*$2*" 2>/dev/null | wc -l | tr -d ' '; }
new_sessions() { find "$1/sessions" -type f -name '*.jsonl' -newer "$2" 2>/dev/null | wc -l | tr -d ' '; }
token_prompt='Without running commands or reading files, list every token that starts with SPIKE08- and appears in the instructions already loaded into your context. Reply with the tokens only, one per line, or NONE.'

# Profile B's AGENTS.md in CODEX_HOME is global guidance, so a reply shows
# which home Codex loaded without the agent reading any file.
marker="$b_home/AGENTS.md"
if [ ! -e "$marker" ]; then
  printf '# SPIKE-08 profile B\n\nProfile token: SPIKE08-B-USER\n' > "$marker"
fi

{
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "macOS: $(sw_vers -productVersion)"
  echo "codex cli: $(run_a --version)"
  echo "codex desktop: $(defaults read "$app/Contents/Info" CFBundleShortVersionString)"
} | tee "$out/versions.txt"

if [ "$mode" = cli ]; then
  step "1. Login status and credential files"
  say "A login status: $(run_a login status 2>&1 | head -1)"
  say "B login status: $(run_b login status 2>&1 | head -1)"
  say "auth.json: A=$(auth_file "$HOME/.codex") B=$(auth_file "$b_home")"
  echo "Codex sắp mở ở chế độ tương tác cho profile A. Gõ /status, xem account và gói, rồi thoát (/quit hoặc Ctrl+C hai lần)."
  (cd "$fixture" && run_a) || true
  ask "Profile A: /status báo account nào (A/B), gói gì? Có lỗi nào không? (không ghi email)"
  echo "Bây giờ là profile B. Làm giống vậy."
  (cd "$fixture" && run_b) || true
  ask "Profile B: /status báo account nào (A/B), gói gì? Có lỗi nào không?"

  step "2. Profile-level instructions"
  answer_a="$(cd "$fixture" && exec_a "$token_prompt" 2>"$out/token-a.err")"; code_a=$?
  answer_b="$(cd "$fixture" && exec_b "$token_prompt" 2>"$out/token-b.err")"; code_b=$?
  say "A (exit $code_a): $answer_a"
  say "B (exit $code_b): $answer_b"
  if [ "$answer_a" = NONE ] && [ "$answer_b" = SPIKE08-B-USER ]; then
    say "RESULT instructions: PASS"
  else
    say "RESULT instructions: CHECK (expected A=NONE, B=SPIKE08-B-USER; stderr in local/)"
  fi

  step "3. Session storage and cross-resume"
  id_a="$(cd "$fixture" && exec_a --json "Reply with the single word ALPHA." 2>/dev/null | thread_id)"
  id_b="$(cd "$fixture" && exec_b --json "Reply with the single word BRAVO." 2>/dev/null | thread_id)"
  if [ -n "$id_a" ] && [ -n "$id_b" ]; then
    say "session A file count: in A=$(files_with "$HOME/.codex" "$id_a"), in B=$(files_with "$b_home" "$id_a")"
    say "session B file count: in A=$(files_with "$HOME/.codex" "$id_b"), in B=$(files_with "$b_home" "$id_b")"
    cross_ab="$(cd "$fixture" && run_b exec resume --skip-git-repo-check --ephemeral "$id_a" "Reply with OK." 2>&1)"; code_ab=$?
    cross_ba="$(cd "$fixture" && run_a exec resume --ignore-user-config --skip-git-repo-check --ephemeral "$id_b" "Reply with OK." 2>&1)"; code_ba=$?
    say "B resuming A's session: exit=$code_ab, output=$(printf '%s' "$cross_ab" | tail -1 | cut -c1-120)"
    say "A resuming B's session: exit=$code_ba, output=$(printf '%s' "$cross_ba" | tail -1 | cut -c1-120)"
  else
    say "No session id (A='${id_a:+found}', B='${id_b:+found}'); skipped"
  fi

  step "4. Running in parallel"
  (cd "$fixture" && exec_a --ephemeral "Reply with the single word PARALLEL-A." > "$out/parallel-a.txt" 2>/dev/null; date +%s > "$out/parallel-a.end") &
  pid_a=$!
  (cd "$fixture" && exec_b --ephemeral "Reply with the single word PARALLEL-B." > "$out/parallel-b.txt" 2>/dev/null; date +%s > "$out/parallel-b.end") &
  pid_b=$!
  started="$(date +%s)"
  wait "$pid_a" "$pid_b"
  say "started=$started end_a=$(cat "$out/parallel-a.end") end_b=$(cat "$out/parallel-b.end")"
  say "A: $(tail -1 "$out/parallel-a.txt")"
  say "B: $(tail -1 "$out/parallel-b.txt")"

  step "5. Login status afterwards"
  say "A login status: $(run_a login status 2>&1 | head -1)"
  say "B login status: $(run_b login status 2>&1 | head -1)"
  say "auth.json: A=$(auth_file "$HOME/.codex") B=$(auth_file "$b_home")"
  echo
  echo "Observations: $log"
  exit 0
fi

mkdir -p "$data_dir"
# Launched without a terminal on purpose: a launcher in Electron Main has none.
open_instance() {
  local status=0
  open -n -a "$app" --env "CODEX_HOME=$b_home" --args "--user-data-dir=$data_dir" < /dev/null > /dev/null 2>&1 || status=$?
  say "open exit: $status"
  sleep 5
  say "instance B main processes: $(instance_pid | wc -l | tr -d ' '); default instance main processes: $(default_count)"
}

if [ "$mode" = desktop-login ]; then
  step "Sign in to account B with the default app closed"
  open_instance
  echo "Nếu cửa sổ mới đòi đăng nhập, đăng nhập account B. Trước khi xác nhận trên browser, kiểm tra browser đang ở account B."
  ask "Cửa sổ mới đã đăng nhập sẵn hay phải đăng nhập? Browser có quay về cửa sổ đó không? Account nào (A/B)?"
  stop_instance | tee -a "$log"
  echo
  echo "Observations: $log"
  exit 0
fi

step "0. Before starting"
say "default instance main processes: $(default_count)"
ask "App chính (ChatGPT/Codex) đang dùng account nào? (A/B; xem trong menu profile)"

step "1. Open a second instance with CODEX_HOME of profile B"
open_instance
ask "Có cửa sổ thứ hai không? Nó đã đăng nhập sẵn hay hiện màn hình đăng nhập? Nếu đã đăng nhập: account nào (A/B)?"
ask "App chính có bị ảnh hưởng không? Còn dùng account cũ không?"
echo "Nếu cửa sổ mới chưa đăng nhập: trả lời các câu sau là 'bỏ qua', rồi chạy chế độ desktop-login trong README."

step "2. Codex in the second instance reads profile B"
touch "$out/marker-thread"
echo "Trong cửa sổ MỚI, mở folder: $fixture"
echo "Tạo thread mới và gửi nguyên văn:"
echo "$token_prompt"
ask "Câu trả lời là gì (NONE hay SPIKE08-B-USER)? Folder đúng là a-agents-only không? Menu profile hiện account nào?"
say "new session files: A=$(new_sessions "$HOME/.codex" "$out/marker-thread") B=$(new_sessions "$b_home" "$out/marker-thread")"

step "3. Which window receives codex app"
status=0; (cd "$fixture" && run_b app "$fixture" < /dev/null > /dev/null 2>&1) || status=$?
say "exit: $status"
sleep 3
ask "codex app mở folder ở cửa sổ nào: chính, mới, hay không thấy?"

step "4. Quit and reopen: is the login kept"
stop_instance | tee -a "$log"
open_instance
ask "Cửa sổ mới có giữ đăng nhập không, account nào? App chính còn dùng account cũ không?"

step "5. Stop the second instance"
stop_instance | tee -a "$log"
say "default instance main processes: $(default_count)"
say "data dir size: $(du -sh "$data_dir" 2>/dev/null | cut -f1)"
ask "App chính có còn dùng account cũ và dùng bình thường không?"

echo
echo "Observations: $log"
