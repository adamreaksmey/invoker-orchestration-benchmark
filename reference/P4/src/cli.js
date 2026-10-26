import { readFileSync, writeFileSync } from "node:fs";
import { UsageError, parseArguments } from "./arguments.js";
import { parseCsv } from "./parse.js";
import { aggregateRows, formatCsv, formatJson, formatTable } from "./report.js";
import { applySchema, findMissingColumn } from "./schema.js";

const USAGE = "usage: csvreport <input.csv> [--schema file.json] [--skip-invalid] [--group-by col] [--sum col] [--count] [--format table|csv|json] [--out path]\n";
const EXIT_OK = 0;
const EXIT_USAGE = 1;
const EXIT_INVALID = 2;
const FORMATTERS = { table: formatTable, csv: formatCsv, json: formatJson };

class InputError extends Error {}

function readText(path) {
  try { return readFileSync(path, "utf8"); } catch { throw new InputError(`error: cannot read ${path}`); }
}

function validate(options, header, rows, io) {
  if (!options.schema) return { rows, exitCode: EXIT_OK };
  const schema = JSON.parse(readText(options.schema));
  const missingColumn = findMissingColumn(schema, header);
  if (missingColumn) { io.stderr(`error: missing column ${missingColumn}\n`); return { exitCode: EXIT_INVALID }; }
  const { errors, validRows, invalidCount } = applySchema(schema, rows);
  errors.forEach((line) => io.stderr(`${line}\n`));
  if (invalidCount === 0) return { rows: validRows, exitCode: EXIT_OK };
  if (!options.skipInvalid) return { exitCode: EXIT_INVALID };
  io.stderr(`skipped ${invalidCount} invalid row(s)\n`);
  return { rows: validRows, exitCode: EXIT_OK };
}

function render(options, header, rows) {
  const report = options.groupBy ? aggregateRows(rows, options) : rows;
  const columns = options.groupBy ? Object.keys(report[0] ?? { [options.groupBy]: "" }) : header;
  return FORMATTERS[options.format](report, columns);
}

function execute(argv, io) {
  const options = parseArguments(argv);
  const { header, rows } = parseCsv(readText(options.input));
  const validation = validate(options, header, rows, io);
  if (validation.exitCode !== EXIT_OK) return validation.exitCode;
  const output = render(options, header, validation.rows);
  if (options.out) writeFileSync(options.out, output);
  else io.stdout(output);
  return EXIT_OK;
}

export function run(argv, io) {
  try {
    return execute(argv, io);
  } catch (error) {
    if (error instanceof UsageError) { io.stderr(`usage: ${error.message}\n${USAGE}`); return EXIT_USAGE; }
    if (error instanceof InputError) { io.stderr(`${error.message}\n`); return EXIT_USAGE; }
    throw error;
  }
}
