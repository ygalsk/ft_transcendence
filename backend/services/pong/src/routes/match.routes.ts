import { FastifyInstance } from "fastify";
import { createRoom, getRoom, rooms } from "../game/room/registry";
import { MatchConfig } from "../game/types";

export default async function matchRoutes(fastify: FastifyInstance) {

  // Create a casual match (HTTP API)
  fastify.post<{ 
    Body: { vsAi?: boolean; scoreLimit?: number } 
  }>("/match", async (request, reply) => {
    const { vsAi = false, scoreLimit = 11 } = request.body;

    const matchId = `casual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const config: MatchConfig = {
      scoreLimit,
      allowSpectators: true,
      enableAi: vsAi,
    };

    // Create room but do NOT assign players; WS will do that
    createRoom(matchId, config);

    return reply.send({
      matchId,
      vsAi,
      scoreLimit,
    });
  });

  // Get info about a given match/room
  fastify.get<{ Params: { matchId: string } }>("/match/:matchId", async (request, reply) => {
    const { matchId } = request.params;

    const room = getRoom(matchId);
    if (!room) {
      return reply.code(404).send({ error: "Match not found" });
    }

    return reply.send({
      matchId,
      state: room.state,
      players: {
        left: room.players.left && {
          userId: room.players.left.userId,
          displayName: room.players.left.displayName,
        },
        right: room.players.right && {
          userId: room.players.right.userId,
          displayName: room.players.right.displayName,
        },
      },
      score: room.score,
      isTournament: !!room.config.tournamentId,
      tournamentId: room.config.tournamentId ?? null,
      enableAi: room.config.enableAi,
    });
  });

  // ------------------------------------
  // List all active rooms (dev/debug only)
  // ------------------------------------
  fastify.get("/rooms", async () => {
    return Array.from(rooms.values()).map((room) => ({
      id: room.id,
      state: room.state,
      players: {
        left: room.players.left?.displayName ?? null,
        right: room.players.right?.displayName ?? null,
      },
      score: room.score,
      isTournament: !!room.config.tournamentId,
    }));
  });

  // ------------------------------------
  // Fetch match history from DB (optional)
  // ------------------------------------
  fastify.get("/matches/history", async () => {
    try {
      const stmt = fastify.db.prepare(`
        SELECT id, winner_id, loser_id, left_score, right_score, created_at
        FROM matches
        ORDER BY created_at DESC
        LIMIT 20
      `);
      const rows = stmt.all();
      return { matches: rows };
    } catch (err: any) {
      fastify.log.error(err, "Failed to read match history");
      return { matches: [] };
    }
  });

}
