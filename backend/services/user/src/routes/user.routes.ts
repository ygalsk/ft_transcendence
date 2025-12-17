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
    schema: { body: UpdateProfileSchema },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { userId } = request.user!;
    const { display_name, bio, avatar_url } = request.body;

    fastify.db.prepare(`
      UPDATE users
      SET display_name = COALESCE(?, display_name),
          bio = COALESCE(?, bio),
          avatar_url = COALESCE(?, avatar_url),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(display_name, bio, avatar_url, userId);

    return reply.send({ message: 'Profile updated' });
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

  // POST /user/logout - set user offline, when its called frontwnd must delete the token
  fastify.post('/logout', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user!.userId;

    try {
      fastify.db.prepare('UPDATE users SET online = 0 WHERE id = ?').run(userId);
      
      fastify.log.info({ userId }, 'User logged out');
      return reply.send({ message: 'Logged out successfully.' });
    } catch (error: any) {
      fastify.log.error({ error: error.message, userId }, 'Failed to logout');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}
