import type { DatabaseSync } from "node:sqlite";
import type { Account, Transaction } from "./ledger";

type AccountRow = { id: string; name: string };
type TransactionRow = { id: string; account_id: string; amount_cents: number; description: string | null };

/** A ledger backed by the application's SQLite database for one authenticated user. */
export class SqliteLedger {
  private readonly userId: string;

  constructor(private readonly db: DatabaseSync, userId: string) {
    this.userId = requireText(userId, "User id");
  }

  addAccount(account: Account): Account {
    const id = requireText(account?.id, "Account id");
    const name = requireText(account?.name, "Account name");
    try {
      this.db.prepare("INSERT INTO accounts (id, user_id, name, created_at) VALUES (?, ?, ?, ?)")
        .run(id, this.userId, name, Date.now());
    } catch (error) {
      if (isConstraintError(error)) throw new Error(`Account already exists: ${id}`);
      throw error;
    }
    return { id, name };
  }

  getAccount(accountId: string): Account | undefined {
    const row = this.db.prepare("SELECT id, name FROM accounts WHERE user_id = ? AND id = ?")
      .get(this.userId, accountId) as AccountRow | undefined;
    return row && { id: row.id, name: row.name };
  }

  listAccounts(): Account[] {
    const rows = this.db.prepare("SELECT id, name FROM accounts WHERE user_id = ? ORDER BY rowid")
      .all(this.userId) as AccountRow[];
    return rows.map(({ id, name }) => ({ id, name }));
  }

  addTransaction(transaction: Transaction): Transaction {
    const id = requireText(transaction?.id, "Transaction id");
    const accountId = requireText(transaction?.accountId, "Account id");
    if (!this.getAccount(accountId)) throw new Error(`Unknown account: ${accountId}`);
    if (!Number.isSafeInteger(transaction.amountCents)) {
      throw new TypeError("Transaction amountCents must be a safe integer");
    }
    if (transaction.amountCents === 0) throw new RangeError("Transaction amountCents cannot be zero");
    const description = transaction.description?.trim() || undefined;
    try {
      this.db.prepare(`INSERT INTO transactions
        (id, user_id, account_id, amount_cents, description, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, this.userId, accountId, transaction.amountCents, description ?? null, Date.now());
    } catch (error) {
      if (isConstraintError(error) && this.transactionExists(id)) {
        throw new Error(`Transaction already exists: ${id}`);
      }
      throw error;
    }
    return { id, accountId, amountCents: transaction.amountCents, ...(description ? { description } : {}) };
  }

  listTransactions(accountId?: string): Transaction[] {
    if (accountId !== undefined && !this.getAccount(accountId)) throw new Error(`Unknown account: ${accountId}`);
    const rows = accountId === undefined
      ? this.db.prepare(`SELECT id, account_id, amount_cents, description FROM transactions
          WHERE user_id = ? ORDER BY rowid`).all(this.userId) as TransactionRow[]
      : this.db.prepare(`SELECT id, account_id, amount_cents, description FROM transactions
          WHERE user_id = ? AND account_id = ? ORDER BY rowid`).all(this.userId, accountId) as TransactionRow[];
    return rows.map(toTransaction);
  }

  getBalance(accountId: string): number {
    if (!this.getAccount(accountId)) throw new Error(`Unknown account: ${accountId}`);
    let balance = 0;
    for (const transaction of this.listTransactions(accountId)) {
      balance += transaction.amountCents;
      if (!Number.isSafeInteger(balance)) throw new RangeError("Account balance exceeds safe integer cents");
    }
    return balance;
  }

  private transactionExists(id: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM transactions WHERE user_id = ? AND id = ?")
      .get(this.userId, id));
  }
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    amountCents: Number(row.amount_cents),
    ...(row.description ? { description: row.description } : {}),
  };
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint/i.test(error.message);
}
