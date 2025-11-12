import metricsPlugin from 'fastify-metrics';
import fastify from "fastify";
import db from "./plugins/db";
import auth from "./plugins/auth";
import websocket from "./plugins/websocket";
import userRoutes from "./routes/users";
import authRoutes from "./routes/auth";
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

export function buildApp() {
    const app = fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>();

    app.register(metricsPlugin, {
        endpoint: '/metrics',
        defaultMetrics: { enabled: true },
        routeMetrics: { enabled: true }
    });

    app.register(db);
    app.register(auth);
    app.register(websocket);

    app.register(userRoutes, { prefix: "/users" });
    app.register(authRoutes, { prefix: "/auth" });

    app.get("/health", async () => {
        return { status : "ok", message: "Server healthy!" };
    });

    return app;
}