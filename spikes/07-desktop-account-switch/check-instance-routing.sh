#!/usr/bin/env bash
# SPIKE-07 follow-up: which running instance macOS picks for `open -b`, `open -a` and a URL when one
# bundle has several instances. Uses a throwaway copy of Electron with its own bundle id and URL
# scheme, so no provider app or account is involved. The copy is unregistered at the end.
# Usage: check-instance-routing.sh <Electron.app> <work dir>
set -uo pipefail

source_app="$1"
work="$2"
app="$work/AgentHub Routing Probe.app"
id=dev.agenthub.routingprobe
scheme=agenthubprobe
log="$work/events.log"
lsregister=/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister
buddy=/usr/libexec/PlistBuddy

rm -rf "$work"
mkdir -p "$work"
ditto "$source_app" "$app"
plist="$app/Contents/Info.plist"
"$buddy" -c "Set :CFBundleName AgentHub Routing Probe" "$plist"
"$buddy" -c "Set :CFBundleDisplayName AgentHub Routing Probe" "$plist"
"$buddy" -c "Set :CFBundleIdentifier $id" "$plist"
"$buddy" -c "Delete :CFBundleURLTypes" "$plist" 2>/dev/null
"$buddy" -c "Add :CFBundleURLTypes array" -c "Add :CFBundleURLTypes:0 dict" \
  -c "Add :CFBundleURLTypes:0:CFBundleURLName string probe" \
  -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" \
  -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string $scheme" "$plist"
mkdir -p "$app/Contents/Resources/app"
printf '{"name":"probe","main":"main.js"}\n' > "$app/Contents/Resources/app/package.json"
printf '%s' "$log" > "$app/Contents/Resources/app/log-path"
cat > "$app/Contents/Resources/app/main.js" <<'JS'
const { app } = require('electron');
const fs = require('fs');
const dir = process.argv.find((arg) => arg.startsWith('--user-data-dir='));
const name = dir ? 'B' : 'default';
const log = fs.readFileSync(__dirname + '/log-path', 'utf8');
const write = (event) => fs.appendFileSync(log, name + ' ' + event + '\n');
write('started');
app.on('open-url', (event, url) => { event.preventDefault(); write('open-url'); });
app.on('activate', () => write('activate'));
JS
codesign --force --deep --sign - "$app" 2>/dev/null
"$lsregister" -f -R -trusted "$app"
sleep 1

executable="$app/Contents/MacOS/Electron"
stop_all() {
  pkill -f "^$executable" 2>/dev/null
  sleep 1.5
  : > "$log"
}
trap 'stop_all; "$lsregister" -u "$app"; rm -rf "$work"' EXIT

start_b() { /usr/bin/open -n -a "$app" --args "--user-data-dir=$work/B"; sleep 2.5; }
start_default() { /usr/bin/open -n -a "$app"; sleep 2.5; }
step() {
  : > "$log"
  "${@:2}"
  sleep 2.5
  printf '%-44s -> %s\n' "$1" "$(tr '\n' ';' < "$log")"
}

stop_all
echo "== only B is running"
start_b; step 'open -b' /usr/bin/open -b "$id"; stop_all
start_b; step 'open -a' /usr/bin/open -a "$app"; stop_all
start_b; step 'open URL' /usr/bin/open "$scheme://x"; stop_all
start_b; step 'open -n -a (no user-data-dir)' /usr/bin/open -n -a "$app"; stop_all

echo "== B started first, then default"
start_b; start_default; step 'open URL' /usr/bin/open "$scheme://x"; step 'open -b' /usr/bin/open -b "$id"; stop_all

echo "== default started first, then B"
start_default; start_b; step 'open URL' /usr/bin/open "$scheme://x"; step 'open -b' /usr/bin/open -b "$id"; stop_all

echo "== nothing running"
step 'open URL' /usr/bin/open "$scheme://x"; stop_all
step 'open -b' /usr/bin/open -b "$id"; stop_all
