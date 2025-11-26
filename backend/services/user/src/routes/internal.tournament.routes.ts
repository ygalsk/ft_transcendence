import { FastifyInstance } from "fastify";
import {
  TournamentMatchCompleteSchema,
  TournamentMatchCompleteType,
} from "../../../shared/schemas/tournament.schema";

export default async function internalTournamentRoutes(
  fastify: FastifyInstance
) {
  // ============================================================
  // Helper: advance a winner into their correct next-round match
  // ============================================================
  function advanceWinnerToNextMatch(
    tournamentId: number,
    round: number,
    matchIndex: number,
    winnerId: number
  ) {
    const nextRound = round + 1;
    const nextIndex = Math.floor(matchIndex / 2);
    const isLeftWinner = matchIndex % 2 === 0; // even → left slot

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
      // Create next-round match with this winner on correct side
      fastify.db
        .prepare(
          `INSERT INTO tournament_matches
           (tournament_id, round, match_index, left_player_id, right_player_id)
           VALUES (?, ?, ?, ?, ?)`
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

    // Update existing match only if slot is empty
    if (isLeftWinner) {
      if (existing.left_player_id == null) {
        fastify.db
          .prepare(
            `UPDATE tournament_matches
             SET left_player_id = ?
             WHERE id = ?`
          )
          .run(winnerId, existing.id);
      }
    } else {
      if (existing.right_player_id == null) {
        fastify.db
          .prepare(
            `UPDATE tournament_matches
             SET right_player_id = ?
             WHERE id = ?`
          )
          .run(winnerId, existing.id);
      }
    }
  }

  // ============================================================
  // Helper: Auto-finish BYE matches (only one player)
  // ============================================================
  function autoAdvanceByes(tournamentId: number) {
    const findByes = fastify.db.prepare(
      `SELECT id, round, match_index, left_player_id, right_player_id
       FROM tournament_matches
       WHERE tournament_id = ?
         AND status = 'pending'
         AND (
           (left_player_id IS NOT NULL AND right_player_id IS NULL)
           OR
           (left_player_id IS NULL AND right_player_id IS NOT NULL)
         )
       ORDER BY round ASC, match_index ASC`
    );

    const finishBye = fastify.db.prepare(
      `UPDATE tournament_matches
       SET winner_id = ?, status = 'finished', finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    for (;;) {
      const byes = findByes.all(tournamentId) as any[];
      if (!byes.length) break;

      for (const m of byes) {
        const winnerId = m.left_player_id ?? m.right_player_id;

        finishBye.run(winnerId, m.id);

        advanceWinnerToNextMatch(
          tournamentId,
          m.round,
          m.match_index,
          winnerId
        );
      }
    }
  }

  // ============================================================
  // POST /internal/tournament/match-complete
  // Called only by Pong service after a match ends
  // ============================================================
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
          .send({ error: "Forbidden — only pong-service may call this" });
      }

      const {
        tournamentId,
        tournamentMatchId,
        winnerId,
        leftScore,
        rightScore,
      } = request.body;

      const tx = fastify.db.transaction(() => {
        // Load match
        const match = fastify.db
          .prepare(
            `SELECT id, round, match_index, left_player_id, right_player_id
             FROM tournament_matches
             WHERE id = ? AND tournament_id = ?`
          )
          .get(tournamentMatchId, tournamentId);

        if (!match) {
          throw new Error("Tournament match not found");
        }

        // Mark match finished
        fastify.db
          .prepare(
            `UPDATE tournament_matches
             SET winner_id = ?, left_score = ?, right_score = ?,
                 status = 'finished', finished_at = CURRENT_TIMESTAMP
             WHERE id = ?`
          )
          .run(winnerId, leftScore, rightScore, tournamentMatchId);

        // Advance winner into next round
        advanceWinnerToNextMatch(
          tournamentId,
          match.round,
          match.match_index,
          winnerId
        );

        // Auto-progress BYEs (can cascade)
        autoAdvanceByes(tournamentId);

        // If no remaining matches → tournament is finished
        const remaining = fastify.db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM tournament_matches
             WHERE tournament_id = ?
               AND status != 'finished'`
          )
          .get(tournamentId).count as number;

        if (remaining === 0) {
          fastify.db
            .prepare(
              `UPDATE tournaments
               SET status = 'finished', finished_at = CURRENT_TIMESTAMP
               WHERE id = ?`
            )
            .run(tournamentId);
        }
      });

      try {
        tx();
      } catch (err: any) {
        fastify.log.error(
          { err: err.message, tournamentId, tournamentMatchId },
          "Tournament progression failed"
        );
        return reply
          .code(500)
          .send({ error: "Internal tournament progression error" });
      }

      return reply.send({
        message: "Tournament updated — winner advanced",
      });
    }
  );
}
