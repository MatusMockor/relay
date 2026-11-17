#!/usr/bin/env bash

native_module_dir() {
  echo "$1/app.asar.unpacked/node_modules/better-sqlite3"
}

native_prebuild_name() {
  local arch="$1" platform
  case "$(uname -s)" in
    Darwin) platform=darwin ;;
    Linux) platform=linux ;;
    *) echo "unsupported platform $(uname -s)" >&2; return 1 ;;
  esac
  echo "$platform-$arch.node"
}
