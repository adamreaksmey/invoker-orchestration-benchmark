#!/usr/bin/env bash
set -euo pipefail
HARNESS="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURE_ID="${1:?usage: validate-reference.sh P1|P2|P3|P4 [overlay-dir] [result-name]}"
OVERLAY="${2:-$HARNESS/reference/$FIXTURE_ID}"
RESULT_NAME="${3:-$FIXTURE_ID}"
FIXTURE_NAME="$(node -p "require('$HARNESS/acceptance/$FIXTURE_ID/manifest.json').fixture")"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
rsync -a --exclude node_modules "$HARNESS/fixtures/$FIXTURE_NAME/" "$STAGE/"
rsync -a --exclude node_modules "$OVERLAY/" "$STAGE/"
node "$HARNESS/scripts/verify.mjs" --fixture "$FIXTURE_ID" --dir "$STAGE" --tier 2 --out "$HARNESS/reference/results/$RESULT_NAME.json"
