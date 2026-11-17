#!/usr/bin/env bash
set -euo pipefail

arch="${1:?usage: scripts/release-tools/notarize-app.sh <arm64|x64>}"
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/mac-app-path.sh"
app="$(mac_app_path "$(mac_release_dir stage "$arch")" "$arch")"
[ -d "$app" ] || { echo "missing $app, run scripts/release-tools/package-app.sh first" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
ditto -c -k --sequesterRsrc --keepParent "$app" "$work/app.zip"
"$here/notary-wait.sh" "$("$here/notary-submit.sh" "$work/app.zip")"
"$here/retry.sh" stapler xcrun stapler staple "$app"
"$here/retry.sh" stapler xcrun stapler validate "$app"
