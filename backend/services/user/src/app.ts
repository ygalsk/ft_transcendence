import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastify from 'fastify';
import { join } from 'path';

import dbPlugin from '../shared/plugins/db';
import userRoutes from './routes/user.routes';
import internalRoutes from './routes/internal.routes';

export function buildApp() {
  const app = fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>();

  // Database
  app.register(dbPlugin, {
    path: process.env.DB_PATH || '/data/user.sqlite',
    schemaPath: join(__dirname, '../../db/schema.sql')
  });

  // Routes
  app.register(userRoutes);
  app.register(internalRoutes, { prefix: '/internal' });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', service: 'user' };
  });

  return app;
}
