//
// src/game/ai.ts
//

import {
  PlayerInput,
  PlayerSide,
  SerializedGameState,
  AiDifficulty,
} from "./types";
import { FIELD_HEIGHT, FIELD_WIDTH } from "./physics";

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

  // Tunable parameters (set from difficulty)
  private predictionError = 20;          // ±px error around predicted Y
  private tolerance = 10;               // dead zone around target (no movement)
  private idleCenterTolerance = 25;     // how close to center before idle
  private maxPredictTime = 240;         // maximum "frames" we simulate into the future

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
    if (this.readyForUpdate && state.state === "playing") {
      this.readyForUpdate = false;
      this.lastDecision = this.computeDecision(state);
    }
    return this.lastDecision;
  }

  // --------------------------
  // Difficulty configuration
  // --------------------------

  private configureByDifficulty(difficulty: AiDifficulty) {
    switch (difficulty) {
      case "easy":
        this.predictionError = 45;        // very imprecise
        this.tolerance = 18;              // moves less aggressively
        this.idleCenterTolerance = 45;    // often idles near center
        this.maxPredictTime = 180;        // doesn't look too far
        break;
      case "hard":
        this.predictionError = 6;         // very precise
        this.tolerance = 6;               // reacts to small offsets
        this.idleCenterTolerance = 15;    // stays well centered
        this.maxPredictTime = 300;        // looks further ahead
        break;
      case "medium":
      default:
        this.predictionError = 20;
        this.tolerance = 10;
        this.idleCenterTolerance = 25;
        this.maxPredictTime = 240;
        break;
    }
  }

  // --------------------------
  // Core AI decision
  // --------------------------

  private computeDecision(state: SerializedGameState): PlayerInput {
    const paddle = state.paddles[this.side];
    const ball = state.ball;

    const paddleCenter = paddle.y + paddle.height / 2;
    const ballX = ball.position.x;
    const ballY = ball.position.y;
    const vx = ball.velocity.x;
    const vy = ball.velocity.y;

    // If ball is almost not moving horizontally, just idle/center.
    if (Math.abs(vx) < 0.01) {
      return this.idleMove(paddleCenter);
    }

    // Determine if ball is coming toward this side
    const movingTowardAI =
      (this.side === "left" && vx < 0) ||
      (this.side === "right" && vx > 0);

    if (!movingTowardAI) {
      // Ball is going away: drift toward vertical center and chill
      return this.idleMove(paddleCenter);
    }

    // Compute X coordinate of AI paddle roughly based on render coordinates
    const aiX = this.side === "left" ? 20 : FIELD_WIDTH - 20;
    const dx = aiX - ballX;

    // If for some reason sign doesn't match, just idle
    if ((this.side === "left" && dx > 0) || (this.side === "right" && dx < 0)) {
      return this.idleMove(paddleCenter);
    }

    // Time (in "ticks") until ball reaches AI X, limited to avoid madness
    const timeToImpact = Math.abs(dx / vx);
    const t = Math.min(timeToImpact, this.maxPredictTime);

    // Predict Y with simple "bouncing" off top/bottom
    let predictedY = ballY + vy * t;

    // Reflect off top/bottom walls (0 .. FIELD_HEIGHT)
    while (predictedY < 0 || predictedY > FIELD_HEIGHT) {
      if (predictedY < 0) predictedY = -predictedY;
      else if (predictedY > FIELD_HEIGHT) predictedY = FIELD_HEIGHT * 2 - predictedY;
    }

    // Add difficulty-based noise for imperfect play
    const noise = (Math.random() - 0.5) * 2 * this.predictionError;
    predictedY += noise;

    // Decide movement based on target vs paddle center
    if (predictedY < paddleCenter - this.tolerance) {
      return { up: true, down: false };
    }
    if (predictedY > paddleCenter + this.tolerance) {
      return { up: false, down: true };
    }

    return { up: false, down: false };
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
