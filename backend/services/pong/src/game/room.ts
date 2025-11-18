//
// src/game/room.ts
//

import {
  BallState,
  GameState,
  MatchConfig,
  PlayerInput,
  PlayerSide,
  RoomPlayer,
  ScoreState,
  SerializedGameState,
} from "./types";
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  MS_PER_TICK,
  PADDLE_HEIGHT,
  applyPlayerInput,
  createInitialBall,
  createInitialPaddles,
  resetBall,
  updateBall,
} from "./physics";
import { AiController } from "./ai";

// ---------------------------
// Match end types
// ---------------------------

export type MatchEndReason = "normal" | "disconnect" | "forfeit";

export interface MatchFinishedPayload {
  matchId: string;
  tournamentId?: number;
  winnerSide: PlayerSide;
  score: ScoreState;
  leftPlayer: RoomPlayer | null;
  rightPlayer: RoomPlayer | null;
  reason: MatchEndReason;
}

// ---------------------------
// Room constants
// ---------------------------

const DISCONNECT_GRACE_MS = 60_000; // 60s grace like chess.com
const SERVE_DELAY_MS = 1_000;       // 1s pause before each serve

// ---------------------------
// Room class
// ---------------------------

export class Room {
  public readonly id: string;
  public readonly config: MatchConfig;

  public state: GameState = "waiting";

  public paddles: { left: { y: number; height: number }; right: { y: number; height: number } };
  public ball: BallState;
  public score: ScoreState = { left: 0, right: 0 };

  public players: { left: RoomPlayer | null; right: RoomPlayer | null } = {
    left: null,
    right: null,
  };
  public spectators: RoomPlayer[] = [];

  private lastInput: Record<PlayerSide, PlayerInput> = {
    left: { up: false, down: false },
    right: { up: false, down: false },
  };

  private tickTimer: NodeJS.Timeout | null = null;
  private serveTimer: NodeJS.Timeout | null = null;
  private aiControllers: Partial<Record<PlayerSide, AiController>> = {};

  private createdAt: number = Date.now();
  private finishedAt?: number;
  private currentServeSide: PlayerSide | null = null;

  // Hooks to be plugged in by WS / tournament / app layer
  public broadcastState: (state: SerializedGameState) => void = () => {};
  public onMatchFinished: (payload: MatchFinishedPayload) => void = () => {};
  public log: (level: "info" | "warn" | "error", message: string, meta?: any) => void = () => {};

  constructor(id: string, config: MatchConfig) {
    this.id = id;
    this.config = config;

    this.paddles = createInitialPaddles();
    this.ball = createInitialBall();
  }

  // ---------------------------
  // Lifecycle
  // ---------------------------

  public start(): void {
    if (this.tickTimer) return;
    this.state = "waiting";
    this.tickTimer = setInterval(() => this.tick(), MS_PER_TICK);
  }

