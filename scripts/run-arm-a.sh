#!/usr/bin/env bash
source "$(dirname "$0")/lib/common.sh"
FIXTURE_ID="${1:?usage: run-arm-a.sh P1|P2|P3|P4}"
ARM=A
prepare_run_dir "$FIXTURE_ID" "$ARM"
REPO="$HARNESS/work/runs/$FIXTURE_ID-$ARM"
clone_baseline "$FIXTURE_ID" "$REPO"
fresh_codex_home "$FIXTURE_ID-$ARM"
MODEL="$(config_value "c.arms.$ARM.model")"
PROMPT="$(cat "$HARNESS/prompts/continuous.md")"
STARTED_AT="$(iso_now)"; START_SECONDS="$(date +%s)"
set +e
CODEX_HOME="$CODEX_HOME_DIR" "$BENCH_REAL_CODEX" exec --json -m "$MODEL" --dangerously-bypass-approvals-and-sandbox -C "$REPO" "$PROMPT" \
  </dev/null > "$RUN_DIR/codex-exec.jsonl" 2> "$RUN_DIR/codex-exec.stderr"
EXIT_CODE=$?
set -e
FINISHED_AT="$(iso_now)"; WALL_SECONDS=$(( $(date +%s) - START_SECONDS ))
cp -R "$CODEX_HOME_DIR/sessions" "$RUN_DIR/codex-sessions" 2>/dev/null || true
node "$HARNESS/scripts/lib/write-run-info.mjs" "$RUN_DIR" "$FIXTURE_ID" "$ARM" "$STARTED_AT" "$FINISHED_AT" "$WALL_SECONDS" "$EXIT_CODE" \
  "{\"tool\":\"codex exec\",\"model\":\"$MODEL\"}"
node "$HARNESS/scripts/finalize-run.mjs" --fixture "$FIXTURE_ID" --arm "$ARM" --run-dir "$RUN_DIR" --repo "$REPO" --commit-leftovers
