import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PATH = join(FIXTURE_ROOT, "bin", "csvreport.js");
const EXIT_OK = 0;
const EXIT_USAGE = 1;
const EXIT_INVALID = 2;

const SALES_SCHEMA = {
  columns: {
    region: { type: "string", required: true, enum: ["north", "south"] },
    amount: { type: "number", required: true, min: 0 },
    qty: { type: "integer", min: 1, max: 100 },
    day: { type: "date" },
    paid: { type: "boolean" },
  },
};

function scratchDirectory() {
  return mkdtempSync(join(tmpdir(), "csvreport-acceptance-"));
}

function writeFile(name, contents) {
  const path = join(scratchDirectory(), name);
  writeFileSync(path, contents);
  return path;
}

function writeSchema(schema = SALES_SCHEMA) {
  return writeFile("schema.json", JSON.stringify(schema));
}

function runCli(args) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: "utf8" });
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

function runJson(args) {
  const result = runCli([...args, "--format", "json"]);
  assert.equal(result.exitCode, EXIT_OK, result.stderr);
  return JSON.parse(result.stdout);
}

function errorLines(stderr) {
  return stderr.split(/\r?\n/).filter((line) => /^row \d+: /.test(line));
}

test("parses RFC 4180 quoting, embedded newlines, CRLF, and BOM", () => {
  const csv = '\uFEFFname,note,city\r\n"Smith, Jane","She said ""hi""",Austin\r\n"Lee","line one\nline two",Boston\r\n';
  assert.deepEqual(runJson([writeFile("quoted.csv", csv)]), [
    { name: "Smith, Jane", note: 'She said "hi"', city: "Austin" },
    { name: "Lee", note: "line one\nline two", city: "Boston" },
  ]);
});

test("handles files without a trailing newline", () => {
  assert.deepEqual(runJson([writeFile("plain.csv", "a,b\n1,2")]), [{ a: "1", b: "2" }]);
});

test("schema converts numeric columns to JSON numbers", () => {
  const csv = "region,amount,qty,day,paid\nnorth,10.5,2,2026-01-03,true\nsouth,0,,,\n";
  const rows = runJson([writeFile("typed.csv", csv), "--schema", writeSchema()]);
  assert.equal(rows[0].amount, 10.5);
  assert.equal(rows[0].qty, 2);
  assert.equal(rows[1].amount, 0);
  assert.equal(rows[0].region, "north");
});

test("reports each invalid cell with its data row number and exits 2", () => {
  const csv = [
    "region,amount,qty,day,paid",
    "north,1,1,2026-01-01,true",
    "east,1,1,2026-01-01,true",
    "south,abc,1,2026-01-01,false",
    "south,-5,1,2026-01-01,false",
    "south,2,1.5,2026-01-01,false",
    "south,2,101,2026-01-01,false",
    "south,2,3,2026-02-30,false",
    "south,2,3,2026-01-01,yes",
    ",2,3,2026-01-01,true",
    "",
  ].join("\n");
  const result = runCli([writeFile("invalid.csv", csv), "--schema", writeSchema()]);
  assert.equal(result.exitCode, EXIT_INVALID);
  assert.equal(result.stdout, "");
  const lines = errorLines(result.stderr);
  const expectedPrefixes = [
    "row 2: region: ",
    "row 3: amount: ",
    "row 4: amount: ",
    "row 5: qty: ",
    "row 6: qty: ",
    "row 7: day: ",
    "row 8: paid: ",
    "row 9: region: ",
  ];
  assert.equal(lines.length, expectedPrefixes.length, result.stderr);
  for (const prefix of expectedPrefixes) {
    assert.ok(lines.some((line) => line.startsWith(prefix)), `missing error starting with ${JSON.stringify(prefix)}`);
  }
});

test("row numbers count records, not physical lines", () => {
  const csv = 'region,amount\nnorth,"1"\nsouth,"multi\nline"\n';
  const schema = { columns: { amount: { type: "number" } } };
  const result = runCli([writeFile("multiline.csv", csv), "--schema", writeSchema(schema)]);
  assert.equal(result.exitCode, EXIT_INVALID);
  assert.deepEqual(errorLines(result.stderr).map((line) => line.split(":")[0]), ["row 2"]);
});

