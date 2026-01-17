-- ==========================
-- Users
-- ==========================

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,                    -- Auth service sets this, not auto-increment
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  online INTEGER DEFAULT 0,
  last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ==========================
-- Match History (Normal Matches)
-- ==========================

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

-- Friends sys.
-- user->sender, friend->recipient
CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,

  UNIQUE(user_id, friend_id),
  CHECK(user_id != friend_id)
);

CREATE TRIGGER IF NOT EXISTS last_seen_update
  AFTER UPDATE OF online ON users
  FOR EACH ROW
  WHEN NEW.online = 0 AND OLD.online = 1
BEGIN
  UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
