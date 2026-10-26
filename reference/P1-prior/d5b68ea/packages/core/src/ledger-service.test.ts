import { describe, expect, it } from "vitest";
import { InMemoryLedgerRepository } from "./in-memory-ledger-repository";
import { LedgerService } from "./ledger-service";

const ALICE = "alice-id";
const BOB = "bob-id";

function createService() {
  return new LedgerService(new InMemoryLedgerRepository());
}

describe("LedgerService", () => {
  it("adds accounts, posts transactions, and computes balances in integer cents", () => {
    const service = createService();
    service.addAccount(ALICE, { id: "checking", name: " Checking " });
    service.addTransaction(ALICE, { id: "pay", accountId: "checking", amountCents: 125_050 });
    service.addTransaction(ALICE, { id: "rent", accountId: "checking", amountCents: -80_025, description: " rent " });

    expect(service.listAccounts(ALICE)).toEqual([{ id: "checking", name: "Checking" }]);
    expect(service.getBalance(ALICE, "checking")).toBe(45_025);
    expect(service.listTransactions(ALICE, "checking").map(({ id }) => id)).toEqual(["pay", "rent"]);
    expect(service.listTransactions(ALICE)[1].description).toBe("rent");
  });

  it("isolates owners and allows the same ids for different owners", () => {
    const service = createService();
    service.addAccount(ALICE, { id: "checking", name: "Alice" });
    service.addAccount(BOB, { id: "checking", name: "Bob" });
    service.addTransaction(ALICE, { id: "pay", accountId: "checking", amountCents: 500 });

    expect(service.getBalance(BOB, "checking")).toBe(0);
    expect(service.listTransactions(BOB)).toEqual([]);
    expect(service.listAccounts(BOB)).toEqual([{ id: "checking", name: "Bob" }]);
  });

  it("rejects duplicates, unknown accounts, and invalid amounts", () => {
    const service = createService();
    service.addAccount(ALICE, { id: "a", name: "A" });
    service.addTransaction(ALICE, { id: "t", accountId: "a", amountCents: 1 });

    expect(() => service.addAccount(ALICE, { id: "a", name: "Again" })).toThrow(/already exists/);
    expect(() => service.addTransaction(ALICE, { id: "t", accountId: "a", amountCents: 2 })).toThrow(/already exists/);
    expect(() => service.addTransaction(ALICE, { id: "u", accountId: "missing", amountCents: 2 })).toThrow(/Unknown account/);
    expect(() => service.addTransaction(ALICE, { id: "u", accountId: "a", amountCents: 0 })).toThrow(RangeError);
    expect(() => service.addTransaction(ALICE, { id: "u", accountId: "a", amountCents: 1.5 })).toThrow(TypeError);
    expect(() => service.getBalance(ALICE, "missing")).toThrow(/Unknown account/);
    expect(() => service.listTransactions(BOB, "a")).toThrow(/Unknown account/);
  });

  it("rejects balances beyond safe integer cents", () => {
    const service = createService();
    service.addAccount(ALICE, { id: "a", name: "A" });
    service.addTransaction(ALICE, { id: "big", accountId: "a", amountCents: Number.MAX_SAFE_INTEGER });
    service.addTransaction(ALICE, { id: "more", accountId: "a", amountCents: 1 });
    expect(() => service.getBalance(ALICE, "a")).toThrow(RangeError);
  });
});
