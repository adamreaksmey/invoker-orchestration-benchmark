import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parsePage } from "./front-matter.js";

export const SLUG_PATTERN = /^[a-z0-9-]+$/;
const PAGE_EXTENSION = ".md";

export function pagePath(pagesDir, slug) {
  return join(pagesDir, `${slug}${PAGE_EXTENSION}`);
}

export function listSlugs(pagesDir) {
  return readdirSync(pagesDir)
    .filter((file) => file.endsWith(PAGE_EXTENSION))
    .map((file) => file.slice(0, -PAGE_EXTENSION.length))
    .filter((slug) => SLUG_PATTERN.test(slug))
    .sort();
}

export function readPage(pagesDir, slug) {
  const path = pagePath(pagesDir, slug);
  if (!existsSync(path)) return undefined;
  return parsePage(slug, readFileSync(path, "utf8"));
}

export function readAllPages(pagesDir) {
  return listSlugs(pagesDir).map((slug) => readPage(pagesDir, slug));
}

export function writePage(pagesDir, slug, body) {
  const existed = existsSync(pagePath(pagesDir, slug));
  writeFileSync(pagePath(pagesDir, slug), body);
  return existed;
}

export function deletePage(pagesDir, slug) {
  const path = pagePath(pagesDir, slug);
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}
