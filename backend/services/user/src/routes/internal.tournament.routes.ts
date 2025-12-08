// services/user/src/routes/internal.tournament.routes.ts

import { FastifyInstance } from "fastify";
import {
  TournamentMatchCompleteSchema,
  TournamentMatchCompleteType,
} from "../../shared/schemas/tournament.schema";

export default async function internalTournamentRoutes(
  fastify: FastifyInstance
) {
  // =============================================
  // Helper: advance a winner to the next match
  // =============================================
  function advanceWinnerToNextMatch(
    tournamentId: number,
    round: number,
    matchIndex: number,
    winnerId: number
  ) {
    const nextRound = round + 1;
    const nextIndex = Math.floor(matchIndex / 2);
    const isLeftWinner = matchIndex % 2 === 0;

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

  // =============================================
  // Helper: auto-advance BYE matches
  // =============================================
  function autoAdvanceByes(tournamentId: number) {
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

    for (;;) {
      const byes = findByes.all(tournamentId) as {
        id: number;
        round: number;
        match_index: number;
        left_player_id: number | null;
        right_player_id: number | null;
      }[];

      if (!byes.length) break;

      for (const m of byes) {
        const winnerId = m.left_player_id ?? m.right_player_id!;

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

  // =============================================
  // POST /internal/tournament/match-complete
  // =============================================
  fastify.post<{ Body: TournamentMatchCompleteType }>(
    "/match-complete",
    {
      schema: { body: TournamentMatchCompleteSchema },
      preHandler: [fastify.authenticateService],
    },
    async (request, reply) => {
      if (request.service !== "pong") {
        return reply.code(403).send({ error: "Forbidden" });
      }

      const {
        tournamentId,
        tournamentMatchId,
        winnerId,
        leftScore,
        rightScore,
      } = request.body;

      const tx = fastify.db.transaction(() => {
        const match = fastify.db
          .prepare(
            `SELECT id, round, match_index, left_player_id, right_player_id
             FROM tournament_matches
             WHERE id = ? AND tournament_id = ?`
          )
          .get(tournamentMatchId, tournamentId) as
          | {
              id: number;
              round: number;
              match_index: number;
              left_player_id: number | null;
              right_player_id: number | null;
            }
          | undefined;

        if (!match) {
          throw new Error("Match not found");
        }

        fastify.db
          .prepare(
            `UPDATE tournament_matches
             SET winner_id = ?, left_score = ?, right_score = ?,
                 status = 'finished', finished_at = CURRENT_TIMESTAMP
             WHERE id = ?`
          )
          .run(
            winnerId,
            leftScore ?? null,
            rightScore ?? null,
            tournamentMatchId
          );

        advanceWinnerToNextMatch(
          tournamentId,
          match.round,
          match.match_index,
          winnerId
        );

        autoAdvanceByes(tournamentId);

        const remaining = fastify.db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM tournament_matches
             WHERE tournament_id = ?
               AND status != 'finished'`
          )
          .get(tournamentId) as { count: number };

        if (remaining.count === 0) {
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
        fastify.log.error(err, "Tournament progression error");
        return reply.code(500).send({ error: "Internal error" });
      }

      return reply.send({ message: "Match processed" });
    }
  );
}
