#!/usr/bin/env bash
set -euo pipefail

arch="${1:?usage: scripts/release-tools/notarize-dmg.sh <arm64|x64> <version>}"
version="${2:?usage: scripts/release-tools/notarize-dmg.sh <arm64|x64> <version>}"
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/mac-app-path.sh"
dmg="$(mac_release_dir dist "$arch")/relay-$version-$arch-mac.dmg"
[ -f "$dmg" ] || { echo "missing $dmg, run scripts/release-tools/package-distributables.sh first" >&2; exit 1; }

"$here/notary-wait.sh" "$("$here/notary-submit.sh" "$dmg")"
"$here/retry.sh" stapler xcrun stapler staple "$dmg"
"$here/retry.sh" stapler xcrun stapler validate "$dmg"
