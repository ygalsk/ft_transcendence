import { FastifyInstance } from 'fastify';
import { CreateProfileSchema, CreateProfileType, MatchResultSchema, MatchResultType } from '../../shared/schemas/user.schema';

export default async function internalRoutes(fastify: FastifyInstance) {

  // POST /internal/create-profile - Called by Auth service after registration
  fastify.post<{ Body: CreateProfileType }>('/create-profile', {
    schema: { body: CreateProfileSchema },
    preHandler: [fastify.authenticateService] // Use service authentication
  }, async (request, reply) => {
    // Validate internal service call
    if (request.service !== 'auth') {
      return reply.code(403).send({ error: 'Forbidden: Only auth service can create profiles' });
    }

    const { id, email, display_name} = request.body;

    try {
      fastify.db.prepare(`
        INSERT INTO users (id, email, display_name, bio, avatar_url)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, email, display_name, "Hi!", 'default.png');

      fastify.log.info({ userId: id, email }, 'User profile created');
      return reply.code(201).send({ message: 'Profile created' });
    } catch (err: any) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
        return reply.code(409).send({ error: 'Profile already exists' });
      }
      fastify.log.error({ err, userId: id }, 'Failed to create profile');
      return reply.code(500).send({ error: 'Internal error' });
    }
  });

  // POST /internal/match-result - Record match results
  fastify.post<{ Body: MatchResultType }>('/match-result', {
    schema: { body: MatchResultSchema },
    preHandler: [fastify.authenticateService] // Use service authentication
  }, async (request, reply) => {
    if (request.service !== 'pong') {
      return reply.code(403).send({ error: 'Forbidden: Only pong service can record match results' });
    }

    const { winnerId, loserId, leftScore, rightScore } = request.body;

    try {
      fastify.db.prepare(`
        INSERT INTO match_history (winner_id, loser_id, left_score, right_score)
        VALUES (?, ?, ?, ?)
      `).run(winnerId, loserId, leftScore, rightScore);

      fastify.db.prepare(`UPDATE users SET wins = COALESCE(wins, 0) + 1 WHERE id = ?`).run(winnerId);
      fastify.db.prepare(`UPDATE users SET losses = COALESCE(losses, 0) + 1 WHERE id = ?`).run(loserId);

      fastify.log.info({ winnerId, loserId }, 'Match recorded');
      return reply.send({ message: 'Match recorded successfully' });
    } catch (err: any) {
      if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return reply.code(400).send({ error: 'Invalid user IDs' });
      }
      fastify.log.error({ err }, 'Failed to record match');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // PATCH /internal/:userId/online - Update online status (internal only)
  fastify.patch<{ 
      Params: { userId: string },
      Body: { online: boolean }
  }>('/:userId/online', async (request, reply) => {
      const userId = parseInt(request.params.userId, 10);
      const { online } = request.body;

      if (isNaN(userId))
          return reply.code(400).send({ error: 'Invalid user ID' });

      try {
          fastify.db.prepare('UPDATE users SET online = ? WHERE id = ?')
              .run(online ? 1 : 0, userId);

      fastify.log.info({ userId, online }, 'Online status updated');
      return reply.send({ message: 'Online status updated' });
    } catch (error: any) {
      fastify.log.error({ error: error.message, userId }, 'Failed to update online status');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}
