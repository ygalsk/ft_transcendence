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
        `SELECT tp.user_id, u.display_name, u.elo
         FROM tournament_players tp
         JOIN users u ON u.id = tp.user_id
         WHERE tp.tournament_id = ?
         ORDER BY tp.seed IS NULL, tp.seed ASC`
      )
      .all(id);

    return reply.send({ tournament, players });
  });

  //
  // GET /tournaments/:id/bracket - placeholder for bracket
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
}
