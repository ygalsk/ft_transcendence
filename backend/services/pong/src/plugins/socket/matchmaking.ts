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
import { pongMatchmakingQueueSize } from "../../metrics/pong.metrics";

export class CasualMatchmaker {
  private waiting: Socket | null = null;

  constructor(
    private readonly userServiceUrl: string, //dont remove
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
          "Failed to assign side in Human vs Ai match"
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

    // Human vs Human matchmaking
    if (!this.waiting) {
      this.waiting = socket;
      
      // Track queue size increase
      pongMatchmakingQueueSize.set(1);
      
      socket.emit("waiting", { message: " Waiting for opponent..." });
      fastify.log.info({ socketId: socket.id }, "Player added to matchmaking queue");
      return;
    }

    if (this.waiting.id === socket.id) return;

    const p1 = this.waiting;
    const p1User = this.getUser(p1);
    this.waiting = null;
    
    // Track queue emptied
    pongMatchmakingQueueSize.set(0);

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

    if (!p1Side) {
      fastify.log.error({ matchId, userId: p1User.userId }, "Failed to assign side to p1");
      p1.emit("error", { message: "Unable to join match" });
      socket.emit("error", { message: "Unable to join match" });
      return;
    }

    const p2Side = room.addHumanPlayer({
      socketId: socket.id,
      userId: user.userId,
      displayName,
      avatarUrl: undefined,
    });

    if (!p2Side) {
      fastify.log.error({ matchId, userId: user.userId }, "Failed to assign side to p2");
      socket.emit("error", { message: "Unable to join match" });
      p1.emit("error", { message: "Unable to join match" });
      return;
    }

    (p1.data.session as SocketSession).roomId = room.id;
    (p1.data.session as SocketSession).side = p1Side;
    session.roomId = room.id;
    session.side = p2Side;

    p1.join(room.id);
    socket.join(room.id);

    p1.emit("match_start", {
      matchId: room.id,
      you: p1Side,
      opponent: displayName,
      mode: "casual",
    });
    socket.emit("match_start", {
      matchId: room.id,
      you: p2Side,
      opponent: getDisplayName(p1User),
      mode: "casual",
    });

    const startAt = emitMatchReady(fastify, room, "casual");
    scheduleStart(room, startAt);
    fastify.log.info(
      { roomId: room.id, p1Side, p2Side },
      "Casual PvP match started"
    );
  }

  public handleDisconnect(socketId: string): void {
    if (this.waiting?.id === socketId) {
      this.waiting = null;
      
      // Track queue emptied
      pongMatchmakingQueueSize.set(0);
    }
  }

  private getUser(socket: Socket): SocketUser {
    return socket.data.user as SocketUser;
  }
}
