#!/usr/bin/env bash
set -euo pipefail
REAL_CURSOR="${BENCH_REAL_CURSOR:?BENCH_REAL_CURSOR must point at the real cursor binary}"
LOG_DIR="${BENCH_CURSOR_LOG_DIR:?BENCH_CURSOR_LOG_DIR must be set}"
mkdir -p "$LOG_DIR"
if [ "${1:-}" = "agent" ]; then shift; fi
INVOCATION="$(date +%s)-$$"
printf '%s\n' "$PWD" > "$LOG_DIR/$INVOCATION.cwd"
set +e
"$REAL_CURSOR" agent --force --output-format json "$@" </dev/null > "$LOG_DIR/$INVOCATION.json" 2> "$LOG_DIR/$INVOCATION.stderr"
STATUS=$?
set -e
node -e '
const fs = require("node:fs");
const raw = fs.readFileSync(process.argv[1], "utf8").trim();
try { const parsed = JSON.parse(raw); process.stdout.write(String(parsed.result ?? "") + "\n"); if (parsed.is_error) process.exitCode = 1; }
catch { process.stdout.write(raw + "\n"); }
' "$LOG_DIR/$INVOCATION.json" || STATUS=1
cat "$LOG_DIR/$INVOCATION.stderr" >&2
exit $STATUS
