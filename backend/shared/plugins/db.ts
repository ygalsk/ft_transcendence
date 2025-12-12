import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface DbPluginOptions {
  path: string;
  schema?: string;
  schemaPath?: string;  // Path to .sql file
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Database.Database;
  }
}

async function dbPlugin(fastify: FastifyInstance, opts: DbPluginOptions) {
  const db = new Database(opts.path);
  // Reduce "database is locked" stalls but allow a short wait
  db.pragma('busy_timeout = 8000');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Initialize schema from string or file
  let schema = opts.schema;
  if (opts.schemaPath) {
    schema = readFileSync(opts.schemaPath, 'utf-8');
  }

  if (schema) {
    db.exec(schema);
  }

  fastify.decorate('db', db);

  fastify.addHook('onClose', async () => {
    db.close();
  });

  fastify.log.info({ dbPath: opts.path }, 'Database initialized');
}

export default fp(dbPlugin);
