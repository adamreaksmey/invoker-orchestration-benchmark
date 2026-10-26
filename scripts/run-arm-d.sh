#!/usr/bin/env bash
source "$(dirname "$0")/lib/common.sh"
FIXTURE_ID="${1:?usage: run-arm-d.sh P1|P2|P3|P4}"
ARM=D
prepare_run_dir "$FIXTURE_ID" "$ARM"
REPO="$HARNESS/work/runs/$FIXTURE_ID-$ARM"
clone_baseline "$FIXTURE_ID" "$REPO"
MODEL="$(config_value "c.arms.$ARM.model")"
PROMPT="$(cat "$HARNESS/prompts/continuous.md")"
STARTED_AT="$(iso_now)"; START_SECONDS="$(date +%s)"
set +e
( cd "$REPO" && "$BENCH_REAL_CURSOR" agent --print --force --trust --output-format json --model "$MODEL" "$PROMPT" ) \
  </dev/null > "$RUN_DIR/cursor.json" 2> "$RUN_DIR/cursor.stderr"
EXIT_CODE=$?
set -e
FINISHED_AT="$(iso_now)"; WALL_SECONDS=$(( $(date +%s) - START_SECONDS ))
node "$HARNESS/scripts/lib/write-run-info.mjs" "$RUN_DIR" "$FIXTURE_ID" "$ARM" "$STARTED_AT" "$FINISHED_AT" "$WALL_SECONDS" "$EXIT_CODE" \
  "{\"tool\":\"cursor agent\",\"model\":\"$MODEL\"}"
node "$HARNESS/scripts/finalize-run.mjs" --fixture "$FIXTURE_ID" --arm "$ARM" --run-dir "$RUN_DIR" --repo "$REPO" --commit-leftovers
