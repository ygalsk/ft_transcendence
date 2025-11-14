import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { Socket } from 'socket.io';
import { rooms, endMatch } from '../game/room';
import { handlePlayerJoin, handlePlayerLeave } from '../game/matchmaking';
import { updatePaddlePosition } from '../game/physics';

async function pongSocketPlugin(fastify: FastifyInstance) {
  // Wait for Socket.IO to be ready
  fastify.addHook('onReady', async () => {
    fastify.io.on("connection", async (socket: Socket) => {
      // User is already authenticated by socketIOPlugin middleware
      const user = socket.data.user;
      if (!user) {
        fastify.log.warn('Socket connected without user data');
        return;
      }

      // Fetch display name from User service
      let display_name = user.email;
      try {
        const res = await fetch(`${process.env.USER_SERVICE_URL || 'http://user-service:5000'}/users/${user.userId}`);
        if (res.ok) {
          const data = await res.json() as { display_name?: string };
          display_name = data.display_name || user.email;
        }
      } catch {
        fastify.log.warn({ userId: user.userId }, "Could not fetch display name for user");
      }

      socket.data.user = { ...user, display_name };
      fastify.log.info({ userId: user.userId, displayName: display_name }, `Player authenticated`);

      // Handle matchmaking
      handlePlayerJoin(fastify, socket);

      // Handle paddle movement
      socket.on("move", (data: { y: number }) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;

        updatePaddlePosition(room, socket.id, data.y);
      });

      // Handle disconnect
      socket.on("disconnect", () => {
        fastify.log.info({ socketId: socket.id }, `Player disconnected`);

        // Remove from matchmaking queue
        handlePlayerLeave(socket);

        // Handle in-game disconnect
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;

        // Opponent wins by forfeit
        const winner = room.left.socket.id === socket.id ? "right" : "left";
        endMatch(fastify, room, winner);
      });
    });
  });
}

export default fp(pongSocketPlugin, {
  name: 'pong-socket-plugin',
  dependencies: ['socketio-plugin'] // Depends on the shared Socket.IO plugin
});
