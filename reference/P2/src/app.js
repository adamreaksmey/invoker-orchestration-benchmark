import express from "express";
import { openDatabase } from "./db.js";
import { generateCode, isValidCustomCode, isValidUrl, summarizeClicks } from "./links.js";
import { createRateLimiter } from "./rate-limit.js";

const DEFAULT_RATE_LIMIT_MAX = 20;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

function resolveOptions(options) {
  return {
    databasePath: options.databasePath ?? process.env.DATABASE_PATH ?? "shortener.sqlite",
    rateLimitMax: options.rateLimitMax ?? Number(process.env.RATE_LIMIT_MAX ?? DEFAULT_RATE_LIMIT_MAX),
    rateLimitWindowMs: options.rateLimitWindowMs ?? Number(process.env.RATE_LIMIT_WINDOW_MS ?? DEFAULT_RATE_LIMIT_WINDOW_MS),
    now: options.now ?? (() => Date.now()),
  };
}

function createLinkHandler(db, now) {
  return (req, res) => {
    const { url, code: customCode } = req.body ?? {};
    if (!isValidUrl(url)) return res.status(400).json({ error: "url must be an absolute http(s) URL" });
    if (customCode !== undefined && !isValidCustomCode(customCode)) return res.status(400).json({ error: "invalid code" });
    const code = customCode ?? generateCode();
    if (db.prepare("SELECT 1 FROM links WHERE code = ?").get(code)) return res.status(409).json({ error: "code already exists" });
    db.prepare("INSERT INTO links (code, url, created_at) VALUES (?, ?, ?)").run(code, url, new Date(now()).toISOString());
    return res.status(201).json({ code, url, shortUrl: `/${code}` });
  };
}

function registerReadRoutes(app, db, now) {
  const findLink = (code) => db.prepare("SELECT code, url, created_at FROM links WHERE code = ?").get(code);
  app.get("/links/:code/stats", (req, res) => {
    const link = findLink(req.params.code);
    if (!link) return res.status(404).json({ error: "link not found" });
    const clicks = db.prepare("SELECT clicked_at FROM clicks WHERE code = ? ORDER BY clicked_at, id").all(link.code);
    return res.json(summarizeClicks(link.code, link.url, clicks));
  });
  app.get("/links/:code", (req, res) => {
    const link = findLink(req.params.code);
    if (!link) return res.status(404).json({ error: "link not found" });
    return res.json({ code: link.code, url: link.url, createdAt: link.created_at });
  });
  app.get("/:code", (req, res) => {
    const link = findLink(req.params.code);
    if (!link) return res.status(404).json({ error: "link not found" });
    db.prepare("INSERT INTO clicks (code, clicked_at, referer) VALUES (?, ?, ?)").run(link.code, now(), req.get("referer") ?? null);
    return res.redirect(302, link.url);
  });
}

export function createApp(options = {}) {
  const settings = resolveOptions(options);
  const db = openDatabase(settings.databasePath);
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  const rateLimit = createRateLimiter({ max: settings.rateLimitMax, windowMs: settings.rateLimitWindowMs, now: settings.now });
  app.post("/links", rateLimit, createLinkHandler(db, settings.now));
  registerReadRoutes(app, db, settings.now);
  app.locals.close = () => db.close();
  return app;
}
