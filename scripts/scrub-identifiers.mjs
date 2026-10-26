#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUNS_ROOT = join(HARNESS_ROOT, "runs");
const ACCOUNT_FIELD_PATTERN = /"(creator_user_id|creator_account_id|account_id|user_id|email)"\s*:\s*"[^"]*"/g;
const REDACTED_VALUE = "redacted";
const SCRUBBED_EXTENSIONS = /\.(jsonl?|log|stderr|txt)$/;

function listFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return listFiles(path);
    return SCRUBBED_EXTENSIONS.test(entry) ? [path] : [];
  });
}

let scrubbedFiles = 0;
for (const path of listFiles(RUNS_ROOT)) {
  const original = readFileSync(path, "utf8");
  const scrubbed = original.replace(ACCOUNT_FIELD_PATTERN, (_match, field) => `"${field}":"${REDACTED_VALUE}"`);
  if (scrubbed === original) continue;
  writeFileSync(path, scrubbed);
  scrubbedFiles += 1;
}
console.log(`scrubbed account identifiers in ${scrubbedFiles} file(s)`);
