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
export const PADDLE_HEIGHT = 70;   // 🔥 reduced from 100 → 70 for better balance

// How far paddles are from the edge
export const PADDLE_OFFSET_X = 30;

// Movement & physics
export const PADDLE_SPEED = 7;     // 🔥 reduced from 8 → 7 (optional, smoother feel)
export const BALL_BASE_SPEED = 6;
export const BALL_SPEED_INCREMENT = 0.6;
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
    velocity: { x: 0, y: 0 },
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

  const direction = servingSide === "left" ? 1 : -1;

  const angle = (Math.random() * Math.PI) / 4 - Math.PI / 8;

  ball.velocity.x = direction * BALL_BASE_SPEED * Math.cos(angle);
  ball.velocity.y = BALL_BASE_SPEED * Math.sin(angle);
}

// ---------------------------
// Ball Update & Collisions
// ---------------------------

export interface UpdateResult {
  scored: PlayerSide | null;
}

export function updateBall(
  ball: BallState,
  paddles: { left: PaddleState; right: PaddleState },
  score: ScoreState
): UpdateResult {
  ball.position.x += ball.velocity.x;
  ball.position.y += ball.velocity.y;

  if (ball.position.y <= 0) {
    ball.position.y = 0;
    ball.velocity.y *= -1;
  } else if (ball.position.y >= FIELD_HEIGHT) {
    ball.position.y = FIELD_HEIGHT;
    ball.velocity.y *= -1;
  }

  if (ball.position.x < 0) {
    score.right += 1;
    return { scored: "right" };
  }

  if (ball.position.x > FIELD_WIDTH) {
    score.left += 1;
    return { scored: "left" };
  }

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

  const withinX =
    side === "left"
      ? ballX <= paddleX + halfWidth && ballX >= paddleX - halfWidth
      : ballX >= paddleX - halfWidth && ballX <= paddleX + halfWidth;

  const withinY = ballY >= paddleTop && ballY <= paddleBottom;

  if (!withinX || !withinY) return;

  const paddleCenterY = paddle.y + paddle.height / 2;
  const relativeIntersectY = (ballY - paddleCenterY) / (paddle.height / 2);
  const clampedRelative = clamp(relativeIntersectY, -1, 1);

  const bounceAngle = clampedRelative * MAX_BOUNCE_ANGLE;

  const currentSpeed = Math.hypot(ball.velocity.x, ball.velocity.y) || BALL_BASE_SPEED;
  const newSpeed = currentSpeed + BALL_SPEED_INCREMENT;

  const direction = side === "left" ? 1 : -1;

  ball.velocity.x = direction * newSpeed * Math.cos(bounceAngle);
  ball.velocity.y = newSpeed * Math.sin(bounceAngle);

  if (side === "left") {
    ball.position.x = paddleX + halfWidth + 1;
  } else {
    ball.position.x = paddleX - halfWidth - 1;
  }
}
