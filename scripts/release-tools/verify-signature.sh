#!/usr/bin/env bash
set -euo pipefail

app="${1:?usage: scripts/release-tools/verify-signature.sh <path/to/Relay.app> <arm64|x64>}"
arch="${2:?usage: scripts/release-tools/verify-signature.sh <path/to/Relay.app> <arm64|x64>}"
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID must be set}"
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/native-module-path.sh"

codesign --verify --deep --strict --verbose=2 "$app"

signature_of() {
  codesign --display --verbose=4 "$1" 2>&1 || { echo "$1: no readable signature" >&2; return 1; }
}

expect_team() {
  local file="$1" details="$2"
  grep -q "^TeamIdentifier=$APPLE_TEAM_ID$" <<<"$details" || { echo "$file: team is not $APPLE_TEAM_ID" >&2; exit 1; }
  grep -q "^Timestamp=" <<<"$details" || { echo "$file: no secure timestamp" >&2; exit 1; }
}

details="$(signature_of "$app")"
grep -q "^Identifier=sk.relay.desktop$" <<<"$details" || { echo "$app: identifier is not sk.relay.desktop" >&2; exit 1; }
grep -Eq "flags=0x[0-9a-f]+\([^)]*runtime" <<<"$details" || { echo "$app: hardened runtime is off" >&2; exit 1; }
expect_team "$app" "$details"
entitlements="$(codesign --display --entitlements - --xml "$app" 2>/dev/null)"
grep -q "com.apple.security.cs.allow-jit" <<<"$entitlements" || { echo "$app: allow-jit entitlement missing" >&2; exit 1; }
echo "ok sk.relay.desktop"

module="$(native_module_dir "$app/Contents/Resources")/prebuilds/$(native_prebuild_name "$arch")"
expect_team "$module" "$(signature_of "$module")"
echo "ok better_sqlite3.node"
