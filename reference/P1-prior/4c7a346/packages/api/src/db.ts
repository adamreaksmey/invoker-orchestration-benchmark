import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = [
  { version: 1, name: "create_ledger_tables", file: "001_create_ledger_tables.sql" },
  { version: 2, name: "scope_ledger_ids_to_users", file: "002_scope_ledger_ids_to_users.sql" },
] as const;

/** Open the local SQLite database and ensure the persistence schema exists. */
export function openDatabase(filename: string): DatabaseSync {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
  `);
  runMigrations(db);
  return db;
}

/** Apply each unapplied SQL migration once, recording its version atomically. */
export function runMigrations(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);
  const applied = db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[];
  const versions = new Set(applied.map(({ version }) => Number(version)));

  for (const migration of MIGRATIONS) {
    if (versions.has(migration.version)) continue;
    const sql = readFileSync(join(__dirname, "../migrations", migration.file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
        .run(migration.version, migration.name, Date.now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
