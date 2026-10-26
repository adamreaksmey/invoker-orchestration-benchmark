const INTEGER_PATTERN = /^-?\d+$/;
const NUMBER_PATTERN = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const BOOLEAN_VALUES = new Set(["true", "false"]);

function isCalendarDate(value) {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

const TYPE_CHECKS = {
  string: () => undefined,
  integer: (value) => (INTEGER_PATTERN.test(value) ? undefined : "expected integer"),
  number: (value) => (NUMBER_PATTERN.test(value) ? undefined : "expected number"),
  date: (value) => (isCalendarDate(value) ? undefined : "expected date YYYY-MM-DD"),
  boolean: (value) => (BOOLEAN_VALUES.has(value) ? undefined : "expected true or false"),
};

function checkRange(rule, value) {
  if (rule.type !== "integer" && rule.type !== "number") return undefined;
  if (rule.min !== undefined && Number(value) < rule.min) return `must be >= ${rule.min}`;
  if (rule.max !== undefined && Number(value) > rule.max) return `must be <= ${rule.max}`;
  return undefined;
}

export function validateCell(rule, value) {
  if (value === "") return rule.required ? "required value missing" : undefined;
  const typeError = (TYPE_CHECKS[rule.type] ?? TYPE_CHECKS.string)(value);
  if (typeError) return typeError;
  if (rule.enum && !rule.enum.includes(value)) return `must be one of ${rule.enum.join(", ")}`;
  return checkRange(rule, value);
}

export function convertCell(rule, value) {
  const isNumeric = rule.type === "integer" || rule.type === "number";
  return isNumeric && value !== "" ? Number(value) : value;
}

export function findMissingColumn(schema, header) {
  return Object.keys(schema.columns).find((column) => !header.includes(column));
}

export function applySchema(schema, rows) {
  const errors = [];
  const validRows = [];
  rows.forEach((row, index) => {
    const rowErrors = Object.entries(schema.columns)
      .map(([column, rule]) => ({ column, message: validateCell(rule, row[column]) }))
      .filter((result) => result.message);
    rowErrors.forEach(({ column, message }) => errors.push(`row ${index + 1}: ${column}: ${message}`));
    if (rowErrors.length > 0) return;
    const converted = { ...row };
    for (const [column, rule] of Object.entries(schema.columns)) converted[column] = convertCell(rule, row[column]);
    validRows.push(converted);
  });
  return { errors, validRows, invalidCount: rows.length - validRows.length };
}
