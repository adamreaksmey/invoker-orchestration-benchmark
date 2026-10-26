#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUNS_ROOT = join(HARNESS_ROOT, "runs");
const SUMMARY_PATH = join(RUNS_ROOT, "summary.json");

function listFiles(directory, pattern) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return listFiles(path, pattern);
    return pattern.test(entry) ? [path] : [];
  });
}

function parseJsonLines(path) {
  return readFileSync(path, "utf8").split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function summarizeCodexSession(path) {
  const events = parseJsonLines(path);
  const tokenEvents = events.filter((event) => event.payload?.type === "token_count" && event.payload.info?.total_token_usage);
  const usage = tokenEvents.at(-1)?.payload.info.total_token_usage ?? {};
  const model = events.find((event) => event.type === "turn_context")?.payload?.model ?? "unknown";
  const rateLimits = events.filter((event) => event.payload?.rate_limits?.primary).map((event) => event.payload.rate_limits.primary);
  const totalInput = usage.input_tokens ?? 0;
  const cachedInput = usage.cached_input_tokens ?? 0;
  return {
    session: basename(path),
    model,
    totalInput,
    cachedInput,
    uncachedInput: totalInput - cachedInput,
    output: usage.output_tokens ?? 0,
    reasoningOutput: usage.reasoning_output_tokens ?? 0,
    firstQuota: rateLimits[0],
    lastQuota: rateLimits.at(-1),
  };
}

function summarizeCursorResult(path) {
  let parsed;
  try { parsed = JSON.parse(readFileSync(path, "utf8")); } catch { return undefined; }
  const usage = parsed.usage ?? {};
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const freshInput = usage.inputTokens ?? 0;
  return {
    session: basename(path),
    model: parsed.model ?? "grok-4.5",
    totalInput: freshInput + cacheRead + cacheWrite,
    cachedInput: cacheRead,
    uncachedInput: freshInput + cacheWrite,
    output: usage.outputTokens ?? 0,
    reasoningOutput: 0,
    isError: Boolean(parsed.is_error),
    durationMs: parsed.duration_ms,
  };
}

function sumSessions(sessions) {
  const keys = ["totalInput", "cachedInput", "uncachedInput", "output", "reasoningOutput"];
  const totals = Object.fromEntries(keys.map((key) => [key, sessions.reduce((sum, session) => sum + session[key], 0)]));
  return { ...totals, sessions: sessions.length };
}

function sumByModel(sessions) {
  const byModel = {};
  for (const session of sessions) (byModel[session.model] ??= []).push(session);
  return Object.fromEntries(Object.entries(byModel).map(([model, group]) => [model, sumSessions(group)]));
}

function quotaMovement(sessions) {
  const ordered = sessions.filter((session) => session.firstQuota).sort((left, right) => left.session.localeCompare(right.session));
  if (ordered.length === 0) return undefined;
  const first = ordered[0].firstQuota;
  const last = ordered.at(-1).lastQuota;
  const sameWindow = first.resets_at === last.resets_at;
  return { windowMinutes: first.window_minutes, startPercent: first.used_percent, endPercent: last.used_percent, sameWindow, deltaPercent: sameWindow ? last.used_percent - first.used_percent : null };
}

function collectSessions(runDirectory) {
  const codex = listFiles(join(runDirectory, "codex-sessions"), /\.jsonl$/).map(summarizeCodexSession);
  const cursorFiles = [join(runDirectory, "cursor.json"), ...listFiles(join(runDirectory, "cursor-calls"), /\.json$/)].filter(existsSync);
  const cursor = cursorFiles.map(summarizeCursorResult).filter(Boolean);
  return { codex, cursor, all: [...codex, ...cursor] };
}

function summarizeRun(runDirectory) {
  const meta = JSON.parse(readFileSync(join(runDirectory, "meta.json"), "utf8"));
  const sessions = collectSessions(runDirectory);
  const tokens = { totals: sumSessions(sessions.all), byModel: sumByModel(sessions.all), codexQuota: quotaMovement(sessions.codex), sessions: sessions.all };
  writeFileSync(join(runDirectory, "tokens.json"), `${JSON.stringify(tokens, null, 2)}\n`);
  const auditPath = join(runDirectory, "contamination.json");
  const contaminationFindings = existsSync(auditPath) ? JSON.parse(readFileSync(auditPath, "utf8")).findings.length : meta.contaminationFindings;
  return { ...meta, contaminationFindings, tokens: { totals: tokens.totals, byModel: tokens.byModel, codexQuota: tokens.codexQuota } };
}

const runDirectories = readdirSync(RUNS_ROOT)
  .filter((fixture) => /^P\d$/.test(fixture))
  .flatMap((fixture) => readdirSync(join(RUNS_ROOT, fixture)).filter((arm) => /^arm-[a-e]$/.test(arm)).map((arm) => join(RUNS_ROOT, fixture, arm)))
  .filter((directory) => existsSync(join(directory, "meta.json")));
const cells = runDirectories.map(summarizeRun).sort((left, right) => `${left.fixture}${left.arm}`.localeCompare(`${right.fixture}${right.arm}`));
writeFileSync(SUMMARY_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), cells }, null, 2)}\n`);
for (const cell of cells) {
  console.log(`${cell.fixture} ${cell.arm} accepted=${cell.accepted} wall=${cell.wallSeconds}s input=${cell.tokens.totals.totalInput} uncached=${cell.tokens.totals.uncachedInput} output=${cell.tokens.totals.output} sessions=${cell.tokens.totals.sessions}`);
}
