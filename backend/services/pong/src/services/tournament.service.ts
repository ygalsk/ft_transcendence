import { Database } from 'better-sqlite3';
import { BracketService } from './bracket.service';

export class TournamentService {
  constructor(
    private db: Database,
    private bracketService: BracketService
  ) {}

  /*
  Start tournament - seed players and generate bracket
  Uses random seeding via SQL ORDER BY RANDOM()
  */
  async startTournament(
    tournamentId: number,
    userId: number
  ): Promise<void> {
    const tournament = this.db
      .prepare(`SELECT id, created_by, status FROM tournaments WHERE id = ?`)
      .get(tournamentId) as any;

    if (!tournament)
      throw new Error('Tournament not found');

    if (tournament.created_by !== userId)
      throw new Error('Forbidden');

    if (tournament.status !== 'pending')
      throw new Error('Already started');

    const playersRaw = this.db
      .prepare(
        `SELECT user_id, display_name FROM tournament_players
         WHERE tournament_id = ?
         ORDER BY RANDOM()`
      )
      .all(tournamentId) as { user_id: number}[];

    if (playersRaw.length < 2)
      throw new Error('Not enough players');

    const players = playersRaw;

    // Transaction: update status, assign seeds, create matches
    const tx = this.db.transaction(() => {
      this.db
        .prepare(`UPDATE tournaments SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(tournamentId);

      const seedStmt = this.db.prepare(
        `UPDATE tournament_players SET seed = ? WHERE tournament_id = ? AND user_id = ?`
      );
      players.forEach((p, i) => seedStmt.run(i + 1, tournamentId, p.user_id));

      // Generate bracket
      const bracketSize = 1 << Math.ceil(Math.log2(players.length));
      const seedOrder = this.bracketService.generateSeedOrder(bracketSize);

      const seeds: (number | null)[] = Array(bracketSize).fill(null);
      players.forEach((p, idx) => {
        const slot = seedOrder.findIndex(s => s === idx + 1);
        if (slot >= 0) seeds[slot] = p.user_id;
      });

      // Create round 1 matches
      const insertMatch = this.db.prepare(
        `INSERT INTO tournament_matches
         (tournament_id, round, match_index, left_player_id, right_player_id, pong_match_id, status)
         VALUES (?, 1, ?, ?, ?, ?, 'pending')`
      );

      let matchIndex = 0;
      for (let i = 0; i < seeds.length; i += 2) {
        const pongMatchId = `t${tournamentId}-r1-m${matchIndex}`;
        insertMatch.run(
          tournamentId,
          matchIndex,
          seeds[i] ?? null,
          seeds[i + 1] ?? null,
          pongMatchId
        );
        matchIndex++;
      }
    });

    tx();

    // Advance BYEs immediately
    const maxRound = this.bracketService.calculateMaxRound(players.length);
    this.bracketService.advanceByes(tournamentId, maxRound);
  }

  /*
  Check for stalled matches and auto-advance BYEs
  Separated from GET requests - called explicitly via POST
  */
  advanceTournamentState(tournamentId: number): void {
    const playerCount = (this.db
      .prepare(`SELECT COUNT(*) AS count FROM tournament_players WHERE tournament_id = ?`)
      .get(tournamentId) as any).count;

    const maxRound = this.bracketService.calculateMaxRound(playerCount);

    // Resolve stalled matches
    this.bracketService.resolveStalledMatches(tournamentId, maxRound);
    this.bracketService.advanceByes(tournamentId, maxRound);

    // Check if tournament complete
    this.checkTournamentCompletion(tournamentId);
  }

  // Mark tournament finished if no pending/running matches remain
  public checkTournamentCompletion(tournamentId: number): void {
    const remaining = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM tournament_matches
         WHERE tournament_id = ? AND status IN ('pending','running')`
      )
      .get(tournamentId) as any;

    if (remaining.count === 0) {
      const finalMatch = this.db
        .prepare(
          `SELECT winner_id FROM tournament_matches
          WHERE tournament_id = ? AND status = 'finished'
          ORDER BY round DESC, match_index ASC
          LIMIT 1`
      )
      .get(tournamentId) as any;

      const winnerId = finalMatch?.winner_id;
  
      this.db
        .prepare(
          `UPDATE tournaments
           SET status = 'finished', finished_at = CURRENT_TIMESTAMP, winner_id = ?
           WHERE id = ?`
        )
        .run(winnerId, tournamentId);
    }
  }
}