#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SUMMARY_PATH = join(HARNESS_ROOT, "runs", "summary.json");
const OUTPUT_PATH = join(HARNESS_ROOT, "reports", "generated-tables.md");
const FIXTURE_IDS = ["P1", "P2", "P3", "P4"];
const ARM_IDS = ["A", "B", "C", "D", "E"];
const COMPARISONS = [
  { label: "H2: Invoker vs continuous, same Codex model (B ÷ A)", numerator: "B", denominator: "A" },
  { label: "H1: Invoker vs continuous, same Cursor model (E ÷ D)", numerator: "E", denominator: "D" },
  { label: "H3: mixed vs uniform model routing inside Invoker (C ÷ B)", numerator: "C", denominator: "B" },
  { label: "Cross-worker: same DAG, Cursor vs Codex workers (E ÷ B)", numerator: "E", denominator: "B" },
];
const THOUSAND = 1000;

const summary = JSON.parse(readFileSync(SUMMARY_PATH, "utf8"));
const cellIndex = new Map(summary.cells.map((cell) => [`${cell.fixture}${cell.arm}`, cell]));
const cellFor = (fixtureId, armId) => cellIndex.get(`${fixtureId}${armId}`);

function formatThousands(value) {
  return `${Math.round(value / THOUSAND).toLocaleString("en-US")}k`;
}

function formatRatio(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}×` : "n/a";
}

function renderTable(header, rows) {
  return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

function matrix(title, describeCell) {
  const rows = FIXTURE_IDS.map((fixtureId) => [fixtureId, ...ARM_IDS.map((armId) => {
    const cell = cellFor(fixtureId, armId);
    return cell ? describeCell(cell) : "not run";
  })]);
  return `### ${title}\n\n${renderTable(["Fixture", ...ARM_IDS.map((armId) => `Arm ${armId}`)], rows)}`;
}

function acceptanceLabel(cell) {
  if (cell.accepted) return "PASS";
  return cell.tier1 === "pass" ? "FAIL (hidden)" : "FAIL (visible)";
}

function sumOver(armId, read) {
  return FIXTURE_IDS.map((fixtureId) => cellFor(fixtureId, armId)).filter(Boolean).reduce((total, cell) => total + read(cell), 0);
}

function ratioRows(read) {
  return COMPARISONS.map(({ label, numerator, denominator }) => {
    const perFixture = FIXTURE_IDS.map((fixtureId) => {
      const top = cellFor(fixtureId, numerator);
      const bottom = cellFor(fixtureId, denominator);
      return top && bottom ? formatRatio(read(top) / read(bottom)) : "n/a";
    });
    return [label, ...perFixture, formatRatio(sumOver(numerator, read) / sumOver(denominator, read))];
  });
}

function ratioTable(title, read) {
  return `### ${title}\n\n${renderTable(["Comparison", ...FIXTURE_IDS, "All four (sum ÷ sum)"], ratioRows(read))}`;
}

function acceptanceTotals() {
  const rows = ARM_IDS.map((armId) => {
    const cells = FIXTURE_IDS.map((fixtureId) => cellFor(fixtureId, armId)).filter(Boolean);
    const accepted = cells.filter((cell) => cell.accepted).length;
    return [`Arm ${armId}`, `${accepted} / ${cells.length}`, formatThousands(sumOver(armId, (cell) => cell.tokens.totals.totalInput)), formatThousands(sumOver(armId, (cell) => cell.tokens.totals.output)), `${sumOver(armId, (cell) => cell.wallSeconds)} s`];
  });
  return `### Totals per arm (all four fixtures)\n\n${renderTable(["Arm", "Accepted", "Total input tokens", "Output tokens", "Wall time"], rows)}`;
}

function perAcceptedTable() {
  const rows = ARM_IDS.map((armId) => {
    const cells = FIXTURE_IDS.map((fixtureId) => cellFor(fixtureId, armId)).filter(Boolean);
    const acceptedCount = cells.filter((cell) => cell.accepted).length;
    const totalInput = sumOver(armId, (cell) => cell.tokens.totals.totalInput);
    const totalOutput = sumOver(armId, (cell) => cell.tokens.totals.output);
    if (acceptedCount === 0) return [`Arm ${armId}`, "0", "n/a", "n/a"];
    return [`Arm ${armId}`, String(acceptedCount), formatThousands(totalInput / acceptedCount), formatThousands(totalOutput / acceptedCount)];
  });
  return `### Tokens per accepted deliverable (all tokens spent ÷ accepted cells)\n\n${renderTable(["Arm", "Accepted cells", "Input tokens per accepted", "Output tokens per accepted"], rows)}`;
}

