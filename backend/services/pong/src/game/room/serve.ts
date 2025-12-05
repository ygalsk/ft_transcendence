import { resetBall } from "../physics";
import type {
  BallState,
  GameState,
  PlayerSide,
  SerializedGameState,
} from "../types";
import type { RoomPlayers } from "./types";

export const SERVE_DELAY_MS = 1_000;

interface ServeContext {
  state: GameState;
  players: RoomPlayers;
  ball: BallState;
  currentServeSide: PlayerSide | null;
  serveTimer: NodeJS.Timeout | null;
  setState(state: GameState): void;
  setCurrentServeSide(side: PlayerSide): void;
  setServeTimer(timer: NodeJS.Timeout | null): void;
  broadcast(state: SerializedGameState): void;
  serialize(): SerializedGameState;
}

export function maybeStartServing(ctx: ServeContext): void {
  const leftReady = ctx.players.left?.connected ?? false;
  const rightReady = ctx.players.right?.connected ?? false;

  if (!leftReady || !rightReady) return;

  let serveSide = ctx.currentServeSide;
  if (!serveSide) {
    serveSide = Math.random() < 0.5 ? "left" : "right";
    ctx.setCurrentServeSide(serveSide);
  }

  if (ctx.state === "waiting") {
    scheduleServe(ctx, serveSide);
  }
}

export function scheduleServe(
  ctx: ServeContext,
  servingSide: PlayerSide
): void {
  ctx.setCurrentServeSide(servingSide);

  if (ctx.serveTimer) {
    clearTimeout(ctx.serveTimer);
    ctx.setServeTimer(null);
  }

  ctx.setState("starting");

  const timer = setTimeout(() => {
    resetBall(ctx.ball, servingSide);
    ctx.setState("playing");
    ctx.broadcast(ctx.serialize());
  }, SERVE_DELAY_MS);

  ctx.setServeTimer(timer);
}
