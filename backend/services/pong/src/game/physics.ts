//
// src/game/physics.ts
//

import { BallState, PaddleState, PlayerInput, PlayerSide, ScoreState } from "./types";

// ---------------------------
// Core Field & Game Constants
// ---------------------------

export const FIELD_WIDTH = 800;
export const FIELD_HEIGHT = 500;

export const PADDLE_WIDTH = 10;
export const PADDLE_HEIGHT = 100;

// How far paddles are from the edge
export const PADDLE_OFFSET_X = 30;

// Movement & physics
export const PADDLE_SPEED = 8;           // max movement per tick (same for human & AI)
export const BALL_BASE_SPEED = 6;        // initial ball speed
export const BALL_SPEED_INCREMENT = 0.6; // speed gain per paddle hit
export const MAX_BOUNCE_ANGLE = Math.PI / 3; // 60 degrees

// Timing
export const TICK_RATE = 60;
export const MS_PER_TICK = 1000 / TICK_RATE;

// ---------------------------
// Helpers
// ---------------------------

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------
// Initial State Helpers
// ---------------------------

export function createInitialPaddles(): { left: PaddleState; right: PaddleState } {
  const centerY = FIELD_HEIGHT / 2 - PADDLE_HEIGHT / 2;

  return {
    left: { y: centerY, height: PADDLE_HEIGHT },
    right: { y: centerY, height: PADDLE_HEIGHT },
  };
}

export function createInitialBall(): BallState {
  return {
    position: { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2 },
    velocity: { x: 0, y: 0 }, // will be set on first serve
  };
}

// ---------------------------
// Paddle Movement
// ---------------------------

export function clampPaddle(paddle: PaddleState): void {
  const maxY = FIELD_HEIGHT - paddle.height;
  paddle.y = clamp(paddle.y, 0, maxY);
}

export function applyPlayerInput(paddle: PaddleState, input: PlayerInput): void {
  let dy = 0;
  if (input.up) dy -= PADDLE_SPEED;
  if (input.down) dy += PADDLE_SPEED;

  paddle.y += dy;
  clampPaddle(paddle);
}

// ---------------------------
// Ball Reset & Serve
// ---------------------------

export function resetBall(ball: BallState, servingSide: PlayerSide): void {
  ball.position.x = FIELD_WIDTH / 2;
  ball.position.y = FIELD_HEIGHT / 2;

  // Direction: serving side sends ball towards opponent
  const direction = servingSide === "left" ? 1 : -1;

  // Slight random angle near horizontal (-22.5° to +22.5°)
  const angle = (Math.random() * Math.PI) / 4 - Math.PI / 8;

  ball.velocity.x = direction * BALL_BASE_SPEED * Math.cos(angle);
  ball.velocity.y = BALL_BASE_SPEED * Math.sin(angle);
}

// ---------------------------
// Ball Update & Collisions
// ---------------------------

export interface UpdateResult {
  scored: PlayerSide | null; // which side scored, if any
}

/**
 * Updates the ball's position, handles wall & paddle collisions,
 * and updates the score if a goal happens.
 *
 * This function:
 *  - moves the ball
 *  - bounces off top/bottom walls
 *  - bounces off paddles with angle based on hit position
 *  - incrementally speeds up the ball on paddle hits
 *  - updates score.left / score.right when a goal occurs
 *
 * It does NOT enforce score limits — Room logic will handle that.
 */
export function updateBall(
  ball: BallState,
  paddles: { left: PaddleState; right: PaddleState },
  score: ScoreState
): UpdateResult {
  // Move ball according to its velocity
  ball.position.x += ball.velocity.x;
  ball.position.y += ball.velocity.y;

  // ------------ Wall collisions (top and bottom) ------------
  if (ball.position.y <= 0) {
    ball.position.y = 0;
    ball.velocity.y *= -1;
  } else if (ball.position.y >= FIELD_HEIGHT) {
    ball.position.y = FIELD_HEIGHT;
    ball.velocity.y *= -1;
  }

  // ------------ Goals (passes left or right edge) ------------
  if (ball.position.x < 0) {
    // Ball passed left side → right player scores
    score.right += 1;
    return { scored: "right" };
  }

  if (ball.position.x > FIELD_WIDTH) {
    // Ball passed right side → left player scores
    score.left += 1;
    return { scored: "left" };
  }

  // ------------ Paddle collisions ------------
  handlePaddleCollision(ball, paddles.left, "left");
  handlePaddleCollision(ball, paddles.right, "right");

  return { scored: null };
}

// ---------------------------
// Paddle Collision Logic
// ---------------------------

function handlePaddleCollision(
  ball: BallState,
  paddle: PaddleState,
  side: PlayerSide
): void {
  const ballX = ball.position.x;
  const ballY = ball.position.y;
  const paddleTop = paddle.y;
  const paddleBottom = paddle.y + paddle.height;

  const paddleX = side === "left" ? PADDLE_OFFSET_X : FIELD_WIDTH - PADDLE_OFFSET_X;
  const halfWidth = PADDLE_WIDTH / 2;

  // Check horizontal overlap
  const withinX =
    side === "left"
      ? ballX <= paddleX + halfWidth && ballX >= paddleX - halfWidth
      : ballX >= paddleX - halfWidth && ballX <= paddleX + halfWidth;

  // Check vertical overlap
  const withinY = ballY >= paddleTop && ballY <= paddleBottom;

  if (!withinX || !withinY) return;

  // Normalize impact position: -1 (top) to 1 (bottom)
  const paddleCenterY = paddle.y + paddle.height / 2;
  const relativeIntersectY = (ballY - paddleCenterY) / (paddle.height / 2);
  const clampedRelative = clamp(relativeIntersectY, -1, 1);

  // Compute bounce angle
  const bounceAngle = clampedRelative * MAX_BOUNCE_ANGLE;

  // Increase ball speed slightly after each paddle hit
  const currentSpeed = Math.hypot(ball.velocity.x, ball.velocity.y) || BALL_BASE_SPEED;
  const newSpeed = currentSpeed + BALL_SPEED_INCREMENT;

  // Direction: always away from the paddle
  const direction = side === "left" ? 1 : -1;

  ball.velocity.x = direction * newSpeed * Math.cos(bounceAngle);
  ball.velocity.y = newSpeed * Math.sin(bounceAngle);

  // Push ball slightly out of the paddle to avoid "sticking"
  if (side === "left") {
    ball.position.x = paddleX + halfWidth + 1;
  } else {
    ball.position.x = paddleX - halfWidth - 1;
  }
}
