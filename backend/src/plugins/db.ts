import fp from "fastify-plugin";
import Database from "better-sqlite3";

export default fp(async (fastify) => {
    const db = new Database("database.sqlite");
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          avatarUrl TEXT,
          oauth_provider TEXT,
          oauth_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    fastify.decorate("db", db);
});