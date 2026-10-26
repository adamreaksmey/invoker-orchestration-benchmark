import { readFileSync } from "node:fs";

const [tasksPath, baselineSha] = process.argv.slice(2);
const tasks = JSON.parse(readFileSync(tasksPath, "utf8"));
const workTasks = tasks.filter((task) => !task.config?.isMergeNode);
const completedWithCommit = workTasks
  .filter((task) => task.status === "completed" && task.execution?.commit)
  .sort((left, right) => Date.parse(left.execution.completedAt) - Date.parse(right.execution.completedAt));
const verifyTask = workTasks.find((task) => task.id.endsWith("-verify"));
const tip = verifyTask?.status === "completed" && verifyTask.execution?.commit
  ? verifyTask.execution.commit
  : completedWithCommit.at(-1)?.execution.commit ?? baselineSha;
process.stdout.write(tip);
