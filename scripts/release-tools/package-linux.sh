#!/usr/bin/env bash
set -euo pipefail

arch="${1:?usage: scripts/release-tools/package-linux.sh <x64|arm64> <version>}"
version="${2:?usage: scripts/release-tools/package-linux.sh <x64|arm64> <version>}"
here="$(cd "$(dirname "$0")" && pwd)"
desktop="$(cd "$here/../../apps/desktop" && pwd)"
output="$desktop/release/linux/$arch"

case "$arch" in
  x64) unpacked="$output/linux-unpacked" manifest=latest-linux.yml ;;
  arm64) unpacked="$output/linux-arm64-unpacked" manifest=latest-linux-arm64.yml ;;
  *) echo "unsupported arch: $arch" >&2; exit 1 ;;
esac

[ -f "$desktop/out/main/index.js" ] || { echo "missing $desktop/out, build or download the bundle first" >&2; exit 1; }
rm -rf "$output"
(cd "$desktop" && env -u ELECTRON_RUN_AS_NODE pnpm exec electron-builder --linux AppImage deb "--$arch" --publish never -c.directories.output="$output")

"$here/verify-native-module.sh" "$unpacked/relay" "$unpacked/resources" "$arch"
[ -f "$unpacked/resources/app-update.yml" ] || { echo "$unpacked has no app-update.yml" >&2; exit 1; }
(cd "$output" && sha256sum -- *.AppImage *.deb >"SHA256SUMS-linux-$arch")
node "$here/verify-feed.ts" "$output/$manifest" "$version"
node "$here/verify-checksums.ts" "$output/SHA256SUMS-linux-$arch"
