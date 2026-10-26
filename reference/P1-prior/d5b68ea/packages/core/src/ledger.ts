/** An account tracked by the in-memory ledger. */
export interface Account {
  id: string;
  name: string;
}

/** A transaction amount is signed integer cents: credits are positive, debits negative. */
export interface Transaction {
  id: string;
  accountId: string;
  amountCents: number;
  description?: string;
}

export class Ledger {
  private readonly accounts = new Map<string, Account>();
  private readonly transactions: Transaction[] = [];
  private readonly transactionIds = new Set<string>();

  addAccount(account: Account): Account {
    const saved = parseAccount(account);
    if (this.accounts.has(saved.id)) throw new Error(`Account already exists: ${saved.id}`);
    this.accounts.set(saved.id, saved);
    return { ...saved };
  }

  getAccount(accountId: string): Account | undefined {
    const account = this.accounts.get(accountId);
    return account ? { ...account } : undefined;
  }

  listAccounts(): Account[] {
    return [...this.accounts.values()].map((account) => ({ ...account }));
  }

  addTransaction(transaction: Transaction): Transaction {
    const saved = parseTransaction(transaction);
    if (!this.accounts.has(saved.accountId)) throw new Error(`Unknown account: ${saved.accountId}`);
    if (this.transactionIds.has(saved.id)) throw new Error(`Transaction already exists: ${saved.id}`);
    this.transactions.push(saved);
    this.transactionIds.add(saved.id);
    return { ...saved };
  }

  listTransactions(accountId?: string): Transaction[] {
    if (accountId !== undefined && !this.accounts.has(accountId)) {
      throw new Error(`Unknown account: ${accountId}`);
    }
    return this.transactions
      .filter((transaction) => accountId === undefined || transaction.accountId === accountId)
      .map((transaction) => ({ ...transaction }));
  }

  getBalance(accountId: string): number {
    if (!this.accounts.has(accountId)) throw new Error(`Unknown account: ${accountId}`);
    return sumTransactionAmounts(this.transactions.filter((transaction) => transaction.accountId === accountId));
  }
}

export function parseAccount(account: Account): Account {
  return {
    id: requireText(account?.id, "Account id"),
    name: requireText(account?.name, "Account name"),
  };
}

export function parseTransaction(transaction: Transaction): Transaction {
  const id = requireText(transaction?.id, "Transaction id");
  const accountId = requireText(transaction?.accountId, "Account id");
  if (!Number.isSafeInteger(transaction.amountCents)) {
    throw new TypeError("Transaction amountCents must be a safe integer");
  }
  if (transaction.amountCents === 0) throw new RangeError("Transaction amountCents cannot be zero");
  const description = transaction.description?.trim();
  return { id, accountId, amountCents: transaction.amountCents, ...(description ? { description } : {}) };
}

export function sumTransactionAmounts(transactions: readonly Transaction[]): number {
  let balance = 0;
  for (const transaction of transactions) {
    balance += transaction.amountCents;
    if (!Number.isSafeInteger(balance)) throw new RangeError("Account balance exceeds safe integer cents");
  }
  return balance;
}

export function createLedger(): Ledger {
  return new Ledger();
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}
