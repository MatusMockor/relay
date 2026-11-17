#!/usr/bin/env bash
set -euo pipefail

: "${EVENT_NAME:?EVENT_NAME must be set}"
here="$(cd "$(dirname "$0")" && pwd)"
manifest="$(cd "$here/../../apps/desktop" && pwd)/package.json"
tag=""
if [ "$EVENT_NAME" = "push" ]; then
  : "${REF_NAME:?REF_NAME must be set for a tag push}"
  tag="$REF_NAME"
fi

version="$(node "$here/verify-package-version.ts" "$manifest" "$tag")"
echo "version=$version" >>"${GITHUB_OUTPUT:-/dev/stdout}"
echo "release version $version" >&2
