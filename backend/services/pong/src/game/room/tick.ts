import { applyPlayerInput, updateBall } from "../physics";
import type {
  BallState,
  GameState,
  MatchConfig,
  PlayerInput,
  PlayerSide,
  ScoreState,
  SerializedGameState,
} from "../types";
import type { MatchEndReason, RoomPlayers } from "./types";

export interface TickContext {
  state: GameState;
  players: RoomPlayers;
  lastInput: Record<PlayerSide, PlayerInput>;
  paddles: { left: { y: number; height: number }; right: { y: number; height: number } };
  ball: BallState;
  score: ScoreState;
  config: MatchConfig;
  updateAiInputs(): void;
  scheduleServe(servingSide: PlayerSide): void;
  finishMatch(winner: PlayerSide, reason: MatchEndReason): void;
  broadcast(state: SerializedGameState): void;
  serialize(): SerializedGameState;
  setState(state: GameState): void;
}

export function runTick(ctx: TickContext): void {
  if (ctx.state === "finished") return;

  const hasLeft = !!ctx.players.left;
  const hasRight = !!ctx.players.right;
  const leftReady = ctx.players.left?.connected ?? false;
  const rightReady = ctx.players.right?.connected ?? false;

  if (!hasLeft || !hasRight || !leftReady || !rightReady) {
    ctx.setState("waiting");
    ctx.broadcast(ctx.serialize());
    return;
  }

  if (ctx.state === "waiting" || ctx.state === "starting" || ctx.state === "paused") {
    ctx.broadcast(ctx.serialize());
    return;
  }

  ctx.updateAiInputs();

  if (ctx.players.left) applyPlayerInput(ctx.paddles.left, ctx.lastInput.left);
  if (ctx.players.right) applyPlayerInput(ctx.paddles.right, ctx.lastInput.right);

  const result = updateBall(ctx.ball, ctx.paddles, ctx.score);

  if (result.scored) {
    const scoredSide = result.scored;
    const concededSide: PlayerSide = scoredSide === "left" ? "right" : "left";

    if (ctx.score.left >= ctx.config.scoreLimit || ctx.score.right >= ctx.config.scoreLimit) {
      const winnerSide: PlayerSide = ctx.score.left > ctx.score.right ? "left" : "right";
      ctx.finishMatch(winnerSide, "normal");
    } else {
      ctx.setState("paused");
      ctx.scheduleServe(concededSide);
    }
  }

  ctx.broadcast(ctx.serialize());
}
