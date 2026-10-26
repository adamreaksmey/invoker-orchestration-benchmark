import { DatabaseSync } from "node:sqlite";
import { applyMigrations } from "./migrations";

/** Open the local SQLite database and apply all pending persistence migrations. */
export function openDatabase(filename: string): DatabaseSync {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON");
  applyMigrations(db);
  return db;
}
