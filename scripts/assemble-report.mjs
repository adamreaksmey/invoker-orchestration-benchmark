#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_PATH = join(HARNESS_ROOT, "reports", "COMBINED.template.md");
const TABLES_PATH = join(HARNESS_ROOT, "reports", "generated-tables.md");
const OUTPUT_PATH = join(HARNESS_ROOT, "reports", "COMBINED.md");
const PLACEHOLDER_PATTERN = /\{\{table:([^}]+)\}\}/g;

function indexTablesByHeading(markdown) {
  const tables = new Map();
  for (const section of markdown.split(/^### /m).slice(1)) {
    const [heading, ...body] = section.split("\n");
    tables.set(heading.trim(), body.join("\n").trim());
  }
  return tables;
}

const tables = indexTablesByHeading(readFileSync(TABLES_PATH, "utf8"));
const missing = [];
const report = readFileSync(TEMPLATE_PATH, "utf8").replace(PLACEHOLDER_PATTERN, (_placeholder, heading) => {
  const table = tables.get(heading.trim());
  if (table === undefined) missing.push(heading);
  return table ?? `**MISSING TABLE: ${heading}**`;
});
if (missing.length > 0) {
  console.error(`missing generated tables: ${missing.join(", ")}`);
  process.exit(1);
}
writeFileSync(OUTPUT_PATH, report);
console.log(`wrote ${OUTPUT_PATH}`);
