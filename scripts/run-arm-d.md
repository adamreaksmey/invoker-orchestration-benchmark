# Arm D — continuous Cursor (operator notes)

`scripts/run-arm-d.sh P<N>` runs Arm D without operator interaction:

1. Clones `baseline/p<N>-<name>` from the fixtures repo into `work/runs/P<N>-D`.
2. Runs, from inside that clone:
   `cursor agent --print --force --trust --output-format json --model grok-4.5 "$(cat prompts/continuous.md)"`
   - `--force` lets the agent run shell commands (`npm test`, `git commit`); without it, print mode
     blocks them.
   - `--output-format json` returns one JSON result whose `usage` field is the token record.
   - MCP servers are not auto-approved (`--approve-mcps` is not passed).
3. Writes `cursor.json` / `cursor.stderr` and `run.json`, then calls `finalize-run.mjs`, which commits
   any uncommitted work as a flagged harness commit, publishes the tip to `runs/P<N>/arm-d`, and runs the
   hidden verify and contamination audit.

Running it from the Cursor IDE instead is not equivalent: the IDE's agent loop, context, and token
accounting differ from the CLI.
