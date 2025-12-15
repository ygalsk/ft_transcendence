// services/user/src/routes/internal.tournament.routes.ts

import { FastifyInstance } from "fastify";
import {
  TournamentMatchCompleteSchema,
  TournamentMatchCompleteType,
} from "../../shared/schemas/tournament.schema";

export default async function internalTournamentRoutes(
  fastify: FastifyInstance
) {
  // Serialize match-complete processing to avoid concurrent transactions
  let matchQueue = Promise.resolve();

  // Calculate the maximum round for a tournament based on joined players.
  function getTournamentMaxRound(tournamentId: number): number {
    const countRow = fastify.db
      .prepare(
        `SELECT COUNT(*) AS count FROM tournament_players WHERE tournament_id = ?`
      )
      .get(tournamentId) as { count: number } | undefined;
    const playerCount = countRow?.count ?? 0;
    // Minimum of 2 players; guard with 1 round to avoid runaway advancement.
    return Math.max(1, Math.ceil(Math.log2(Math.max(2, playerCount))));
  }

  // =============================================
  // Helper: advance a winner to the next match
  // =============================================
  function advanceWinnerToNextMatch(
    tournamentId: number,
    round: number,
    matchIndex: number,
    winnerId: number,
    maxRound?: number
  ) {
    const nextRound = round + 1;
    if (maxRound && nextRound > maxRound) {
      return;
    }
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
  function autoAdvanceByes(tournamentId: number, maxRound?: number) {
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
          const leftChild = childExists.get(tournamentId, m.round - 1, m.match_index * 2) as any;
          const rightChild = childExists.get(tournamentId, m.round - 1, m.match_index * 2 + 1) as any;
          const waitingOnLeft = m.left_player_id === null && leftChild;
          const waitingOnRight = m.right_player_id === null && rightChild;
          if (waitingOnLeft || waitingOnRight) {
            continue;
          }
        }

        const winnerId = m.left_player_id ?? m.right_player_id!;

        finishBye.run(winnerId, m.id);

        advanceWinnerToNextMatch(
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
  }

  // =============================================
  // POST /internal/tournament/match-complete
  // =============================================
  fastify.post<{ Body: TournamentMatchCompleteType }>(
    "/match-complete",
    {
      schema: { body: TournamentMatchCompleteSchema },
      preHandler: [fastify.authenticateService],
      onRequest: (req, _reply, done) => {
        fastify.log.info(
          {
            url: req.url,
            headers: {
              authorization: req.headers.authorization,
              "content-type": req.headers["content-type"],
            },
          },
          "match-complete onRequest"
        );
        done();
      },
    },
    async (request, reply) => {
      if (request.service !== "pong") {
        return reply.code(403).send({ error: "Forbidden" });
      }

      // Grab the payload up-front so we can respond immediately.
      const payload = { ...request.body };

       // Early log to confirm we entered the handler
       fastify.log.info(
         {
           tournamentId: payload.tournamentId,
           tournamentMatchId: payload.tournamentMatchId,
           winnerId: payload.winnerId,
         },
         "Tournament match-complete received"
       );

      // Respond right away so pong-service is never blocked by DB locks.
      reply.code(202).send({ accepted: true });

      // Process in the background, serialized via matchQueue to avoid DB lock contention.
      matchQueue = matchQueue.then(async () => {
        const startedAt = Date.now();
        const {
          tournamentId,
          tournamentMatchId,
          winnerId,
          leftScore,
          rightScore,
        } = payload;

        fastify.log.info(
          { tournamentId, tournamentMatchId },
          "Tournament match worker start"
        );

        try {
          // If tournament already finished or not running, skip
          const tStatus = fastify.db
            .prepare(`SELECT status FROM tournaments WHERE id = ?`)
            .get(tournamentId) as { status: string } | undefined;
          if (!tStatus || tStatus.status === "finished") {
            fastify.log.warn(
              { tournamentId, tournamentMatchId },
              "Skipping match-complete: tournament not active"
            );
            return;
          }

          const tx = fastify.db.transaction(() => {
            const maxRound = getTournamentMaxRound(tournamentId);
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
              fastify.log.error(
                { tournamentId, tournamentMatchId },
                "Match not found for match-complete"
              );
              return;
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
              winnerId,
              maxRound
            );

            fastify.log.info(
              {
                tournamentId,
                tournamentMatchId,
                winnerId,
                leftScore,
                rightScore,
                round: match.round,
                matchIndex: match.match_index,
              },
              "Match marked finished"
            );

            autoAdvanceByes(tournamentId, maxRound);

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

          tx();
          const remainingAfter = fastify.db
            .prepare(
              `SELECT COUNT(*) AS count
               FROM tournament_matches
               WHERE tournament_id = ?
                 AND status != 'finished'`
            )
            .get(tournamentId) as { count: number };

          const openCount = fastify.db
            .prepare(
              `SELECT COUNT(*) AS count
               FROM tournaments
               WHERE status IN ('pending','running')`
            )
            .get() as { count: number };

          fastify.log.info(
            {
              tournamentId,
              tournamentMatchId,
              remainingAfter,
              openCountAfter: openCount.count,
              durationMs: Date.now() - startedAt,
            },
            "Tournament match processed asynchronously"
          );
        } catch (err: any) {
          // Swallow SQLITE_BUSY to avoid holding the DB; callers already got 202
          if (err?.code === "SQLITE_BUSY") {
            fastify.log.warn(
              { tournamentId, tournamentMatchId },
              "Tournament progression skipped due to busy database"
            );
          } else {
            fastify.log.error(
              { err: err?.message, tournamentId, tournamentMatchId },
              "Tournament progression error (async)"
            );
          }
        }
      }).finally(() => {
        fastify.log.info(
          {
            tournamentId: payload.tournamentId,
            tournamentMatchId: payload.tournamentMatchId,
          },
          "Tournament match queue item finished"
        );
      }).catch((err) => {
        fastify.log.error(
          { err: err?.message },
          "Tournament match queue unexpected error"
        );
      });
    }
  );
}
