import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { AuthUser } from './auth';
import type { Server as HTTPServer } from 'node:http';
import client from 'prom-client';

if (!process.env.JWT_SECRET)
  throw new Error('JWT_SECRET environment variable is required');

const JWT_SECRET: string = process.env.JWT_SECRET;

// Socket.IO metrics

//connections, disconnections, errors
const socketioConnectionsTotal = new client.Counter({
  name: 'socketio_connections_total',
  help: 'Total number of Socket.IO connections',
  labelNames: ['status', 'service'],
});

const socketioConnectedClients = new client.Gauge({
  name: 'socketio_connected_clients',
  help: 'Current number of connected Socket.IO clients',
  labelNames: ['service'],
});

//all emitted socket events by name
const socketioEventsTotal = new client.Counter({
  name: 'socketio_events_total',
  help: 'Total number of Socket.IO events',
  labelNames: ['event_type', 'service'],
});

// auth success, failure, guest connections
const socketioAuthAttempts = new client.Counter({
  name: 'socketio_auth_attempts_total',
  help: 'Total Socket.IO authentication attempts',
  labelNames: ['status', 'service'],
});

// per socket state, attached to socket.data
export interface SocketData {
  user: (AuthUser & { display_name?: string }) | null;
  roomId?: string;
}

// type safe
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
  serviceName?: string;
}

async function socketIOPlugin(fastify: FastifyInstance, options: SocketIOPluginOptions = {}) {

  const serviceName = options.serviceName || 'unknown';

  // Fastify's existing HTTP server
  const httpServer = fastify.server;

  // Create Socket.IO server with typed SocketData on top of fastify
  const io: SocketIOServer<any, any, any, SocketData> = new SocketIOServer(httpServer, {
    cors: options.cors || { origin: '*' },
    path: options.path || '/socket.io',
  });

  // catch transport level failure
  io.engine.on("connection_error", (err) => {
    fastify.log.error({ error: err }, "Socket.IO connection error");
    socketioConnectionsTotal.inc({ status: 'error', service: serviceName });
  });

  // JWT auth middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token; //from client during connection

    // No token, treat as guest
    if (!token) {
      socket.data.user = null;  
      fastify.log.info('Guest connected to WebSocket service');
      socketioAuthAttempts.inc({ status: 'guest', service: serviceName });
      return next();
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;

      socket.data.user = decoded;

      fastify.log.info(
        { userId: decoded.userId, email: decoded.email },
        'Socket.IO user authenticated'
      );

      socketioAuthAttempts.inc({ status: 'success', service: serviceName });
      next();

    } catch (error: any) {
      fastify.log.warn({ error: error.message }, 'Invalid JWT, treating as guest');
      // Treat invalid token as guest
      socket.data.user = null;
      socketioAuthAttempts.inc({ status: 'failure', service: serviceName });
      next();
    }
  });

  // Track new connection
  io.on('connection', (socket) => {
    socketioConnectionsTotal.inc({ status: 'connected', service: serviceName });
    socketioConnectedClients.inc({ service: serviceName });

    fastify.log.info({ socketId: socket.id }, 'Socket.IO client connected');

    // Track disconnection
    socket.on('disconnect', (reason) => {
      socketioConnectionsTotal.inc({ status: 'disconnected', service: serviceName });
      socketioConnectedClients.dec({ service: serviceName });

      fastify.log.info({ socketId: socket.id, reason }, 'Socket.IO client disconnected');
    });

    // Track all socket events
    socket.onAny((eventName) => {
      socketioEventsTotal.inc({ event_type: eventName, service: serviceName });
    });
  });

  // Attach to Fastify instance
  fastify.decorate('io', io);
  fastify.decorate('httpServer', httpServer);

  // Close handler
  fastify.addHook('onClose', async () => {
    io.close();
  });

  fastify.log.info(`Socket.IO plugin initialized for service: ${serviceName}`);
}

export default fp(socketIOPlugin, {
  name: 'socketio-plugin',
});
