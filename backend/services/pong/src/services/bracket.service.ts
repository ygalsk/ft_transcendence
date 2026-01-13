import { Database } from 'better-sqlite3';

export class BracketService {
  constructor(private db: Database) {}

  // Advance winner to next round match
  advanceWinner(
    tournamentId: number,
    round: number,
    matchIndex: number,
    winnerId: number,
    maxRound?: number
  ): void {
    const nextRound = round + 1;
    if (maxRound && nextRound > maxRound) return;

    const nextIndex = Math.floor(matchIndex / 2);
    const isLeftWinner = matchIndex % 2 === 0;

    const existing = this.db
      .prepare(
        `SELECT id, left_player_id, right_player_id, status
         FROM tournament_matches
         WHERE tournament_id = ? AND round = ? AND match_index = ?`
      )
      .get(tournamentId, nextRound, nextIndex) as any;

    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO tournament_matches
           (tournament_id, round, match_index, left_player_id, right_player_id, status)
           VALUES (?, ?, ?, ?, ?, 'pending')`
        )
        .run(
          tournamentId,
          nextRound,
          nextIndex,
          isLeftWinner ? winnerId : null,
          isLeftWinner ? null : winnerId
        );
      return;
    }

    if (isLeftWinner && !existing.left_player_id) {
      this.db
        .prepare(`UPDATE tournament_matches SET left_player_id = ? WHERE id = ?`)
        .run(winnerId, existing.id);
    } else if (!isLeftWinner && !existing.right_player_id) {
      this.db
        .prepare(`UPDATE tournament_matches SET right_player_id = ? WHERE id = ?`)
        .run(winnerId, existing.id);
    }
  }

  /*
  Auto advance BYE matches (when one side is null)
  Checks if child match is FINISHED before advancing
  */
  advanceByes(tournamentId: number, maxRound?: number): void {
    const findByes = this.db.prepare(
      `SELECT id, round, match_index, left_player_id, right_player_id
       FROM tournament_matches
       WHERE tournament_id = ?
         AND status = 'pending'
         AND (
           (left_player_id IS NOT NULL AND right_player_id IS NULL)
           OR (left_player_id IS NULL AND right_player_id IS NOT NULL)
         )
       ORDER BY round ASC, match_index ASC`
    );

    const finishBye = this.db.prepare(
      `UPDATE tournament_matches
       SET winner_id = ?, status = 'finished', finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    const childExists = this.db.prepare(
      `SELECT status FROM tournament_matches
       WHERE tournament_id = ? AND round = ? AND match_index = ?`
    );

    for (;;) {
      const byes = findByes.all(tournamentId) as any[];
      if (!byes.length) break;

      let progressed = false;

      for (const m of byes) {
        // Check if child is FINISHED before advancing
        if (m.round > 1) {
          const leftChild = childExists.get(tournamentId, m.round - 1, m.match_index * 2) as any;
          const rightChild = childExists.get(tournamentId, m.round - 1, m.match_index * 2 + 1) as any;

          const waitingOnLeft = m.left_player_id === null && leftChild && leftChild.status !== 'finished';
          const waitingOnRight = m.right_player_id === null && rightChild && rightChild.status !== 'finished';

          if (waitingOnLeft || waitingOnRight)
            continue; // Wait for child to finish
        }

        const winnerId = m.left_player_id ?? m.right_player_id!;
        finishBye.run(winnerId, m.id);
        this.advanceWinner(tournamentId, m.round, m.match_index, winnerId, maxRound);
        progressed = true;
      }

      if (!progressed) break; // Prevent infinite loop
    }
  }

  /*
  Resolve matches where both players assigned but not started (stalled)
  Winner determined by seed (lower seed wins)
  */
  resolveStalledMatches(
    tournamentId: number,
    maxRound: number,
    timeoutMs = 120_000
  ): void {
    const stalled = this.db
      .prepare(
        `SELECT id, round, match_index, left_player_id, right_player_id, created_at
         FROM tournament_matches
         WHERE tournament_id = ?
           AND status = 'pending'
           AND left_player_id IS NOT NULL
           AND right_player_id IS NOT NULL
           AND (strftime('%s','now') - strftime('%s', created_at)) * 1000 > ?`
      )
      .all(tournamentId, timeoutMs) as any[];

    if (!stalled.length) return;

    const getSeed = this.db.prepare(
      `SELECT seed FROM tournament_players
       WHERE tournament_id = ? AND user_id = ?`
    );

    const finish = this.db.prepare(
      `UPDATE tournament_matches
       SET winner_id = ?, left_score = ?, right_score = ?,
           status = 'finished', finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    for (const m of stalled) {
      const leftInfo = getSeed.get(tournamentId, m.left_player_id) as any;
      const rightInfo = getSeed.get(tournamentId, m.right_player_id) as any;

      // Decide winner by seed (lower seed wins)
      let winnerId = m.left_player_id;
      if (leftInfo && rightInfo) {
        const leftSeed = leftInfo.seed ?? Number.MAX_SAFE_INTEGER;
        const rightSeed = rightInfo.seed ?? Number.MAX_SAFE_INTEGER;
        winnerId = leftSeed < rightSeed ? m.left_player_id : m.right_player_id;
      }

      finish.run(winnerId, 0, 0, m.id);
      this.advanceWinner(tournamentId, m.round, m.match_index, winnerId, maxRound);
    }

    this.advanceByes(tournamentId);
  }

  /*
  Generate standard bracket seeding order
  Example: 4 players → [1,4,3,2], 8 players → [1,8,4,5,3,6,2,7]
  */
  generateSeedOrder(size: number): number[] {
    if (size === 1) return [1];
    const half = this.generateSeedOrder(size / 2);
    const mirrored = half.map((s) => size + 1 - s);
    return half.flatMap((s, i) => [s, mirrored[i]]);
  }

  // Calculate max rounds for tournament based on player count
  calculateMaxRound(playerCount: number): number {
    return Math.max(1, Math.ceil(Math.log2(Math.max(2, playerCount))));
  }
}