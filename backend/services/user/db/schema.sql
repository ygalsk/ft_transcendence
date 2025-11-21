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
  online INTEGER DEFAULT 0,
  last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
  elo INTEGER DEFAULT 1200, -- ⭐ NEW: Elo rating
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

-- ==========================
-- Tournaments
-- ==========================

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, finished, cancelled
  max_players INTEGER NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 1,   -- 1 = public, 0 = private/invite
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tournament_players (
  tournament_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  seed INTEGER,                           -- seeding based on Elo
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, user_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  round INTEGER NOT NULL,                 -- 1 = first round, etc
  match_index INTEGER NOT NULL,           -- index within the round
  left_player_id INTEGER,
  right_player_id INTEGER,
  winner_id INTEGER,
  left_score INTEGER,
  right_score INTEGER,
  pong_match_id TEXT,                     -- id that pong-service used
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, finished
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  FOREIGN KEY (left_player_id) REFERENCES users(id),
  FOREIGN KEY (right_player_id) REFERENCES users(id),
  FOREIGN KEY (winner_id) REFERENCES users(id)
);

