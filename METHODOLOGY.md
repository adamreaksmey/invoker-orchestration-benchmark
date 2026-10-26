# Methodology

## Question

Does running a software change as an **Invoker DAG** (a planned graph of small agent tasks, each in
its own git worktree) produce better results, or the same results more cheaply, than giving the
**same spec to one continuous agent session**?

"Better" is measured only by a hidden, automated acceptance suite. "Cheaper" is measured in tokens:
the benchmark does not convert tokens to dollars, because every arm uses flat subscriptions and more
tokens means more spend (or more quota) on any metered plan.

## Fixtures (four projects with different purposes)

| ID | Project | Purpose | W1 change |
|----|---------|---------|-----------|
| P1 | `ledger` | Full-stack web app (TypeScript Express API + React UI, npm workspaces) | Move in-memory ledger data into SQLite with migrations, a service layer, restart survival, and a working UI flow |
| P2 | `shortener` | HTTP microservice (Express, ESM) | SQLite persistence, URL/code validation, click analytics, per-IP rate limiting |
| P3 | `wiki` | Content and search service (Markdown files + Express) | Front matter, FTS5 search index with startup sync, ranked search with snippets, tags API |
| P4 | `csv-cli` | Command-line data tool (Node built-ins only) | RFC 4180 parsing, JSON-schema-style validation with row errors, aggregation, csv/json/table output |

