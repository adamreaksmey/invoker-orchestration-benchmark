import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS, currentSchemaVersion, runMigrations } from "./migrations";

const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

function tableNames(db: DatabaseSync): string[] {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
  return rows.map((row) => row.name);
}

describe("runMigrations", () => {
  let db: DatabaseSync | undefined;
  afterEach(() => { db?.close(); db = undefined; });

  it("applies all migrations on an empty database", () => {
    db = new DatabaseSync(":memory:");
    expect(runMigrations(db)).toEqual(MIGRATIONS.map(({ version }) => version));
    expect(tableNames(db)).toEqual(expect.arrayContaining(["users", "sessions", "accounts", "transactions", "schema_migrations"]));
    expect(currentSchemaVersion(db)).toBe(LATEST_VERSION);
  });

  it("is idempotent when run again", () => {
    db = new DatabaseSync(":memory:");
    runMigrations(db);
    expect(runMigrations(db)).toEqual([]);
    expect(currentSchemaVersion(db)).toBe(LATEST_VERSION);
  });

  it("upgrades a pre-migration database that already has auth tables", () => {
    db = new DatabaseSync(":memory:");
    db.exec(MIGRATIONS[0].sql);
    db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES ('u', 'legacy', 'h', 1)").run();
    runMigrations(db);
    const legacyUsers = db.prepare("SELECT username FROM users").all() as { username: string }[];
    expect(legacyUsers.map((row) => row.username)).toEqual(["legacy"]);
    expect(tableNames(db)).toContain("accounts");
  });

  it("rolls back a failing migration and records nothing for it", () => {
    db = new DatabaseSync(":memory:");
    const broken = { version: 1, name: "broken", sql: "CREATE TABLE ok_table (id INTEGER); SELECT * FROM missing_table_xyz;" };
    expect(() => runMigrations(db!, [broken])).toThrow();
    expect(tableNames(db)).not.toContain("ok_table");
    expect(currentSchemaVersion(db)).toBe(0);
  });
});
