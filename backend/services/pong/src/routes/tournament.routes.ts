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

    // =======================================
  // POST /tournaments/join — with alias
  // =======================================
  fastify.post<{ Body: JoinTournamentType }>(
    "/join",
    {
      schema: { body: JoinTournamentSchema },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user!;
      const { tournamentId, alias } = request.body;

      const tournament = fastify.db
        .prepare(
          `SELECT id, status, max_players
           FROM tournaments WHERE id = ?`
        )
        .get(tournamentId) as
        | { id: number; status: string; max_players: number }
        | undefined;

      if (!tournament) {
        return reply.code(404).send({ error: "Tournament not found" });
      }

      if (tournament.status !== "pending") {
        return reply.code(400).send({ error: "Tournament already started" });
      }

      const count = fastify.db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM tournament_players WHERE tournament_id = ?`
        )
        .get(tournamentId) as { count: number };

      if (count.count >= tournament.max_players) {
        return reply.code(400).send({ error: "Tournament is full" });
      }

      try {
        fastify.db
          .prepare(
            `INSERT INTO tournament_players (tournament_id, user_id, alias)
             VALUES (?, ?, ?)`
          )
          .run(tournamentId, userId, alias);
      } catch (err: any) {
        if (err.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
          return reply.code(409).send({ error: "Already joined" });
        }
        throw err;
      }

      return reply.send({ message: "Joined", alias });
    }
  );

  // =======================================
  // GET /tournaments/:id — overview
  // =======================================
  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const tournament = fastify.db
      .prepare(
        `SELECT id, name, created_by, status, max_players, is_public,
                created_at, started_at, finished_at
         FROM tournaments
         WHERE id = ?`
      )
      .get(id);

    if (!tournament) {
      return reply.code(404).send({ error: "Tournament not found" });
    }

    const players = fastify.db
      .prepare(
        `SELECT tp.user_id, tp.alias, u.elo, tp.seed
         FROM tournament_players tp
         JOIN users u ON u.id = tp.user_id
         WHERE tp.tournament_id = ?
         ORDER BY tp.seed IS NULL, tp.seed ASC`
      )
      .all(id);

    return reply.send({ tournament, players });
  });

  // =======================================
  // GET /tournaments/:id/bracket
  // =======================================
  fastify.get("/:id/bracket", async (request, reply) => {
    const { id } = request.params as { id: string };

    const matchesRaw = fastify.db
      .prepare(
        `SELECT *
         FROM tournament_matches
         WHERE tournament_id = ?
         ORDER BY round ASC, match_index ASC`
      )
      .all(id);

    const getAlias = fastify.db.prepare(
      `SELECT alias
       FROM tournament_players
       WHERE tournament_id = ? AND user_id = ?`
    );

    const matches = (matchesRaw as any[]).map((m) => ({
      matchId: m.id,
      round: m.round,
      index: m.match_index,
      status: m.status,
      pong_match_id: m.pong_match_id,
      winner_id: m.winner_id,
      left:
        m.left_player_id != null
          ? {
              userId: m.left_player_id,
              alias: (getAlias.get(id, m.left_player_id) as any)?.alias ?? null,
            }
          : null,
      right:
        m.right_player_id != null
          ? {
              userId: m.right_player_id,
              alias: (getAlias.get(id, m.right_player_id) as any)?.alias ?? null,
            }
          : null,
      score:
        m.left_score != null
          ? { left: m.left_score, right: m.right_score }
          : null,
    }));

    const grouped = matches.reduce((acc: any[], m) => {
      let round = acc.find((r) => r.round === m.round);
      if (!round) {
        round = { round: m.round, matches: [] as any[] };
        acc.push(round);
      }
      round.matches.push(m);
      return acc;
    }, []).sort((a, b) => a.round - b.round);

    return reply.send({ matches, rounds: grouped });
  });

    // =======================================
  // GET /tournaments/:id/leaderboard
  // =======================================
  fastify.get("/:id/leaderboard", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = fastify.db
      .prepare(
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
         ORDER BY wins DESC, losses ASC, tp.seed ASC`
      )
      .all(id) as {
        user_id: number;
        alias: string;
        seed: number | null;
        wins: number;
        losses: number;
      }[];

    return reply.send({ leaderboard: rows });
  });

  // =======================================
  // GET /tournaments/:id/current-round
  // Returns the earliest round that still has pending/running matches,
  // or the last finished round if the tournament is done.
  // =======================================
  fastify.get("/:id/current-round", async (request, reply) => {
    const { id } = request.params as { id: string };

    const pending = fastify.db
      .prepare(
        `SELECT MIN(round) AS round
         FROM tournament_matches
         WHERE tournament_id = ?
           AND status IN ('pending','running')`
      )
      .get(id) as { round: number | null };

    if (pending.round != null) {
      const roundNum = pending.round;
      const matches = fastify.db
        .prepare(
          `SELECT *
           FROM tournament_matches
           WHERE tournament_id = ? AND round = ?
           ORDER BY match_index ASC`
        )
        .all(id, roundNum);
      return reply.send({ round: roundNum, matches });
    }

    // If no pending/running, return the last finished round (or null)
    const lastFinished = fastify.db
      .prepare(
        `SELECT MAX(round) AS round
         FROM tournament_matches
         WHERE tournament_id = ?`
      )
      .get(id) as { round: number | null };

    if (lastFinished.round != null) {
      const roundNum = lastFinished.round;
      const matches = fastify.db
        .prepare(
          `SELECT *
           FROM tournament_matches
           WHERE tournament_id = ? AND round = ?
           ORDER BY match_index ASC`
        )
        .all(id, roundNum);
      return reply.send({ round: roundNum, matches, status: "finished" });
    }

    return reply.code(404).send({ error: "No matches" });
  });

  // =======================================
  // POST /tournaments/:id/start
  // =======================================
  fastify.post(
    "/:id/start",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user!.userId;

      const tournament = fastify.db
        .prepare(
          `SELECT id, created_by, status
           FROM tournaments WHERE id = ?`
        )
        .get(id) as
        | { id: number; created_by: number; status: string }
        | undefined;

      if (!tournament) {
        return reply.code(404).send({ error: "Tournament not found" });
      }

      if (tournament.created_by !== userId) {
        return reply.code(403).send({ error: "Forbidden" });
      }

      if (tournament.status !== "pending") {
        return reply.code(400).send({ error: "Already started" });
      }

      const players = fastify.db
        .prepare(
          `SELECT tp.user_id, tp.alias, u.elo
           FROM tournament_players tp
           JOIN users u ON u.id = tp.user_id
           WHERE tp.tournament_id = ?
           ORDER BY u.elo DESC, u.id ASC`
        )
        .all(id) as { user_id: number; alias: string; elo: number }[];

      if (players.length < 2) {
        return reply.code(400).send({ error: "Not enough players" });
      }

      const tx = fastify.db.transaction(() => {
        fastify.db
          .prepare(
            `UPDATE tournaments
             SET status = 'running', started_at = CURRENT_TIMESTAMP
             WHERE id = ?`
          )
          .run(id);

        const seedStmt = fastify.db.prepare(
          `UPDATE tournament_players
           SET seed = ?
           WHERE tournament_id = ? AND user_id = ?`
        );

        players.forEach((p, i) => seedStmt.run(i + 1, id, p.user_id));

        const insertMatch = fastify.db.prepare(
          `INSERT INTO tournament_matches
           (tournament_id, round, match_index, left_player_id, right_player_id, pong_match_id, status)
           VALUES (?, 1, ?, ?, ?, ?, 'pending')`
        );

        const fillMatch = (matchIndex: number, left: number | null, right: number | null) => {
          const pongMatchId = `t${id}-r1-m${matchIndex}`;
          insertMatch.run(
            id,
            matchIndex,
            left,
            right,
            pongMatchId
          );
        };

        // Bracket sizing: next power of two
        const bracketSize = 1 << Math.ceil(Math.log2(players.length));
        const maxRound = Math.ceil(Math.log2(bracketSize));
        const seedOrder = generateSeedOrder(bracketSize);

        // Map seed number to player (sorted by elo desc), fill remainder with null for BYEs
        const seeds: (number | null)[] = Array(bracketSize).fill(null);
        players.forEach((p, idx) => {
          const seedNum = idx + 1;
          const slot = seedOrder.findIndex((s) => s === seedNum);
          if (slot >= 0) seeds[slot] = p.user_id;
        });

        // Round 1 pairing from seeded slots
        let matchIndex = 0;
        for (let i = 0; i < seeds.length; i += 2) {
          fillMatch(matchIndex, seeds[i] ?? null, seeds[i + 1] ?? null);
          matchIndex++;
        }
      });

      tx();

      // Process BYEs immediately so lone players advance
      autoAdvanceByesLocal(fastify, Number(id), Math.ceil(Math.log2(players.length)));

      const matches = fastify.db
        .prepare(
          `SELECT *
           FROM tournament_matches
           WHERE tournament_id = ? AND round = 1
           ORDER BY match_index ASC`
        )
        .all(id);

      return reply.send({
        message: "Tournament started",
        round: 1,
        matches,
      });
    }
  );
}