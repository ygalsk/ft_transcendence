import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastify from 'fastify';
import { join } from 'path';

import dbPlugin from '../shared/plugins/db';
import authPlugin from '../shared/plugins/auth';
import swaggerPlugin from '../shared/plugins/swagger';
import prometheusPlugin from '../shared/plugins/prometheus';
import socketIOPlugin from '../shared/plugins/socketio';
import pongSocketPlugin from './plugins/pong.socket';
import matchRoutes from './routes/match.routes';
//import tournamentRoutes from  './routes/tournament.routes';

export function buildApp() {
  const app = fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>();

  // Database
  app.register(dbPlugin, {
    path: process.env.DB_PATH || '/data/pong.sqlite',
    schemaPath: join(__dirname, '../../db/schema.sql')
  });

  // Auth plugin (for HTTP routes)
  app.register(authPlugin);

  // Prometheus metrics
  app.register(prometheusPlugin);

  // Swagger
  app.register(swaggerPlugin, {
    serviceName: 'Pong Service',
    serverUrl: '/api/pong'
  });

  // Socket.IO plugin
  app.register(socketIOPlugin, {
    cors: { origin: '*' }
  });

  // Pong-specific Socket.IO handlers
  app.register(pongSocketPlugin);

  // Routes
  app.register(matchRoutes);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', service: 'pong' };
  });

  return app;
}
