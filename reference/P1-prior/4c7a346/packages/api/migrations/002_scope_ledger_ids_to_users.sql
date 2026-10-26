CREATE TABLE accounts_v2 (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

INSERT INTO accounts_v2 (id, user_id, name, created_at)
SELECT id, user_id, name, created_at FROM accounts;

CREATE TABLE transactions_v2 (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents != 0),
  description TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, account_id) REFERENCES accounts_v2(user_id, id) ON DELETE CASCADE
);

INSERT INTO transactions_v2 (id, user_id, account_id, amount_cents, description, created_at)
SELECT id, user_id, account_id, amount_cents, description, created_at FROM transactions;

DROP TABLE transactions;
DROP TABLE accounts;
ALTER TABLE accounts_v2 RENAME TO accounts;
ALTER TABLE transactions_v2 RENAME TO transactions;

CREATE INDEX accounts_user_id_idx ON accounts(user_id);
CREATE INDEX transactions_user_id_idx ON transactions(user_id);
CREATE INDEX transactions_account_id_idx ON transactions(user_id, account_id);
