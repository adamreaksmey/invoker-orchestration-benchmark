#!/usr/bin/env bash
set -euo pipefail
HARNESS="$(cd "$(dirname "$0")/.." && pwd)"
RESULTS="$HARNESS/reference/results"
mkdir -p "$RESULTS"
FAILURES=0
for FIXTURE_ID in P1 P2 P3 P4; do
  SHA="$(node -p "require('$HARNESS/fixtures/baselines.json').$FIXTURE_ID.sha")"
  if node "$HARNESS/scripts/verify.mjs" --fixture "$FIXTURE_ID" --commit "$SHA" --out "$RESULTS/$FIXTURE_ID-baseline.json" >/dev/null 2>&1; then
    echo "[calibrate] $FIXTURE_ID baseline unexpectedly PASSED hidden acceptance"; FAILURES=$((FAILURES + 1))
  else
    echo "[calibrate] $FIXTURE_ID baseline fails hidden acceptance (expected)"
  fi
  if bash "$HARNESS/scripts/validate-reference.sh" "$FIXTURE_ID" >/dev/null 2>&1; then
    echo "[calibrate] $FIXTURE_ID reference passes hidden acceptance (expected)"
  else
    echo "[calibrate] $FIXTURE_ID reference FAILED hidden acceptance"; FAILURES=$((FAILURES + 1))
  fi
done
for PRIOR in "$HARNESS"/reference/P1-prior/*/; do
  NAME="$(basename "$PRIOR")"
  if bash "$HARNESS/scripts/validate-reference.sh" P1 "$PRIOR" "P1-prior-$NAME" >/dev/null 2>&1; then
    echo "[calibrate] P1 prior accepted tip $NAME passes (expected)"
  else
    echo "[calibrate] P1 prior accepted tip $NAME FAILED"; FAILURES=$((FAILURES + 1))
  fi
done
exit "$FAILURES"
