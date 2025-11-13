import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastify from 'fastify';
import { join } from 'path';

import dbPlugin from '../shared/plugins/db';
import authPlugin from '../shared/plugins/auth';
import authRoutes from './routes/auth.routes';

export function buildApp() {
  const app = fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>();

  // Database
  app.register(dbPlugin, {
    path: process.env.DB_PATH || '/data/auth.sqlite',
    schemaPath: join(__dirname, '../../db/schema.sql')
  });

  // Auth
  app.register(authPlugin);

  // Routes
  app.register(authRoutes);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', service: 'auth' };
  });

  return app;
}