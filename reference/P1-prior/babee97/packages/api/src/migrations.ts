import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

interface Migration {
  version: number;
  sql: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    sql: readFileSync(new URL("./migrations/001_initial.sql", import.meta.url), "utf8"),
  },
];

/** Apply each unapplied migration exactly once, in version order. */
export function applyMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>)
      .map((row) => Number(row.version)),
  );

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;

    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(migration.version, Date.now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

