import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { applyMigrations } from "./migrations";

describe("database migrations", () => {
  let db: DatabaseSync | undefined;

  afterEach(() => db?.close());

  it("applies migration v1 cleanly on an empty database", () => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");

    applyMigrations(db);

    expect(db.prepare("SELECT version FROM schema_migrations").all()).toEqual([{ version: 1 }]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()).toEqual([
      { name: "accounts" },
      { name: "schema_migrations" },
      { name: "sessions" },
      { name: "transactions" },
      { name: "users" },
    ]);
    expect(db.prepare("PRAGMA table_info(accounts)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "user_id" }),
      expect.objectContaining({ name: "id" }),
      expect.objectContaining({ name: "name" }),
    ]));
    expect(db.prepare("PRAGMA table_info(transactions)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "user_id" }),
      expect.objectContaining({ name: "amount_cents" }),
    ]));

    applyMigrations(db);
    expect(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toEqual({ count: 1 });
  });
});
