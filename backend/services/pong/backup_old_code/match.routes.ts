import { FastifyInstance } from 'fastify';

export default async function matchRoutes(fastify: FastifyInstance) {
  // GET /matches - Get recent matches
  fastify.get('/matches', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const stmt = fastify.db.prepare(`
        SELECT id, winner_id, loser_id, left_score, right_score, duration, created_at
        FROM matches
        ORDER BY created_at DESC
        LIMIT 50
      `);
      const matches = stmt.all();

      return reply.send({ matches });
    } catch (error: any) {
      fastify.log.error({ error: error.message }, 'Failed to fetch matches');
      return reply.code(500).send({ error: 'Failed to fetch matches' });
    }
  });

  // GET /matches/:userId - Get matches for a specific user
  fastify.get<{ Params: { userId: string } }>('/matches/:userId', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { userId } = request.params;
    const userIdNum = parseInt(userId, 10);

    if (isNaN(userIdNum)) {
      return reply.code(400).send({ error: 'Invalid user ID' });
    }

    try {
      const stmt = fastify.db.prepare(`
        SELECT id, winner_id, loser_id, left_score, right_score, duration, created_at
        FROM matches
        WHERE winner_id = ? OR loser_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `);
      const matches = stmt.all(userIdNum, userIdNum);

      return reply.send({ matches });
    } catch (error: any) {
      fastify.log.error({ error: error.message }, 'Failed to fetch user matches');
      return reply.code(500).send({ error: 'Failed to fetch user matches' });
    }
  });

  // GET /matches/stats/:userId - Get match statistics for a user
  fastify.get<{ Params: { userId: string } }>('/matches/stats/:userId', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { userId } = request.params;
    const userIdNum = parseInt(userId, 10);

    if (isNaN(userIdNum)) {
      return reply.code(400).send({ error: 'Invalid user ID' });
    }

    try {
      const stmt = fastify.db.prepare(`
        SELECT
          COUNT(*) as total_matches,
          SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN loser_id = ? THEN 1 ELSE 0 END) as losses,
          AVG(CASE WHEN winner_id = ? THEN duration ELSE NULL END) as avg_win_duration
        FROM matches
        WHERE winner_id = ? OR loser_id = ?
      `);
      const stats = stmt.get(userIdNum, userIdNum, userIdNum, userIdNum, userIdNum);

      return reply.send({ stats });
    } catch (error: any) {
      fastify.log.error({ error: error.message }, 'Failed to fetch user stats');
      return reply.code(500).send({ error: 'Failed to fetch user stats' });
    }
  });
}
