CREATE TABLE IF NOT EXISTS interests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  product TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE(email, product)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  platform TEXT,
  product TEXT,
  game_bucket TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx
  ON analytics_events(created_at);

CREATE TABLE IF NOT EXISTS report_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  username TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS report_snapshots_customer_idx
  ON report_snapshots(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS monitored_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  email TEXT NOT NULL,
  platform TEXT NOT NULL,
  username TEXT NOT NULL,
  game_filter TEXT NOT NULL DEFAULT 'all',
  game_count INTEGER NOT NULL DEFAULT 60,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_run_at INTEGER,
  last_error TEXT,
  UNIQUE(customer_id, platform, username)
);

CREATE INDEX IF NOT EXISTS monitored_accounts_last_run_idx
  ON monitored_accounts(last_run_at);
