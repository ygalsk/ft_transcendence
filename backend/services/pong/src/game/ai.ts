//
// src/game/ai.ts
//

import {
  PlayerInput,
  PlayerSide,
  SerializedGameState,
  AiDifficulty,
} from "./types";
import { FIELD_HEIGHT, FIELD_WIDTH, PADDLE_OFFSET_X } from "./physics";

/**
 * AI Controller with difficulty:
 *  - Only recomputes its decision once per second (subject requirement)
 *  - Predicts where the ball will cross the AI paddle X position
 *  - Adds difficulty-dependent error and deadzones
 *  - Returns PlayerInput; Room applies movement using same physics as humans
 */
export class AiController {
  private side: PlayerSide;
  private difficulty: AiDifficulty;

  private lastDecision: PlayerInput = { up: false, down: false };
  private readyForUpdate = true;
  private plan:
    | { targetY: number; tolerance: number }
    | null = null;

  // Tunable parameters (set from difficulty)
  private predictionError = 20;          // ±px error around predicted Y
  private tolerance = 10;               // dead zone around target (no movement)
  private idleCenterTolerance = 25;     // how close to center before idle
  private maxPredictTime = 240;         // maximum "frames" we simulate into the future
  private nearImpactFrames = 45;        // when impact is close, tighten aim

  constructor(side: PlayerSide, difficulty: AiDifficulty = "medium") {
    this.side = side;
    this.difficulty = difficulty;

    this.configureByDifficulty(difficulty);

    // Recompute decision at most once per second
    setInterval(() => {
      this.readyForUpdate = true;
    }, 1000);
  }

  /**
   * Called every tick (~60 fps) by the Room.
   * Only recomputes when readyForUpdate === true & game is "playing".
   */
  public getInput(state: SerializedGameState): PlayerInput {
    // Recompute target once per second
    if (this.readyForUpdate && state.state === "playing") {
      this.readyForUpdate = false;
      this.plan = this.buildPlan(state);
    }

    // If no plan yet (e.g., pre-play), idle
    if (!this.plan) {
      return this.idleMove(
        state.paddles[this.side].y + state.paddles[this.side].height / 2
      );
    }

    const paddle = state.paddles[this.side];
    const paddleCenter = paddle.y + paddle.height / 2;
    const { targetY, tolerance } = this.plan;

    if (targetY < paddleCenter - tolerance) {
      this.lastDecision = { up: true, down: false };
    } else if (targetY > paddleCenter + tolerance) {
      this.lastDecision = { up: false, down: true };
    } else {
      this.lastDecision = { up: false, down: false };
    }

    return this.lastDecision;
  }

  // --------------------------
  // Difficulty configuration
  // --------------------------

  private configureByDifficulty(difficulty: AiDifficulty) {
    switch (difficulty) {
      case "easy":
        this.predictionError = 60;        // very imprecise
        this.tolerance = 18;              // moves less aggressively
        this.idleCenterTolerance = 50;    // often idles near center
        this.maxPredictTime = 90;         // doesn't look too far
        this.nearImpactFrames = 50;
        break;
      case "hard":
        this.predictionError = 15;         // very precise
        this.tolerance = 6;               // reacts to small offsets
        this.idleCenterTolerance = 15;    // stays well centered
        this.maxPredictTime = 210;        // looks further ahead
        this.nearImpactFrames = 40;
        break;
      case "medium":
      default:
        this.predictionError = 40;       // less precise
        this.tolerance = 12;             // wider dead zone
        this.idleCenterTolerance = 30;
        this.maxPredictTime = 110;       // shorter lookahead
        this.nearImpactFrames = 35;      // less time in "locked-in" mode
        break;
    }
  }

  // --------------------------
  // Core AI decision
  // --------------------------

  /**
   * Computes a targetY and tolerance once per second based on the last seen state.
   */
  private buildPlan(state: SerializedGameState): { targetY: number; tolerance: number } {
    const paddle = state.paddles[this.side];
    const ball = state.ball;

    const paddleCenter = paddle.y + paddle.height / 2;
    const ballX = ball.position.x;
    const ballY = ball.position.y;
    const vx = ball.velocity.x;
    const vy = ball.velocity.y;

    // Determine if ball is coming toward this side
    const movingTowardAI =
      (this.side === "left" && vx < 0) ||
      (this.side === "right" && vx > 0);

    // If ball is almost not moving or going away: aim center, wide tolerance to reduce jitter.
    if (Math.abs(vx) < 0.01 || !movingTowardAI) {
      return {
        targetY: FIELD_HEIGHT / 2,
        tolerance: this.idleCenterTolerance,
      };
    }

    // Compute X coordinate of AI paddle roughly based on render coordinates
    const aiX = this.side === "left" ? PADDLE_OFFSET_X : FIELD_WIDTH - PADDLE_OFFSET_X;
    const dx = aiX - ballX;

    // If for some reason sign doesn't match, just idle
    if ((this.side === "left" && dx > 0) || (this.side === "right" && dx < 0)) {
      return {
        targetY: FIELD_HEIGHT / 2,
        tolerance: this.idleCenterTolerance,
      };
    }

    // Time (in "ticks") until ball reaches AI X, limited to avoid madness
    const timeToImpact = Math.abs(dx / vx);
    const t = Math.min(timeToImpact, this.maxPredictTime);
    const nearImpact = timeToImpact <= this.nearImpactFrames;

    // Predict Y with simple "bouncing" off top/bottom
    let predictedY = ballY + vy * t;

    // Reflect off top/bottom walls (0 .. FIELD_HEIGHT)
    while (predictedY < 0 || predictedY > FIELD_HEIGHT) {
      if (predictedY < 0) predictedY = -predictedY;
      else if (predictedY > FIELD_HEIGHT) predictedY = FIELD_HEIGHT * 2 - predictedY;
    }

    // Add difficulty-based noise for imperfect play
    const localError = nearImpact ? this.predictionError * 0.4 : this.predictionError;
    const noise = (Math.random() - 0.5) * 2 * localError;
    predictedY = Math.max(0, Math.min(FIELD_HEIGHT, predictedY + noise));

    const localTolerance = nearImpact
      ? Math.max(4, Math.floor(this.tolerance * 0.6))
      : this.tolerance;

    return { targetY: predictedY, tolerance: localTolerance };
  }

  /**
   * Behavior when ball is NOT approaching the AI:
   * slowly drift toward vertical center so it's ready for next rally.
   */
  private idleMove(paddleCenter: number): PlayerInput {
    const centerY = FIELD_HEIGHT / 2;

    if (paddleCenter < centerY - this.idleCenterTolerance) {
      return { up: false, down: true };
    }
    if (paddleCenter > centerY + this.idleCenterTolerance) {
      return { up: true, down: false };
    }

    return { up: false, down: false };
  }
}
