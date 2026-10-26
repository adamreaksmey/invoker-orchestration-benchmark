#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const DELEGATION_SIGNATURES = [
  /invoker-cli\s+(run|submit|retry|wait)\b/,
  /invoker_(submit_plan|prepare_plan_review|list_tasks|get_workflow)/,
  /submit-plan\.sh/,
  /mcp__invoker/,
  /packages\/cli\/dist\/index\.js\s+run\b/,
];
const SCANNED_EXTENSIONS = /\.(jsonl?|txt|log|stderr|out)$/;
const MAX_EXCERPT_CHARACTERS = 240;

const { values } = parseArgs({ options: { "run-dir": { type: "string" } } });
if (!values["run-dir"]) {
  console.error("usage: audit-contamination.mjs --run-dir <dir>");
  process.exit(64);
}
const runDirectory = resolve(values["run-dir"]);

function listFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return listFiles(path);
    return SCANNED_EXTENSIONS.test(entry) && entry !== "contamination.json" ? [path] : [];
  });
}

function findSignatures(path) {
  const text = readFileSync(path, "utf8");
  return DELEGATION_SIGNATURES.flatMap((signature) => {
    const match = signature.exec(text);
    if (!match) return [];
    const start = Math.max(0, match.index - MAX_EXCERPT_CHARACTERS / 2);
    return [{ file: relative(runDirectory, path), signature: signature.source, excerpt: text.slice(start, start + MAX_EXCERPT_CHARACTERS) }];
  });
}

const findings = listFiles(runDirectory).flatMap(findSignatures);
const report = { scannedAt: new Date().toISOString(), signatures: DELEGATION_SIGNATURES.map((signature) => signature.source), findings };
writeFileSync(join(runDirectory, "contamination.json"), `${JSON.stringify(report, null, 2)}\n`);
console.error(`[audit] ${findings.length} delegation signature(s) found`);
