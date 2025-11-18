import { FastifyInstance } from 'fastify';
import { GameRoom } from './room';

// -------------------- Physics Constants --------------------
const PADDLE_HEIGHT = 80;
const PADDLE_WIDTH = 10;
const PADDLE_OFFSET = 20;
const BALL_SPEED = 4;
const TICK_RATE = 33; // ~30 FPS

// -------------------- Helper Functions --------------------
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function resetBall(room: GameRoom, serveTo: "left" | "right"): void {
  room.ball.x = room.width / 2;
  room.ball.y = room.height / 2;
  room.ball.vx = serveTo === "left" ? -BALL_SPEED : BALL_SPEED;
  room.ball.vy = (Math.random() * 2 - 1) * 3;
}

// -------------------- Game Loop --------------------
export function startGameLoop(app: FastifyInstance, room: GameRoom): void {
  room.loop = setInterval(() => tick(app, room), TICK_RATE);
}

function tick(app: FastifyInstance, room: GameRoom): void {
  if (!room.isActive) return;

  const { width, height, left, right, ball } = room;

  // Move ball
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Bounce off top/bottom walls
  if (ball.y < 0 || ball.y > height) {
    ball.vy *= -1;
  }

  // Check collision with left paddle
  const leftHit =
    ball.x <= PADDLE_OFFSET + PADDLE_WIDTH &&
    ball.y >= left.paddleY &&
    ball.y <= left.paddleY + PADDLE_HEIGHT;

  // Check collision with right paddle
  const rightHit =
    ball.x >= width - PADDLE_OFFSET - PADDLE_WIDTH &&
    ball.y >= right.paddleY &&
    ball.y <= right.paddleY + PADDLE_HEIGHT;

  // Bounce off paddles
  if (leftHit) {
    ball.vx = Math.abs(ball.vx);
  } else if (rightHit) {
    ball.vx = -Math.abs(ball.vx);
  }

  // Scoring
  if (ball.x < 0) {
    // Right player scores
    right.score++;
    resetBall(room, "left");
  } else if (ball.x > width) {
    // Left player scores
    left.score++;
    resetBall(room, "right");
  }

  // Check win condition (first to 5)
  if (left.score >= 5 || right.score >= 5) {
    // Import endMatch dynamically to avoid circular dependency
    import('./room').then(({ endMatch }) => {
      endMatch(app, room, left.score >= 5 ? "left" : "right");
    });
    return;
  }

  // Broadcast game state to all players in the room
  app.io.to(room.id).emit("state", {
    ball,
    paddles: { left: left.paddleY, right: right.paddleY },
    score: { left: left.score, right: right.score },
  });
}

// -------------------- Paddle Movement --------------------
export function updatePaddlePosition(room: GameRoom, socketId: string, y: number): void {
  const maxY = room.height - PADDLE_HEIGHT;

  if (room.left.socket.id === socketId) {
    room.left.paddleY = clamp(y, 0, maxY);
  } else if (room.right.socket.id === socketId) {
    room.right.paddleY = clamp(y, 0, maxY);
  }
}
