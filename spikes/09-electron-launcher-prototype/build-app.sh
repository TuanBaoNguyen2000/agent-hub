#!/usr/bin/env bash
# SPIKE-09: wraps the prototype in a copy of Electron.app so it can start through
# LaunchServices (Finder, `open`) and get a GUI environment, not a terminal's.
# Signs ad hoc for this machine only. Sends no provider requests.
# Usage: build-app.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
source_app="$here/node_modules/electron/dist/Electron.app"
target="$here/local/build/AgentHub Spike 09.app"
plist="$target/Contents/Info.plist"
buddy=/usr/libexec/PlistBuddy

[ -d "$source_app" ] || {
  echo "Missing Electron; run: npm ci && npx install-electron, in $here" >&2
  exit 1
}

rm -rf "$target"
mkdir -p "$(dirname "$target")"
ditto "$source_app" "$target"

resources="$target/Contents/Resources/app"
mkdir -p "$resources"
cp "$here"/app/* "$resources/"
printf '{"outDir":"%s"}\n' "$here/local/runs" > "$resources/spike-config.json"

"$buddy" -c "Set :CFBundleName AgentHub Spike 09" "$plist"
"$buddy" -c "Set :CFBundleDisplayName AgentHub Spike 09" "$plist"
"$buddy" -c "Set :CFBundleIdentifier dev.agenthub.spike09" "$plist"

codesign --force --deep --sign - "$target" 2>/dev/null
echo "Built: $target"
