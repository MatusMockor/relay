#!/usr/bin/env bash
set -euo pipefail

usage="usage: scripts/release-tools/verify-native-module.sh <electron-executable> <resources-dir> <arm64|x64>"
executable="${1:?$usage}"
resources="$(cd "${2:?$usage}" && pwd)"
arch="${3:?$usage}"
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/native-module-path.sh"
prebuilds="$(native_module_dir "$resources")/prebuilds"
expected="$(native_prebuild_name "$arch")"
module="$prebuilds/$expected"

[ -f "$module" ] || { echo "missing $module" >&2; exit 1; }
foreign="$(find "$prebuilds" -name '*.node' ! -name "$expected")"
[ -z "$foreign" ] || { echo "prebuilds for other platforms are packaged: $foreign" >&2; exit 1; }
[ ! -e "$(native_module_dir "$resources")/build/Release/better_sqlite3.node" ] || { echo "a locally compiled better_sqlite3.node would shadow the prebuild" >&2; exit 1; }

case "$(uname -s)-$arch" in
  Darwin-arm64) lipo "$module" -verify_arch arm64 ;;
  Darwin-x64) lipo "$module" -verify_arch x86_64 ;;
  Linux-arm64) file -b "$module" | grep -q 'ARM aarch64' ;;
  Linux-x64) file -b "$module" | grep -q 'x86-64' ;;
  *) false ;;
esac || { echo "$module is not built for $arch" >&2; exit 1; }

probe="if (process.arch !== process.argv[2]) { throw new Error('running as ' + process.arch); } const Database = require(process.argv[1]); const db = new Database(':memory:'); const row = db.prepare('select sqlite_version() as v').get(); db.close(); console.log('better-sqlite3 loads in Electron ' + process.versions.electron + ' ' + process.arch + ', sqlite ' + row.v);"
ELECTRON_RUN_AS_NODE=1 "$executable" -e "$probe" "$resources/app.asar/node_modules/better-sqlite3" "$arch"