Each fixture lives on its own orphan branch `baseline/p<N>-<name>` in
[`invoker-bench-fixtures`](https://github.com/adamreaksmey/invoker-bench-fixtures). A baseline branch
contains the app, its existing tests, `SPEC.md` (the W1 change, copied from `specs/`), and
`AGENTS.md` (work locally, no delegation, run tests, commit). Baseline SHAs are pinned in
`fixtures/baselines.json`.

## Arms

| Arm | Tool | Model routing | Shape |
|-----|------|---------------|-------|
| A | `codex exec` | `gpt-reserve` | One continuous session |
| B | Invoker DAG, Codex workers | every task `gpt-reserve` | 5–7 agent tasks + 1 command verify task |
| C | Invoker DAG, Codex workers | `gpt-6-luna` on tasks tagged *mechanical*, `gpt-reserve` on *hard* | same DAG as B |
| D | `cursor agent` | `grok-4.5` | One continuous session |
| E | Invoker DAG, Cursor workers | every task `grok-4.5` | same DAG as B |

Comparisons:

- **H1 (same worker, practical):** D vs E — does Invoker improve a Cursor workflow?
- **H2 (same worker, same model):** A vs B — does Invoker orchestration beat one Codex session?
- **H3 (model routing):** B vs C — does routing mechanical tasks to a cheaper model save tokens without losing acceptance?
- **Cross-worker:** B vs E — the same DAG on two different worker CLIs.

B, C, and E are generated from one definition (`plans/tasks.json`) by `scripts/gen-plans.mjs`, so the
DAG, prompts, and dependencies are identical and only agent/model differ. P1 reuses the V4 ledger DAG
shape (two tasks fan out after API integration, then join); P2–P4 are linear chains. The continuous
arms receive `prompts/continuous.md`, which asks for the whole of `SPEC.md`.

## Acceptance (what "passed" means)

`scripts/verify.mjs` extracts the arm's tip commit into a clean temporary directory and runs:

1. **Tier 1 (visible):** `npm ci`, `npm test`, `npm run build`. Agents can run these themselves.
2. **Tier 2 (hidden):** tier 1, then copies the fixture's hidden suite from `acceptance/P<N>/` into the
   checkout and runs it. Agents never see these files: they live only in this harness repo, which was
   kept private while the matrix ran.

A cell is **accepted** only if tier 2 passes and the tip differs from the baseline.

The hidden suites test the public contract in `SPEC.md` as a black box: restart persistence,
per-user isolation, status codes, analytics math with an injected clock, rate-limit windows, FTS
ranking and punctuation safety, CSV edge cases, row-numbered validation errors, output formats, and
for P1 a Playwright browser flow (register → account → transaction → reload → sign out/in).

### Calibration (run before any arm)

`scripts/calibrate.sh` must exit 0:

- every **baseline fails** its hidden suite (the suite measures the requested change);
- every **reference solution passes** (`reference/P<N>/` overlays; the suite is passable as written);
- for P1, all four **previously accepted V3/V4 tips** (Arms A–D of the earlier single-project study)
  also pass, tying this benchmark to the earlier results.

## Integrity rules

- **One run per cell.** A rerun is allowed only for an infrastructure failure (provider outage,
  quota exhaustion, harness bug) and is recorded in `rerun-reason.txt` with the previous attempt kept.
- **No silent repair.** The harness never edits agent output. If an arm leaves uncommitted work, the
  harness commits it as `harness: commit uncommitted agent work (flagged)` and sets
  `harnessCommittedLeftovers: true`.
- **Every tip is published** to `runs/P<N>/arm-<x>` in the fixtures repo, with a diff summary in
  `runs/P<N>/arm-<x>/diff.json`.
- **Isolation.** Each Codex cell uses a fresh `CODEX_HOME` containing only `auth.json`, so the global
  `~/.codex/AGENTS.md` (which contains Invoker routing instructions) and other sessions are invisible
  and every session file in that home belongs to the cell. Each Invoker cell uses its own
  `--db-dir` (database, clone, worktrees, logs).
- **Contamination audit.** `scripts/audit-contamination.mjs` scans each cell's transcripts for
  Invoker/delegation calls (`invoker-cli run`, `invoker_submit_plan`, …).

## Harness adaptations (disclosed)

- **Codex stdin wrapper (B, C).** `scripts/bin/codex` runs the real Codex with stdin closed. In V4,
  Codex workers blocked on an open stdin pipe under Invoker. This changes no prompt or flag.
- **Cursor worker wrapper (E).** Invoker launches Cursor workers as
  `cursor agent --print --trust --model grok-4.5 <prompt>`. Without `--force`, Cursor's print mode
  blocks shell commands, so a worker cannot run `npm test` or `git commit`. This is a real Invoker
  finding. `scripts/bin/cursor-worker.sh` (set as `INVOKER_CURSOR_COMMAND`) adds `--force` and
  `--output-format json` so E has the same shell access as D and its token usage is recorded; it
  prints the agent's final text so Invoker sees normal output.
- **No dependency provisioning.** Standalone `invoker-cli run` does not apply `repoProvisionCommands`,
  so Invoker worktrees start without `node_modules`, exactly like the continuous arms' fresh clones.
  Every agent installs dependencies itself when it needs them.
- **Concurrency.** `invoker-cli run --standalone` runs one task at a time (default `maxConcurrency`
  1). Two harness queues ran side by side: a Codex queue (A, B, C) and a Cursor queue (D, E). P1 cells,
  whose browser tests use port 5173, were scheduled so they never overlapped.
- **Post-freeze harness fix (audit only).** After the freeze commit, the contamination audit was
  found to match the harness's own `run.json` (which records the tool name `invoker-cli run`). The
  audit now skips harness-written files and was re-run on every cell; no agent was rerun and no
  result changed. Codex account identifiers are redacted from published transcripts by
  `scripts/scrub-identifiers.mjs`.
- **Residual exposure.** Cursor agents (D and E alike) can see the operator's global Cursor rules,
  which include an Invoker-routing rule. Every prompt and `AGENTS.md` says "Do it locally", which that
  rule defers to; MCP servers are not auto-approved; the audit checks for any delegation.

## Tokens

- **Codex:** from each session's final `token_count` event: `input_tokens` (which already includes
  cached input), `cached_input_tokens`, and `output_tokens`.
- **Cursor:** from each `--output-format json` result: total input = `inputTokens + cacheReadTokens +
  cacheWriteTokens`, cached = `cacheReadTokens`, plus `outputTokens`.
- Reported per cell: total input, uncached input, output, number of agent sessions, and (Codex only)
  movement of the subscription's 5-hour quota percentage when start and end fall in the same window.

Invoker's own prompt wrapping around each task prompt is included, because it is a real cost of using
Invoker.

## Limitations

- One run per cell. Agent runs are stochastic; a single pass or fail is evidence, not a rate.
- W1 only. Recovery (killing a task mid-run) and later change waves are not measured.
- Acceptance is automated. No blind human review of code quality.
- No agent saw the hidden tests, but the specs state the contract precisely, so a strong single
  session is not disadvantaged by missing information.
