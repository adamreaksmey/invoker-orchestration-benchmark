import { describe, expect, it } from "vitest";
import { Ledger } from "./ledger";
import { LedgerService } from "./ledger-service";

describe("LedgerService", () => {
  it("applies ledger rules while persisting through its store", () => {
    const service = new LedgerService(new Ledger());
    service.addAccount({ id: " checking ", name: " Checking " });
    service.addTransaction({ id: "pay", accountId: "checking", amountCents: 125_050 });
    service.addTransaction({ id: "rent", accountId: "checking", amountCents: -80_025, description: " Rent " });

    expect(service.listAccounts()).toEqual([{ id: "checking", name: "Checking" }]);
    expect(service.listTransactions("checking")).toEqual([
      { id: "pay", accountId: "checking", amountCents: 125_050 },
      { id: "rent", accountId: "checking", amountCents: -80_025, description: "Rent" },
    ]);
    expect(service.getBalance("checking")).toBe(45_025);
  });

  it("rejects unknown accounts, duplicate ids, and invalid amounts", () => {
    const service = new LedgerService(new Ledger());
    service.addAccount({ id: "a", name: "Main" });

    expect(() => service.addAccount({ id: "a", name: "Other" })).toThrow(/already exists/);
    expect(() => service.addTransaction({ id: "t", accountId: "missing", amountCents: 1 }))
      .toThrow(/Unknown account/);
    expect(() => service.addTransaction({ id: "t", accountId: "a", amountCents: 0 }))
      .toThrow(/cannot be zero/);
    expect(() => service.addTransaction({ id: "t", accountId: "a", amountCents: 1.5 }))
      .toThrow(/safe integer/);

    service.addTransaction({ id: "t", accountId: "a", amountCents: 1 });
    expect(() => service.addTransaction({ id: "t", accountId: "a", amountCents: 2 }))
      .toThrow(/already exists/);
    expect(() => service.getBalance("missing")).toThrow(/Unknown account/);
    expect(() => service.listTransactions("missing")).toThrow(/Unknown account/);
  });

  it("does not expose records returned by persistence", () => {
    const service = new LedgerService(new Ledger());
    service.addAccount({ id: "a", name: "Main" });
    const account = service.getAccount("a")!;
    account.name = "Changed";
    service.addTransaction({ id: "t", accountId: "a", amountCents: 1 });
    const transactions = service.listTransactions();
    transactions[0].amountCents = 50;

    expect(service.getAccount("a")?.name).toBe("Main");
    expect(service.getBalance("a")).toBe(1);
  });
});
