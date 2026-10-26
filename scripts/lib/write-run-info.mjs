import { writeFileSync } from "node:fs";

const [runDirectory, fixture, arm, startedAt, finishedAt, wallSeconds, exitCode, extraJson] = process.argv.slice(2);
const runInfo = {
  fixture,
  arm,
  startedAt,
  finishedAt,
  wallSeconds: Number(wallSeconds),
  agentExitCode: Number(exitCode),
  ...(extraJson ? JSON.parse(extraJson) : {}),
};
writeFileSync(`${runDirectory}/run.json`, `${JSON.stringify(runInfo, null, 2)}\n`);
