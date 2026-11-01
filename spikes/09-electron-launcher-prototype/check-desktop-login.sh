#!/usr/bin/env bash
# SPIKE-09: checks whether `claude --desktop` costs profile A its CLI login. Compares
# `claude auth status` and the Keychain item's modification time, before and after.
# Never requests the secret and keeps no account identifier. Each trial except
# `baseline` opens a Code session in Claude Desktop and may sign profile A out.
# Exits 3 once profile A is signed out, so the next trial does not run.
# Usage: check-desktop-login.sh baseline|terminal|script|electron
set -uo pipefail

trial="${1:-}"
here="$(cd "$(dirname "$0")" && pwd)"
fixture="$HOME/.agenthub-spike/spike09/Dự án thử"
log="$here/local/login-trials.log"
clean=(env -i HOME="$HOME" USER="$USER" LOGNAME="${LOGNAME:-$USER}" SHELL=/bin/zsh TMPDIR="$TMPDIR" LANG=en_US.UTF-8)

exe="$("${clean[@]}" PATH=/usr/bin:/bin /bin/zsh -ilc 'whence -p claude' 2>/dev/null | tail -1)"
[ -x "$exe" ] || {
  echo "claude not found" >&2
  exit 1
}
tool_env=("${clean[@]}" PATH="$(dirname "$exe"):/usr/bin:/bin:/usr/sbin:/sbin")

logged_in() {
  "${tool_env[@]}" "$exe" auth status 2>/dev/null | python3 -Ic '
import json, sys
try:
    data = json.load(sys.stdin)
    print("loggedIn=%s plan=%s" % (data.get("loggedIn"), data.get("subscriptionType")))
except ValueError:
    print("loggedIn=unknown")'
}
keychain_mtime() {
  security find-generic-password -s "Claude Code-credentials" 2>/dev/null |
    sed -n 's/.*"mdat".*"\([0-9]*Z\).*/\1/p'
}
say() { printf '%s\n' "$*" | sed "s#$HOME#~#g" | tee -a "$log"; }
snapshot() {
  local status
  status="$(logged_in)"
  say "$(date -u +%H:%M:%S) $trial $1: $status keychain=$(keychain_mtime)"
  case "$status" in *loggedIn=False*) signed_out=1 ;; esac
}
signed_out=0
watch_after() {
  for wait_s in 2 10 30 60; do
    sleep "$wait_s"
    snapshot "+${wait_s}s"
    [ "$signed_out" = 0 ] || break
  done
}

mkdir -p "$here/local"
snapshot before
[ "$signed_out" = 0 ] || {
  say "Profile A is already signed out; not running"
  exit 3
}

case "$trial" in
  baseline) ;;
  terminal)
    state="$(mktemp -d)"
    command_file="$state/launch.command"
    {
      echo '#!/bin/zsh -f'
      printf 'cd -- %q || exit 126\n' "$fixture"
      printf '/usr/bin/env -i HOME=%q USER=%q LOGNAME=%q SHELL=/bin/zsh TMPDIR=%q LANG=en_US.UTF-8 PATH=%q TERM="$TERM" %q --desktop\n' \
        "$HOME" "$USER" "${LOGNAME:-$USER}" "$TMPDIR" "$(dirname "$exe"):/usr/bin:/bin:/usr/sbin:/sbin" "$exe"
      printf 'print -r -- $? > %q\n' "$state/status"
    } > "$command_file"
    chmod 700 "$command_file"
    "${clean[@]}" PATH=/usr/bin:/bin /usr/bin/open -a Terminal "$command_file"
    for _ in $(seq 1 30); do
      [ -f "$state/status" ] && break
      sleep 1
    done
    say "$(date -u +%H:%M:%S) terminal exit=$(cat "$state/status" 2>/dev/null || echo none)"
    rm -rf "$state"
    ;;
  script)
    output="$(cd "$fixture" && "${tool_env[@]}" TERM=xterm-256color /usr/bin/script -q /dev/null "$exe" --desktop </dev/null 2>&1)"
    code=$?
    say "$(date -u +%H:%M:%S) script exit=$code output=$(printf '%s' "$output" | tr -d '\r\b' | tr '\n' ' ')"
    ;;
  electron)
    # Repeats the launches that preceded the sign-out at 12:23 UTC, in the same order:
    # the first app inherits this shell's env, the second starts clean.
    bundle="$here/local/build/AgentHub Spike 09.app"
    /usr/bin/open -W -n "$bundle" --args --run=terminal-probe,claude-fresh,codex-fresh --label=login-trial-prelude
    "${clean[@]}" PATH=/usr/bin:/bin /usr/bin/open -W -n "$bundle" --args --run=desktop-pty --label=login-trial
    say "$(date -u +%H:%M:%S) electron report=$(ls -t "$here"/local/runs/*-login-trial.json | head -1)"
    ;;
  *)
    echo "Usage: $0 baseline|terminal|script|electron" >&2
    exit 2
    ;;
esac

watch_after
[ "$signed_out" = 0 ] || exit 3
