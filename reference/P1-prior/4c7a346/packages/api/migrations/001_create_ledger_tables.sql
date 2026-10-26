CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, id)
);

CREATE INDEX accounts_user_id_idx ON accounts(user_id);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents != 0),
  description TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id) ON DELETE CASCADE
);

CREATE INDEX transactions_user_id_idx ON transactions(user_id);
CREATE INDEX transactions_account_id_idx ON transactions(user_id, account_id);
