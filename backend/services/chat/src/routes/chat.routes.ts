import { FastifyInstance } from "fastify";
import db from "../../../../shared/plugins/db";

export async function chatRoutes(fastify: FastifyInstance) {
  // 📜 Get last 50 messages from a room
  fastify.get("/rooms/:room/messages", async (req, reply) => {
    const { room } = req.params as { room: string };
    const roomRow = db.prepare("SELECT id FROM chat_rooms WHERE name = ?").get(room);
    if (!roomRow) return reply.code(404).send({ error: "Room not found" });

    const messages = db
      .prepare("SELECT * FROM messages WHERE room_id = ? ORDER BY id DESC LIMIT 50")
      .all(roomRow.id);

    return reply.send({ messages });
  });
}
