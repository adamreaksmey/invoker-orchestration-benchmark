import { DatabaseSync } from "node:sqlite";

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "auth",
    sql: `
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
    `,
  },
  {
    version: 2,
    name: "ledger",
    sql: `
      CREATE TABLE IF NOT EXISTS accounts (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, id)
      );
      CREATE TABLE IF NOT EXISTS transactions (
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, id),
        FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions(user_id, account_id);
    `,
  },
];

/** Open the local SQLite database and apply all versioned schema migrations. */
export function openDatabase(filename: string): DatabaseSync {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at INTEGER NOT NULL)");
  const applied = new Set<number>(
    (db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>).map(row => Number(row.version)),
  );
  const record = db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)");
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      record.run(migration.version, migration.name, Date.now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
  }
  return db;
}
