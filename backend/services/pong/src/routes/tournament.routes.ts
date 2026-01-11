// services/user/src/routes/tournament.routes.ts

import { FastifyInstance } from "fastify";
import {
  CreateTournamentSchema,
  CreateTournamentType,
  JoinTournamentSchema,
  JoinTournamentType,
} from "../../shared/schemas/tournament.schema";

// Helpers (duplicated from internal route) to handle BYEs at start time
function advanceWinnerToNextMatch(
  fastify: any,
  tournamentId: number,
  round: number,
  matchIndex: number,
  winnerId: number,
  maxRound?: number
) {
  const nextRound = round + 1;
  const nextIndex = Math.floor(matchIndex / 2);
  const isLeftWinner = matchIndex % 2 === 0;

  if (maxRound && nextRound > maxRound) {
    return;
  }

  const existing = fastify.db
    .prepare(
      `SELECT id, left_player_id, right_player_id, status
       FROM tournament_matches
       WHERE tournament_id = ? AND round = ? AND match_index = ?`
    )
    .get(tournamentId, nextRound, nextIndex) as
    | {
        id: number;
        left_player_id: number | null;
        right_player_id: number | null;
        status: string;
      }
    | undefined;

  if (!existing) {
    fastify.db
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

  if (isLeftWinner) {
    if (!existing.left_player_id) {
      fastify.db
        .prepare(
          `UPDATE tournament_matches SET left_player_id = ? WHERE id = ?`
        )
        .run(winnerId, existing.id);
    }
  } else {
    if (!existing.right_player_id) {
      fastify.db
        .prepare(
          `UPDATE tournament_matches SET right_player_id = ? WHERE id = ?`
        )
        .run(winnerId, existing.id);
    }
  }
}

function autoAdvanceByesLocal(fastify: any, tournamentId: number, maxRound?: number) {
  const findByes = fastify.db.prepare(
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

  const finishBye = fastify.db.prepare(
    `UPDATE tournament_matches
     SET winner_id = ?, status = 'finished', finished_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  );

  const childExists = fastify.db.prepare(
    `SELECT status FROM tournament_matches
     WHERE tournament_id = ? AND round = ? AND match_index = ?`
  );

  for (;;) {
    const byes = findByes.all(tournamentId) as {
      id: number;
      round: number;
      match_index: number;
      left_player_id: number | null;
      right_player_id: number | null;
    }[];

    if (!byes.length) break;

    let progressed = false;

    for (const m of byes) {
      // If the empty slot has a child match in the previous round, wait for it to complete
      if (m.round > 1) {
        const leftChild = childExists.get(
          tournamentId,
          m.round - 1,
          m.match_index * 2
        ) as any;
        const rightChild = childExists.get(
          tournamentId,
          m.round - 1,
          m.match_index * 2 + 1
        ) as any;
        const waitingOnLeft = m.left_player_id === null && leftChild;
        const waitingOnRight = m.right_player_id === null && rightChild;
        if (waitingOnLeft || waitingOnRight) {
          continue;
        }
      }

      const winnerId = m.left_player_id ?? m.right_player_id!;

      finishBye.run(winnerId, m.id);

      advanceWinnerToNextMatch(
        fastify,
        tournamentId,
        m.round,
        m.match_index,
        winnerId,
        maxRound
      );
      progressed = true;
    }

    // Prevent infinite loop when all remaining byes are waiting on children
    if (!progressed) break;
  }

  // If no pending/running matches remain, mark tournament finished
  const totalMatches = fastify.db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM tournament_matches
       WHERE tournament_id = ?`
    )
    .get(tournamentId) as { count: number };

  const remaining = fastify.db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM tournament_matches
       WHERE tournament_id = ?
         AND status IN ('pending','running')`
    )
    .get(tournamentId) as { count: number };

  // Only finish if there were matches seeded; avoid auto-finishing empty (not started) tournaments
  if (totalMatches.count > 0 && remaining.count === 0) {
    fastify.db
      .prepare(
        `UPDATE tournaments
         SET status = 'finished', finished_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(tournamentId);
  }
}