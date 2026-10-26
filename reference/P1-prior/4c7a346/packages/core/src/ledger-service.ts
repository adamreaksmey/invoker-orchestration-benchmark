import type { Account, Transaction } from "./ledger";

/** The persistence operations required by LedgerService. */
export interface LedgerPersistence {
  addAccount(account: Account): Account;
  getAccount(accountId: string): Account | undefined;
  listAccounts(): Account[];
  addTransaction(transaction: Transaction): Transaction;
  listTransactions(accountId?: string): Transaction[];
}

/** Applies the ledger's validation and query rules to a persistent store. */
export class LedgerService {
  constructor(private readonly persistence: LedgerPersistence) {}

  addAccount(account: Account): Account {
    const id = requireText(account?.id, "Account id");
    const name = requireText(account?.name, "Account name");
    if (this.persistence.getAccount(id)) throw new Error(`Account already exists: ${id}`);
    return copyAccount(this.persistence.addAccount({ id, name }));
  }

  getAccount(accountId: string): Account | undefined {
    const account = this.persistence.getAccount(accountId);
    return account && copyAccount(account);
  }

  listAccounts(): Account[] {
    return this.persistence.listAccounts().map(copyAccount);
  }

  addTransaction(transaction: Transaction): Transaction {
    const id = requireText(transaction?.id, "Transaction id");
    const accountId = requireText(transaction?.accountId, "Account id");
    if (!this.persistence.getAccount(accountId)) throw new Error(`Unknown account: ${accountId}`);
    if (this.persistence.listTransactions().some((saved) => saved.id === id)) {
      throw new Error(`Transaction already exists: ${id}`);
    }
    if (!Number.isSafeInteger(transaction.amountCents)) {
      throw new TypeError("Transaction amountCents must be a safe integer");
    }
    if (transaction.amountCents === 0) {
      throw new RangeError("Transaction amountCents cannot be zero");
    }
    const description = transaction.description?.trim();
    return copyTransaction(this.persistence.addTransaction({
      id,
      accountId,
      amountCents: transaction.amountCents,
      ...(description ? { description } : {}),
    }));
  }

  listTransactions(accountId?: string): Transaction[] {
    if (accountId !== undefined && !this.persistence.getAccount(accountId)) {
      throw new Error(`Unknown account: ${accountId}`);
    }
    return this.persistence.listTransactions(accountId).map(copyTransaction);
  }

  getBalance(accountId: string): number {
    if (!this.persistence.getAccount(accountId)) throw new Error(`Unknown account: ${accountId}`);
    let balance = 0;
    for (const transaction of this.persistence.listTransactions(accountId)) {
      balance += transaction.amountCents;
      if (!Number.isSafeInteger(balance)) throw new RangeError("Account balance exceeds safe integer cents");
    }
    return balance;
  }
}

function copyAccount(account: Account): Account {
  return { id: account.id, name: account.name };
}

function copyTransaction(transaction: Transaction): Transaction {
  return {
    id: transaction.id,
    accountId: transaction.accountId,
    amountCents: transaction.amountCents,
    ...(transaction.description ? { description: transaction.description } : {}),
  };
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}
