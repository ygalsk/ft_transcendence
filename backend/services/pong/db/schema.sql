-- Pong Service Database Schema

-- Match results table
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  winner_id INTEGER NOT NULL,
  loser_id INTEGER NOT NULL,
  left_score INTEGER NOT NULL,
  right_score INTEGER NOT NULL,
  duration INTEGER, -- duration in seconds
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_matches_winner ON matches(winner_id);
CREATE INDEX IF NOT EXISTS idx_matches_loser ON matches(loser_id);
CREATE INDEX IF NOT EXISTS idx_matches_created ON matches(created_at);

-- ==========================
-- Tournaments 
-- ==========================

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending, running, finished, cancelled
  max_players INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  winner_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tournament_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournament_created_by ON tournaments(created_by);

-- ==========================
-- Tournament Players 
-- ==========================

CREATE TABLE IF NOT EXISTS tournament_players (
  tournament_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  seed INTEGER,                               -- Assigned after tournament starts
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, user_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament ON tournament_players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_user ON tournament_players(user_id);

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
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_status ON tournament_matches(status);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_pong_match ON tournament_matches(pong_match_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_lookup ON tournament_matches(tournament_id, round, match_index);