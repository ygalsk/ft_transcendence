import { FastifyInstance } from 'fastify';
import { pipeline } from 'stream/promises';
import { createWriteStream, createReadStream, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { UpdateProfileSchema,
        UpdateProfileType,
        AvatarUploadResponseSchema,
        GetAvatarParamsSchema,
        GetAvatarParamsType
} from '../../shared/schemas/user.schema';
import axios from 'axios';

const AVATAR_DIR = process.env.UPLOADS_DIR || '/usr/src/app/data/avatars';
const DEFAULT_AVATAR_PATH = join(AVATAR_DIR, 'default.png');
const DEFAULT_AVATAR_URL = 'default.png';
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];
const MIME_TO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png'};

export default async function userRoutes(fastify: FastifyInstance) {

  // GET /:id - Get user by ID
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const user = fastify.db.prepare(`
      SELECT id, email, display_name, online, last_seen, avatar_url, bio, wins, losses
      FROM users WHERE id = ?
    `).get(id);

    if (!user)
      return reply.code(404).send({ error: 'User not found' });

    return reply.send(user);
  });

  // PUT /me - Update current user profile
  fastify.put<{ Body: UpdateProfileType }>('/me', {
    schema: { body: UpdateProfileSchema },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { userId } = request.user!;
    const { display_name, bio, avatar_url } = request.body;

    //CHECK LATER W FRONTEND
    //prevent setting avatar to null/empty, undefined will keep it same
    // const avatarUrl = avatar_url || undefined;

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

  //file size limit handled in app.ts by fastify/multipart
  //saved in db as id.ext
  //post /avatar - upload avatar
  fastify.post('/avatar', {
    schema: {
      response: {
        201: AvatarUploadResponseSchema,
        400: { type: 'object', additionalProperties: true },
        500: { type: 'object', additionalProperties: true }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      //get the file from req /multipart/form-data
      const data = await (request as any).file();
    
      if (!data)
        return reply.code(400).send({ error: 'No file uploaded' });

      if (!ALLOWED_MIME_TYPES.includes(data.mimetype))
        return reply.code(400).send({error: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`});

      const userId = request.user!.userId;
      const ext = MIME_TO_EXT[data.mimetype as keyof typeof MIME_TO_EXT];
      const filename = `${userId}.${ext}`;
      const filepath = join(AVATAR_DIR, filename);

      // Save file to disk (overwrites if same format)
      await pipeline(data.file, createWriteStream(filepath));

      if (!existsSync(filepath)) {
        fastify.log.error({ userId, filename}, 'File write verification failed');
        return reply.code(500).send({error: 'Failed to save file'});
      }

      // cleanup old format if user switched extensions
      const oldExt = ext === 'png' ? 'jpg' : 'png';
      const oldFilepath = join(AVATAR_DIR, `${userId}.${oldExt}`);
      if (existsSync(oldFilepath)) {
        try {
          unlinkSync(oldFilepath);
          fastify.log.debug(`Cleaned up old avatar format: ${userId}.${oldExt}`);
        } catch (cleanupError) {
          fastify.log.warn(`Failed to delete old avatar format: ${userId}.${oldExt}`);
          // Don't fail upload if cleanup fails
        }
      }

      // Update database
      fastify.db.prepare(`
        UPDATE users SET avatar_url = ? WHERE id = ?
      `).run(filename, userId);

      fastify.log.info({userId, filename}, 'Avatar uploaded');
      return reply.code(201).send({
        message: 'Avatar uploaded',
        avatar_url: filename
      });

    } catch (error: any) {
      fastify.log.error({ error }, 'Avatar upload failed');
      return reply.code(500).send({ error: 'Upload failed' });
    }
  });
  
  //get /:id/avatar -serve files
  fastify.get<{ Params: GetAvatarParamsType }>('/:id/avatar', {
    schema: {
      params: GetAvatarParamsSchema,
      response: {
        200: { type: 'object', additionalProperties: true },
        404: { type: 'object', additionalProperties: true },
        500: { type: 'object', additionalProperties: true }
      }
    }
  }, async (request, reply) => {
    const { userId } = request.params;

    try {
      const user = fastify.db.prepare(`
        SELECT avatar_url FROM users WHERE id = ?
      `).get(userId) as { avatar_url: string } | undefined;

      const path = user?.avatar_url && existsSync(join(AVATAR_DIR, user.avatar_url))
        ? join(AVATAR_DIR, user.avatar_url) : DEFAULT_AVATAR_PATH;

      const type = path.endsWith('.png') ? 'image/png' : 'image/jpeg';
      // Set proper headers for image, cache for a day, prevent mime sniffing
      reply.header('Content-Type', type);
      reply.header('Cache-Control', 'public, max-age=86400');  // 1 day
      reply.header('X-Content-Type-Options', 'nosniff');

      return reply.send(createReadStream(path));
    } catch (error: any) {
      fastify.log.error({ error, userId }, `Failed to serve avatar`);
      return reply.code(500).send({ error: 'Failed to retrieve file' });
    }
  });

  //delete /avatar - remove avatar & revert to default
  fastify.delete('/avatar', {
    schema: {
      response: {
        204: { type: 'null' },
        400: { type: 'object', additionalProperties: true },
        500: { type: 'object', additionalProperties: true }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const userId = request.user!.userId;

      const user = fastify.db.prepare(`
        SELECT avatar_url FROM users WHERE id = ?
      `).get(userId) as { avatar_url: string } | undefined;

      if (!user?.avatar_url || user.avatar_url == DEFAULT_AVATAR_URL)
        return reply.code(400).send({error: 'Avatar doesnt exist or cant delete default avatar'});

      // delete avatar file for this user
      const path = join(AVATAR_DIR, user.avatar_url);
      if (existsSync(path)) {
        try {
          unlinkSync(path);//deleting from disk
          fastify.log.debug(`Deleted avatar file: ${user.avatar_url}`);
        } catch (e) {
          fastify.log.warn(`Failed to delete avatar file: ${user.avatar_url}`);
        }
      }
      //update db
      fastify.db.prepare(`
        UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(DEFAULT_AVATAR_URL, userId);

      fastify.log.info({ userId }, 'Avatar deleted, reverted to default');
      return reply.send({ message: 'Avatar deleted successfully' });

    } catch (error: any) {
      fastify.log.error({ error }, 'Failed to delete avatar file');
      return reply.code(500).send({ error: 'Failed to delete avatar file' });
    }
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

  // DELETE /me - delete user account
  fastify.delete('/me', {
    schema: {
      response: {
        204: { type: 'null' },
        401: { type: 'object', additionalProperties: true },
        404: { type: 'object', additionalProperties: true },
        500: { type: 'object', additionalProperties: true }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const userId = request.user!.userId;

      // for avatar cleanup
      const user = fastify.db.prepare(`
        SELECT avatar_url FROM users WHERE id = ?
      `).get(userId) as { avatar_url: string } | undefined;

      if (!user)
        return reply.code(404).send({ error: 'User not found' });

      // delete match history
      fastify.db.prepare(`
        DELETE FROM match_history WHERE winner_id = ? OR loser_id = ?
      `).run(userId, userId);
      fastify.log.info({ userId }, 'Deleted match history');

      // delete friendship
      fastify.db.prepare(`
        DELETE FROM friendships WHERE user_id = ? OR friend_id = ?
      `).run(userId, userId);
      fastify.log.info({ userId }, 'Deleted friendships');

      // delete avatar file
      if (user.avatar_url && user.avatar_url !== DEFAULT_AVATAR_URL) {
        const avatarPath = join(AVATAR_DIR, user.avatar_url);
        if (existsSync(avatarPath)) {
          try {
            unlinkSync(avatarPath);
            fastify.log.info({ userId, avatar: user.avatar_url }, 'Deleted avatar file');
          } catch (error) {
            fastify.log.warn({ userId, error }, 'Failed to delete avatar file');
          }
        }
      }

      // delete user from database
      fastify.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      fastify.log.info({ userId }, 'Deleted user from database');

      // Call Auth Service to delete from auth DB
      try {
        const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:4000';
        const serviceSecret = process.env.SERVICE_SECRET || 'your-service-secret';
        
        // Direct service-to-service call (no /api/auth prefix)
        const deleteUrl = `${authServiceUrl}/internal/users/${userId}`;
        
        fastify.log.info({ userId, url: deleteUrl }, 'Calling auth service to delete user');
        
        await axios.delete(deleteUrl, {
          headers: {
            'x-service-secret': serviceSecret
          }
        });
        fastify.log.info({ userId }, 'Deleted user from auth service');
      } catch (error: any) {
        fastify.log.error({ 
          userId, 
          error: error.message,
          response: error.response?.data,
          status: error.response?.status 
        }, 'Failed to delete from auth service');
        return reply.code(500).send({ error: 'Failed to complete account deletion' });
      }

      return reply.code(204).send();
    } catch (error: any) {
      fastify.log.error({ error, userId: request.user?.userId }, 'Failed to delete account');
      return reply.code(500).send({ error: 'Failed to delete account' });
    }
  });
}
