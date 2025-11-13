import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

export interface AuthUser {
  userId: number;
  email: string;
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      const authHeader = request.headers.authorization;

      if (!authHeader) {
        return reply.code(401).send({ error: 'Missing authorization header' });
      }

      const token = authHeader.replace('Bearer ', '');

      if (!token) {
        return reply.code(401).send({ error: 'Missing token' });
      }

      const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
      request.user = decoded;

    } catch (error) {
      fastify.log.error({ error }, 'Authentication failed');
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }
  });
}

export default fp(authPlugin);

// Utility function for token generation
export function generateToken(userId: number, email: string): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
}
