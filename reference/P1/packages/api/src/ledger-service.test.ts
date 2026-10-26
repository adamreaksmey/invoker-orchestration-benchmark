import { afterEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./db";
import { LedgerService } from "./ledger-service";

describe("LedgerService", () => {
  let db: DatabaseSync | undefined;
  afterEach(() => db?.close());

  it("persists user-scoped accounts, transactions, and balances", () => {
    db = openDatabase(":memory:");
    db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)").run("alice", "alice", "hash", 1);
    db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)").run("bob", "bob", "hash", 1);
    const alice = new LedgerService(db, "alice");
    const bob = new LedgerService(db, "bob");
    alice.addAccount({ id: "checking", name: "Checking" });
    alice.addTransaction({ id: "pay", accountId: "checking", amountCents: 1234, description: "  Pay  " });

    expect(alice.listAccounts()).toEqual([{ id: "checking", name: "Checking" }]);
    expect(alice.listTransactions()).toEqual([{ id: "pay", accountId: "checking", amountCents: 1234, description: "Pay" }]);
    expect(alice.getBalance("checking")).toBe(1234);
    expect(bob.listAccounts()).toEqual([]);
    expect(() => bob.getBalance("checking")).toThrow(/Unknown account/);
  });

  it("validates integer cents and domain references", () => {
    db = openDatabase(":memory:");
    db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)").run("alice", "alice", "hash", 1);
    const service = new LedgerService(db, "alice");
    service.addAccount({ id: "a", name: "Main" });
    expect(() => service.addAccount({ id: "a", name: "Other" })).toThrow(/already exists/);
    expect(() => service.addTransaction({ id: "t", accountId: "missing", amountCents: 1 })).toThrow(/Unknown account/);
    expect(() => service.addTransaction({ id: "t", accountId: "a", amountCents: 1.5 })).toThrow(/safe integer/);
    service.addTransaction({ id: "t", accountId: "a", amountCents: 1 });
    expect(() => service.addTransaction({ id: "t", accountId: "a", amountCents: 2 })).toThrow(/already exists/);
  });
});
