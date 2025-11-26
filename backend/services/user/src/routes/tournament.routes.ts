// services/user/src/routes/tournament.routes.ts
import { FastifyInstance } from "fastify";
import {
  CreateTournamentSchema,
  CreateTournamentType,
  JoinTournamentSchema,
  JoinTournamentType,
} from "../../../shared/schemas/tournament.schema";

export default async function tournamentRoutes(fastify: FastifyInstance) {
  //
  // POST /tournaments - create a new tournament
  //
  fastify.post<{ Body: CreateTournamentType }>(
    "/tournaments",
    {
      schema: { body: CreateTournamentSchema },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user!;
      const { name, max_players, is_public = true } = request.body;

      const stmt = fastify.db.prepare(
        `INSERT INTO tournaments (name, created_by, max_players, is_public)
         VALUES (?, ?, ?, ?)`
      );
      const result = stmt.run(name, userId, max_players, is_public ? 1 : 0);

      return reply.code(201).send({ id: result.lastInsertRowid });
    }
  );

  //
  // POST /tournaments/join - join a tournament
  //
  fastify.post<{ Body: JoinTournamentType }>(
    "/tournaments/join",
    {
      schema: { body: JoinTournamentSchema },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { userId } = request.user!;
      const { tournamentId } = request.body;

      const tournament = fastify.db
        .prepare(
          `SELECT id, status, max_players
           FROM tournaments WHERE id = ?`
        )
        .get(tournamentId);

      if (!tournament) {
        return reply.code(404).send({ error: "Tournament not found" });
      }

      if (tournament.status !== "pending") {
        return reply.code(400).send({ error: "Tournament already started" });
      }

      const countRow = fastify.db
        .prepare(
          `SELECT COUNT(*) AS count FROM tournament_players
           WHERE tournament_id = ?`
        )
        .get(tournamentId) as { count: number };

      if (countRow.count >= tournament.max_players) {
        return reply.code(400).send({ error: "Tournament is full" });
      }

      try {
        fastify.db
          .prepare(
            `INSERT INTO tournament_players (tournament_id, user_id)
             VALUES (?, ?)`
          )
          .run(tournamentId, userId);
      } catch (err: any) {
        if (err.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
          return reply.code(409).send({ error: "Already joined" });
        }
        throw err;
      }

      return reply.send({ message: "Joined tournament" });
    }
  );

  //
  // GET /tournaments/:id - basic info + players
  //
  fastify.get("/tournaments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const tournament = fastify.db
      .prepare(
        `SELECT id, name, created_by, status, max_players, is_public,
                created_at, started_at, finished_at
         FROM tournaments WHERE id = ?`
      )
      .get(id);

    if (!tournament) {
      return reply.code(404).send({ error: "Tournament not found" });
    }

    const players = fastify.db
      .prepare(
        `SELECT tp.user_id, u.display_name, u.elo, tp.seed
         FROM tournament_players tp
         JOIN users u ON u.id = tp.user_id
         WHERE tp.tournament_id = ?
         ORDER BY tp.seed IS NULL, tp.seed ASC`
      )
      .all(id);

    return reply.send({ tournament, players });
  });

  //
  // GET /tournaments/:id/bracket - raw matches
  //
  fastify.get("/tournaments/:id/bracket", async (request, reply) => {
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

  //
  // POST /tournaments/:id/start
  // - Only creator can start
  // - Seeds players by Elo
  // - Creates round 1 matches w/ pong_match_id
  //
  fastify.post("/tournaments/:id/start", {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user!;

    // 1) Load tournament
    const tournament = fastify.db
      .prepare(
        `SELECT id, created_by, status
         FROM tournaments WHERE id = ?`
      )
      .get(id) as { id: number; created_by: number; status: string } | undefined;

    if (!tournament) {
      return reply.code(404).send({ error: "Tournament not found" });
    }

    if (tournament.created_by !== userId) {
      return reply.code(403).send({ error: "Only the creator can start this tournament" });
    }

    if (tournament.status !== "pending") {
      return reply.code(400).send({ error: "Tournament has already started or finished" });
    }

    // 2) Load players with Elo, ordered by Elo DESC (highest first)
    const players = fastify.db
      .prepare(
        `SELECT tp.user_id, u.elo
         FROM tournament_players tp
         JOIN users u ON u.id = tp.user_id
         WHERE tp.tournament_id = ?
         ORDER BY u.elo DESC, u.id ASC`
      )
      .all(id) as { user_id: number; elo: number }[];

    if (players.length < 2) {
      return reply.code(400).send({ error: "Need at least 2 players to start a tournament" });
    }

    // 3) Transaction: set status, assign seeds, create round-1 matches
    const startTournamentTx = fastify.db.transaction(() => {
      // 3a) Update tournament status
      fastify.db
        .prepare(
          `UPDATE tournaments
           SET status = 'running', started_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .run(id);

      // 3b) Assign seeds based on Elo rank
      const updateSeedStmt = fastify.db.prepare(
        `UPDATE tournament_players
         SET seed = ?
         WHERE tournament_id = ? AND user_id = ?`
      );

      players.forEach((p, index) => {
        const seed = index + 1; // 1 = highest elo
        updateSeedStmt.run(seed, id, p.user_id);
      });

      // 3c) Create round 1 matches: (seed1 vs seed2), (seed3 vs seed4), ...
      const insertMatchStmt = fastify.db.prepare(
        `INSERT INTO tournament_matches
         (tournament_id, round, match_index, left_player_id, right_player_id, pong_match_id, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`
      );

      let matchIndex = 0;
      for (let i = 0; i < players.length; i += 2) {
        const left = players[i];
        const right = players[i + 1]; // may be undefined (bye)

        const pongMatchId = `t${id}-r1-m${matchIndex}`; // 👈 user-service generated ID

        insertMatchStmt.run(
          id,
          1,                       // round 1
          matchIndex,
          left?.user_id ?? null,
          right?.user_id ?? null,
          pongMatchId
        );
        matchIndex++;
      }
    });

    startTournamentTx();

    // 4) Return the newly created round-1 matches
    const round1Matches = fastify.db
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
      matches: round1Matches,
    });
  });

  //
  // GET /tournaments/:id/round/:round - enriched bracket info
  //
  fastify.get("/tournaments/:id/round/:round", async (request, reply) => {
    const { id, round } = request.params as { id: string; round: string };
    const roundNum = Number(round);

    if (isNaN(roundNum) || roundNum < 1) {
      return reply.code(400).send({ error: "Invalid round number" });
    }

    const tournament = fastify.db
      .prepare(
        `SELECT id, name, status
         FROM tournaments WHERE id = ?`
      )
      .get(id);

    if (!tournament) {
      return reply.code(404).send({ error: "Tournament not found" });
    }

    const matches = fastify.db
      .prepare(
        `SELECT *
         FROM tournament_matches
         WHERE tournament_id = ?
           AND round = ?
         ORDER BY match_index ASC`
      )
      .all(id, roundNum);

    if (matches.length === 0) {
      return reply.code(404).send({ error: "No matches for this round" });
    }

    const getUser = fastify.db.prepare(
      `SELECT id, display_name, avatar_url, elo, wins, losses
       FROM users
       WHERE id = ?`
    );

    const enriched = matches.map((m: any) => ({
      matchId: m.id,
      round: m.round,
      index: m.match_index,
      status: m.status,
      winner_id: m.winner_id,
      pong_match_id: m.pong_match_id,

      left_player:
        m.left_player_id != null ? getUser.get(m.left_player_id) : null,

      right_player:
        m.right_player_id != null ? getUser.get(m.right_player_id) : null,

      score:
        m.left_score != null
          ? { left: m.left_score, right: m.right_score }
          : null,
    }));

    return reply.send({
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
      },
      round: roundNum,
      matches: enriched,
    });
  });

}
