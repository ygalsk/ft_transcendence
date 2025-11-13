import { FastifyInstance } from 'fastify';
import { UpdateProfileSchema, UpdateProfileType } from '../../shared/schemas/user.schema';

export default async function userRoutes(fastify: FastifyInstance) {

  // GET /:id - Get user by ID
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const user = fastify.db.prepare(`
      SELECT id, email, display_name, avatar_url, bio, wins, losses
      FROM users WHERE id = ?
    `).get(id);

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return reply.send(user);
  });

  // PUT /me - Update current user profile
  fastify.put<{ Body: UpdateProfileType }>('/me', {
    schema: { body: UpdateProfileSchema }
  }, async (request, reply) => {
    const userHeader = request.headers['x-user'];

    if (!userHeader || typeof userHeader !== 'string') {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    try {
      const currentUser = JSON.parse(userHeader);
      const { display_name, bio, avatar_url } = request.body;

      fastify.db.prepare(`
        UPDATE users
        SET display_name = COALESCE(?, display_name),
            bio = COALESCE(?, bio),
            avatar_url = COALESCE(?, avatar_url),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(display_name, bio, avatar_url, currentUser.userId);

      return reply.send({ message: 'Profile updated' });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // GET /leaderboard - Get top 10 users
  fastify.get('/leaderboard', async () => {
    const rows = fastify.db.prepare(`
      SELECT id, display_name, wins, losses
      FROM users
      ORDER BY wins DESC, losses ASC
      LIMIT 10
    `).all();

    return { leaderboard: rows };
  });
}
