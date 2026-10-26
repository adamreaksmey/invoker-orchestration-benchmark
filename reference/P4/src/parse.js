const BYTE_ORDER_MARK = "\uFEFF";
const QUOTE = '"';

function readQuotedField(text, start) {
  let value = "";
  let index = start + 1;
  while (index < text.length) {
    if (text[index] !== QUOTE) { value += text[index]; index += 1; continue; }
    if (text[index + 1] === QUOTE) { value += QUOTE; index += 2; continue; }
    return { value, next: index + 1 };
  }
  throw new Error("unterminated quoted field");
}

function readRecords(text) {
  const records = [];
  let record = [];
  let field = "";
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (character === QUOTE && field === "") {
      const quoted = readQuotedField(text, index);
      field = quoted.value;
      index = quoted.next;
    } else if (character === ",") { record.push(field); field = ""; index += 1; }
    else if (character === "\n" || character === "\r") {
      record.push(field); records.push(record); record = []; field = "";
      index += character === "\r" && text[index + 1] === "\n" ? 2 : 1;
    } else { field += character; index += 1; }
  }
  if (field !== "" || record.length > 0) { record.push(field); records.push(record); }
  return records.filter((candidate) => !(candidate.length === 1 && candidate[0] === ""));
}

export function parseCsv(text) {
  const [header = [], ...dataRecords] = readRecords(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text);
  const rows = dataRecords.map((cells) => Object.fromEntries(header.map((column, index) => [column, cells[index] ?? ""])));
  return { header, rows };
}
