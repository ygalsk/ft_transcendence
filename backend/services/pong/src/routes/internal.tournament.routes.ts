import { FastifyInstance } from 'fastify';
import { TournamentMatchCompleteSchema, TournamentMatchCompleteType } from '../../shared/schemas/tournament.schema';
import { BracketService } from '../services/bracket.service';

export default async function internalTournamentRoutes(fastify: FastifyInstance) {
  const bracketService = new BracketService(fastify.db);

  // Serialize match-complete processing
  let matchQueue = Promise.resolve();

  fastify.post<{ Body: TournamentMatchCompleteType }>("/match-complete", {
      schema: { body: TournamentMatchCompleteSchema },
      preHandler: [fastify.authenticateService]
    }, async (request, reply) => {
      if (request.service !== 'pong')
        return reply.code(403).send({ error: 'Forbidden' });

      const payload = { ...request.body };

      // Respond immediately so backend stays responsive
      reply.code(202).send({ accepted: true });

      // Process in background queue
      matchQueue = matchQueue.then(async () => {
        const { tournamentId, tournamentMatchId, winnerId, leftScore, rightScore } = payload;

        try {
          const tournament = fastify.db
            .prepare(`SELECT status FROM tournaments WHERE id = ?`)
            .get(tournamentId) as any;

          if (!tournament || tournament.status !== 'running') {
            fastify.log.warn({ tournamentId }, 'Tournament not running, skipping');
            return;
          }

          const tx = fastify.db.transaction(() => {
            const match = fastify.db
              .prepare(
                `SELECT id, round, match_index, status, left_player_id, right_player_id
                 FROM tournament_matches
                 WHERE id = ? AND tournament_id = ?`
              )
              .get(tournamentMatchId, tournamentId) as any;

            if (!match) {
              fastify.log.error({ tournamentMatchId }, 'Match not found');
              return;
            }

            // Validate match is not already finished
            if (match.status === 'finished') {
              fastify.log.warn({ tournamentMatchId }, 'Match already finished');
              return;
            }

            // Validate winner is a player in this match
            if (winnerId !== match.left_player_id && winnerId !== match.right_player_id) {
              fastify.log.error({ tournamentMatchId, winnerId }, 'Winner not in match');
              return;
            }

            // Update match
            fastify.db
              .prepare(
                `UPDATE tournament_matches
                 SET winner_id = ?, left_score = ?, right_score = ?,
                     status = 'finished', finished_at = CURRENT_TIMESTAMP
                 WHERE id = ?`
              )
              .run(winnerId, leftScore ?? null, rightScore ?? null, tournamentMatchId);

            // Advance winner
            const playerCount = (fastify.db
              .prepare(`SELECT COUNT(*) AS count FROM tournament_players WHERE tournament_id = ?`)
              .get(tournamentId) as any).count;

            const maxRound = bracketService.calculateMaxRound(playerCount);

            bracketService.advanceWinner(
              tournamentId,
              match.round,
              match.match_index,
              winnerId,
              maxRound
            );

            // Resolve stalled matches (timeout=0 for immediate resolution in automatic flow)
            bracketService.resolveStalledMatches(tournamentId, maxRound, 0);

            bracketService.advanceByes(tournamentId, maxRound);

            // Check completion - only pending/running matches
            const remaining = fastify.db
              .prepare(
                `SELECT COUNT(*) AS count
                 FROM tournament_matches
                 WHERE tournament_id = ? AND status IN ('pending','running')`
              )
              .get(tournamentId) as any;

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

          tx();

          fastify.log.info({ tournamentId, tournamentMatchId }, 'Match completed successfully');
        } catch (error: any) {
          fastify.log.error({ error: error.message, tournamentId }, 'Match completion failed');
        }
      });
    }
  );
}