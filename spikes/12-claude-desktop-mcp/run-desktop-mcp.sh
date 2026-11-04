#!/usr/bin/env bash
# SPIKE-12: registers the SPIKE-10 MCP stub for account B of Claude Desktop, in two places,
# then opens B's instance so the user can check the Code tab and Chat.
#   Code tab: user scope of CLAUDE_CONFIG_DIR (claude mcp add), aliases B-code, B-code-direct
#   Chat:     claude_desktop_config.json in B's --user-data-dir, aliases B-chat, B-chat-direct
# "-direct" entries call the app binary with ELECTRON_RUN_AS_NODE in env; the others use
# the shell-script shim. Every config file touched is backed up first.
# The default instance (~/.claude, ~/Library/Application Support/Claude) is never written.
# Usage: run-desktop-mcp.sh setup | open | report | stop | restore
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
spike10="$(cd "$here/../10-mcp-server-from-app" && pwd)"
app_dir="$spike10/local/build/Thử nghiệm MCP/AgentHub Spike 10.app"
binary="$app_dir/Contents/MacOS/AgentHub"
script="$app_dir/Contents/Resources/app.asar/mcp/agenthub-mcp-stub.cjs"
shim="$spike10/local/bin/agenthub mcp"
context="$spike10/local/context"
local_dir="$here/local"
log="$local_dir/server.log"
b_root="${CLAUDE_B_ROOT:-$HOME/.agenthub-spike/claude-b}"
b_data="${CLAUDE_DESKTOP_B_DATA:-$HOME/.agenthub-spike/claude-desktop-b}"
desktop_config="$b_data/claude_desktop_config.json"
claude_app=/Applications/Claude.app
mkdir -p "$local_dir/workspace"

say() { printf '%s\n' "$*"; }
instance_pid() { pgrep -f "Claude.app/Contents/MacOS/Claude .*--user-data-dir=$b_data" | head -1 || true; }
args_for() { printf '%s\n' "--account=$1" "--context-root=$context" "--log=$log"; }

case "${1:-}" in
  setup)
    [ -x "$shim" ] || { say "Run $spike10/build-app.sh first" >&2; exit 1; }
    [ -z "$(instance_pid)" ] || { say "Instance B is running; run: $0 stop" >&2; exit 1; }
    backup="$local_dir/backup"
    if [ ! -d "$backup" ]; then
      mkdir -p "$backup"
      cp -p "$b_root/.claude.json" "$backup/claude.json"
      cp -p "$desktop_config" "$backup/claude_desktop_config.json"
      say "Backed up B's .claude.json and claude_desktop_config.json to $backup"
    fi
    export CLAUDE_CONFIG_DIR="$b_root"
    claude mcp remove -s user agenthub >/dev/null 2>&1 || true
    claude mcp remove -s user agenthub-direct >/dev/null 2>&1 || true
    code_args=(); while IFS= read -r line; do code_args+=("$line"); done < <(args_for B-code)
    claude mcp add -s user agenthub -- "$shim" "${code_args[@]}" >/dev/null
    direct=(); while IFS= read -r line; do direct+=("$line"); done < <(args_for B-code-direct)
    claude mcp add -s user agenthub-direct -e ELECTRON_RUN_AS_NODE=1 -- "$binary" "$script" "${direct[@]}" >/dev/null
    node - "$desktop_config" "$shim" "$binary" "$script" "$context" "$log" <<'EOF'
const fs = require('node:fs');
const [file, shim, binary, script, context, log] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = (alias) => [`--account=${alias}`, `--context-root=${context}`, `--log=${log}`];
config.mcpServers = {
  ...(config.mcpServers || {}),
  agenthub: { command: shim, args: args('B-chat') },
  'agenthub-direct': { command: binary, args: [script, ...args('B-chat-direct')], env: { ELECTRON_RUN_AS_NODE: '1' } },
};
fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
EOF
    say "Registered: Code tab (claude mcp, user scope of B) and Chat (claude_desktop_config.json of B)."
    say "CLI check of B's user scope:"
    claude mcp list 2>&1 | grep -E '^agenthub' | sed -E "s#$HOME#~#g; s#(agenthub[^:]*):.* - #\1: … - #"
    date -u +%Y-%m-%dT%H:%M:%SZ > "$local_dir/setup-at"
    ;;
  open)
    [ -z "$(instance_pid)" ] || { say "Instance B already running (pid $(instance_pid)); run: $0 stop first"; exit 1; }
    # Env allowlist: `open` hands the caller's env to the app (SPIKE-09).
    env -i HOME="$HOME" USER="$USER" LOGNAME="$USER" PATH=/usr/bin:/bin:/usr/sbin:/sbin \
      /usr/bin/open -n -a "$claude_app" --env "CLAUDE_CONFIG_DIR=$b_root" --args "--user-data-dir=$b_data"
    sleep 5
    say "Instance B pid: $(instance_pid)"
    say "Workspace for the Code tab: $local_dir/workspace"
    ;;
  report)
    since="$(cat "$local_dir/setup-at" 2>/dev/null || echo 1970)"
    say "Server events since setup ($since):"
    [ -f "$log" ] || { say "(no server log yet)"; exit 0; }
    awk -v since="$since" '$1 >= since' "$log" \
      | grep -E 'started|initialize from|tools/call|context_write' \
      | sed -E 's/ ancestry=[^ ]*//; s/ electron=[^ ]* runAsNode=[^ ]* parent=.*//; s/"description":"[^"]*",?//; s/"websiteUrl":"[^"]*",?//' || true
    for alias in code chat; do
      file="$context/demo/DESKTOP-$alias.md"
      say "DESKTOP-$alias.md written: $([ -e "$file" ] && echo yes || echo no)"
    done
    ;;
  stop)
    pid="$(instance_pid)"
    if [ -n "$pid" ]; then kill "$pid"; say "Stopped instance B (pid $pid)"; else say "Instance B not running"; fi
    ;;
  restore)
    [ -z "$(instance_pid)" ] || { say "Stop instance B first: $0 stop" >&2; exit 1; }
    backup="$local_dir/backup"
    [ -d "$backup" ] || { say "No backup in $backup" >&2; exit 1; }
    cp -p "$backup/claude.json" "$b_root/.claude.json"
    cp -p "$backup/claude_desktop_config.json" "$desktop_config"
    say "Restored B's .claude.json and claude_desktop_config.json"
    ;;
  *)
    say "Usage: $0 setup | open | report | stop | restore" >&2
    exit 2
    ;;
esac
