//
// src/game/ai.ts
//

import { PlayerInput, PlayerSide, SerializedGameState } from "./types";
import { FIELD_HEIGHT, PADDLE_HEIGHT } from "./physics";

/**
 * AI Controller:
 *  - Only updates decision once per second
 *  - Produces PlayerInput { up, down }
 *  - Does NOT directly modify paddle position
 *  - Reads only SerializedGameState passed by Room
 */
export class AiController {
  private side: PlayerSide;

  private lastDecision: PlayerInput = { up: false, down: false };
  private readyForUpdate: boolean = true;

  constructor(side: PlayerSide) {
    this.side = side;

    // Reset decision flag every 1000ms
    setInterval(() => {
      this.readyForUpdate = true;
    }, 1000);
  }

  /**
   * Main AI decision method.
   * Called by Room EACH TICK (60 times per second),
   * but computes a new decision ONLY once per second.
   */
  public getInput(state: SerializedGameState): PlayerInput {
    // Only compute new decision if allowed
    if (this.readyForUpdate && state.state === "playing") {
      this.readyForUpdate = false;
      this.lastDecision = this.computeDecision(state);
    }

    return this.lastDecision;
  }

  /**
   * Compute actual decision based on game state.
   */
  private computeDecision(state: SerializedGameState): PlayerInput {
    const myPaddle = state.paddles[this.side];
    const ball = state.ball;

    const paddleCenter = myPaddle.y + myPaddle.height / 2;
    const ballY = ball.position.y;

    const tolerance = 5; // dead zone (avoid jitter)

    // If ball is above paddle → move up
    if (ballY < paddleCenter - tolerance) {
      return { up: true, down: false };
    }

    // If ball is below paddle → move down
    if (ballY > paddleCenter + tolerance) {
      return { up: false, down: true };
    }

    // Otherwise stay still
    return { up: false, down: false };
  }
}
