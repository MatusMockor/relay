#!/usr/bin/env bash
set -euo pipefail

arch="${1:?usage: scripts/release-tools/verify-shipped.sh <arm64|x64> <version>}"
version="${2:?usage: scripts/release-tools/verify-shipped.sh <arm64|x64> <version>}"
here="$(cd "$(dirname "$0")" && pwd)"
config="$(cd "$here/../../apps/desktop" && pwd)/electron-builder.yml"
source "$here/mac-app-path.sh"
dist="$(mac_release_dir dist "$arch")"
zip="$dist/relay-$version-$arch-mac.zip"
dmg="$dist/relay-$version-$arch-mac.dmg"
require_notarization="${REQUIRE_NOTARIZATION:-1}"

work="$(mktemp -d)"
mount_point="$work/dmg"
cleanup() {
  if [ -d "$mount_point/Relay.app" ]; then
    hdiutil detach "$mount_point" -quiet || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

verify_app() {
  local app="$1"
  [ -d "$app" ] || { echo "missing $app" >&2; exit 1; }
  "$here/verify-signature.sh" "$app" "$arch"
  "$here/verify-native-module.sh" "$app/Contents/MacOS/Relay" "$app/Contents/Resources" "$arch"
  node "$here/verify-fuses.ts" "$app" "$config"
  [ -f "$app/Contents/Resources/app-update.yml" ] || { echo "$app has no app-update.yml" >&2; exit 1; }
  if [ "$require_notarization" = "1" ]; then
    "$here/retry.sh" stapler xcrun stapler validate "$app"
  fi
}

ditto -x -k "$zip" "$work/zip"
verify_app "$work/zip/Relay.app"

mkdir -p "$mount_point"
hdiutil attach "$dmg" -nobrowse -noautoopen -readonly -mountpoint "$mount_point" -quiet
verify_app "$mount_point/Relay.app"

if [ "$require_notarization" = "1" ]; then
  "$here/verify-notarization.sh" "$work/zip/Relay.app" "$dmg"
fi
echo "shipped $arch artifacts verified"
