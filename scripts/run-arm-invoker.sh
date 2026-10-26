#!/usr/bin/env bash
source "$(dirname "$0")/lib/common.sh"
FIXTURE_ID="${1:?usage: run-arm-invoker.sh P1|P2|P3|P4 B|C|E}"
ARM="${2:?usage: run-arm-invoker.sh P1|P2|P3|P4 B|C|E}"
prepare_run_dir "$FIXTURE_ID" "$ARM"
PLAN="$HARNESS/plans/$FIXTURE_ID-$(config_value "c.arms.$ARM.plan").yaml"
DB_DIR="$HARNESS/work/invoker/$FIXTURE_ID-$ARM"
rm -rf "$DB_DIR"
fresh_codex_home "$FIXTURE_ID-$ARM"
cp "$PLAN" "$RUN_DIR/plan.yaml"
export CODEX_HOME="$CODEX_HOME_DIR"
export PATH="$HARNESS/scripts/bin:$PATH"
export INVOKER_CURSOR_COMMAND="$HARNESS/scripts/bin/cursor-worker.sh"
export BENCH_CURSOR_LOG_DIR="$RUN_DIR/cursor-calls"
STARTED_AT="$(iso_now)"; START_SECONDS="$(date +%s)"
set +e
node "$INVOKER_CLI" run "$PLAN" --standalone --db-dir "$DB_DIR" --json > "$RUN_DIR/invoker-run.json" 2> "$RUN_DIR/invoker-run.stderr"
EXIT_CODE=$?
set -e
FINISHED_AT="$(iso_now)"; WALL_SECONDS=$(( $(date +%s) - START_SECONDS ))
WORKFLOW_ID="$(node -p "require('$RUN_DIR/invoker-run.json').workflow.id")"
INVOKER_DB_DIR="$DB_DIR" node "$INVOKER_CLI" query tasks --workflow "$WORKFLOW_ID" --standalone --output json > "$RUN_DIR/tasks.json" 2>/dev/null
WORKFLOW_STATUS="$(node -p "require('$RUN_DIR/invoker-run.json').workflow.status")"
cp -R "$CODEX_HOME_DIR/sessions" "$RUN_DIR/codex-sessions" 2>/dev/null || true
cp -R "$DB_DIR/outputs" "$RUN_DIR/invoker-outputs" 2>/dev/null || true
CLONE="$(ls -d "$DB_DIR"/repos/*/ | head -1)"
TIP="$(node "$HARNESS/scripts/lib/invoker-tip.mjs" "$RUN_DIR/tasks.json" "$(baseline_sha "$FIXTURE_ID")")"
AGENT="$(config_value "c.arms.$ARM.agent")"
node "$HARNESS/scripts/lib/write-run-info.mjs" "$RUN_DIR" "$FIXTURE_ID" "$ARM" "$STARTED_AT" "$FINISHED_AT" "$WALL_SECONDS" "$EXIT_CODE" \
  "{\"tool\":\"invoker-cli run --standalone\",\"agent\":\"$AGENT\",\"workflowId\":\"$WORKFLOW_ID\",\"workflowStatus\":\"$WORKFLOW_STATUS\"}"
node "$HARNESS/scripts/finalize-run.mjs" --fixture "$FIXTURE_ID" --arm "$ARM" --run-dir "$RUN_DIR" --repo "$CLONE" --tip "$TIP"
