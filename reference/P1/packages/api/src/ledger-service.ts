import type { DatabaseSync } from "node:sqlite";

export interface Account {
  id: string;
  name: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  amountCents: number;
  description?: string;
}

type AccountRow = { id: string; name: string };
type TransactionRow = { id: string; account_id: string; amount_cents: number; description: string | null };

/** Persistent, user-scoped ledger operations. This service has no Express dependency. */
export class LedgerService {
  constructor(private readonly db: DatabaseSync, private readonly userId: string, private readonly now: () => number = Date.now) {
    requireText(userId, "User id");
  }

  addAccount(input: Account): Account {
    const id = requireText(input?.id, "Account id");
    const name = requireText(input?.name, "Account name");
    if (this.getAccount(id)) throw new Error(`Account already exists: ${id}`);
    const account = { id, name };
    this.db.prepare("INSERT INTO accounts (user_id, id, name, created_at) VALUES (?, ?, ?, ?)").run(this.userId, id, name, this.now());
    return account;
  }

  getAccount(accountId: string): Account | undefined {
    const id = requireText(accountId, "Account id");
    const row = this.db.prepare("SELECT id, name FROM accounts WHERE user_id = ? AND id = ?").get(this.userId, id) as AccountRow | undefined;
    return row && { id: row.id, name: row.name };
  }

  listAccounts(): Account[] {
    return (this.db.prepare("SELECT id, name FROM accounts WHERE user_id = ? ORDER BY rowid").all(this.userId) as AccountRow[])
      .map(row => ({ id: row.id, name: row.name }));
  }

  addTransaction(input: Transaction): Transaction {
    const id = requireText(input?.id, "Transaction id");
    const accountId = requireText(input?.accountId, "Account id");
    if (!this.getAccount(accountId)) throw new Error(`Unknown account: ${accountId}`);
    if (!Number.isSafeInteger(input?.amountCents)) throw new TypeError("Transaction amountCents must be a safe integer");
    if (input.amountCents === 0) throw new RangeError("Transaction amountCents cannot be zero");
    const description = typeof input.description === "string" ? input.description.trim() : undefined;
    if (this.db.prepare("SELECT 1 FROM transactions WHERE user_id = ? AND id = ?").get(this.userId, id)) {
      throw new Error(`Transaction already exists: ${id}`);
    }
    const transaction: Transaction = { id, accountId, amountCents: input.amountCents, ...(description ? { description } : {}) };
    this.db.prepare("INSERT INTO transactions (user_id, id, account_id, amount_cents, description, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(this.userId, id, accountId, input.amountCents, description ?? null, this.now());
    return { ...transaction };
  }

  listTransactions(accountId?: string): Transaction[] {
    if (accountId !== undefined && !this.getAccount(accountId)) throw new Error(`Unknown account: ${accountId}`);
    const rows = accountId === undefined
      ? this.db.prepare("SELECT id, account_id, amount_cents, description FROM transactions WHERE user_id = ? ORDER BY rowid").all(this.userId)
      : this.db.prepare("SELECT id, account_id, amount_cents, description FROM transactions WHERE user_id = ? AND account_id = ? ORDER BY rowid").all(this.userId, accountId);
    return (rows as TransactionRow[]).map(toTransaction);
  }

  getBalance(accountId: string): number {
    if (!this.getAccount(accountId)) throw new Error(`Unknown account: ${accountId}`);
    let balance = 0;
    for (const row of this.db.prepare("SELECT amount_cents FROM transactions WHERE user_id = ? AND account_id = ? ORDER BY rowid").all(this.userId, accountId) as Array<{ amount_cents: number }>) {
      balance += Number(row.amount_cents);
      if (!Number.isSafeInteger(balance)) throw new RangeError("Account balance exceeds safe integer cents");
    }
    return balance;
  }
}

function toTransaction(row: TransactionRow): Transaction {
  return { id: row.id, accountId: row.account_id, amountCents: Number(row.amount_cents), ...(row.description ? { description: row.description } : {}) };
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}
