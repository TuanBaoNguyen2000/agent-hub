#!/usr/bin/env bash
# SPIKE-11: runs `codex exec` once per mode with the SPIKE-10 MCP stub, to see whether the
# MCP server runs outside the command sandbox and how MCP tool calls are approved.
# Uses profile B's login but ignores its config.toml (--ignore-user-config) and keeps no
# session (--ephemeral). Each mode sends one short agent turn to the model.
# Usage: run-codex-mcp.sh tui   (interactive, for the user)
#        run-codex-mcp.sh <mode>...   modes: ws-default ro-default ro-approve tool-approve on-request auto prompt writes approve
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
spike10="$here/../10-mcp-server-from-app"
shim="$spike10/local/bin/agenthub mcp"
context="$spike10/local/context"
workspace="$here/local/workspace"
runs="$here/local/runs"
export CODEX_HOME="${CODEX_HOME_B:-$HOME/.agenthub-spike/codex-b}"

[ -x "$shim" ] || { echo "Run $spike10/build-app.sh first" >&2; exit 1; }
mkdir -p "$workspace" "$runs"

toml_string() { printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"; }

# Interactive check for the user: the TUI loads profile B's own config.toml, so it is
# backed up first and diffed afterwards to see what an approval choice persists.
if [ "${1:-}" = tui ]; then
  config="$CODEX_HOME/config.toml"
  cp "$config" "$runs/config-before-tui.toml"
  rm -f "$context/demo/CODEX-tui.md"
  codex -C "$workspace" -s workspace-write -a on-request \
    -c "mcp_servers.agenthub.command=$(toml_string "$shim")" \
    -c "mcp_servers.agenthub.args=[$(toml_string "--account=B"), $(toml_string "--context-root=$context"), $(toml_string "--log=$runs/server.log")]" \
    "Call the MCP tool context_write (server agenthub) with path demo/CODEX-tui.md and content 'written via MCP in the TUI'. Then call context_read with path demo/STATUS.md. Report both results and stop."
  echo "== File written by MCP: $([ -e "$context/demo/CODEX-tui.md" ] && echo yes || echo no)"
  echo "== config.toml changes (lines starting with + were added):"
  diff "$runs/config-before-tui.toml" "$config" | sed -n 's/^> /+ /p; s/^< /- /p' || true
  exit 0
fi

for mode in "$@"; do
  sandbox=workspace-write
  approval=()
  case "$mode" in
    ws-default) ;;
    ro-default) sandbox=read-only ;;
    ro-approve) sandbox=read-only; approval=(-c 'mcp_servers.agenthub.default_tools_approval_mode="approve"') ;;
    tool-approve) approval=(-c 'mcp_servers.agenthub.tools.context_write.approval_mode="approve"') ;;
    on-request) approval=(-c 'approval_policy="on-request"') ;;
    auto|prompt|writes|approve) approval=(-c "mcp_servers.agenthub.default_tools_approval_mode=\"$mode\"") ;;
    *) echo "Unknown mode: $mode" >&2; exit 2 ;;
  esac
  rm -f "$context/demo/CODEX-$mode.md" "$context/demo/SHELL-$mode.md" "$workspace/ws-$mode.md"

  prompt="This is a test of tool permissions. Do exactly these steps in order, once each, without retrying or working around failures, and report each result verbatim:
1. Call the MCP tool spike_facts (server agenthub). Report the fields ancestry, writeOutsideWorkspace and sandboxEnv.
2. Call the MCP tool context_read with path demo/STATUS.md. Report the sha256 line.
3. Call the MCP tool context_write with path demo/CODEX-$mode.md and content 'written via MCP in mode $mode'.
4. Run the shell command: touch '$context/demo/SHELL-$mode.md'
5. Run the shell command: touch ws-$mode.md
End with a table: step, succeeded (yes/no), error text if any."

  started=$(date -u +%Y-%m-%dT%H-%M-%SZ)
  out="$runs/$started-$mode.jsonl"
  echo "== $mode (sandbox $sandbox) -> $out"
  set +e
  codex exec --json --ephemeral --ignore-user-config --skip-git-repo-check \
    -C "$workspace" -s "$sandbox" \
    -c "mcp_servers.agenthub.command=$(toml_string "$shim")" \
    -c "mcp_servers.agenthub.args=[$(toml_string "--account=B"), $(toml_string "--context-root=$context"), $(toml_string "--log=$runs/server.log")]" \
    ${approval[@]+"${approval[@]}"} \
    "$prompt" </dev/null >"$out" 2>"$out.stderr"
  echo "exit: $?"
  set -e
  for file in "$context/demo/CODEX-$mode.md" "$context/demo/SHELL-$mode.md" "$workspace/ws-$mode.md"; do
    if [ -e "$file" ]; then echo "exists:  ${file#"$here/../"}"; else echo "missing: ${file#"$here/../"}"; fi
  done
done
