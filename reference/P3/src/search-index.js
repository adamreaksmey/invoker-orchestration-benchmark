import { DatabaseSync } from "node:sqlite";

const MAX_RESULTS = 20;
const TITLE_WEIGHT = 10.0;
const BODY_WEIGHT = 1.0;
const SNIPPET_TOKENS = 12;
const SEARCH_TERM_PATTERN = /[\p{L}\p{N}_]+/gu;
const MIGRATIONS = [
  {
    version: 1,
    sql: `CREATE VIRTUAL TABLE pages_fts USING fts5(slug UNINDEXED, title, body);
          CREATE TABLE page_tags (slug TEXT NOT NULL, tag TEXT NOT NULL, title TEXT NOT NULL, PRIMARY KEY (slug, tag));`,
  },
];

function migrate(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)");
  const applied = new Set(db.prepare("SELECT version FROM schema_migrations").all().map((row) => row.version));
  for (const migration of MIGRATIONS.filter((candidate) => !applied.has(candidate.version))) {
    db.exec(migration.sql);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(migration.version);
  }
}

export function toMatchExpression(query) {
  const terms = query.match(SEARCH_TERM_PATTERN) ?? [];
  return terms.map((term) => `"${term}"`).join(" ");
}

export function openSearchIndex(path) {
  const db = new DatabaseSync(path);
  migrate(db);
  const removePage = (slug) => {
    db.prepare("DELETE FROM pages_fts WHERE slug = ?").run(slug);
    db.prepare("DELETE FROM page_tags WHERE slug = ?").run(slug);
  };
  const upsertPage = (page) => {
    removePage(page.slug);
    db.prepare("INSERT INTO pages_fts (slug, title, body) VALUES (?, ?, ?)").run(page.slug, page.title, page.body);
    for (const tag of page.tags) db.prepare("INSERT INTO page_tags (slug, tag, title) VALUES (?, ?, ?)").run(page.slug, tag, page.title);
  };
  const rebuild = (pages) => {
    db.exec("BEGIN");
    db.exec("DELETE FROM pages_fts; DELETE FROM page_tags;");
    pages.forEach(upsertPage);
    db.exec("COMMIT");
  };
  return { db, removePage, upsertPage, rebuild, search: (query) => search(db, query), close: () => db.close() };
}

function search(db, query) {
  const expression = toMatchExpression(query);
  if (!expression) return [];
  const rows = db.prepare(
    `SELECT slug, title, snippet(pages_fts, 2, '**', '**', '…', ${SNIPPET_TOKENS}) AS snippet,
            bm25(pages_fts, 0, ${TITLE_WEIGHT}, ${BODY_WEIGHT}) AS rank
     FROM pages_fts WHERE pages_fts MATCH ? ORDER BY rank LIMIT ${MAX_RESULTS}`,
  ).all(expression);
  return rows.map(({ slug, title, snippet, rank }) => ({ slug, title, snippet, score: -rank }));
}
