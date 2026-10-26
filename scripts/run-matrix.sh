#!/usr/bin/env bash
set -uo pipefail
HARNESS="$(cd "$(dirname "$0")/.." && pwd)"
QUEUE_NAME="${1:?usage: run-matrix.sh <queue-name> <P1:A> [<P2:B> ...]}"
shift
LOG="$HARNESS/runs/queue-$QUEUE_NAME.log"
mkdir -p "$HARNESS/runs"
for CELL in "$@"; do
  FIXTURE_ID="${CELL%%:*}"
  ARM="${CELL##*:}"
  RUNNER="$HARNESS/scripts/run-arm-$(echo "$ARM" | tr 'A-Z' 'a-z').sh"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) START $FIXTURE_ID $ARM" >> "$LOG"
  bash "$RUNNER" "$FIXTURE_ID" >> "$LOG" 2>&1
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) END $FIXTURE_ID $ARM exit=$?" >> "$LOG"
done
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) QUEUE_DONE $QUEUE_NAME" >> "$LOG"
