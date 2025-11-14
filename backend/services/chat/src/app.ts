import Fastify from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { createServer } from "http";
import { log } from "./utils/logger";

(async () => {
  try {
    const fastify = Fastify({ logger: false });

    // 2️⃣ Add a simple health check route
    fastify.get("/health", async () => {
      return { ok: true, service: "chat-service" };
    });

    // 3️⃣ Create HTTP server *from Fastify’s underlying Node handler*
    const httpServer = createServer(fastify.server);

    // 4️⃣ Attach Socket.IO to same HTTP server
    const io = new SocketIOServer(httpServer, {
      cors: { origin: "*" },
    });

    io.on("connection", (socket) => {
      log.success(`🔗 Client connected: ${socket.id}`);

      socket.on("join", (room) => {
        socket.join(room);
        log.info(`User ${socket.id} joined room ${room}`);
        io.to(room).emit("system", `User ${socket.id} joined ${room}`);
      });

      socket.on("message", ({ room, content }) => {
        log.info(`[${room}] ${socket.id}: ${content}`);
        io.to(room).emit("message", {
          type: "message",
          room,
          senderId: socket.id,
          content,
          timestamp: new Date().toISOString(),
        });
      });

      socket.on("disconnect", (reason) => {
        log.warn(`❌ Disconnected: ${socket.id} (${reason})`);
      });
    });

    // 5️⃣ Start the combined server
    const port = Number(process.env.CHAT_PORT) || 6000;
    httpServer.listen(port, "0.0.0.0", () => {
      log.success(`✅ Chat service listening on port ${port} 🚀`);
    });
  } catch (err: any) {
    log.error(`❌ Chat failed to start: ${err.message}`);
    console.error(err);
  }
})();
