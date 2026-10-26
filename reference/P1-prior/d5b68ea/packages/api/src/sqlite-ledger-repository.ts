import type { DatabaseSync } from "node:sqlite";
import type { Account, Transaction } from "../../core/src/ledger";
import type { LedgerRepository } from "../../core/src/ledger-service";

type AccountRow = { id: string; name: string };
type TransactionRow = { id: string; account_id: string; amount_cents: number; description: string | null };

const FIND_ACCOUNT = "SELECT id, name FROM accounts WHERE user_id = ? AND id = ?";
const LIST_ACCOUNTS = "SELECT id, name FROM accounts WHERE user_id = ? ORDER BY rowid";
const INSERT_ACCOUNT = "INSERT INTO accounts (user_id, id, name) VALUES (?, ?, ?)";
const FIND_TRANSACTION = "SELECT 1 AS present FROM transactions WHERE user_id = ? AND id = ?";
const INSERT_TRANSACTION =
  "INSERT INTO transactions (user_id, id, account_id, amount_cents, description) VALUES (?, ?, ?, ?, ?)";
const LIST_TRANSACTIONS = "SELECT id, account_id, amount_cents, description FROM transactions WHERE user_id = ? ORDER BY rowid";
const LIST_ACCOUNT_TRANSACTIONS =
  "SELECT id, account_id, amount_cents, description FROM transactions WHERE user_id = ? AND account_id = ? ORDER BY rowid";

export class SqliteLedgerRepository implements LedgerRepository {
  constructor(private readonly db: DatabaseSync) {}

  findAccount(ownerId: string, accountId: string): Account | undefined {
    const row = this.db.prepare(FIND_ACCOUNT).get(ownerId, accountId) as AccountRow | undefined;
    return row && toAccount(row);
  }

  listAccounts(ownerId: string): Account[] {
    return (this.db.prepare(LIST_ACCOUNTS).all(ownerId) as unknown as AccountRow[]).map(toAccount);
  }

  insertAccount(ownerId: string, account: Account): void {
    this.db.prepare(INSERT_ACCOUNT).run(ownerId, account.id, account.name);
  }

  hasTransaction(ownerId: string, transactionId: string): boolean {
    return this.db.prepare(FIND_TRANSACTION).get(ownerId, transactionId) !== undefined;
  }

  insertTransaction(ownerId: string, transaction: Transaction): void {
    this.db.prepare(INSERT_TRANSACTION)
      .run(ownerId, transaction.id, transaction.accountId, transaction.amountCents, transaction.description ?? null);
  }

  listTransactions(ownerId: string, accountId?: string): Transaction[] {
    const rows = accountId === undefined
      ? this.db.prepare(LIST_TRANSACTIONS).all(ownerId)
      : this.db.prepare(LIST_ACCOUNT_TRANSACTIONS).all(ownerId, accountId);
    return (rows as unknown as TransactionRow[]).map(toTransaction);
  }
}

function toAccount(row: AccountRow): Account {
  return { id: row.id, name: row.name };
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    amountCents: Number(row.amount_cents),
    ...(row.description ? { description: row.description } : {}),
  };
}
