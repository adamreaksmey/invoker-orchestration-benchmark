import { DatabaseSync } from "node:sqlite";

const MIGRATIONS = [
  {
    version: 1,
    sql: `CREATE TABLE links (code TEXT PRIMARY KEY, url TEXT NOT NULL, created_at TEXT NOT NULL);
          CREATE TABLE clicks (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL REFERENCES links(code),
                               clicked_at INTEGER NOT NULL, referer TEXT);
          CREATE INDEX clicks_by_code ON clicks(code, clicked_at);`,
  },
];

export function openDatabase(path) {
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set(db.prepare("SELECT version FROM schema_migrations").all().map((row) => row.version));
  for (const migration of MIGRATIONS.filter((candidate) => !applied.has(candidate.version))) {
    db.exec("BEGIN");
    db.exec(migration.sql);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(migration.version, new Date().toISOString());
    db.exec("COMMIT");
  }
  return db;
}
