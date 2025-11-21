import { FastifyInstance } from "fastify";
import {
  TournamentMatchCompleteSchema,
  TournamentMatchCompleteType,
} from "../../../shared/schemas/tournament.schema";

export default async function internalTournamentRoutes(fastify: FastifyInstance) {
  //
  // POST /internal/tournament/match-complete
  // Called by pong-service when a tournament match finishes
  //
  fastify.post<{ Body: TournamentMatchCompleteType }>(
    "/internal/tournament/match-complete",
    {
      schema: { body: TournamentMatchCompleteSchema },
      preHandler: [fastify.authenticateService],
    },
    async (request, reply) => {
      if (request.service !== "pong") {
        return reply.code(403).send({ error: "Forbidden: only pong service allowed" });
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

      // Update tournament_matches row
      fastify.db
        .prepare(
          `UPDATE tournament_matches
           SET winner_id = ?, left_score = ?, right_score = ?, status = 'finished',
               finished_at = CURRENT_TIMESTAMP
           WHERE id = ? AND tournament_id = ?`
        )
        .run(winnerId, leftScore, rightScore, tournamentMatchId, tournamentId);

      // ❗ Later: update Elo here as well if you want tournament matches
      // to affect rating (or call the same logic as normal match_history).

      // ❗ Later: advance winner to next round by creating/updating next matches.

      return reply.send({ message: "Tournament match recorded" });
    }
  );
}
