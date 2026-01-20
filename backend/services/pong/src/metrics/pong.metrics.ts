import client from 'prom-client';

export const pongActiveGames = new client.Gauge({
  name: 'pong_active_games',
  help: 'Number of currently active pong games',
  labelNames: ['type'], // casual/tournament
});

export const pongMatchmakingQueueSize = new client.Gauge({
  name: 'pong_matchmaking_queue_size',
  help: 'Number of players waiting in matchmaking queue',
});

export const pongMatchesTotal = new client.Counter({
  name: 'pong_matches_total',
  help: 'Total number of pong matches',
  labelNames: ['type', 'status'], // type: casual/tournament status: started/completed/abandoned
});

export const pongMatchDuration = new client.Histogram({
  name: 'pong_match_duration_seconds',
  help: 'Duration of pong matches in seconds',
  labelNames: ['type'],
  buckets: [30, 60, 120, 180, 300, 600, 1200], // 30s to 20min
});

export const pongTournamentsTotal = new client.Counter({
  name: 'pong_tournaments_total',
  help: 'Total number of tournaments',
  labelNames: ['status'], // created/started/completed/cancelled
});

export const pongActiveTournaments = new client.Gauge({
  name: 'pong_active_tournaments',
  help: 'Number of currently active tournaments',
});

export const pongPlayerDisconnects = new client.Counter({
  name: 'pong_player_disconnects_total',
  help: 'Total number of player disconnections during games',
  labelNames: ['type'], // casual or tournament
});

export const pongTournamentParticipants = new client.Gauge({
  name: 'pong_tournament_participants',
  help: 'Number of participants in active tournaments',
  labelNames: ['tournament_id'],
});