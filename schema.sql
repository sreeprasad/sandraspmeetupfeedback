CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  loved INTEGER NOT NULL,
  demo TEXT,
  demo_details TEXT,
  change_next TEXT,
  topic TEXT,
  problem TEXT,
  solved TEXT,
  name TEXT
);
