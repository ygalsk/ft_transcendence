import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { AuthUser } from './auth';
import type { Server as HTTPServer } from 'node:http';

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

export interface SocketData {
  user?: AuthUser & { display_name?: string };
  roomId?: string;
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    io: SocketIOServer<any, any, any, SocketData>;
    httpServer: HTTPServer;
  }
}

interface SocketIOPluginOptions {
  cors?: {
    origin: string | string[];
    methods?: string[];
    credentials?: boolean;
  };
  path?: string;
}

async function socketIOPlugin(fastify: FastifyInstance, options: SocketIOPluginOptions = {}) {
  // Use Fastify's existing HTTP server
  const httpServer = fastify.server;

  // Create Socket.IO server with typed SocketData
  const io: SocketIOServer<any, any, any, SocketData> = new SocketIOServer(httpServer, {
    cors: options.cors || { origin: '*' },
    path: options.path || '/socket.io',
  });

  // Debug logging
  io.engine.on("connection_error", (err) => {
    fastify.log.error({ error: err }, "Socket.IO connection error");
  });

  // JWT Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        fastify.log.warn('Socket.IO connection attempt without token');
        return next(new Error('Missing authentication token'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;

      // Attach user data to socket
      socket.data.user = decoded;

      fastify.log.info({ userId: decoded.userId, email: decoded.email }, 'Socket.IO user authenticated');
      next();

    } catch (error: any) {
      fastify.log.error({ error: error.message }, 'Socket.IO authentication failed');
      next(new Error('Invalid or expired token'));
    }
  });

  // Attach to Fastify instance
  fastify.decorate('io', io);
  fastify.decorate('httpServer', httpServer);

  // Close handler
  fastify.addHook('onClose', async () => {
    io.close();
  });

  fastify.log.info('Socket.IO plugin initialized');
}

export default fp(socketIOPlugin, {
  name: 'socketio-plugin',
});
