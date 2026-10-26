#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES_CLONE = join(HARNESS_ROOT, "work", "fixtures");
const STEP_TIMEOUT_MS = 15 * 60 * 1000;
const LOG_TAIL_CHARACTERS = 4000;
const COPY_EXCLUDED_NAMES = new Set(["node_modules", ".git", "dist", "test-results", "playwright-report"]);
const TIER_ONE_STEPS = [
  { name: "install", command: "npm ci --no-audit --no-fund" },
  { name: "test", command: "npm test" },
  { name: "build", command: "npm run build" },
];

function readOptions() {
  const { values } = parseArgs({
    options: {
      fixture: { type: "string" },
      commit: { type: "string" },
      dir: { type: "string" },
      tier: { type: "string", default: "2" },
      out: { type: "string" },
      keep: { type: "boolean", default: false },
    },
  });
  if (!values.fixture || (!values.commit && !values.dir)) {
    console.error("usage: verify.mjs --fixture P1..P4 (--commit <sha> | --dir <path>) [--tier 1|2] [--out file.json] [--keep]");
    process.exit(64);
  }
  return values;
}

function extractCommit(commit, destination) {
  const archive = spawnSync("git", ["-C", FIXTURES_CLONE, "archive", "--format=tar", commit], { maxBuffer: 1 << 30 });
  if (archive.status !== 0) throw new Error(`git archive ${commit} failed: ${archive.stderr}`);
  const untar = spawnSync("tar", ["-x", "-C", destination], { input: archive.stdout });
  if (untar.status !== 0) throw new Error(`tar extract failed: ${untar.stderr}`);
}

function copyDirectory(source, destination) {
  cpSync(source, destination, {
    recursive: true,
    filter: (path) => !COPY_EXCLUDED_NAMES.has(path.split("/").pop()),
  });
}

function runStep(step, workingDirectory) {
  const startedAt = Date.now();
  const result = spawnSync("bash", ["-lc", step.command], {
    cwd: workingDirectory,
    encoding: "utf8",
    timeout: STEP_TIMEOUT_MS,
    maxBuffer: 1 << 28,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return {
    name: step.name,
    command: step.command,
    exitCode: result.status ?? (result.signal ? `signal:${result.signal}` : "unknown"),
    passed: result.status === 0,
    durationMs: Date.now() - startedAt,
    logTail: output.slice(-LOG_TAIL_CHARACTERS),
  };
}

function installAcceptance(fixtureId, workingDirectory) {
  const acceptanceDirectory = join(HARNESS_ROOT, "acceptance", fixtureId);
  const manifest = JSON.parse(readFileSync(join(acceptanceDirectory, "manifest.json"), "utf8"));
  for (const file of manifest.files) {
    const target = join(workingDirectory, file.to);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(acceptanceDirectory, file.from), target);
  }
  return manifest.commands;
}

function runSteps(steps, workingDirectory, results) {
  for (const step of steps) {
    const result = runStep(step, workingDirectory);
    results.push(result);
    console.error(`[verify] ${step.name}: ${result.passed ? "PASS" : "FAIL"} (${result.durationMs} ms)`);
    if (!result.passed) return false;
  }
  return true;
}

function main() {
  const options = readOptions();
  const workingDirectory = mkdtempSync(join(tmpdir(), `bench-verify-${options.fixture}-`));
  if (options.commit) extractCommit(options.commit, workingDirectory);
  else copyDirectory(resolve(options.dir), workingDirectory);

  const steps = [];
  const tierOnePassed = runSteps(TIER_ONE_STEPS, workingDirectory, steps);
  const wantsTierTwo = options.tier === "2";
  const tierTwoPassed = tierOnePassed && wantsTierTwo
    ? runSteps(installAcceptance(options.fixture, workingDirectory), workingDirectory, steps)
    : false;

  const verdict = {
    fixture: options.fixture,
    source: options.commit ? { commit: options.commit } : { dir: resolve(options.dir) },
    tier: Number(options.tier),
    tier1: tierOnePassed ? "pass" : "fail",
    tier2: wantsTierTwo ? (tierTwoPassed ? "pass" : "fail") : "skipped",
    accepted: wantsTierTwo ? tierTwoPassed : tierOnePassed,
    verifiedAt: new Date().toISOString(),
    steps,
  };
  if (options.out) {
    mkdirSync(dirname(resolve(options.out)), { recursive: true });
    writeFileSync(resolve(options.out), `${JSON.stringify(verdict, null, 2)}\n`);
  }
  if (!options.keep) rmSync(workingDirectory, { recursive: true, force: true });
  console.log(JSON.stringify({ fixture: verdict.fixture, tier1: verdict.tier1, tier2: verdict.tier2, accepted: verdict.accepted }));
  process.exit(verdict.accepted ? 0 : 1);
}

main();
