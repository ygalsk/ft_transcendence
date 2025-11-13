import { FastifyInstance } from 'fastify';
import { CreateProfileSchema, CreateProfileType, MatchResultSchema, MatchResultType } from '../../shared/schemas/user.schema';

export default async function internalRoutes(fastify: FastifyInstance) {

  // POST /internal/create-profile - Called by Auth service after registration
  fastify.post<{ Body: CreateProfileType }>('/create-profile', {
    schema: { body: CreateProfileSchema }
  }, async (request, reply) => {
    // Validate internal service call
    const serviceHeader = request.headers['x-service'];
    if (serviceHeader !== 'auth') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const { id, email, display_name } = request.body;

    try {
      fastify.db.prepare(`
        INSERT INTO users (id, email, display_name)
        VALUES (?, ?, ?)
      `).run(id, email, display_name);

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
    schema: { body: MatchResultSchema }
  }, async (request, reply) => {
    const serviceHeader = request.headers['x-service'];
    if (serviceHeader !== 'pong') {
      return reply.code(403).send({ error: 'Forbidden' });
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
}
