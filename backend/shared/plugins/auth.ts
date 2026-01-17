import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const SERVICE_JWT_SECRET = process.env.SERVICE_JWT_SECRET;

if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
if (!SERVICE_JWT_SECRET) throw new Error('SERVICE_JWT_SECRET environment variable is required');

export interface AuthUser {
  userId: number;
  email: string;
  display_name?: string;
}

export interface ServiceAuthPayload {
  service: string;
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyRequest {
    service?: string; // Add service property for inter-service authentication
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateService: (request: FastifyRequest, reply: FastifyReply) => Promise<void>; // Add service authentication decorator
  }
}

async function authPlugin(fastify: FastifyInstance) {
  // User authentication decorator
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      const authHeader = request.headers.authorization;

      if (!authHeader) {
        fastify.log.warn({ url: request.url }, 'User auth missing authorization header');
        return reply.code(401).send({ error: 'Missing authorization header' });
      }

      const token = authHeader.replace('Bearer ', '');

      if (!token) {
        fastify.log.warn({ url: request.url }, 'User auth missing token');
        return reply.code(401).send({ error: 'Missing token' });
      }

      const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
      request.user = decoded;
      fastify.log.debug({ url: request.url, userId: decoded.userId }, 'User authenticated');

    } catch (error) {
      fastify.log.error({ error }, 'User authentication failed');
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }
  });

  // Service authentication decorator
  fastify.decorate('authenticateService', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      const authHeader = request.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Service ')) {
        fastify.log.warn(
          { url: request.url, authHeader },
          'Service auth missing or invalid header'
        );
        return reply.code(401).send({ error: 'Missing or invalid Service authorization header' });
      }

      const token = authHeader.replace('Service ', '');
      const decoded = verifyServiceToken(token); // Use the new verifyServiceToken function
      request.service = decoded.service;
      fastify.log.debug(
        { url: request.url, service: decoded.service },
        'Service authenticated'
      );

    } catch (error: any) {
      fastify.log.error({ error }, 'Service authentication failed');
      return reply.code(401).send({ error: error.message || 'Invalid or expired service token' });
    }
  });
}

export default fp(authPlugin);

// Utility function for user token generation
export function generateToken(userId: number, email: string): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
}

// Utility function for service token generation
export function generateServiceToken(serviceName: string): string {
  return jwt.sign({ service: serviceName }, SERVICE_JWT_SECRET, {
    expiresIn: '5m', // Short-lived token for inter-service communication
  });
}

// Utility function for service token verification
export function verifyServiceToken(token: string): ServiceAuthPayload {
  try {
    return jwt.verify(token, SERVICE_JWT_SECRET) as ServiceAuthPayload;
  } catch (error) {
    throw new Error('Invalid or expired internal service token');
  }
}
