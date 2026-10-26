import {
  parseAccount,
  parseTransaction,
  sumTransactionAmounts,
  type Account,
  type Transaction,
} from "./ledger";

export interface LedgerRepository {
  findAccount(userId: string, accountId: string): Account | undefined;
  listAccounts(userId: string): Account[];
  insertAccount(userId: string, account: Account): void;
  hasTransaction(userId: string, transactionId: string): boolean;
  insertTransaction(userId: string, transaction: Transaction): void;
  listTransactions(userId: string, accountId?: string): Transaction[];
}

/** Domain operations over a user-scoped ledger repository. */
export class LedgerService {
  constructor(private readonly repository: LedgerRepository) {}

  addAccount(userId: string, input: Account): Account {
    const account = parseAccount(input);
    if (this.repository.findAccount(userId, account.id)) {
      throw new Error(`Account already exists: ${account.id}`);
    }
    this.repository.insertAccount(userId, account);
    return { ...account };
  }

  listAccounts(userId: string): Account[] {
    return this.repository.listAccounts(userId);
  }

  addTransaction(userId: string, input: Transaction): Transaction {
    const transaction = parseTransaction(input);
    this.requireAccount(userId, transaction.accountId);
    if (this.repository.hasTransaction(userId, transaction.id)) {
      throw new Error(`Transaction already exists: ${transaction.id}`);
    }
    this.repository.insertTransaction(userId, transaction);
    return { ...transaction };
  }

  listTransactions(userId: string, accountId?: string): Transaction[] {
    if (accountId !== undefined) this.requireAccount(userId, accountId);
    return this.repository.listTransactions(userId, accountId);
  }

  getBalance(userId: string, accountId: string): number {
    this.requireAccount(userId, accountId);
    return sumTransactionAmounts(this.repository.listTransactions(userId, accountId));
  }

  private requireAccount(userId: string, accountId: string): void {
    if (!this.repository.findAccount(userId, accountId)) throw new Error(`Unknown account: ${accountId}`);
  }
}
