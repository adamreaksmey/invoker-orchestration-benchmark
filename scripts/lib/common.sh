#!/usr/bin/env bash
set -euo pipefail
HARNESS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG="$HARNESS/bench.config.json"
INVOKER_CLI="${INVOKER_CLI:-/Users/adamreaksmey/Desktop/Personal/Invoker/packages/cli/dist/index.js}"
FIXTURES_CLONE="$HARNESS/work/fixtures"
export BENCH_REAL_CODEX="${BENCH_REAL_CODEX:-$(command -v codex)}"
export BENCH_REAL_CURSOR="${BENCH_REAL_CURSOR:-$(command -v cursor)}"

config_value() {
  node -p "const c=require('$CONFIG'); $1"
}

iso_now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

prepare_run_dir() {
  local fixture_id="$1" arm="$2"
  RUN_DIR="$HARNESS/runs/$fixture_id/arm-$(echo "$arm" | tr 'A-Z' 'a-z')"
  if [ -f "$RUN_DIR/meta.json" ]; then
    if [ "${BENCH_RERUN_REASON:-}" = "" ]; then
      echo "refusing to overwrite $RUN_DIR (set BENCH_RERUN_REASON to archive and rerun)" >&2
      exit 3
    fi
    local archive="$RUN_DIR.attempt-$(date +%s)"
    mv "$RUN_DIR" "$archive"
    mkdir -p "$RUN_DIR"
    printf '%s\n' "$BENCH_RERUN_REASON" > "$RUN_DIR/rerun-reason.txt"
    echo "$archive" > "$RUN_DIR/previous-attempt.txt"
  fi
  mkdir -p "$RUN_DIR"
}

fresh_codex_home() {
  local name="$1"
  CODEX_HOME_DIR="$HARNESS/work/codex-home/$name"
  rm -rf "$CODEX_HOME_DIR"
  mkdir -p "$CODEX_HOME_DIR"
  cp "$HOME/.codex/auth.json" "$CODEX_HOME_DIR/auth.json"
}

clone_baseline() {
  local fixture_id="$1" destination="$2"
  local branch
  branch="$(config_value "c.fixtures.$fixture_id.branch")"
  rm -rf "$destination"
  git clone -q --branch "$branch" "$(config_value 'c.fixturesRepoUrl')" "$destination"
  git -C "$destination" config user.name "bench-agent"
  git -C "$destination" config user.email "bench-agent@users.noreply.github.com"
}

baseline_sha() {
  node -p "require('$HARNESS/fixtures/baselines.json').$1.sha"
}
