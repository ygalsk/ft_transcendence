import type { Database } from 'better-sqlite3';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    authenticate: any;
  }

  interface FastifyRequest {
    user?: {
      userId: number;
      email: string;
    };
  }
}
