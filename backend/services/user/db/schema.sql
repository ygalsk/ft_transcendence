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
  elo INTEGER DEFAULT 1200,                  -- ⭐ Elo rating
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

-- ==========================
-- Tournaments
-- ==========================

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending, running, finished, cancelled
  max_players INTEGER NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 1,       -- 1 = public, 0 = private
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ==========================
-- Tournament Players
-- ==========================

CREATE TABLE IF NOT EXISTS tournament_players (
  tournament_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  seed INTEGER,                               -- Assigned after tournament starts
  alias TEXT NOT NULL,                         -- ⭐ New: displayed name for this tournament
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, user_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================
-- Tournament Matches
-- ==========================

CREATE TABLE IF NOT EXISTS tournament_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  round INTEGER NOT NULL,                      -- 1 = first round, etc.
  match_index INTEGER NOT NULL,                -- index of match within round
  left_player_id INTEGER,
  right_player_id INTEGER,
  winner_id INTEGER,
  left_score INTEGER,
  right_score INTEGER,
  pong_match_id TEXT,                          -- ID used by pong-service
  status TEXT NOT NULL DEFAULT 'pending',      -- pending, running, finished
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  FOREIGN KEY (left_player_id) REFERENCES users(id),
  FOREIGN KEY (right_player_id) REFERENCES users(id),
  FOREIGN KEY (winner_id) REFERENCES users(id)
);
