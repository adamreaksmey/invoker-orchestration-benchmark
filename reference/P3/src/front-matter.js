const FRONT_MATTER_FENCE = "---";

function parseTags(rawValue) {
  const unbracketed = rawValue.trim().replace(/^\[/, "").replace(/\]$/, "");
  const tags = unbracketed.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  return [...new Set(tags)].sort();
}

function parseFields(lines) {
  const fields = {};
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator > 0) fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return fields;
}

export function splitFrontMatter(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== FRONT_MATTER_FENCE) return { fields: {}, body: markdown };
  const closing = lines.indexOf(FRONT_MATTER_FENCE, 1);
  if (closing === -1) return { fields: {}, body: markdown };
  return { fields: parseFields(lines.slice(1, closing)), body: lines.slice(closing + 1).join("\n") };
}

export function parsePage(slug, markdown) {
  const { fields, body } = splitFrontMatter(markdown);
  const heading = body.split("\n").find((line) => line.startsWith("# "));
  const title = fields.title || (heading ? heading.slice(2).trim() : slug);
  return { slug, title, tags: fields.tags ? parseTags(fields.tags) : [], body };
}
