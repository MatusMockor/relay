#!/usr/bin/env bash
set -euo pipefail

arch="${1:?usage: scripts/release-tools/package-distributables.sh <arm64|x64> <version>}"
version="${2:?usage: scripts/release-tools/package-distributables.sh <arm64|x64> <version>}"
here="$(cd "$(dirname "$0")" && pwd)"
desktop="$(cd "$here/../../apps/desktop" && pwd)"
source "$here/mac-app-path.sh"
output="$(mac_release_dir dist "$arch")"
app="$(mac_app_path "$(mac_release_dir stage "$arch")" "$arch")"
identity="$("$here/signing-identity.sh")"

[ -d "$app" ] || { echo "missing $app, run scripts/release-tools/package-app.sh first" >&2; exit 1; }

rm -rf "$output"
(cd "$desktop" && env -u ELECTRON_RUN_AS_NODE pnpm exec electron-builder --mac dmg zip "--$arch" --prepackaged "$app" --publish never \
  -c.mac.identity="$identity" -c.directories.output="$output")

for file in "relay-$version-$arch-mac.dmg" "relay-$version-$arch-mac.zip" "relay-$version-$arch-mac.zip.blockmap" latest-mac.yml; do
  [ -f "$output/$file" ] || { echo "missing $output/$file" >&2; exit 1; }
done
codesign --verify --strict --verbose=2 "$output/relay-$version-$arch-mac.dmg"
