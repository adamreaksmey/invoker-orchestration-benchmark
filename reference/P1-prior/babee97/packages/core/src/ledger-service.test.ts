import { describe, expect, it } from "vitest";
import type { Account, Transaction } from "./ledger";
import { LedgerService, type LedgerRepository } from "./ledger-service";

class InMemoryRepository implements LedgerRepository {
  private readonly accounts = new Map<string, Account>();
  private readonly transactions: Transaction[] = [];

  findAccount(userId: string, accountId: string): Account | undefined {
    const account = this.accounts.get(this.accountKey(userId, accountId));
    return account && { ...account };
  }

  listAccounts(userId: string): Account[] {
    return [...this.accounts.entries()]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, account]) => ({ ...account }));
  }

  insertAccount(userId: string, account: Account): void {
    this.accounts.set(this.accountKey(userId, account.id), { ...account });
  }

  hasTransaction(userId: string, transactionId: string): boolean {
    return this.transactions.some(
      (transaction) => transaction.id === transactionId && transaction.accountId.startsWith(`${userId}:`),
    );
  }

  insertTransaction(userId: string, transaction: Transaction): void {
    this.transactions.push({ ...transaction, accountId: this.accountKey(userId, transaction.accountId) });
  }

  listTransactions(userId: string, accountId?: string): Transaction[] {
    const scopedAccountId = accountId === undefined ? undefined : this.accountKey(userId, accountId);
    return this.transactions
      .filter(
        (transaction) =>
          transaction.accountId.startsWith(`${userId}:`) &&
          (scopedAccountId === undefined || transaction.accountId === scopedAccountId),
      )
      .map((transaction) => ({ ...transaction, accountId: transaction.accountId.slice(userId.length + 1) }));
  }

  private accountKey(userId: string, accountId: string): string {
    return `${userId}:${accountId}`;
  }
}

describe("LedgerService", () => {
  it("applies ledger rules while delegating persistence per user", () => {
    const service = new LedgerService(new InMemoryRepository());

    service.addAccount("alice", { id: "checking", name: " Checking " });
    service.addTransaction("alice", {
      id: "pay",
      accountId: "checking",
      amountCents: 125_050,
      description: " payday ",
    });
    service.addTransaction("alice", { id: "rent", accountId: "checking", amountCents: -80_025 });

    expect(service.listAccounts("alice")).toEqual([{ id: "checking", name: "Checking" }]);
    expect(service.listTransactions("alice", "checking")).toEqual([
      { id: "pay", accountId: "checking", amountCents: 125_050, description: "payday" },
      { id: "rent", accountId: "checking", amountCents: -80_025 },
    ]);
    expect(service.getBalance("alice", "checking")).toBe(45_025);
  });

  it("rejects unknown accounts, duplicate ids, and zero amounts", () => {
    const service = new LedgerService(new InMemoryRepository());
    service.addAccount("alice", { id: "checking", name: "Checking" });
    service.addTransaction("alice", { id: "pay", accountId: "checking", amountCents: 1 });

    expect(() => service.addTransaction("alice", { id: "missing", accountId: "savings", amountCents: 1 })).toThrow(
      /Unknown account/,
    );
    expect(() => service.addAccount("alice", { id: "checking", name: "Other" })).toThrow(/already exists/);
    expect(() => service.addTransaction("alice", { id: "pay", accountId: "checking", amountCents: 2 })).toThrow(
      /already exists/,
    );
    expect(() => service.addTransaction("alice", { id: "zero", accountId: "checking", amountCents: 0 })).toThrow(
      /cannot be zero/,
    );
    expect(() => service.getBalance("bob", "checking")).toThrow(/Unknown account/);
  });
});
