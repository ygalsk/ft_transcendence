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

-- Tournaments table
CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed
  max_players INTEGER NOT NULL DEFAULT 8,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME
);

-- Tournament participants table
CREATE TABLE IF NOT EXISTS tournament_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  placement INTEGER, -- final placement in tournament (1st, 2nd, 3rd, etc.)
  eliminated_at DATETIME,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  UNIQUE(tournament_id, user_id)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_matches_winner ON matches(winner_id);
CREATE INDEX IF NOT EXISTS idx_matches_loser ON matches(loser_id);
CREATE INDEX IF NOT EXISTS idx_matches_created ON matches(created_at);
CREATE INDEX IF NOT EXISTS idx_tournament_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_user ON tournament_participants(user_id);
