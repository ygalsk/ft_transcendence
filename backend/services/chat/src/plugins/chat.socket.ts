import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { log } from "../utils/logger";

interface ClientData {
  userId: number;
  email?: string;
}

export function registerChatSocket(io: Server) {
  // 🔒 Authenticate users via JWT before connection
  io.use((socket, next) => {
    try {
      console.log("Handshake auth:", socket.handshake.auth);
      const token = socket.handshake.auth?.token;
      if (!token) throw new Error("Missing token");
      const user = jwt.verify(token, process.env.JWT_SECRET || "default_secret");
      (socket.data as ClientData) = user as ClientData;
      next();
    } catch (err: any) {
      next(new Error("Authentication failed: " + err.message));
    }
  });

  // 🧠 Socket event handlers
  io.on("connection", (socket: Socket) => {
    const user = socket.data as ClientData;
    log.success(`🔗 User connected: userId=${user.userId}`);

    socket.on("join", (room: string) => {
      socket.join(room);
      log.info(`User ${user.userId} joined room ${room}`);
      io.to(room).emit("system", `${user.email || "User"} joined ${room}`);
    });

    socket.on("message", ({ room, content }) => {
      if (!room || !content) return;

      // Store in DB
      let roomRow = db.prepare("SELECT id FROM chat_rooms WHERE name = ?").get(room);
      if (!roomRow) {
        const res = db.prepare("INSERT INTO chat_rooms (name) VALUES (?)").run(room);
        roomRow = { id: res.lastInsertRowid };
      }

      db.prepare(
        "INSERT INTO messages (room_id, sender_id, content) VALUES (?, ?, ?)"
      ).run(roomRow.id, user.userId, content);

      const payload = {
        type: "message",
        room,
        senderId: user.userId,
        content,
        timestamp: new Date().toISOString(),
      };

      io.to(room).emit("message", payload);
      log.info(`[Room ${room}] ${user.email || "User"}: ${content}`);
    });

    socket.on("disconnect", () => {
      log.warn(`❌ User disconnected: userId=${user.userId}`);
    });
  });
}
