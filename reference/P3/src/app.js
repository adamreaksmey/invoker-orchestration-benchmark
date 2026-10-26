import express from "express";
import { SLUG_PATTERN, deletePage, readAllPages, readPage, writePage } from "./pages.js";
import { openSearchIndex } from "./search-index.js";

function requireValidSlug(req, res, next) {
  if (!SLUG_PATTERN.test(req.params.slug)) return res.status(400).json({ error: "invalid slug" });
  return next();
}

function registerPageRoutes(app, pagesDir, index) {
  app.get("/pages", (_req, res) => res.json(readAllPages(pagesDir).map(({ slug, title, tags }) => ({ slug, title, tags }))));
  app.get("/pages/:slug", requireValidSlug, (req, res) => {
    const page = readPage(pagesDir, req.params.slug);
    if (!page) return res.status(404).json({ error: "page not found" });
    return res.json(page);
  });
  app.put("/pages/:slug", requireValidSlug, (req, res) => {
    const body = req.body?.body;
    if (typeof body !== "string") return res.status(400).json({ error: "body must be a string" });
    const existed = writePage(pagesDir, req.params.slug, body);
    const page = readPage(pagesDir, req.params.slug);
    index.upsertPage(page);
    return res.status(existed ? 200 : 201).json(page);
  });
  app.delete("/pages/:slug", requireValidSlug, (req, res) => {
    if (!deletePage(pagesDir, req.params.slug)) return res.status(404).json({ error: "page not found" });
    index.removePage(req.params.slug);
    return res.status(204).end();
  });
}

function registerSearchRoutes(app, index) {
  app.get("/search", (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    if (!query.trim()) return res.status(400).json({ error: "q is required" });
    return res.json({ query, results: index.search(query) });
  });
  app.get("/tags", (_req, res) => {
    res.json(index.db.prepare("SELECT tag, COUNT(*) AS count FROM page_tags GROUP BY tag ORDER BY count DESC, tag ASC").all()
      .map(({ tag, count }) => ({ tag, count })));
  });
  app.get("/tags/:tag", (req, res) => {
    res.json(index.db.prepare("SELECT slug, title FROM page_tags WHERE tag = ? ORDER BY slug").all(req.params.tag.toLowerCase())
      .map(({ slug, title }) => ({ slug, title })));
  });
}

export function createApp(options = {}) {
  const pagesDir = options.pagesDir;
  if (!pagesDir) throw new TypeError("pagesDir is required");
  const index = openSearchIndex(options.indexPath ?? process.env.WIKI_INDEX_PATH ?? "wiki-index.sqlite");
  index.rebuild(readAllPages(pagesDir));
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  registerPageRoutes(app, pagesDir, index);
  registerSearchRoutes(app, index);
  app.locals.close = () => index.close();
  return app;
}
