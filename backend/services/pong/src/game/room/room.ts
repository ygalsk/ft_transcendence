import { AiController } from "../ai";
import { createInitialBall, createInitialPaddles, MS_PER_TICK } from "../physics";
import type { AiDifficulty, GameState, MatchConfig, PlayerInput, PlayerSide, RoomPlayer, ScoreState, SerializedGameState } from "../types";
import { addAiPlayer, addHumanPlayer, handleDisconnect, handleReconnect } from "./players";
import { maybeStartServing, scheduleServe } from "./serve";
import { runTick } from "./tick";
import type {
  MatchEndReason,
  MatchFinishedPayload,
  RoomHooks,
  RoomPlayers,
} from "./types";

const SIDES: PlayerSide[] = ["left", "right"];
const DEFAULT_HOOKS: RoomHooks = { broadcastState: () => {}, onMatchFinished: () => {}, log: () => {} };

export class Room {
  readonly id: string;
  readonly config: MatchConfig;
  state: GameState = "waiting";

  paddles = createInitialPaddles();
  ball = createInitialBall();
  score: ScoreState = { left: 0, right: 0 };
  players: RoomPlayers = { left: null, right: null };
  spectators: RoomPlayer[] = [];
  lastInput: Record<PlayerSide, PlayerInput> = { left: { up: false, down: false }, right: { up: false, down: false } };
  aiControllers: Partial<Record<PlayerSide, AiController>> = {};
  currentServeSide: PlayerSide | null = null;

  private hooks: RoomHooks;
  private tickTimer: NodeJS.Timeout | null = null;
  private serveTimer: NodeJS.Timeout | null = null;

  constructor(id: string, config: MatchConfig, hooks: Partial<RoomHooks> = {}) {
    this.id = id;
    this.config = config;
    this.hooks = { ...DEFAULT_HOOKS, ...hooks };
  }

  updateHooks(next: Partial<RoomHooks>): void {
    this.hooks = { ...this.hooks, ...next };
  }

  forceStart(): void {
    this.start();
    this.state = "waiting";
    this.maybeStartServing();
  }

  start(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(this.tick, MS_PER_TICK);
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.serveTimer) {
      clearTimeout(this.serveTimer);
      this.serveTimer = null;
    }
    SIDES.forEach((side) => {
      const player = this.players[side];
      if (player?.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
        player.disconnectTimer = undefined;
      }
    });
  }

  addHumanPlayer(params: {
    socketId: string;
    userId: number | null;
    displayName: string;
    avatarUrl?: string;
  }): PlayerSide | null {
    return addHumanPlayer(this.humanContext, params);
  }

  addAi(side: PlayerSide, displayName = "AI", difficulty?: AiDifficulty): void {
    addAiPlayer(this.aiContext, side, displayName, difficulty);
  }
  handleDisconnect(socketId: string): void {
    handleDisconnect(this.disconnectContext, socketId);
  }
  handleReconnect(params: { socketId: string; userId: number }): PlayerSide | null {
    return handleReconnect(this.reconnectContext, params);
  }

  setInput(side: PlayerSide, input: PlayerInput): void {
    this.lastInput[side] = input;
  }

  getSerializedState = (): SerializedGameState => {
    const left = this.players.left;
    const right = this.players.right;
    return {
      state: this.state,
      ball: this.ball,
      paddles: { left: this.paddles.left, right: this.paddles.right },
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
  };

  private tick = (): void => {
    runTick({
      state: this.state,
      players: this.players,
      lastInput: this.lastInput,
      paddles: this.paddles,
      ball: this.ball,
      score: this.score,
      config: this.config,
      updateAiInputs: this.updateAiInputs,
      scheduleServe: this.scheduleServe,
      finishMatch: this.finishMatch,
      broadcast: this.broadcast,
      serialize: this.getSerializedState,
      setState: this.setState,
    });
  };

  private maybeStartServing = (): void => {
    maybeStartServing({
      state: this.state,
      players: this.players,
      ball: this.ball,
      currentServeSide: this.currentServeSide,
      serveTimer: this.serveTimer,
      setState: this.setState,
      setCurrentServeSide: this.setCurrentServeSide,
      setServeTimer: this.setServeTimer,
      broadcast: this.broadcast,
      serialize: this.getSerializedState,
    });
  };

  private scheduleServe = (servingSide: PlayerSide): void => {
    scheduleServe({
      state: this.state,
      players: this.players,
      ball: this.ball,
      currentServeSide: this.currentServeSide,
      serveTimer: this.serveTimer,
      setState: this.setState,
      setCurrentServeSide: this.setCurrentServeSide,
      setServeTimer: this.setServeTimer,
      broadcast: this.broadcast,
      serialize: this.getSerializedState,
    }, servingSide);
  };

  private updateAiInputs = (): void => {
    SIDES.forEach((side) => {
      const player = this.players[side];
      if (!player?.isAi) return;
      const controller = this.aiControllers[side];
      if (!controller) return;
      this.lastInput[side] = controller.getInput(this.getSerializedState());
    });
  };

  private finishMatch = (winnerSide: PlayerSide, reason: MatchEndReason): void => {
    if (this.state === "finished") return;
    this.state = "finished";
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
    this.hooks.onMatchFinished(payload);
    this.broadcast();
  };

  private broadcast = (): void => {
    this.hooks.broadcastState(this.getSerializedState());
  };

  private setState = (state: GameState): void => {
    this.state = state;
  };
  private setCurrentServeSide = (side: PlayerSide | null): void => {
    this.currentServeSide = side;
  };
  private setServeTimer = (timer: NodeJS.Timeout | null): void => {
    this.serveTimer = timer;
  };

  private get humanContext() {
    return { roomId: this.id, players: this.players, spectators: this.spectators, log: this.hooks.log, forceStart: () => this.forceStart() };
  }
  private get aiContext() {
    return { roomId: this.id, players: this.players, spectators: this.spectators, log: this.hooks.log, config: this.config, aiControllers: this.aiControllers, maybeStartServing: this.maybeStartServing };
  }
  private get disconnectContext() {
    return { roomId: this.id, players: this.players, spectators: this.spectators, log: this.hooks.log, finishMatch: this.finishMatch };
  }
  private get reconnectContext() {
    return { roomId: this.id, players: this.players, spectators: this.spectators, log: this.hooks.log, maybeStartServing: this.maybeStartServing };
  }
}
