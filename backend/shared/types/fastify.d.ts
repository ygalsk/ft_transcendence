import type { Database } from "better-sqlite3";
import type { FastifyRequest, FastifyReply } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;

    // Auth decorators injected by shared/plugins/auth.ts
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateService: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    user?: {
      userId: number;
      email: string;
      display_name: string;
    };

    // For inter-service auth (set by authenticateService)
    service?: string;
  }
}
