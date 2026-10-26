#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  BorderStyle, Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";

const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_INPUT = join(HARNESS_ROOT, "reports", "COMBINED.md");
const DEFAULT_OUTPUT = "/Users/adamreaksmey/Desktop/Personal/Invoker/INVOKER-ORCHESTRATION-BENCHMARK-COMBINED.docx";
const BODY_FONT = "Calibri";
const CODE_FONT = "Menlo";
const BODY_SIZE_HALF_POINTS = 21;
const CODE_SIZE_HALF_POINTS = 17;
const TABLE_SIZE_HALF_POINTS = 18;
const HEADER_FILL = "E7ECF3";
const CODE_FILL = "F4F4F4";
const HEADING_LEVELS = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4 };
const INLINE_TOKEN_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
const TABLE_SEPARATOR_PATTERN = /^\|?\s*:?-{2,}/;

function inlineRuns(text, size = BODY_SIZE_HALF_POINTS) {
  return text.split(INLINE_TOKEN_PATTERN).filter(Boolean).map((part) => {
    if (part.startsWith("**")) return new TextRun({ text: part.slice(2, -2), bold: true, font: BODY_FONT, size });
    if (part.startsWith("`")) return new TextRun({ text: part.slice(1, -1), font: CODE_FONT, size: size - 2 });
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) return new TextRun({ text: `${link[1]} (${link[2]})`, font: BODY_FONT, size, color: "1F4E79" });
    return new TextRun({ text: part, font: BODY_FONT, size });
  });
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function tableCell(text, isHeader) {
  return new TableCell({
    children: [new Paragraph({ children: inlineRuns(isHeader ? `**${text}**` : text, TABLE_SIZE_HALF_POINTS) })],
    shading: isHeader ? { type: ShadingType.CLEAR, fill: HEADER_FILL, color: "auto" } : undefined,
  });
}

function buildTable(lines) {
  const rows = lines.filter((line) => !TABLE_SEPARATOR_PATTERN.test(line.trim())).map(splitTableRow);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, index) => new TableRow({ tableHeader: index === 0, children: cells.map((cell) => tableCell(cell, index === 0)) })),
  });
}

function buildCodeBlock(lines) {
  return lines.map((line) => new Paragraph({
    children: [new TextRun({ text: line || " ", font: CODE_FONT, size: CODE_SIZE_HALF_POINTS })],
    shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: "auto" },
    spacing: { after: 0 },
  }));
}

function buildListItem(line) {
  const ordered = /^\s*\d+\.\s+/.test(line);
  const indentLevel = Math.min(1, Math.floor(line.match(/^\s*/)[0].length / 2));
  const text = line.replace(/^\s*(?:[-*]|\d+\.)\s+/, "");
  const marker = ordered ? `${line.trim().match(/^\d+/)[0]}. ` : "• ";
  return new Paragraph({ children: [new TextRun({ text: marker, font: BODY_FONT, size: BODY_SIZE_HALF_POINTS }), ...inlineRuns(text)], indent: { left: 360 + indentLevel * 360, hanging: 260 }, spacing: { after: 60 } });
}

function collectWhile(lines, start, predicate) {
  const collected = [];
  let index = start;
  while (index < lines.length && predicate(lines[index])) { collected.push(lines[index]); index += 1; }
  return { collected, next: index };
}

function convertBlock(lines, index) {
  const line = lines[index];
  if (line.startsWith("```")) {
    const { collected, next } = collectWhile(lines, index + 1, (candidate) => !candidate.startsWith("```"));
    return { blocks: buildCodeBlock(collected), next: next + 1 };
  }
  if (line.trim().startsWith("|")) {
    const { collected, next } = collectWhile(lines, index, (candidate) => candidate.trim().startsWith("|"));
    return { blocks: [buildTable(collected), new Paragraph({ text: "" })], next };
  }
  const heading = /^(#{1,4})\s+(.*)$/.exec(line);
  if (heading) return { blocks: [new Paragraph({ heading: HEADING_LEVELS[heading[1].length], children: [new TextRun({ text: heading[2].replace(/`/g, ""), font: BODY_FONT })] })], next: index + 1 };
  if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) return { blocks: [buildListItem(line)], next: index + 1 };
  if (/^---+$/.test(line.trim())) return { blocks: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "BBBBBB", space: 1 } } })], next: index + 1 };
  if (line.startsWith("> ")) return { blocks: [new Paragraph({ children: inlineRuns(line.slice(2)), indent: { left: 360 }, shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: "auto" } })], next: index + 1 };
  if (!line.trim()) return { blocks: [], next: index + 1 };
  const { collected, next } = collectWhile(lines, index, (candidate) => candidate.trim() && !/^(#|```|\||\s*(?:[-*]|\d+\.)\s|> |---+$)/.test(candidate));
  return { blocks: [new Paragraph({ children: inlineRuns(collected.join(" ")), spacing: { after: 120 } })], next: Math.max(next, index + 1) };
}

function convertMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const converted = convertBlock(lines, index);
    blocks.push(...converted.blocks);
    index = converted.next;
  }
  return blocks;
}

const { values } = parseArgs({ options: { input: { type: "string", default: DEFAULT_INPUT }, output: { type: "string", default: DEFAULT_OUTPUT } } });
const markdown = readFileSync(resolve(values.input), "utf8");
const document = new Document({
  creator: "invoker-orchestration-benchmark",
  title: "Invoker Orchestration Benchmark — Combined Report",
  styles: { default: { document: { run: { font: BODY_FONT, size: BODY_SIZE_HALF_POINTS } } } },
  sections: [{ properties: {}, children: convertMarkdown(markdown) }],
});
writeFileSync(resolve(values.output), await Packer.toBuffer(document));
console.log(`wrote ${resolve(values.output)}`);
