// services/user/src/routes/internal.tournament.routes.ts

import { FastifyInstance } from "fastify";
import {
  TournamentMatchCompleteSchema,
  TournamentMatchCompleteType,
} from "../../../shared/schemas/tournament.schema";

export default async function internalTournamentRoutes(fastify: FastifyInstance) {
  //
  // Helper: advance a winner to their next match in the bracket
  //
  function advanceWinnerToNextMatch(
    tournamentId: number,
    round: number,
    matchIndex: number,
    winnerId: number
  ) {
    const nextRound = round + 1;
    const nextIndex = Math.floor(matchIndex / 2);
    const isLeftWinner = matchIndex % 2 === 0; // even → left slot, odd → right slot

    // See if next-round match already exists
    const nextMatch = fastify.db
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

    if (!nextMatch) {
      // Create a new next-round match with winner in correct slot
      const insertStmt = fastify.db.prepare(
        `INSERT INTO tournament_matches
         (tournament_id, round, match_index, left_player_id, right_player_id, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`
      );

      const leftId = isLeftWinner ? winnerId : null;
      const rightId = isLeftWinner ? null : winnerId;

      insertStmt.run(tournamentId, nextRound, nextIndex, leftId, rightId);
      return;
    }

    // Next match exists → put winner into left or right if that slot is free
    if (isLeftWinner) {
      if (
        nextMatch.left_player_id !== null &&
        nextMatch.left_player_id !== winnerId
      ) {
        // Inconsistent bracket state; log and skip
        fastify.log.warn(
          {
            tournamentId,
            round,
            matchIndex,
            nextMatchId: nextMatch.id,
            existing: nextMatch.left_player_id,
            incoming: winnerId,
          },
          "Left slot already occupied in next match when advancing winner"
        );
        return;
      }

      fastify.db
        .prepare(
          `UPDATE tournament_matches
           SET left_player_id = ?
           WHERE id = ?`
        )
        .run(winnerId, nextMatch.id);
    } else {
      if (
        nextMatch.right_player_id !== null &&
        nextMatch.right_player_id !== winnerId
      ) {
        fastify.log.warn(
          {
            tournamentId,
            round,
            matchIndex,
            nextMatchId: nextMatch.id,
            existing: nextMatch.right_player_id,
            incoming: winnerId,
          },
          "Right slot already occupied in next match when advancing winner"
        );
        return;
      }

      fastify.db
        .prepare(
          `UPDATE tournament_matches
           SET right_player_id = ?
           WHERE id = ?`
        )
        .run(winnerId, nextMatch.id);
    }
  }

  //
  // Helper: repeatedly auto-finish BYE matches:
  //  - pending matches where exactly ONE player is set
  //  - winner is that player, then advanced forward
  //
  function autoAdvanceByes(tournamentId: number) {
    const selectByesStmt = fastify.db.prepare(
      `SELECT id, round, match_index, left_player_id, right_player_id
       FROM tournament_matches
       WHERE tournament_id = ?
         AND status = 'pending'
         AND (
           (left_player_id IS NOT NULL AND right_player_id IS NULL) OR
           (left_player_id IS NULL AND right_player_id IS NOT NULL)
         )
       ORDER BY round ASC, match_index ASC`
    );

    const finishByeStmt = fastify.db.prepare(
      `UPDATE tournament_matches
       SET winner_id = ?, status = 'finished', finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    // Loop until there are no more BYEs that can be auto-advanced
    // (important when multiple rounds in a row generate BYEs).
    // This is safe because every iteration finishes at least one match,
    // so it cannot loop forever.
    for (;;) {
      const byeMatches = selectByesStmt.all(tournamentId) as Array<{
        id: number;
        round: number;
        match_index: number;
        left_player_id: number | null;
        right_player_id: number | null;
      }>;

      if (!byeMatches.length) break;

      for (const m of byeMatches) {
        const winnerId = m.left_player_id ?? m.right_player_id!;
        finishByeStmt.run(winnerId, m.id);

        // Advance this winner into the next round
        advanceWinnerToNextMatch(
          tournamentId,
          m.round,
          m.match_index,
          winnerId
        );
      }
    }
  }

  //
  // POST /internal/tournament/match-complete
  // Called by pong-service when a tournament match finishes.
  // Responsibilities:
  //  - mark match as finished
  //  - advance winner into next match
  //  - auto-resolve BYEs (if any)
  //  - if no remaining matches → mark tournament as finished
  //
  fastify.post<{ Body: TournamentMatchCompleteType }>(
    "/internal/tournament/match-complete",
    {
      schema: { body: TournamentMatchCompleteSchema },
      preHandler: [fastify.authenticateService],
    },
    async (request, reply) => {
      if (request.service !== "pong") {
        return reply
          .code(403)
          .send({ error: "Forbidden: only pong service allowed" });
      }

      const {
        tournamentId,
        tournamentMatchId,
        winnerId,
        leftPlayerId,
        rightPlayerId,
        leftScore,
        rightScore,
      } = request.body;

      const runTx = fastify.db.transaction(() => {
        // 1) Load match & basic info
        const match = fastify.db
          .prepare(
            `SELECT id, tournament_id, round, match_index, status,
                    left_player_id, right_player_id
             FROM tournament_matches
             WHERE id = ? AND tournament_id = ?`
          )
          .get(
            tournamentMatchId,
            tournamentId
          ) as
          | {
              id: number;
              tournament_id: number;
              round: number;
              match_index: number;
              status: string;
              left_player_id: number | null;
              right_player_id: number | null;
            }
          | undefined;

        if (!match) {
          throw new Error("Tournament match not found");
        }

        // Optional safety: check winner is one of the players
        if (
          winnerId !== match.left_player_id &&
          winnerId !== match.right_player_id
        ) {
          fastify.log.warn(
            {
              tournamentId,
              tournamentMatchId,
              winnerId,
              leftPlayerId,
              rightPlayerId,
              dbLeft: match.left_player_id,
              dbRight: match.right_player_id,
            },
            "WinnerId is not one of the match's players (continuing anyway)"
          );
        }

        // 2) Mark this match as finished
        fastify.db
          .prepare(
            `UPDATE tournament_matches
             SET winner_id = ?, left_score = ?, right_score = ?,
                 status = 'finished', finished_at = CURRENT_TIMESTAMP
             WHERE id = ?`
          )
          .run(winnerId, leftScore, rightScore, tournamentMatchId);

        // 3) Advance winner into the next round
        advanceWinnerToNextMatch(
          tournamentId,
          match.round,
          match.match_index,
          winnerId
        );

        // 4) Auto-advance BYEs (matches with a single player)
        autoAdvanceByes(tournamentId);

        // 5) If there are no non-finished matches left → finish tournament
        const remaining = fastify.db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM tournament_matches
             WHERE tournament_id = ? AND status != 'finished'`
          )
          .get(tournamentId) as { count: number };

        if (remaining.count === 0) {
          fastify.db
            .prepare(
              `UPDATE tournaments
               SET status = 'finished',
                   finished_at = CURRENT_TIMESTAMP
               WHERE id = ?`
            )
            .run(tournamentId);
        }
      });

      try {
        runTx();
      } catch (err: any) {
        fastify.log.error(
          { err, tournamentId, tournamentMatchId },
          "Failed to process tournament match-complete"
        );
        return reply
          .code(500)
          .send({ error: "Internal tournament progression error" });
      }

      return reply.send({
        message: "Tournament match recorded and bracket updated",
      });
    }
  );
}
