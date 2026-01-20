import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type { Socket } from "socket.io";
import { getRoom } from "../game/room/registry";
import type { PlayerInput } from "../game/types";
import { CasualMatchmaker } from "./socket/matchmaking";
import { handleJoinMatch } from "./socket/join-match";
import { decodeUserToken, ensureSocketUser } from "./socket/user";
import type {
  CasualJoinPayload,
  InputPayload,
  JoinMatchPayload,
  SocketContext,
  SocketSession,
  SocketUser,
} from "./socket/types";

const DEFAULT_SCORE_LIMIT = 11;
const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL || "http://user-service:5000";

export default fp(async function pongSocketPlugin(fastify: FastifyInstance) {
  const matchmaker = new CasualMatchmaker(
    USER_SERVICE_URL,
    DEFAULT_SCORE_LIMIT
  );

  fastify.addHook("onReady", async () => {
    const io = fastify.io;

    io.use((socket, next) => {
      const decoded = decodeUserToken(fastify, socket);
      if (decoded) {
        socket.data.user = decoded;
      }
      next();
    });

    io.on("connection", async (socket: Socket) => {
      const session: SocketSession = {};
      socket.data.session = session;

      let user: SocketUser;
      try {
        user = await ensureSocketUser(fastify, socket, USER_SERVICE_URL);
      } catch (err) {
        fastify.log.error({ err }, "Failed to initialize socket user");
        socket.emit("error", { message: "Unable to initialize session" });
        socket.disconnect();
        return;
      }

      const ctx: SocketContext = { fastify, socket, user, session };

      socket.on("join_casual", (payload?: CasualJoinPayload) =>
        matchmaker.handleJoin(ctx, payload)
      );

      socket.on("join_match", (payload: JoinMatchPayload) =>
        handleJoinMatch(ctx, payload, DEFAULT_SCORE_LIMIT)
      );

      socket.on("input", (data: InputPayload) => handleInput(ctx, data));

      socket.on("disconnect", () => {
        fastify.log.info({ socketId: socket.id }, "Socket disconnected");
        matchmaker.handleDisconnect(socket.id);
        handleRoomDisconnect(ctx);
      });
    });
  });
});

function handleInput(ctx: SocketContext, data: InputPayload): void {
  const roomId = ctx.session.roomId;
  const side = ctx.session.side;
  if (!roomId || !side) return;

  const room = getRoom(roomId);
  if (!room) return;

  const input: PlayerInput = {
    up: !!data.up,
    down: !!data.down,
  };

  room.setInput(side, input);
}

function handleRoomDisconnect(ctx: SocketContext): void {
  const roomId = ctx.session.roomId;
  if (!roomId) return;

  const room = getRoom(roomId);
  if (!room) return;

  room.handleDisconnect(ctx.socket.id);
}
