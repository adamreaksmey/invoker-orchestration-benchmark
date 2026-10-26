import type { Account, Transaction } from "./ledger";
import type { LedgerRepository } from "./ledger-service";

interface OwnerRecords {
  accounts: Account[];
  transactions: Transaction[];
}

export class InMemoryLedgerRepository implements LedgerRepository {
  private readonly records = new Map<string, OwnerRecords>();

  findAccount(ownerId: string, accountId: string): Account | undefined {
    const account = this.recordsFor(ownerId).accounts.find((candidate) => candidate.id === accountId);
    return account && { ...account };
  }

  listAccounts(ownerId: string): Account[] {
    return this.recordsFor(ownerId).accounts.map((account) => ({ ...account }));
  }

  insertAccount(ownerId: string, account: Account): void {
    this.recordsFor(ownerId).accounts.push({ ...account });
  }

  hasTransaction(ownerId: string, transactionId: string): boolean {
    return this.recordsFor(ownerId).transactions.some((transaction) => transaction.id === transactionId);
  }

  insertTransaction(ownerId: string, transaction: Transaction): void {
    this.recordsFor(ownerId).transactions.push({ ...transaction });
  }

  listTransactions(ownerId: string, accountId?: string): Transaction[] {
    return this.recordsFor(ownerId).transactions
      .filter((transaction) => accountId === undefined || transaction.accountId === accountId)
      .map((transaction) => ({ ...transaction }));
  }

  private recordsFor(ownerId: string): OwnerRecords {
    let owned = this.records.get(ownerId);
    if (!owned) {
      owned = { accounts: [], transactions: [] };
      this.records.set(ownerId, owned);
    }
    return owned;
  }
}
