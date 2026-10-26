import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { SqliteLedger } from "./sqlite-ledger";

describe("SqliteLedger", () => {
  let db: DatabaseSync | undefined;
  afterEach(() => db?.close());

  function setup(): DatabaseSync {
    db = new DatabaseSync(":memory:");
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL);
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (user_id, id)
      );
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents != 0),
        description TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id) ON DELETE CASCADE
      );
      INSERT INTO users (id) VALUES ('u1'), ('u2');
    `);
    return db;
  }

  it("persists accounts and integer-cent transactions and balances", () => {
    const database = setup();
    const ledger = new SqliteLedger(database, "u1");
    ledger.addAccount({ id: "checking", name: " Checking " });
    ledger.addTransaction({ id: "pay", accountId: "checking", amountCents: 125_050 });
    ledger.addTransaction({ id: "rent", accountId: "checking", amountCents: -80_025, description: " Rent " });

    expect(ledger.listAccounts()).toEqual([{ id: "checking", name: "Checking" }]);
    expect(ledger.listTransactions("checking")).toEqual([
      { id: "pay", accountId: "checking", amountCents: 125_050 },
      { id: "rent", accountId: "checking", amountCents: -80_025, description: "Rent" },
    ]);
    expect(ledger.getBalance("checking")).toBe(45_025);
  });

  it("isolates account and transaction queries by user", () => {
    const database = setup();
    const first = new SqliteLedger(database, "u1");
    const second = new SqliteLedger(database, "u2");
    first.addAccount({ id: "first-account", name: "First" });
    second.addAccount({ id: "second-account", name: "Second" });
    first.addTransaction({ id: "first-transaction", accountId: "first-account", amountCents: 50 });

    expect(second.listAccounts()).toEqual([{ id: "second-account", name: "Second" }]);
    expect(second.listTransactions()).toEqual([]);
    expect(() => second.getBalance("first-account")).toThrow(/Unknown account/);
    expect(() => second.addTransaction({ id: "leak", accountId: "first-account", amountCents: 1 }))
      .toThrow(/Unknown account/);
  });

  it("rejects invalid transaction amounts and safe-integer balance overflow", () => {
    const ledger = new SqliteLedger(setup(), "u1");
    ledger.addAccount({ id: "a", name: "Main" });
    expect(() => ledger.addTransaction({ id: "zero", accountId: "a", amountCents: 0 })).toThrow(/cannot be zero/);
    expect(() => ledger.addTransaction({ id: "fraction", accountId: "a", amountCents: 1.5 })).toThrow(/safe integer/);
    ledger.addTransaction({ id: "large", accountId: "a", amountCents: Number.MAX_SAFE_INTEGER });
    ledger.addTransaction({ id: "overflow", accountId: "a", amountCents: 1 });
    expect(() => ledger.getBalance("a")).toThrow(/exceeds safe integer/);
  });
});
