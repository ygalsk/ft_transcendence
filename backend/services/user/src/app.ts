import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import multipart from '@fastify/multipart';
import fastify from 'fastify';
import { join } from 'path';

import dbPlugin from '../shared/plugins/db';
import authPlugin from '../shared/plugins/auth';
import prometheusPlugin from '../shared/plugins/prometheus';
import swaggerPlugin from '../shared/plugins/swagger';

import userRoutes from './routes/user.routes';
import internalRoutes from './routes/internal.routes';
import friendsRoutes from './routes/friends.routes';

// 👇 ADD THESE TWO IMPORTS
import tournamentRoutes from './routes/tournament.routes';
import internalTournamentRoutes from './routes/internal.tournament.routes';

export function buildApp() {
  const app = fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>();

  //enable file upload w limits
  app.register(multipart, {
    limits : {
      fileSize: 2 * 1024 * 1024, //2mb
      files: 1 //one file per request
    }
  });

  // Database
  app.register(dbPlugin, {
    path: process.env.DB_PATH || '/data/user.sqlite',
    schemaPath: join(__dirname, '../../db/schema.sql')
  });

  // Auth
  app.register(authPlugin);

  // Prometheus metrics
  app.register(prometheusPlugin);

  // Swagger
  app.register(swaggerPlugin, {
    serviceName: 'User Service',
    serverUrl: '/api/user'
  });

  // Public user routes
  app.register(userRoutes);

  // Internal user routes
  app.register(internalRoutes, { prefix: '/internal' });
  app.register(friendsRoutes);

  // ⭐ NEW: public tournament routes (e.g. /tournaments, /tournaments/:id)
  app.register(tournamentRoutes, { prefix: '/tournaments' });

  // ⭐ NEW: internal tournament routes (called from pong-service)
  // URLs like: /internal/tournaments/...
  app.register(internalTournamentRoutes, { prefix: '/internal/tournaments' });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', service: 'user' };
  });

  return app;
}
