import type { DatabaseSync } from "node:sqlite";
import type { Account, Transaction } from "./ledger";
import type { LedgerRepository } from "./ledger-service";

type AccountRow = { id: string; name: string };
type TransactionRow = {
  id: string;
  account_id: string;
  amount_cents: number;
  description: string | null;
};

/** SQLite implementation of the user-scoped ledger repository. */
export class SqliteLedgerRepository implements LedgerRepository {
  constructor(private readonly db: DatabaseSync) {}

  findAccount(userId: string, accountId: string): Account | undefined {
    const row = this.db.prepare("SELECT id, name FROM accounts WHERE user_id = ? AND id = ?").get(userId, accountId) as
      | AccountRow
      | undefined;
    return row && { id: row.id, name: row.name };
  }

  listAccounts(userId: string): Account[] {
    const rows = this.db.prepare("SELECT id, name FROM accounts WHERE user_id = ? ORDER BY rowid").all(userId) as AccountRow[];
    return rows.map(({ id, name }) => ({ id, name }));
  }

  insertAccount(userId: string, account: Account): void {
    this.db.prepare("INSERT INTO accounts (user_id, id, name) VALUES (?, ?, ?)").run(userId, account.id, account.name);
  }

  hasTransaction(userId: string, transactionId: string): boolean {
    const row = this.db.prepare("SELECT 1 AS present FROM transactions WHERE user_id = ? AND id = ?").get(userId, transactionId) as
      | { present: number }
      | undefined;
    return row !== undefined;
  }

  insertTransaction(userId: string, transaction: Transaction): void {
    this.db.prepare(
      "INSERT INTO transactions (user_id, id, account_id, amount_cents, description) VALUES (?, ?, ?, ?, ?)",
    ).run(userId, transaction.id, transaction.accountId, transaction.amountCents, transaction.description ?? null);
  }

  listTransactions(userId: string, accountId?: string): Transaction[] {
    const query = accountId === undefined
      ? "SELECT id, account_id, amount_cents, description FROM transactions WHERE user_id = ? ORDER BY rowid"
      : "SELECT id, account_id, amount_cents, description FROM transactions WHERE user_id = ? AND account_id = ? ORDER BY rowid";
    const rows = (accountId === undefined
      ? this.db.prepare(query).all(userId)
      : this.db.prepare(query).all(userId, accountId)) as TransactionRow[];
    return rows.map((row) => ({
      id: row.id,
      accountId: row.account_id,
      amountCents: row.amount_cents,
      ...(row.description === null ? {} : { description: row.description }),
    }));
  }
}
