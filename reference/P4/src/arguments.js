export const FORMATS = new Set(["table", "csv", "json"]);
const VALUE_FLAGS = { "--schema": "schema", "--format": "format", "--out": "out", "--group-by": "groupBy", "--sum": "sum" };
const BOOLEAN_FLAGS = { "--skip-invalid": "skipInvalid", "--count": "count" };

export class UsageError extends Error {}

function readFlag(options, argv, index) {
  const argument = argv[index];
  if (BOOLEAN_FLAGS[argument]) { options[BOOLEAN_FLAGS[argument]] = true; return index; }
  if (!VALUE_FLAGS[argument]) throw new UsageError(`unknown option ${argument}`);
  if (argv[index + 1] === undefined) throw new UsageError(`${argument} requires a value`);
  options[VALUE_FLAGS[argument]] = argv[index + 1];
  return index + 1;
}

export function parseArguments(argv) {
  const options = { format: "table", skipInvalid: false, count: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) { index = readFlag(options, argv, index); continue; }
    if (options.input) throw new UsageError("only one input file is allowed");
    options.input = argv[index];
  }
  if (!options.input) throw new UsageError("missing input file");
  if (!FORMATS.has(options.format)) throw new UsageError(`unknown format ${options.format}`);
  if ((options.sum || options.count) && !options.groupBy) throw new UsageError("--sum and --count require --group-by");
  return options;
}
