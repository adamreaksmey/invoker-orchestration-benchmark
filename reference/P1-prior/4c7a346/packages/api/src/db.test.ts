import { afterEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase, runMigrations } from "./db";

describe("ledger database migrations", () => {
  let db: DatabaseSync | undefined;
  afterEach(() => db?.close());

  it("applies v1 cleanly to an empty database and records it once", () => {
    db = openDatabase(":memory:");

    expect(db.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 1, name: "create_ledger_tables" },
      { version: 2, name: "scope_ledger_ids_to_users" },
    ]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all())
      .toEqual([
        { name: "accounts" },
        { name: "schema_migrations" },
        { name: "sessions" },
        { name: "transactions" },
        { name: "users" },
      ]);

    runMigrations(db);
    expect(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toEqual({ count: 2 });
  });
});
