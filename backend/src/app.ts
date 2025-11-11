import metricsPlugin from 'fastify-metrics';
import fastify from "fastify";
import db from "./plugins/db";
import auth from "./plugins/auth";
import websocket from "./plugins/websocket";
import userRoutes from "./routes/users";
// import authRoutes from "./routes/auth";

export function buildApp() {
    const app = fastify({ logger: true });

    app.register(metricsPlugin, {
        endpoint: '/metrics',
        defaultMetrics: { enabled: true },
        routeMetrics: { enabled: true }
    });
    app.register(db);
    app.register(auth);
    app.register(websocket);

    app.register(userRoutes, { prefix: "/users" });
    // app.register(authRoutes, { prefix: "/auth" });

    app.get("/health", async () => {
        return { status : "ok", message: "Server healthy!" };
    });

    app.get("/db-test", async () => {
        // @ts-ignore
        const result = app.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        return { tables: result };
    });

    return app;
}