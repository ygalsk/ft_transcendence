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
  AiDifficulty,
} from "./types";
import {
  MS_PER_TICK,
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
  tournamentMatchId?: number;
  winnerSide: PlayerSide;
  score: ScoreState;
  leftPlayer: RoomPlayer | null;
  rightPlayer: RoomPlayer | null;
  reason: MatchEndReason;
}

// ---------------------------
// Room constants
// ---------------------------

const DISCONNECT_GRACE_MS = 60_000; // 60s grace
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

  // Hooks to be plugged by WS / outer layer
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

  // ============================================
//  PUBLIC: Force game loop & serving to begin
// ============================================
  public forceStart(): void {
    // Start the game loop (if not already running)
    this.start();

    // Kick off serving when both players are connected
    this.state = "waiting";
    this.maybeStartServing();
  }

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

  public addHumanPlayer(params: {
    socketId: string;
    userId: number | null;
    displayName: string;
    avatarUrl?: string;
  }): PlayerSide | null {
    const { socketId, userId, displayName, avatarUrl } = params;

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
      this.forceStart();         // 👈 only this
      return "left";
    }

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
      this.forceStart();          // 👈 only this
      return "right";
    }

    this.spectators.push({
      socketId,
      userId,
      displayName,
      avatarUrl,
      side: "left",
      isAi: false,
      connected: true,
    });
    this.log("info", "Spectator joined room", { roomId: this.id, userId, displayName });
    return null;
  }

  // ---------------------------
  // AI
  // ---------------------------

  public addAi(
    side: PlayerSide,
    displayName = "AI",
    difficulty?: AiDifficulty
  ): void {
    if (this.players[side]) return;

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

    const chosenDifficulty: AiDifficulty =
      difficulty ?? this.config.aiDifficulty ?? "medium";

    this.aiControllers[side] = new AiController(side, chosenDifficulty);

    this.log("info", "AI player added", {
      roomId: this.id,
      side,
      difficulty: chosenDifficulty,
    });

    this.maybeStartServing();
  }

  // ---------------------------
  // Disconnect handling
  // ---------------------------

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

    this.spectators = this.spectators.filter((s) => s.socketId !== socketId);
  }

  public handleReconnect(params: { socketId: string; userId: number }): PlayerSide | null {
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
  // Tick Loop
  // ---------------------------

  private tick(): void {
    if (this.state === "finished") return;

    const hasLeft = !!this.players.left;
    const hasRight = !!this.players.right;

    const leftReady = this.players.left?.connected ?? false;
    const rightReady = this.players.right?.connected ?? false;

    if (!hasLeft || !hasRight || !leftReady || !rightReady) {
      this.state = "waiting";
      this.broadcastState(this.getSerializedState());
      return;
    }

    if (this.state === "waiting") {
      this.broadcastState(this.getSerializedState());
      return;
    }

    if (this.state === "starting" || this.state === "paused") {
      this.broadcastState(this.getSerializedState());
      return;
    }

    this.updateAiInputs();

    if (this.players.left) applyPlayerInput(this.paddles.left, this.lastInput.left);
    if (this.players.right) applyPlayerInput(this.paddles.right, this.lastInput.right);

    const result = updateBall(this.ball, this.paddles, this.score);

    if (result.scored) {
      const scoredSide = result.scored;
      const concededSide: PlayerSide = scoredSide === "left" ? "right" : "left";

      if (
        this.score.left >= this.config.scoreLimit ||
        this.score.right >= this.config.scoreLimit
      ) {
        const winnerSide: PlayerSide =
          this.score.left > this.score.right ? "left" : "right";
        this.finishMatch(winnerSide, "normal");
      } else {
        this.state = "paused";
        this.scheduleServe(concededSide);
      }
    }

    this.broadcastState(this.getSerializedState());
  }

  // ---------------------------
  // Serving Logic
  // ---------------------------

  private maybeStartServing(): void {
    const leftReady = this.players.left?.connected ?? false;
    const rightReady = this.players.right?.connected ?? false;

    if (!leftReady || !rightReady) return;

    if (!this.currentServeSide) {
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
      tournamentMatchId: this.config.tournamentMatchId,
      winnerSide,
      score: { ...this.score },
      leftPlayer: this.players.left,
      rightPlayer: this.players.right,
      reason,
    };
    this.onMatchFinished(payload);
    this.broadcastState(this.getSerializedState());
  }

  // ---------------------------
  // Serialized State
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
// Room Registry
// ---------------------------

export const rooms = new Map<string, Room>();

export function createRoom(id: string, config: MatchConfig): Room {
  const room = new Room(id, config);
  rooms.set(id, room);
  room.start();              // 👈 IMPORTANT: start loop here
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