function quotaTable() {
  const rows = FIXTURE_IDS.map((fixtureId) => [fixtureId, ...["A", "B", "C"].map((armId) => {
    const quota = cellFor(fixtureId, armId)?.tokens.codexQuota;
    if (!quota) return "n/a";
    return quota.sameWindow ? `+${quota.deltaPercent.toFixed(0)} pts` : `window reset (${quota.startPercent}→${quota.endPercent}%)`;
  })]);
  return `### Codex 5-hour quota consumed (percentage points, same window only)\n\n${renderTable(["Fixture", "Arm A", "Arm B", "Arm C"], rows)}`;
}

function perSessionTable() {
  const rows = FIXTURE_IDS.map((fixtureId) => {
    const continuousCodex = cellFor(fixtureId, "A")?.tokens.totals.totalInput;
    const continuousCursor = cellFor(fixtureId, "D")?.tokens.totals.totalInput;
    const perStep = (armId) => {
      const totals = cellFor(fixtureId, armId)?.tokens.totals;
      return totals ? totals.totalInput / totals.sessions : NaN;
    };
    return [
      fixtureId,
      formatThousands(continuousCodex),
      `${formatThousands(perStep("B"))} (${formatRatio(perStep("B") / continuousCodex)} of A)`,
      formatThousands(continuousCursor),
      `${formatThousands(perStep("E"))} (${formatRatio(perStep("E") / continuousCursor)} of D)`,
    ];
  });
  return `### Input tokens: one Invoker step vs the whole continuous job\n\n${renderTable(["Fixture", "Arm A whole job", "Arm B average per step", "Arm D whole job", "Arm E average per step"], rows)}`;
}

function integrityTable() {
  const rows = summary.cells.map((cell) => [
    `${cell.fixture} ${cell.arm}`,
    cell.tipSha.slice(0, 7),
    cell.diff.shortstat || "no changes",
    String(cell.diff.commits),
    cell.harnessCommittedLeftovers ? "yes (flagged)" : "no",
    String(cell.contaminationFindings ?? "n/a"),
    String(cell.tokens.totals.sessions),
    cell.workflowStatus ?? "—",
  ]);
  return `### Per-cell evidence\n\n${renderTable(["Cell", "Tip", "Diff vs baseline", "Commits", "Harness committed leftovers", "Delegation findings", "Agent sessions", "Invoker workflow status"], rows)}`;
}

function byModelTable() {
  const rows = summary.cells.filter((cell) => cell.arm === "C").map((cell) => {
    const models = Object.entries(cell.tokens.byModel).map(([model, totals]) => `${model}: ${formatThousands(totals.totalInput)} in / ${formatThousands(totals.output)} out (${totals.sessions} sessions)`);
    return [cell.fixture, models.join("; ")];
  });
  return `### Arm C token split by model\n\n${renderTable(["Fixture", "Per-model totals"], rows)}`;
}

const sections = [
  matrix("Hidden acceptance", acceptanceLabel),
  acceptanceTotals(),
  matrix("Wall time (seconds)", (cell) => String(cell.wallSeconds)),
  matrix("Total input tokens (includes cached)", (cell) => formatThousands(cell.tokens.totals.totalInput)),
  matrix("Uncached input tokens", (cell) => formatThousands(cell.tokens.totals.uncachedInput)),
  matrix("Output tokens", (cell) => formatThousands(cell.tokens.totals.output)),
  ratioTable("Total input token ratio", (cell) => cell.tokens.totals.totalInput),
  ratioTable("Uncached input token ratio", (cell) => cell.tokens.totals.uncachedInput),
  ratioTable("Output token ratio", (cell) => cell.tokens.totals.output),
  ratioTable("Wall time ratio", (cell) => cell.wallSeconds),
  perSessionTable(),
  perAcceptedTable(),
  quotaTable(),
  byModelTable(),
  integrityTable(),
];
writeFileSync(OUTPUT_PATH, `<!-- generated by scripts/report-tables.mjs from runs/summary.json (${summary.generatedAt}) -->\n\n${sections.join("\n\n")}\n`);
console.log(`wrote ${OUTPUT_PATH}`);
