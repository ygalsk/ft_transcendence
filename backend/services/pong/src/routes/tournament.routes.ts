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

// Resolve stalled matches (both players assigned, but still pending after a timeout)
function resolveStalledMatches(
  fastify: any,
  tournamentId: number,
  maxRound: number,
  timeoutMs = 120_000
) {
  const stalled = fastify.db
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

  const getSeedElo = fastify.db.prepare(
    `SELECT tp.seed, u.elo
     FROM tournament_players tp
     JOIN users u ON u.id = tp.user_id
     WHERE tp.tournament_id = ? AND tp.user_id = ?`
  );

  const finish = fastify.db.prepare(
    `UPDATE tournament_matches
     SET winner_id = ?, left_score = ?, right_score = ?,
         status = 'finished', finished_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  );

  for (const m of stalled) {
    const leftInfo = getSeedElo.get(tournamentId, m.left_player_id) as
      | { seed: number | null; elo: number }
      | undefined;
    const rightInfo = getSeedElo.get(tournamentId, m.right_player_id) as
      | { seed: number | null; elo: number }
      | undefined;

    // Decide winner: lower seed wins; if seeds null, higher elo wins; fallback to lower user id
    let winnerId = m.left_player_id;
    if (leftInfo && rightInfo) {
      const leftSeed = leftInfo.seed ?? Number.MAX_SAFE_INTEGER;
      const rightSeed = rightInfo.seed ?? Number.MAX_SAFE_INTEGER;
      if (leftSeed !== rightSeed) {
        winnerId = leftSeed < rightSeed ? m.left_player_id : m.right_player_id;
      } else if (leftInfo.elo !== rightInfo.elo) {
        winnerId = leftInfo.elo >= rightInfo.elo ? m.left_player_id : m.right_player_id;
      } else {
        winnerId = Math.min(m.left_player_id, m.right_player_id);
      }
    }

    finish.run(
      winnerId,
      0,
      0,
      m.id
    );

    advanceWinnerToNextMatch(
      fastify,
      tournamentId,
      m.round,
      m.match_index,
      winnerId,
      maxRound
    );
  }

  autoAdvanceByesLocal(fastify, tournamentId);
}

// Standard bracket seeding order (e.g., 4 seeds: [1,4,3,2], 8 seeds: [1,8,4,5,3,6,2,7])
function generateSeedOrder(size: number): number[] {
  if (size === 1) return [1];
  const half = generateSeedOrder(size / 2);
  const mirrored = half.map((s) => size + 1 - s);
  return half.flatMap((s, i) => [s, mirrored[i]]);
}

export default async function tournamentRoutes(fastify: FastifyInstance) {
  // =======================================
  // POST /tournaments — Create tournament
  // (prefix is /tournaments from app.ts)
  // =======================================
  fastify.post<{ Body: CreateTournamentType }>(
    "/",
    {
      schema: { body: CreateTournamentSchema },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user!;
      const { name, max_players, is_public = true } = request.body;

      // Enforce unique name among active tournaments (pending or running)
      const conflict = fastify.db
        .prepare(
          `SELECT id FROM tournaments
           WHERE name = ?
             AND status IN ('pending', 'running')`
        )
        .get(name) as { id: number } | undefined;

      if (conflict) {
        return reply
          .code(400)
          .send({ error: "A pending/running tournament already uses that name" });
      }

      const result = fastify.db
        .prepare(
          `INSERT INTO tournaments (name, created_by, max_players, is_public)
           VALUES (?, ?, ?, ?)`
        )
        .run(name, userId, max_players, is_public ? 1 : 0);

      return reply.code(201).send({ id: result.lastInsertRowid });
    }
  );

  // =======================================
  // GET /tournaments — list tournaments
  // ?status=open (default) => pending + running
  // ?status=finished => recently finished (ordered by finished_at DESC)
  // ?status=all => all statuses
  // =======================================
  fastify.get("/", async (request, reply) => {
    const reqId = (request as any).id || "tournaments-list";
    try {
      const { status, q } = request.query as { status?: string; q?: string };
      const filter = status || "open";
      const like = q ? `%${q}%` : null;
      fastify.log.info({ reqId, status: filter, q }, "Listing tournaments start");

      let tournaments: any[] = [];
      if (filter === "open") {
        tournaments = fastify.db
          .prepare(
            `SELECT t.id, t.name, t.status, t.max_players, t.is_public,
                    t.created_at, t.started_at, t.finished_at,
                    (SELECT COUNT(*) FROM tournament_players tp WHERE tp.tournament_id = t.id) AS player_count
             FROM tournaments t
             WHERE t.status IN ('pending', 'running')
               AND ( ? IS NULL OR t.name LIKE ? )
             ORDER BY t.status ASC, t.created_at DESC
             LIMIT 50`
          )
          .all(like, like) as any[];
      } else if (filter === "finished") {
        tournaments = fastify.db
          .prepare(
            `SELECT t.id, t.name, t.status, t.max_players, t.is_public,
                    t.created_at, t.started_at, t.finished_at,
                    (SELECT COUNT(*) FROM tournament_players tp WHERE tp.tournament_id = t.id) AS player_count
             FROM tournaments t
             WHERE t.status = 'finished'
               AND ( ? IS NULL OR t.name LIKE ? )
             ORDER BY t.finished_at DESC, t.created_at DESC
             LIMIT 30`
          )
          .all(like, like) as any[];
      } else {
        tournaments = fastify.db
          .prepare(
            `SELECT t.id, t.name, t.status, t.max_players, t.is_public,
                    t.created_at, t.started_at, t.finished_at,
                    (SELECT COUNT(*) FROM tournament_players tp WHERE tp.tournament_id = t.id) AS player_count
             FROM tournaments t
             WHERE ( ? IS NULL OR t.name LIKE ? )
             ORDER BY t.status ASC, t.created_at DESC
             LIMIT 50`
          )
          .all(like, like) as any[];
      }

      const enriched: any[] = tournaments.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        max_players: t.max_players,
        is_public: !!t.is_public,
        created_at: t.created_at,
        started_at: t.started_at,
        finished_at: t.finished_at,
        player_count: t.player_count,
        can_join: t.status === "pending" && t.player_count < t.max_players,
      }));

      if (filter === "finished" || filter === "all") {
        // Enrich finished tournaments with podium aliases
        const getFinalMatch = fastify.db.prepare(
          `SELECT winner_id, left_player_id, right_player_id
           FROM tournament_matches
           WHERE tournament_id = ?
           ORDER BY round DESC, match_index ASC
           LIMIT 1`
        );
        const getAlias = fastify.db.prepare(
          `SELECT alias FROM tournament_players WHERE tournament_id = ? AND user_id = ?`
        );
        const getTop3 = fastify.db.prepare(
          `SELECT tp.user_id, tp.alias, tp.seed,
                  SUM(CASE WHEN tm.winner_id = tp.user_id THEN 1 ELSE 0 END) AS wins,
                  SUM(CASE WHEN tm.status = 'finished' AND tm.winner_id IS NOT NULL AND tm.winner_id != tp.user_id THEN 1 ELSE 0 END) AS losses
           FROM tournament_players tp
           LEFT JOIN tournament_matches tm
             ON tm.tournament_id = tp.tournament_id
            AND tm.status = 'finished'
            AND (tm.left_player_id = tp.user_id OR tm.right_player_id = tp.user_id)
           WHERE tp.tournament_id = ?
           GROUP BY tp.user_id, tp.alias, tp.seed
           ORDER BY wins DESC, losses ASC, tp.seed ASC
           LIMIT 3`
        );

        enriched.forEach((t) => {
          if (t.status !== "finished") return;
          const finalMatch = getFinalMatch.get(t.id) as
            | { winner_id: number | null; left_player_id: number | null; right_player_id: number | null }
            | undefined;

          let winnerAlias: string | null = null;
          let runnerAlias: string | null = null;
          if (finalMatch?.winner_id) {
            winnerAlias = (getAlias.get(t.id, finalMatch.winner_id) as any)?.alias ?? null;
            const runnerId =
              finalMatch.winner_id === finalMatch.left_player_id
                ? finalMatch.right_player_id
                : finalMatch.left_player_id;
            if (runnerId) {
              runnerAlias = (getAlias.get(t.id, runnerId) as any)?.alias ?? null;
            }
          }

          const lb = getTop3.all(t.id) as { alias: string }[];
          const thirdAlias = lb[2]?.alias ?? null;

          t.podium = {
            winner: winnerAlias,
            runner_up: runnerAlias,
            third: thirdAlias,
          };
        });
      }

      fastify.log.info({ reqId, count: enriched.length, filter }, "Listing tournaments done");
      return reply.send({ tournaments: enriched });
    } catch (err: any) {
      fastify.log.error({ reqId, err: err.message }, "Failed to list tournaments");
      return reply.code(503).send({ error: "Service unavailable" });
    }
  });
}