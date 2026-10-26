#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES_CLONE = join(HARNESS_ROOT, "work", "fixtures");
const LEFTOVER_COMMIT_MESSAGE = "harness: commit uncommitted agent work (flagged)";
const HARNESS_AUTHOR = ["-c", "user.name=bench-harness", "-c", "user.email=bench-harness@users.noreply.github.com"];

function git(args, options = {}) {
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28, ...options });
  if (result.status !== 0 && !options.allowFailure) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function readOptions() {
  const { values } = parseArgs({
    options: {
      fixture: { type: "string" },
      arm: { type: "string" },
      "run-dir": { type: "string" },
      repo: { type: "string" },
      tip: { type: "string" },
      "commit-leftovers": { type: "boolean", default: false },
    },
  });
  if (!values.fixture || !values.arm || !values["run-dir"] || !values.repo) {
    console.error("usage: finalize-run.mjs --fixture P1 --arm A --run-dir <dir> --repo <git dir> [--tip <sha>] [--commit-leftovers]");
    process.exit(64);
  }
  return values;
}

function commitLeftovers(repo) {
  const status = git(["-C", repo, "status", "--porcelain"]);
  if (!status) return false;
  git(["-C", repo, "add", "-A"]);
  git(["-C", repo, ...HARNESS_AUTHOR, "commit", "-qm", LEFTOVER_COMMIT_MESSAGE]);
  return true;
}

function publishTip(repo, tip, branch) {
  git(["-C", FIXTURES_CLONE, "fetch", "-q", repo, tip], { allowFailure: false });
  const force = process.env.BENCH_RERUN_REASON ? ["--force"] : [];
  git(["-C", FIXTURES_CLONE, "push", "-q", ...force, "origin", `${tip}:refs/heads/${branch}`]);
}

function describeDiff(baseline, tip) {
  const stat = git(["-C", FIXTURES_CLONE, "diff", "--shortstat", baseline, tip]);
  const files = git(["-C", FIXTURES_CLONE, "diff", "--name-status", baseline, tip]).split("\n").filter(Boolean);
  const commits = Number(git(["-C", FIXTURES_CLONE, "rev-list", "--count", `${baseline}..${tip}`]));
  const testFiles = files.filter((line) => /(test|spec)\.[cm]?[jt]sx?$/.test(line));
  return { shortstat: stat, filesChanged: files.length, commits, testFilesTouched: testFiles, nameStatus: files };
}

function runVerify(fixture, tip, runDir) {
  const verifyArguments = [join(HARNESS_ROOT, "scripts", "verify.mjs"), "--fixture", fixture, "--commit", tip, "--tier", "2", "--out", join(runDir, "verify.json")];
  spawnSync(process.execPath, verifyArguments, { stdio: ["ignore", "inherit", "inherit"] });
  return JSON.parse(readFileSync(join(runDir, "verify.json"), "utf8"));
}

function runAudit(runDir) {
  spawnSync(process.execPath, [join(HARNESS_ROOT, "scripts", "audit-contamination.mjs"), "--run-dir", runDir], { stdio: "inherit" });
  const auditPath = join(runDir, "contamination.json");
  return existsSync(auditPath) ? JSON.parse(readFileSync(auditPath, "utf8")) : undefined;
}

function main() {
  const options = readOptions();
  const runDir = resolve(options["run-dir"]);
  const repo = resolve(options.repo);
  const leftoversCommitted = options["commit-leftovers"] ? commitLeftovers(repo) : false;
  const tip = options.tip ?? git(["-C", repo, "rev-parse", "HEAD"]);
  const baseline = JSON.parse(readFileSync(join(HARNESS_ROOT, "fixtures", "baselines.json"), "utf8"))[options.fixture].sha;
  const branch = `runs/${options.fixture}/arm-${options.arm.toLowerCase()}`;
  publishTip(repo, tip, branch);
  const diff = describeDiff(baseline, tip);
  writeFileSync(join(runDir, "diff.json"), `${JSON.stringify(diff, null, 2)}\n`);
  const verdict = runVerify(options.fixture, tip, runDir);
  const audit = runAudit(runDir);
  const runInfo = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
  const meta = {
    ...runInfo,
    baselineSha: baseline,
    tipSha: tip,
    tipBranch: branch,
    harnessCommittedLeftovers: leftoversCommitted,
    noChangesMade: tip === baseline,
    tier1: verdict.tier1,
    tier2: verdict.tier2,
    accepted: verdict.accepted && tip !== baseline,
    diff: { shortstat: diff.shortstat, filesChanged: diff.filesChanged, commits: diff.commits },
    contaminationFindings: audit?.findings?.length ?? null,
  };
  writeFileSync(join(runDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(JSON.stringify({ fixture: meta.fixture, arm: meta.arm, tip, accepted: meta.accepted, wallSeconds: meta.wallSeconds }));
}

main();
