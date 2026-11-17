#!/usr/bin/env bash
set -euo pipefail

: "${APPLE_TEAM_ID:?APPLE_TEAM_ID must be set}"

identity="$(security find-identity -v -p codesigning | sed -n "s/.*\"Developer ID Application: \(.* ($APPLE_TEAM_ID)\)\"$/\1/p" | head -n 1)"
[ -n "$identity" ] || { echo "no Developer ID Application identity of team $APPLE_TEAM_ID in the keychain search list" >&2; exit 1; }
echo "$identity"
