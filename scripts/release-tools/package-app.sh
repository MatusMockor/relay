#!/usr/bin/env bash
set -euo pipefail

arch="${1:?usage: scripts/release-tools/package-app.sh <arm64|x64>}"
here="$(cd "$(dirname "$0")" && pwd)"
desktop="$(cd "$here/../../apps/desktop" && pwd)"
source "$here/mac-app-path.sh"
output="$(mac_release_dir stage "$arch")"
identity="$("$here/signing-identity.sh")"

[ -f "$desktop/out/main/index.js" ] || { echo "missing $desktop/out, build or download the bundle first" >&2; exit 1; }
rm -rf "$output"
(cd "$desktop" && env -u ELECTRON_RUN_AS_NODE \
  RETRY_ATTEMPTS="${CODESIGN_RETRY_ATTEMPTS:-6}" \
  RETRY_DELAY_SECONDS="${CODESIGN_RETRY_DELAY_SECONDS:-60}" \
  RETRY_MAX_DELAY_SECONDS="${CODESIGN_RETRY_MAX_DELAY_SECONDS:-600}" \
  "$here/retry.sh" timestamp pnpm exec electron-builder --mac zip "--$arch" --publish never \
  -c.mac.identity="$identity" -c.directories.output="$output")

app="$(mac_app_path "$output" "$arch")"
[ -f "$app/Contents/Resources/app-update.yml" ] || { echo "$app has no app-update.yml" >&2; exit 1; }
"$here/verify-signature.sh" "$app" "$arch"
"$here/verify-native-module.sh" "$app/Contents/MacOS/Relay" "$app/Contents/Resources" "$arch"
node "$here/verify-fuses.ts" "$app" "$desktop/electron-builder.yml"
echo "$app"
