-- User profiles (no passwords - Auth service owns those)
-- id is set by Auth service, not auto-increment
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS match_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  winner_id INTEGER NOT NULL,
  loser_id INTEGER NOT NULL,
  left_score INTEGER NOT NULL,
  right_score INTEGER NOT NULL,
  played_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (winner_id) REFERENCES users(id),
  FOREIGN KEY (loser_id) REFERENCES users(id)
);