  public stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.serveTimer) {
      clearTimeout(this.serveTimer);
      this.serveTimer = null;
    }
    // Clear any disconnect timers
    (["left", "right"] as PlayerSide[]).forEach((side) => {
      const p = this.players[side];
      if (p?.disconnectTimer) {
        clearTimeout(p.disconnectTimer);
        p.disconnectTimer = undefined;
      }
    });
  }

  // ---------------------------
  // Player Management
  // ---------------------------

  /**
   * Add a human player to the room.
   * Returns assigned side ('left' | 'right') or null if added as spectator.
   */
  public addHumanPlayer(params: {
    socketId: string;
    userId: number | null;
    displayName: string;
    avatarUrl?: string;
  }): PlayerSide | null {
    const { socketId, userId, displayName, avatarUrl } = params;

    // Left free?
    if (!this.players.left) {
      this.players.left = {
        socketId,
        userId,
        displayName,
        avatarUrl,
        side: "left",
        isAi: false,
        connected: true,
      };
      this.log("info", "Player joined room", { roomId: this.id, side: "left", userId });
      this.maybeStartServing();
      return "left";
    }

    // Right free?
    if (!this.players.right) {
      this.players.right = {
        socketId,
        userId,
        displayName,
        avatarUrl,
        side: "right",
        isAi: false,
        connected: true,
      };
      this.log("info", "Player joined room", { roomId: this.id, side: "right", userId });
      this.maybeStartServing();
      return "right";
    }

    // Otherwise spectator
    this.spectators.push({
      socketId,
      userId,
      displayName,
      avatarUrl,
      side: "left", // arbitrary; not used for spectators
      isAi: false,
      connected: true,
    });
    this.log("info", "Spectator joined room", { roomId: this.id, userId, displayName });
    return null;
  }

  public addAi(side: PlayerSide, displayName = "AI"): void {
    if (this.players[side]) return; // already have a player
    const fakeSocketId = `AI-${this.id}-${side}`;
    this.players[side] = {
      socketId: fakeSocketId,
      userId: null,
      displayName,
      avatarUrl: undefined,
      side,
      isAi: true,
      connected: true,
    };
    this.aiControllers[side] = new AiController(side);
    this.log("info", "AI player added", { roomId: this.id, side });
    this.maybeStartServing();
  }

  /**
   * Mark a socket as disconnected and start grace timer.
   */
  public handleDisconnect(socketId: string): void {
    for (const side of ["left", "right"] as PlayerSide[]) {
      const player = this.players[side];
      if (player && player.socketId === socketId && !player.isAi) {
        player.connected = false;
        this.log("info", "Player disconnected", { roomId: this.id, side, userId: player.userId });
        this.startDisconnectTimer(side);
        return;
      }
    }

    // If spectator, just remove them
    this.spectators = this.spectators.filter((s) => s.socketId !== socketId);
  }

  /**
   * Reconnect a human player (same userId) to the room.
   */
  public handleReconnect(params: {
    socketId: string;
    userId: number;
  }): PlayerSide | null {
    const { socketId, userId } = params;

    for (const side of ["left", "right"] as PlayerSide[]) {
      const player = this.players[side];
      if (player && player.userId === userId && !player.isAi) {
        player.socketId = socketId;
        player.connected = true;

        if (player.disconnectTimer) {
          clearTimeout(player.disconnectTimer);
          player.disconnectTimer = undefined;
        }

        this.log("info", "Player reconnected", { roomId: this.id, side, userId });
        this.maybeStartServing();
        return side;
      }
    }

    return null;
  }

  private startDisconnectTimer(side: PlayerSide): void {
    const player = this.players[side];
    if (!player || player.disconnectTimer) return;

    player.disconnectTimer = setTimeout(() => {
      const current = this.players[side];
      if (!current || current.connected) return;

      // Opponent wins by disconnect
      const other: PlayerSide = side === "left" ? "right" : "left";
      this.log("warn", "Player lost by disconnect", {
        roomId: this.id,
        disconnectedSide: side,
        winnerSide: other,
      });
      this.finishMatch(other, "disconnect");
    }, DISCONNECT_GRACE_MS);
  }

  // ---------------------------
  // Input Handling
  // ---------------------------

  public setInput(side: PlayerSide, input: PlayerInput): void {
    this.lastInput[side] = input;
  }

  // ---------------------------
  // Main Tick Loop
  // ---------------------------

  private tick(): void {
    if (this.state === "finished") return;

    const hasLeft = !!this.players.left;
    const hasRight = !!this.players.right;

    const leftReady = this.players.left?.connected ?? false;
    const rightReady = this.players.right?.connected ?? false;

    // If we don't have two active players (or AI), we shouldn't move the ball
    if (!hasLeft || !hasRight || !leftReady || !rightReady) {
      this.state = "waiting";
      this.broadcastState(this.getSerializedState());
      return;
    }

    // If we are waiting/starting/paused, the serve timer will eventually set us to "playing"
    if (this.state === "waiting" || this.state === "starting" || this.state === "paused") {
      this.broadcastState(this.getSerializedState());
      return;
    }

    // 1) AI updates (reads state no more than once per second)
    this.updateAiInputs();

    // 2) Apply inputs to paddles
    if (this.players.left) {
      applyPlayerInput(this.paddles.left, this.lastInput.left);
    }
    if (this.players.right) {
      applyPlayerInput(this.paddles.right, this.lastInput.right);
    }

    // 3) Update ball & score
    const result = updateBall(this.ball, this.paddles, this.score);

    // 4) Check if someone scored
    if (result.scored) {
      const scoredSide = result.scored;
      const concededSide: PlayerSide = scoredSide === "left" ? "right" : "left";

      // Check win condition
      if (
        this.score.left >= this.config.scoreLimit ||
        this.score.right >= this.config.scoreLimit
      ) {
        const winnerSide: PlayerSide =
          this.score.left > this.score.right ? "left" : "right";
        this.finishMatch(winnerSide, "normal");
      } else {
        // Pause, then serve from the side that conceded (loser serves)
        this.state = "paused";
        this.scheduleServe(concededSide);
      }
    }

    // 5) Broadcast state
    this.broadcastState(this.getSerializedState());
  }

  // ---------------------------
  // Serving Logic
  // ---------------------------

  private maybeStartServing(): void {
    // Start serving only when both sides are connected or AI is present
    const leftReady = this.players.left?.connected ?? false;
    const rightReady = this.players.right?.connected ?? false;

    if (!leftReady || !rightReady) return;

    if (!this.currentServeSide) {
      // First serve: random
      this.currentServeSide = Math.random() < 0.5 ? "left" : "right";
    }

    if (this.state === "waiting") {
      this.scheduleServe(this.currentServeSide);
    }
  }

  private scheduleServe(servingSide: PlayerSide): void {
    this.currentServeSide = servingSide;
    if (this.serveTimer) {
      clearTimeout(this.serveTimer);
      this.serveTimer = null;
    }

    this.state = "starting";

    this.serveTimer = setTimeout(() => {
      resetBall(this.ball, servingSide);
      this.state = "playing";
      this.broadcastState(this.getSerializedState());
    }, SERVE_DELAY_MS);
  }

  // ---------------------------
  // AI Handling
  // ---------------------------

  private updateAiInputs(): void {
    for (const side of ["left", "right"] as PlayerSide[]) {
      const player = this.players[side];
      if (!player?.isAi) continue;

      const controller = this.aiControllers[side];
      if (!controller) continue;

      const input = controller.getInput(this.getSerializedState());
      this.lastInput[side] = input;
    }
  }

  // ---------------------------
  // Match End
  // ---------------------------

  private finishMatch(winnerSide: PlayerSide, reason: MatchEndReason): void {
    if (this.state === "finished") return;

    this.state = "finished";
    this.finishedAt = Date.now();
    this.stop();

    const payload: MatchFinishedPayload = {
      matchId: this.id,
      tournamentId: this.config.tournamentId,
      winnerSide,
      score: { ...this.score },
      leftPlayer: this.players.left,
      rightPlayer: this.players.right,
      reason,
    };

    this.onMatchFinished(payload);
    // also broadcast final state
    this.broadcastState(this.getSerializedState());
  }

  // ---------------------------
  // State Serialization
  // ---------------------------

  public getSerializedState(): SerializedGameState {
    const left = this.players.left;
    const right = this.players.right;

    return {
      state: this.state,
      ball: this.ball,
      paddles: {
        left: this.paddles.left,
        right: this.paddles.right,
      },
      score: { ...this.score },
      players: {
        left: {
          displayName: left?.displayName ?? "Waiting...",
          avatarUrl: left?.avatarUrl,
          userId: left?.userId ?? null,
        },
        right: {
          displayName: right?.displayName ?? "Waiting...",
          avatarUrl: right?.avatarUrl,
          userId: right?.userId ?? null,
        },
      },
      meta: {
        roomId: this.id,
        timestamp: Date.now(),
        isTournament: !!this.config.tournamentId,
        tournamentId: this.config.tournamentId,
      },
    };
  }
}

// ---------------------------
// Room Registry (global map)
// ---------------------------

export const rooms = new Map<string, Room>();

export function createRoom(id: string, config: MatchConfig): Room {
  const room = new Room(id, config);
  rooms.set(id, room);
  room.start();
  return room;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

export function removeRoom(id: string): void {
  const room = rooms.get(id);
  if (room) {
    room.stop();
    rooms.delete(id);
  }
}
