#!/usr/bin/env bash
# SPIKE-10: copies the packaged AgentHub.app, adds the MCP stub twice (a plain file in
# Resources/mcp/ and inside a repacked app.asar), writes a launcher shim and fixtures,
# then signs the copy ad hoc. The product app and its data are not touched.
# Usage: build-app.sh [path/to/AgentHub.app]
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
source_app="${1:-$repo/apps/desktop/release/mac-arm64/AgentHub.app}"
local_dir="$here/local"
# Spaces and Vietnamese diacritics on purpose: MCP configs must carry this path.
target="$local_dir/build/Thử nghiệm MCP/AgentHub Spike 10.app"
plist="$target/Contents/Info.plist"
buddy=/usr/libexec/PlistBuddy
asar="$repo/node_modules/.bin/asar"

[ -d "$source_app" ] || { echo "Missing $source_app; run: npm run package" >&2; exit 1; }
[ -x "$asar" ] || { echo "Missing @electron/asar; run npm ci at the repo root" >&2; exit 1; }

rm -rf "$local_dir/build" "$local_dir/bin" "$local_dir/context" "$local_dir/outside"
mkdir -p "$(dirname "$target")" "$local_dir/bin" "$local_dir/runs"
ditto "$source_app" "$target"

resources="$target/Contents/Resources"
mkdir -p "$resources/mcp"
cp "$here/server/agenthub-mcp-stub.cjs" "$resources/mcp/"

work="$local_dir/asar-work"
rm -rf "$work"
"$asar" extract "$resources/app.asar" "$work"
mkdir -p "$work/mcp"
cp "$here/server/agenthub-mcp-stub.cjs" "$work/mcp/"
rm -rf "$resources/app.asar" "$resources/app.asar.unpacked"
"$asar" pack "$work" "$resources/app.asar" --unpack "*.node"
rm -rf "$work"

"$buddy" -c "Set :CFBundleName AgentHub Spike 10" "$plist"
"$buddy" -c "Set :CFBundleIdentifier dev.agenthub.spike10" "$plist"
codesign --force --deep --sign - "$target" 2>/dev/null

# Shim: a stable path for MCP configs that needs no env in the config itself.
shim="$local_dir/bin/agenthub mcp"
cat > "$shim" <<EOF
#!/bin/sh
ELECTRON_RUN_AS_NODE=1 exec "$target/Contents/MacOS/AgentHub" "$target/Contents/Resources/app.asar/mcp/agenthub-mcp-stub.cjs" "\$@"
EOF
chmod +x "$shim"

# Fixtures: one project inside the context root, a file and a symlink that point outside.
mkdir -p "$local_dir/context/demo" "$local_dir/context/khác dự án" "$local_dir/outside"
printf '# STATUS\n\nSPIKE-10 fixture: điểm vào của project demo.\n' > "$local_dir/context/demo/STATUS.md"
printf 'outside the context root\n' > "$local_dir/outside/secret.txt"
ln -s "$local_dir/outside/secret.txt" "$local_dir/context/demo/link-out.md"

echo "Built: $target"
echo "Shim:  $shim"
