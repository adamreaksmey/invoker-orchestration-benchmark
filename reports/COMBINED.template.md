# Invoker Orchestration Benchmark — Combined Report

**Four projects, five execution arms, one hidden pass bar.** October 2026.

Harness and evidence: [invoker-orchestration-benchmark](https://github.com/adamreaksmey/invoker-orchestration-benchmark) · Fixture baselines and every arm's output: [invoker-bench-fixtures](https://github.com/adamreaksmey/invoker-bench-fixtures)

---

## Summary

We gave the same written change request to five ways of running AI coding agents, on four small but
real projects with different purposes, and judged every result with hidden tests the agents never saw.

- **Invoker spent about 3.3× the tokens and took about 3.2–3.5× as long overall** as one continuous session of
  the same agent and model, on every one of the four projects, for both Codex and Cursor.
- **On three of the four projects, it bought nothing:** every arm passed.
- **On the fourth project (a full-stack web app), Invoker with Codex was the only setup that passed.**
  Its plan had a dedicated "make the web flow work" step, which made the agent run the browser test and
  find a UI bug. Both continuous sessions skipped the UI. Invoker with Cursor had the same step and still
  missed the bug.
- **Routing simple steps to a cheaper model did not reduce total tokens** (1.00× overall). It reduced
  output tokens by about a fifth.
- **Per accepted deliverable**, Invoker with Codex used 2.4× the input tokens of continuous Codex, and
  Invoker with Cursor used 3.3× those of continuous Cursor.

The team's conclusion holds on this evidence: as an execution engine, Invoker adds a large, consistent
token and time overhead. Its one measurable benefit was **forcing an explicit step list**. An earlier
study showed a continuous session gets that same benefit when its prompt lists the steps.

---

## 1. Background

**Invoker** is an orchestration tool for AI coding agents. Instead of one long agent session, it runs a
**plan**: a directed acyclic graph (DAG) of small tasks. Each task is a fresh agent session (or a shell
command) in its own git worktree, branched from the result of the tasks it depends on. Invoker
persists the graph, commits each task's output, and can run independent tasks in parallel.

The claim under test is that this decomposition improves the result, lowers cost, or both. An earlier
study on one project (a personal-finance ledger) found that Invoker used 2.77× the input tokens and 4.36×
the wall time of one continuous Codex session, with no quality gain. That study had one project, no
hidden tests, and no token data for Cursor. This benchmark repeats the comparison on four projects,
adds Cursor on both sides, uses hidden acceptance tests, and ships everything needed to replay it.

## 2. What was run

### 2.1 Four projects with different purposes

| ID | Project | What it is | The change requested (W1) |
|---|---|---|---|
| P1 | Ledger | Full-stack personal-finance app: TypeScript Express API, React UI, SQLite auth | Move accounts and transactions from memory into SQLite (migrations, service layer, per-user scoping), survive restarts, and keep the UI flow working |
| P2 | Link shortener | HTTP microservice | SQLite persistence, URL and custom-code validation, click analytics by UTC day, per-IP rate limiting with `Retry-After` |
| P3 | Markdown wiki | Content and search service over Markdown files | Front matter, an FTS5 search index kept in sync with the files, ranked search with snippets, a tags API |
| P4 | CSV report CLI | Command-line data tool (Node built-ins only) | RFC 4180 parsing, schema validation with row-numbered errors, aggregation, CSV/JSON/table output |

Each change is written as a `SPEC.md` in the project with exact contracts: routes, status codes,
options, and output formats. Every arm received the same spec.

### 2.2 Five arms

| Arm | How the work was run | Model |
|---|---|---|
| **A** | One continuous Codex session (`codex exec`) | `gpt-reserve` |
| **B** | Invoker DAG, every task a Codex session | `gpt-reserve` |
| **C** | Same DAG as B; tasks tagged *mechanical* use a cheaper model | `gpt-6-luna` / `gpt-reserve` |
| **D** | One continuous Cursor session (`cursor agent`) | `grok-4.5` |
| **E** | Same DAG as B, every task a Cursor session | `grok-4.5` |

The DAGs have 5 agent steps (P2–P4) or 7 (P1), plus a final command step that runs install, tests,
and build. B, C, and E are generated from one definition, so they differ only in agent and model. The
continuous arms got a short prompt: implement all of `SPEC.md`, run the tests and build, commit.

The comparisons answer four questions:

- **H1:** D vs E. Does Invoker improve a Cursor workflow?
- **H2:** A vs B. Does Invoker beat one session of the same Codex model?
- **H3:** B vs C. Does cheaper-model routing inside Invoker save tokens?
- **Cross-worker:** B vs E. Does the same DAG behave differently on Codex and Cursor?

### 2.3 How results were judged

A result **passes** only if, from a clean checkout of the arm's final commit:

1. `npm ci`, `npm test`, and `npm run build` succeed (visible to agents), **and**
2. a **hidden acceptance suite** passes. It tests the spec's contract as a black box: restart
   persistence, per-user isolation, status codes, analytics math with a fake clock, rate-limit windows,
   search ranking and punctuation safety, CSV edge cases, and validation messages. For P1 it also runs a
   browser test of the full flow: register, add an account, record a transaction, reload, sign out,
   and sign in.

The hidden suites were **calibrated before any arm ran**. Every untouched baseline fails its suite,
every reference solution passes it, and all four previously accepted results from the earlier ledger
study also pass P1's suite.

### 2.4 Integrity controls

Each arm-project cell ran once. No result was repaired by hand. Every final commit is published as
`runs/P<N>/arm-<x>` in the fixtures repo. Codex cells used an empty, isolated Codex home, and Invoker
cells used an isolated Invoker database. A transcript audit found **no delegation calls** in any cell.
Two harness adaptations are disclosed in the methodology:

- Cursor workers under Invoker needed `--force` to run shell commands at all.
- Codex workers needed stdin closed so they wouldn't hang.

---

## 3. Results

### 3.1 Did it pass?

{{table:Hidden acceptance}}

{{table:Totals per arm (all four fixtures)}}

Every arm passed P2, P3, and P4. P1 split the arms: only the two Invoker-with-Codex arms passed.
§4 explains why.

### 3.2 How much did it cost?

{{table:Total input tokens (includes cached)}}

{{table:Total input token ratio}}

{{table:Uncached input token ratio}}

{{table:Output token ratio}}

{{table:Tokens per accepted deliverable (all tokens spent ÷ accepted cells)}}

All runs used flat subscriptions, so tokens are the cost measure. More tokens means more money or
more quota on any metered plan.

- Against the same agent and model, Invoker used **3.25× (Codex) and 3.29× (Cursor)** the total input
  tokens.
- It used **3.86× and 4.85×** the uncached input tokens, and **2.56× and 2.42×** the output tokens.
- **The multiple held on every project, from 2.40× at the lowest to 4.17× at the highest.**

The Codex 5-hour quota meter moves in whole percentage points, which was too coarse to separate the
arms (every cell moved it by 0 or 1 point).

### 3.3 How long did it take?

{{table:Wall time (seconds)}}

{{table:Wall time ratio}}

Invoker took **3.52× (Codex) and 3.22× (Cursor)** the wall time. In standalone mode Invoker runs one task
at a time. Each task starts in a fresh worktree without installed dependencies and rebuilds its
understanding of the code.

### 3.4 Where Invoker's extra tokens come from

{{table:Input tokens: one Invoker step vs the whole continuous job}}

**A single Invoker step costs 48–83% of the input tokens of the entire continuous job.** Each step is a
new session. It re-reads the spec, rediscovers the codebase, often reinstalls dependencies, and runs
the test suite again. With 5–7 steps, that fixed per-step cost dominates.

### 3.5 Does cheaper-model routing help?

{{table:Arm C token split by model}}

Mixed routing (C) used **1.00×** the total input tokens of uniform routing (B), with a range of 0.77–1.12×
per project. It used **0.79×** the output tokens, and its wall time was unchanged (0.99×). The earlier
study saw a 19.6% input reduction on P1. Here P1 went the other way (1.10×). Routing changes which
model reads the tokens, which may matter for per-token pricing, but it does not shrink the work.

### 3.6 Same DAG, different worker

The identical plan on Cursor workers (E) used **1.05×** the input tokens, **1.45×** the output tokens,
and **1.60×** the wall time of Codex workers (B). It also failed P1, where B passed.

---

## 4. The one divergence: P1, the full-stack app

P1's baseline UI has a real bug. The add-account and add-transaction handlers call
`event.currentTarget.reset()` after an `await`, when `currentTarget` is already null. The handler throws, and the new
account never appears. The spec says to "fix any frontend bug that prevents this flow". The browser test
in `e2e/` would reveal the bug, but `npm test` does not run it.

| Arm | Touched `apps/web`? | Fixed the `reset()` bug? | Ran the browser test? | Result |
|---|---|---|---|---|
| A — continuous Codex | No | No | No (20 tool calls in total) | FAIL |
| B — Invoker + Codex | Yes | Yes | Yes (2 runs, 95 tool calls) | PASS |
| C — Invoker + Codex (mixed) | Yes | Yes | Yes (2 runs, 109 tool calls) | PASS |
| D — continuous Cursor | Yes (balance formatting) | No | Not recorded* | FAIL |
| E — Invoker + Cursor | Yes (balance formatting) | No | Not recorded* | FAIL |

\*Cursor's JSON output contains only the final message, not the tool calls.

The difference is **the plan's dedicated web step** (`p1-web-smoke`: "make the web app work end to
end… enable the ledger smoke test"). That step made the Codex worker run the browser test, see the
failure, and fix it. The continuous Codex session treated the work as a backend change and stopped after
`npm test` passed. The same step did not rescue Cursor, so the step list is necessary but not
sufficient.

**This is a checklist effect, not an orchestration effect.** In the earlier study, continuous Codex
**passed** this same change when its prompt listed the deliverables explicitly ("enable the ledger smoke
test", "fix `form.reset()`"). An explicit step list helps, and a single session can use one.

---

## 5. Answers to the four questions

| Question | Answer on this evidence |
|---|---|
| **H1** — Does Invoker improve Cursor? (D vs E) | **No.** Same acceptance (3/4 each), with 3.29× the input tokens and 3.22× the time. |
| **H2** — Does Invoker beat one Codex session? (A vs B) | **Mixed.** Acceptance was better (4/4 vs 3/4, entirely from P1's step list), at 3.25× the input tokens and 3.52× the time. Per accepted deliverable, input tokens were 2.44×. |
| **H3** — Does cheaper-model routing save tokens? (B vs C) | **Not in total tokens** (1.00×). Output fell to 0.79×. Whether this saves money depends on per-model pricing, which was not measured. |
| **Cross-worker** (B vs E) | **The Codex workers did better.** Same DAG; Cursor workers used more output and time and missed P1. |

## 6. Coverage of Edbert's suggested tests

| Edbert's ask | Status in this benchmark |
|---|---|
| Continuous session vs decomposed execution | **Done on four projects** for both Codex (A vs B) and Cursor (D vs E). |
| Do not credit model routing as orchestration savings | **Done.** B vs C isolates routing, and A vs B isolates decomposition. |
| Mixed models by task complexity, frozen before the run | **Done.** Routing was tagged in `plans/tasks.json` and committed before any run. |
| Cost per accepted deliverable; incomplete work is not a win | **Done.** Hidden acceptance, plus tokens per accepted cell (§3.2). |
| Per-stage / per-task cost | **Done for Invoker** (per-session tokens in each cell's `tokens.json`; §3.4). |
| Orchestration value for Cursor, with token economics | **Done.** Cursor tokens measured on both sides (D, E). |
| Repeat across multiple independent workloads | **Done across four projects** (one run per cell, no repeats per cell). |
| Quality beyond tests (blind review, maintainability) | **Not done.** Acceptance is automated only. |
| Persistent-DAG recovery under controlled interruption | **Not done.** Deferred, as agreed; it is the main remaining case where Invoker could add value. |
| Statistical repeats per cell | **Not done.** One run per cell; each result is evidence, not a rate. |

## 7. Limitations

- **One run per cell.** Agent runs are stochastic. The P1 split rests on 5 runs. Invoker cost more tokens and more time in
  all eight Invoker-versus-continuous pairs, which makes that the most reliable result here.
- **Small, well-specified changes.** These changes take a continuous agent about 1–3 minutes. Larger or
  vaguer work could change the balance, in either direction.
- **No parallelism.** Invoker standalone runs one task at a time, and three of the four DAGs are linear
  chains. Parallel fan-out could reduce Invoker's wall time, but not its tokens.
- **No recovery or interruption test.** Resuming a long job after a crash is Invoker's strongest
  design claim and is not measured here.
- **Automated acceptance only.** The hidden suites are strict, but no human reviewed code quality.
  Invoker arms produced larger diffs (more tests and docs), which this benchmark does not reward.

## 8. What this suggests for making Invoker better

These are hypotheses drawn from the measurements. None was tested here.

1. **Cut the per-step cold start.** Each step costs half or more of a whole continuous job (§3.4).
   Carrying context forward between dependent steps (a summary, the previous session, or a warm
   worktree with dependencies installed) targets the largest cost directly.
2. **Choose granularity by size.** For changes a single session finishes in minutes, 5–7 steps
   multiply cost without improving results. Fewer, coarser steps, or one step with a checklist, would
   keep the checklist benefit at a fraction of the cost.
3. **Keep the checklist, drop the fan-out by default.** The only acceptance gain came from an explicit,
   verifiable step ("run the browser test"). Invoker could generate that checklist and hand it to one
   session.
4. **Fix the Cursor worker defaults.** Invoker launches Cursor workers without `--force`, so they cannot
   run shell commands. This benchmark had to wrap the command.
5. **Apply repository provisioning in standalone mode.** Standalone runs ignore
   `repoProvisionCommands`, so every worktree starts without dependencies.

## 9. How to reproduce

```bash
git clone https://github.com/adamreaksmey/invoker-orchestration-benchmark.git
cd invoker-orchestration-benchmark && npm install
git clone https://github.com/adamreaksmey/invoker-bench-fixtures.git work/fixtures
bash scripts/calibrate.sh                      # baselines fail, references pass
bash scripts/run-arm-a.sh P2                   # any arm A–E, any project P1–P4
node scripts/rollup-tokens.mjs && node scripts/report-tables.mjs
```

Re-check any published result without running an agent:
`node scripts/verify.mjs --fixture P1 --commit origin/runs/P1/arm-b --tier 2` (after fetching the `runs/*`
branches into `work/fixtures`). The full protocol is in `METHODOLOGY.md`.

---

## Appendix — per-cell evidence

{{table:Per-cell evidence}}

{{table:Uncached input tokens}}

{{table:Output tokens}}

{{table:Codex 5-hour quota consumed (percentage points, same window only)}}
