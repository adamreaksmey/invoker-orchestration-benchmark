import {
  parseAccount,
  parseTransaction,
  sumTransactionAmounts,
  type Account,
  type Transaction,
} from "./ledger";

export interface LedgerRepository {
  findAccount(ownerId: string, accountId: string): Account | undefined;
  listAccounts(ownerId: string): Account[];
  insertAccount(ownerId: string, account: Account): void;
  hasTransaction(ownerId: string, transactionId: string): boolean;
  insertTransaction(ownerId: string, transaction: Transaction): void;
  listTransactions(ownerId: string, accountId?: string): Transaction[];
}

/** Per-owner ledger operations over a pluggable repository; no HTTP or database dependency. */
export class LedgerService {
  constructor(private readonly repository: LedgerRepository) {}

  addAccount(ownerId: string, input: Account): Account {
    const account = parseAccount(input);
    if (this.repository.findAccount(ownerId, account.id)) {
      throw new Error(`Account already exists: ${account.id}`);
    }
    this.repository.insertAccount(ownerId, account);
    return { ...account };
  }

  listAccounts(ownerId: string): Account[] {
    return this.repository.listAccounts(ownerId);
  }

  addTransaction(ownerId: string, input: Transaction): Transaction {
    const transaction = parseTransaction(input);
    this.requireAccount(ownerId, transaction.accountId);
    if (this.repository.hasTransaction(ownerId, transaction.id)) {
      throw new Error(`Transaction already exists: ${transaction.id}`);
    }
    this.repository.insertTransaction(ownerId, transaction);
    return { ...transaction };
  }

  listTransactions(ownerId: string, accountId?: string): Transaction[] {
    if (accountId !== undefined) this.requireAccount(ownerId, accountId);
    return this.repository.listTransactions(ownerId, accountId);
  }

  getBalance(ownerId: string, accountId: string): number {
    this.requireAccount(ownerId, accountId);
    return sumTransactionAmounts(this.repository.listTransactions(ownerId, accountId));
  }

  private requireAccount(ownerId: string, accountId: string): void {
    if (!this.repository.findAccount(ownerId, accountId)) throw new Error(`Unknown account: ${accountId}`);
  }
}