test("missing schema column fails with a clear error", () => {
  const schema = { columns: { qty: { type: "integer", required: true } } };
  const result = runCli([writeFile("nocol.csv", "region,amount\nnorth,1\n"), "--schema", writeSchema(schema)]);
  assert.equal(result.exitCode, EXIT_INVALID);
  assert.match(result.stderr, /error: missing column qty/);
});

test("--skip-invalid drops bad rows and reports the count", () => {
  const csv = "region,amount\nnorth,1\neast,2\nsouth,3\nsouth,x\n";
  const schema = { columns: { region: { type: "string", enum: ["north", "south"] }, amount: { type: "number" } } };
  const result = runCli([writeFile("skip.csv", csv), "--schema", writeSchema(schema), "--skip-invalid", "--format", "json"]);
  assert.equal(result.exitCode, EXIT_OK, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [{ region: "north", amount: 1 }, { region: "south", amount: 3 }]);
  assert.match(result.stderr, /skipped 2 invalid row\(s\)/);
  assert.equal(errorLines(result.stderr).length, 2);
});

test("groups, sums with 2-decimal rounding, counts, and sorts groups", () => {
  const csv = "region,amount\nsouth,0.1\nnorth,1\nsouth,0.2\neast,2.005\nnorth,2.5\n";
  const rows = runJson([writeFile("group.csv", csv), "--group-by", "region", "--sum", "amount", "--count"]);
  assert.deepEqual(rows.map((row) => Object.keys(row)), [
    ["region", "sum_amount", "count"],
    ["region", "sum_amount", "count"],
    ["region", "sum_amount", "count"],
  ]);
  assert.deepEqual(rows.map((row) => row.region), ["east", "north", "south"]);
  assert.equal(rows.find((row) => row.region === "south").sum_amount, 0.3);
  assert.equal(rows.find((row) => row.region === "north").sum_amount, 3.5);
  assert.deepEqual(rows.map((row) => row.count), [1, 2, 2]);
});

test("count works without sum", () => {
  const rows = runJson([writeFile("count.csv", "team,x\nb,1\na,1\nb,1\n"), "--group-by", "team", "--count"]);
  assert.deepEqual(rows, [{ team: "a", count: 1 }, { team: "b", count: 2 }]);
});

test("json output is pretty-printed with a trailing newline", () => {
  const result = runCli([writeFile("pretty.csv", "a\n1\n"), "--format", "json"]);
  assert.equal(result.stdout, '[\n  {\n    "a": "1"\n  }\n]\n');
});

test("csv output quotes only when needed", () => {
  const csv = 'name,note\n"Smith, Jane","say ""hi"""\nplain,value\n';
  const result = runCli([writeFile("out.csv", csv), "--format", "csv"]);
  assert.equal(result.exitCode, EXIT_OK, result.stderr);
  assert.equal(result.stdout, 'name,note\n"Smith, Jane","say ""hi"""\nplain,value\n');
});

test("table is the default format", () => {
  const result = runCli([writeFile("table.csv", "fruit,qty\napple,2\n")]);
  assert.equal(result.exitCode, EXIT_OK);
  assert.match(result.stdout, /fruit/);
  assert.match(result.stdout, /apple\s+2/);
});

test("--out writes to a file and leaves stdout empty", () => {
  const outPath = join(scratchDirectory(), "report.json");
  const result = runCli([writeFile("o.csv", "a,b\n1,2\n"), "--format", "json", "--out", outPath]);
  assert.equal(result.exitCode, EXIT_OK, result.stderr);
  assert.equal(result.stdout, "");
  assert.ok(existsSync(outPath));
  assert.deepEqual(JSON.parse(readFileSync(outPath, "utf8")), [{ a: "1", b: "2" }]);
});

test("usage and I/O errors exit 1", () => {
  const input = writeFile("u.csv", "a\n1\n");
  for (const args of [[], [input, "--bogus"], [join(scratchDirectory(), "missing.csv")], [input, "--format", "xml"]]) {
    const result = runCli(args);
    assert.equal(result.exitCode, EXIT_USAGE, `args ${JSON.stringify(args)}`);
    assert.match(result.stderr, /^(usage|error):/m);
  }
});

test("no runtime dependencies were added", () => {
  const manifest = JSON.parse(readFileSync(join(FIXTURE_ROOT, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), []);
});
