import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { LedgerService } from "./ledger-service";
import { SqliteLedgerRepository } from "./sqlite-ledger-repository";

describe("SqliteLedgerRepository", () => {
  let db: DatabaseSync | undefined;

  afterEach(() => db?.close());

  function createService(): LedgerService {
    db = new DatabaseSync(":memory:");
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE accounts (
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        PRIMARY KEY (user_id, id)
      );
      CREATE TABLE transactions (
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        description TEXT,
        PRIMARY KEY (user_id, id),
        FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id)
      );
    `);
    return new LedgerService(new SqliteLedgerRepository(db));
  }

  it("persists accounts and transactions per user using integer cents", () => {
    const service = createService();
    service.addAccount("alice", { id: "checking", name: " Checking " });
    service.addTransaction("alice", { id: "pay", accountId: "checking", amountCents: 125_050 });
    service.addTransaction("alice", { id: "rent", accountId: "checking", amountCents: -80_025, description: " rent " });

    expect(service.listAccounts("alice")).toEqual([{ id: "checking", name: "Checking" }]);
    expect(service.listTransactions("alice", "checking")).toEqual([
      { id: "pay", accountId: "checking", amountCents: 125_050 },
      { id: "rent", accountId: "checking", amountCents: -80_025, description: "rent" },
    ]);
    expect(service.getBalance("alice", "checking")).toBe(45_025);
  });

  it("isolates users while allowing the same account and transaction ids", () => {
    const service = createService();
    service.addAccount("alice", { id: "checking", name: "Alice" });
    service.addAccount("bob", { id: "checking", name: "Bob" });
    service.addTransaction("alice", { id: "pay", accountId: "checking", amountCents: 500 });
    service.addTransaction("bob", { id: "pay", accountId: "checking", amountCents: 700 });

    expect(service.getBalance("alice", "checking")).toBe(500);
    expect(service.getBalance("bob", "checking")).toBe(700);
    expect(service.listTransactions("bob")).toHaveLength(1);
  });

  it("enforces domain validation and account ownership", () => {
    const service = createService();
    service.addAccount("alice", { id: "a", name: "A" });
    service.addTransaction("alice", { id: "t", accountId: "a", amountCents: 1 });

    expect(() => service.addAccount("alice", { id: "a", name: "Again" })).toThrow(/already exists/);
    expect(() => service.addTransaction("alice", { id: "t", accountId: "a", amountCents: 2 })).toThrow(/already exists/);
    expect(() => service.addTransaction("bob", { id: "t", accountId: "a", amountCents: 2 })).toThrow(/Unknown account/);
    expect(() => service.addTransaction("alice", { id: "zero", accountId: "a", amountCents: 0 })).toThrow(RangeError);
    expect(() => service.addTransaction("alice", { id: "fraction", accountId: "a", amountCents: 1.5 })).toThrow(TypeError);
    expect(() => service.getBalance("bob", "a")).toThrow(/Unknown account/);
  });
});
