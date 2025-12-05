import { AiController } from "../ai";
import type {
  AiDifficulty,
  MatchConfig,
  PlayerSide,
  RoomPlayer,
} from "../types";
import type {
  MatchEndReason,
  RoomLogger,
  RoomPlayers,
} from "./types";

const DISCONNECT_GRACE_MS = 60_000;

export interface HumanPlayerParams {
  socketId: string;
  userId: number | null;
  displayName: string;
  avatarUrl?: string;
}

interface BasePlayerContext {
  roomId: string;
  players: RoomPlayers;
  spectators: RoomPlayer[];
  log: RoomLogger;
}

interface HumanPlayerContext extends BasePlayerContext {
  forceStart(): void;
}

interface AiPlayerContext extends BasePlayerContext {
  config: MatchConfig;
  aiControllers: Partial<Record<PlayerSide, AiController>>;
  maybeStartServing(): void;
}

interface DisconnectContext extends BasePlayerContext {
  finishMatch(winnerSide: PlayerSide, reason: MatchEndReason): void;
}

interface ReconnectContext extends BasePlayerContext {
  maybeStartServing(): void;
}

export function addHumanPlayer(
  ctx: HumanPlayerContext,
  params: HumanPlayerParams
): PlayerSide | null {
  const { socketId, userId, displayName, avatarUrl } = params;

  const joinAs = (side: PlayerSide): PlayerSide => {
    ctx.players[side] = {
      socketId,
      userId,
      displayName,
      avatarUrl,
      side,
      isAi: false,
      connected: true,
    };

    ctx.log("info", "Player joined room", {
      roomId: ctx.roomId,
      side,
      userId,
    });

    ctx.forceStart();
    return side;
  };

  if (!ctx.players.left) return joinAs("left");
  if (!ctx.players.right) return joinAs("right");

  ctx.spectators.push({
    socketId,
    userId,
    displayName,
    avatarUrl,
    side: "left",
    isAi: false,
    connected: true,
  });

  ctx.log("info", "Spectator joined room", {
    roomId: ctx.roomId,
    userId,
    displayName,
  });

  return null;
}

export function addAiPlayer(
  ctx: AiPlayerContext,
  side: PlayerSide,
  displayName = "AI",
  difficulty?: AiDifficulty
): void {
  if (ctx.players[side]) return;

  const fakeSocketId = `AI-${ctx.roomId}-${side}`;
  const chosenDifficulty: AiDifficulty =
    difficulty ?? ctx.config.aiDifficulty ?? "medium";

  ctx.players[side] = {
    socketId: fakeSocketId,
    userId: null,
    displayName,
    avatarUrl: undefined,
    side,
    isAi: true,
    connected: true,
  };

  ctx.aiControllers[side] = new AiController(side, chosenDifficulty);

  ctx.log("info", "AI player added", {
    roomId: ctx.roomId,
    side,
    difficulty: chosenDifficulty,
  });

  ctx.maybeStartServing();
}

export function handleDisconnect(
  ctx: DisconnectContext,
  socketId: string
): void {
  for (const side of ["left", "right"] as PlayerSide[]) {
    const player = ctx.players[side];
    if (player && player.socketId === socketId && !player.isAi) {
      player.connected = false;
      ctx.log("info", "Player disconnected", {
        roomId: ctx.roomId,
        side,
        userId: player.userId,
      });
      startDisconnectTimer(ctx, side);
      return;
    }
  }

  removeSpectator(ctx.spectators, socketId);
}

export function handleReconnect(
  ctx: ReconnectContext,
  params: { socketId: string; userId: number }
): PlayerSide | null {
  const { socketId, userId } = params;

  for (const side of ["left", "right"] as PlayerSide[]) {
    const player = ctx.players[side];
    if (player && player.userId === userId && !player.isAi) {
      player.socketId = socketId;
      player.connected = true;

      if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
        player.disconnectTimer = undefined;
      }

      ctx.log("info", "Player reconnected", {
        roomId: ctx.roomId,
        side,
        userId,
      });
      ctx.maybeStartServing();
      return side;
    }
  }

  return null;
}

function startDisconnectTimer(
  ctx: DisconnectContext,
  side: PlayerSide
): void {
  const player = ctx.players[side];
  if (!player || player.disconnectTimer) return;

  player.disconnectTimer = setTimeout(() => {
    const current = ctx.players[side];
    if (!current || current.connected) return;

    const other: PlayerSide = side === "left" ? "right" : "left";
    ctx.log("warn", "Player lost by disconnect", {
      roomId: ctx.roomId,
      disconnectedSide: side,
      winnerSide: other,
    });
    ctx.finishMatch(other, "disconnect");
  }, DISCONNECT_GRACE_MS);
}

function removeSpectator(spectators: RoomPlayer[], socketId: string): void {
  const index = spectators.findIndex((s) => s.socketId === socketId);
  if (index >= 0) {
    spectators.splice(index, 1);
  }
}
