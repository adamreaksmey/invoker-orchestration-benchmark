# Invoker orchestration benchmark

A replayable benchmark that compares **Invoker** (a DAG of small agent tasks, each in its own git
worktree) with **one continuous AI coding session** (Codex or Cursor) on the same spec, across four
projects with different purposes. The pass bar is a hidden acceptance suite. The cost is measured in
tokens.

See [METHODOLOGY.md](METHODOLOGY.md) for the full protocol, and `reports/COMBINED.md` for results.

## Layout

```text
bench.config.json            fixtures repo, fixture branches, arms and models
fixtures/<name>/             baseline source for each project (published to the fixtures repo)
fixtures/_shared/AGENTS.md   agent instructions copied into every baseline
fixtures/baselines.json      pinned baseline SHAs
specs/P<N>-w1.md             the change each arm must implement (becomes SPEC.md)
acceptance/P<N>/             HIDDEN acceptance suites + manifest (never in the fixtures repo)
reference/P<N>/              reference solutions proving each hidden suite is passable
reference/P1-prior/          previously accepted V3/V4 ledger tips (calibration)
plans/tasks.json             one DAG definition per fixture
plans/P<N>-*.yaml            generated Invoker plans (B uniform Codex, C mixed Codex, E uniform Cursor)
prompts/continuous.md        prompt for the continuous arms (A, D)
scripts/                     verify, calibrate, run-arm-*, finalize, rollup, audit, docx
runs/P<N>/arm-<x>/           per-cell evidence: meta, verify, diff, tokens, transcripts
reports/COMBINED.md          combined report
```

## Requirements

- macOS or Linux, Node 22.5+ (built-in `node:sqlite` with FTS5), npm, git, `gh` (authenticated)
- Codex CLI signed in (ChatGPT subscription) with access to `gpt-reserve` and `gpt-6-luna`
- Cursor CLI (`cursor agent`) signed in with access to `grok-4.5`
- An Invoker checkout with a built CLI (`packages/cli/dist/index.js`); set `INVOKER_CLI` if it is not at
  the default path in `scripts/lib/common.sh`
- Playwright Chromium for P1's browser test: `npx playwright install chromium`

## Replay

```bash
npm install
bash scripts/publish-fixtures.sh   # only if you use your own fixtures repo; edit bench.config.json first
bash scripts/calibrate.sh          # must exit 0: baselines fail, references pass

# one cell
bash scripts/run-arm-a.sh P2       # continuous Codex
bash scripts/run-arm-b.sh P2       # Invoker DAG, uniform Codex
bash scripts/run-arm-c.sh P2       # Invoker DAG, mixed Codex
bash scripts/run-arm-d.sh P2       # continuous Cursor
bash scripts/run-arm-e.sh P2       # Invoker DAG, uniform Cursor

# the whole matrix as two provider queues (P1 cells must not overlap: port 5173)
bash scripts/run-matrix.sh cursor P1:D P1:E P2:D P2:E P3:D P3:E P4:D P4:E &
bash scripts/run-matrix.sh codex  P2:A P2:B P2:C P3:A P3:B P3:C P4:A P4:B P4:C P1:A P1:B P1:C &
wait

node scripts/rollup-tokens.mjs     # runs/summary.json + per-cell tokens.json
node scripts/scrub-identifiers.mjs # redact Codex account ids before publishing transcripts
node scripts/report-tables.mjs     # reports/generated-tables.md from runs/summary.json
node scripts/assemble-report.mjs   # reports/COMBINED.md from COMBINED.template.md + generated tables
node scripts/build-docx.mjs        # renders reports/COMBINED.md to DOCX (--output <path>)
```

A cell refuses to overwrite an existing result. To rerun after an infrastructure failure:
`BENCH_RERUN_REASON="codex quota exhausted" bash scripts/run-arm-b.sh P2` (the previous attempt is
kept next to the new one).

Re-verify any published tip without rerunning an agent:

```bash
git -C work/fixtures fetch origin 'refs/heads/runs/*:refs/remotes/origin/runs/*'
node scripts/verify.mjs --fixture P2 --commit origin/runs/P2/arm-b --tier 2
```

## What each run records

`runs/P<N>/arm-<x>/meta.json` holds wall time, tip SHA and branch, tier 1 and tier 2 results,
`accepted`, the diff summary, whether the harness had to commit leftovers, and the number of
contamination findings. `tokens.json` holds per-session and per-model token totals. Invoker cells also
keep `plan.yaml`, `tasks.json` (task statuses and commits), and the Invoker task logs.
