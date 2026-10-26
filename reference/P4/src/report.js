const CENTS_FACTOR = 100;
const CSV_SPECIAL_CHARACTERS = /[",\r\n]/;

function roundToCents(value) {
  return Math.round(value * CENTS_FACTOR) / CENTS_FACTOR;
}

export function aggregateRows(rows, { groupBy, sum, count }) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row[groupBy]);
    const group = groups.get(key) ?? { total: 0, size: 0 };
    group.total += sum ? Number(row[sum]) : 0;
    group.size += 1;
    groups.set(key, group);
  }
  const sortedKeys = [...groups.keys()].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return sortedKeys.map((key) => {
    const record = { [groupBy]: key };
    if (sum) record[`sum_${sum}`] = roundToCents(groups.get(key).total);
    if (count) record.count = groups.get(key).size;
    return record;
  });
}

function quoteCsvField(value) {
  const text = String(value);
  return CSV_SPECIAL_CHARACTERS.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function formatCsv(rows, columns) {
  const lines = [columns, ...rows.map((row) => columns.map((column) => row[column]))];
  return lines.map((cells) => cells.map(quoteCsvField).join(",")).join("\n") + "\n";
}

export function formatJson(rows) {
  return `${JSON.stringify(rows, null, 2)}\n`;
}

export function formatTable(rows, columns) {
  if (columns.length === 0) return "";
  const widths = columns.map((column) => Math.max(column.length, ...rows.map((row) => String(row[column]).length)));
  const formatLine = (cells) => cells.map((cell, index) => String(cell).padEnd(widths[index])).join("  ").trimEnd();
  return [formatLine(columns), ...rows.map((row) => formatLine(columns.map((column) => row[column])))].join("\n") + "\n";
}
