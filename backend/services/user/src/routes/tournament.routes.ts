// services/user/src/routes/tournament.routes.ts

import { FastifyInstance } from "fastify";
import {
  CreateTournamentSchema,
  CreateTournamentType,
  JoinTournamentSchema,
  JoinTournamentType,
} from "../../shared/schemas/tournament.schema";

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

    const matches = fastify.db
      .prepare(
        `SELECT *
         FROM tournament_matches
         WHERE tournament_id = ?
         ORDER BY round ASC, match_index ASC`
      )
      .all(id);

    return reply.send({ matches });
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

        let index = 0;

        for (let i = 0; i < players.length; i += 2) {
          const left = players[i];
          const right = players[i + 1];
          const pongMatchId = `t${id}-r1-m${index}`;

          insertMatch.run(
            id,
            index,
            left?.user_id ?? null,
            right?.user_id ?? null,
            pongMatchId
          );

          index++;
        }
      });

      tx();

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

  // =======================================
  // GET /tournaments/:id/round/:round
  // =======================================
  fastify.get("/:id/round/:round", async (request, reply) => {
    const { id, round } = request.params as { id: string; round: string };
    const roundNum = Number(round);

    const matches = fastify.db
      .prepare(
        `SELECT *
         FROM tournament_matches
         WHERE tournament_id = ? AND round = ?
         ORDER BY match_index ASC`
      )
      .all(id, roundNum);

    if (!matches.length) {
      return reply.code(404).send({ error: "No matches" });
    }

    const getAlias = fastify.db.prepare(
      `SELECT alias
       FROM tournament_players
       WHERE tournament_id = ? AND user_id = ?`
    );

    const enriched = matches.map((m: any) => ({
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

    return reply.send({
      round: roundNum,
      matches: enriched,
    });
  });

  // =======================================
  // GET /tournaments/:id/next-match
  // =======================================
  fastify.get("/:id/next-match", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.query as { userId?: string };

    if (!userId) {
      return reply.code(400).send({ error: "userId required" });
    }

    const numericUserId = Number(userId);

    const tournament = fastify.db
      .prepare(
        `SELECT id, status
         FROM tournaments
         WHERE id = ?`
      )
      .get(id) as { id: number; status: string } | undefined;

    if (!tournament) {
      return reply.code(404).send({ error: "Tournament not found" });
    }

    const matches = fastify.db
      .prepare(
        `SELECT *
         FROM tournament_matches
         WHERE tournament_id = ?
           AND (left_player_id = ? OR right_player_id = ?)
         ORDER BY round ASC, match_index ASC`
      )
      .all(id, numericUserId, numericUserId) as any[];

    if (!matches.length) {
      return reply.send({ status: "waiting" });
    }

    const getAlias = fastify.db.prepare(
      `SELECT alias
       FROM tournament_players
       WHERE tournament_id = ? AND user_id = ?`
    );

    // Pending match first
    const pending = matches.find((m) => m.status === "pending");
    if (pending) {
      const isLeft = pending.left_player_id === numericUserId;
      const opponentId = isLeft
        ? pending.right_player_id
        : pending.left_player_id;

      const yourAliasRow = getAlias.get(id, numericUserId) as
        | { alias: string }
        | undefined;
      const opponentAliasRow =
        opponentId != null
          ? (getAlias.get(id, opponentId) as { alias: string } | undefined)
          : undefined;

      return reply.send({
        status: "ready",
        tournamentId: Number(id),
        tournamentMatchId: pending.id,
        matchKey: pending.pong_match_id, // 👈 use this as matchId for Pong
        round: pending.round,
        yourUserId: numericUserId,
        yourAlias: yourAliasRow?.alias ?? null,
        opponentUserId: opponentId ?? null,
        opponentAlias: opponentAliasRow?.alias ?? null,
      });
    }

    // Running match
    const running = matches.find((m) => m.status === "running");
    if (running) {
      return reply.send({
        status: "running",
        tournamentId: Number(id),
        tournamentMatchId: running.id,
        matchKey: running.pong_match_id,
        round: running.round,
      });
    }

    if (tournament.status === "finished") {
      return reply.send({ status: "finished" });
    }

    return reply.send({ status: "eliminated" });
  });
}
