import type { Socket } from "socket.io";
import type { MatchConfig, PlayerSide } from "../../game/types";
import type {
  CasualJoinPayload,
  SocketContext,
  SocketSession,
  SocketUser,
} from "./types";
import { setupRoom } from "./room-setup";
import { emitMatchReady, scheduleStart } from "./notifications";
import { getDisplayName } from "./user";

export class CasualMatchmaker {
  private waiting: Socket | null = null;

  constructor(
    private readonly userServiceUrl: string,
    private readonly defaultScoreLimit: number
  ) {}

  public handleJoin(ctx: SocketContext, payload?: CasualJoinPayload): void {
    const { fastify, socket, user, session } = ctx;
    const vsAi = payload?.vsAi ?? false;
    const difficulty = payload?.difficulty ?? "easy";
    const displayName = getDisplayName(user);

    if (vsAi) {
      const matchId = `casual-${socket.id}-${Date.now()}`;
      const config: MatchConfig = {
        scoreLimit: this.defaultScoreLimit,
        allowSpectators: true,
        enableAi: true,
        aiDifficulty: difficulty,
      };

      const room = setupRoom(fastify, matchId, config);
      const side: PlayerSide | null = room.addHumanPlayer({
        socketId: socket.id,
        userId: user.userId,
        displayName,
        avatarUrl: undefined,
      });

      if (!side) {
        fastify.log.error(
          { matchId, userId: user.userId },
          "Failed to assign side in vsAi match"
        );
        socket.emit("error", { message: "Unable to join match" });
        return;
      }

      const aiSide: PlayerSide = side === "left" ? "right" : "left";
      room.addAi(aiSide, `AI (${difficulty})`, difficulty);

      session.roomId = room.id;
      session.side = side;
      socket.join(room.id);

      socket.emit("match_start", {
        matchId: room.id,
        you: side,
        opponent: `AI (${difficulty})`,
        mode: "casual",
      });

      const startAt = emitMatchReady(fastify, room, "casual", { aiDifficulty: difficulty });
      scheduleStart(room, startAt);
      fastify.log.info(
        { roomId: room.id, playerSide: side, as: displayName, difficulty },
        "Casual vs AI match started"
      );
      return;
    }

    if (!this.waiting) {
      this.waiting = socket;
      socket.emit("waiting", { message: "🕐 Waiting for opponent..." });
      fastify.log.info({ socketId: socket.id }, "Player added to matchmaking queue");
      return;
    }

    if (this.waiting.id === socket.id) return;

    const p1 = this.waiting;
    const p1User = this.getUser(p1);
    this.waiting = null;

    const matchId = `casual-${p1.id}-${socket.id}-${Date.now()}`;
    const config: MatchConfig = {
      scoreLimit: this.defaultScoreLimit,
      allowSpectators: true,
      enableAi: false,
    };

    const room = setupRoom(fastify, matchId, config);

    const p1Side = room.addHumanPlayer({
      socketId: p1.id,
      userId: p1User.userId,
      displayName: getDisplayName(p1User),
      avatarUrl: undefined,
    });

    const p2Side = room.addHumanPlayer({
      socketId: socket.id,
      userId: user.userId,
      displayName,
      avatarUrl: undefined,
    });

    if (!p1Side || !p2Side) {
      fastify.log.error({ matchId }, "Failed to assign sides in casual matchmaking");
      p1.emit("error", { message: "Failed to create match" });
      socket.emit("error", { message: "Failed to create match" });
      return;
    }

    const p1Session = this.getSession(p1);
    p1Session.roomId = room.id;
    p1Session.side = p1Side;

    session.roomId = room.id;
    session.side = p2Side;

    p1.join(room.id);
    socket.join(room.id);

    const left = room.players.left;
    const right = room.players.right;

    p1.emit("match_start", {
      matchId: room.id,
      you: p1Side,
      opponent: p1Side === "left" ? right?.displayName : left?.displayName,
      mode: "casual",
    });

    socket.emit("match_start", {
      matchId: room.id,
      you: p2Side,
      opponent: p2Side === "left" ? right?.displayName : left?.displayName,
      mode: "casual",
    });

    const startAt = emitMatchReady(fastify, room, "casual");
    scheduleStart(room, startAt);
    fastify.log.info(
      {
        roomId: room.id,
        leftUserId: left?.userId,
        rightUserId: right?.userId,
      },
      "Casual human-vs-human match started"
    );
  }

  public handleDisconnect(socketId: string): void {
    if (this.waiting?.id === socketId) {
      this.waiting = null;
    }
  }

  private getSession(socket: Socket): SocketSession {
    if (!socket.data.session) {
      socket.data.session = {};
    }
    return socket.data.session as SocketSession;
  }

  private getUser(socket: Socket): SocketUser {
    return (
      (socket.data.user as SocketUser | undefined) ?? {
        userId: null,
        email: null,
        display_name: "Guest",
      }
    );
  }
}
