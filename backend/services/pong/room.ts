import { FastifyInstance } from 'fastify';
import { Socket } from 'socket.io';
import { generateServiceToken } from '../../shared/plugins/auth';
import { startGameLoop } from './physics';

// -------------------- Types --------------------
export interface PlayerState {
  socket: Socket;
  paddleY: number;
  score: number;
  side: "left" | "right";
}

export interface GameRoom {
  id: string;
  left: PlayerState;
  right: PlayerState;
  ball: { x: number; y: number; vx: number; vy: number };
  width: number;
  height: number;
  isActive: boolean;
  loop?: NodeJS.Timeout;
  startTime?: number;
}

// Global room storage
export const rooms: Map<string, GameRoom> = new Map();

// -------------------- Helper Functions --------------------
function makeRoomId(): string {
  return "room_" + Math.random().toString(36).slice(2, 8);
}

// -------------------- Room Management --------------------
export function createGameRoom(app: FastifyInstance, p1: Socket, p2: Socket): GameRoom {
  const roomId = makeRoomId();
  const width = 800, height = 500;

  const room: GameRoom = {
    id: roomId,
    width,
    height,
    isActive: true,
    left: { socket: p1, paddleY: 200, score: 0, side: "left" },
    right: { socket: p2, paddleY: 200, score: 0, side: "right" },
    ball: { x: 400, y: 250, vx: 4, vy: 3 },
    startTime: Date.now(),
  };

  rooms.set(roomId, room);
  p1.data.roomId = roomId;
  p2.data.roomId = roomId;
  p1.join(roomId);
  p2.join(roomId);

  const leftName = p1.data.user?.display_name || p1.data.user?.email;
  const rightName = p2.data.user?.display_name || p2.data.user?.email;
  app.io.to(roomId).emit("system", `🎮 Match started: ${leftName} vs ${rightName}`);
  p1.emit("match_start", { roomId, you: "left", opponent: rightName });
  p2.emit("match_start", { roomId, you: "right", opponent: leftName });

  startGameLoop(app, room);
  return room;
}

export async function endMatch(app: FastifyInstance, room: GameRoom, winnerSide: "left" | "right") {
  room.isActive = false;

  // Stop game loop
  if (room.loop) {
    clearInterval(room.loop);
    room.loop = undefined;
  }

  const winnerUser = room[winnerSide].socket.data.user;
  const loserUser = winnerSide === "left"
    ? room.right.socket.data.user
    : room.left.socket.data.user;

  const winnerName = winnerUser?.display_name || winnerUser?.email || winnerUser?.userId;
  const loserName = loserUser?.display_name || loserUser?.email || loserUser?.userId;

  app.io.to(room.id).emit("match_end", {
    winner: winnerName,
    loser: loserName,
    finalScore: { left: room.left.score, right: room.right.score },
  });

  app.log.info(`🏁 Match ended: ${winnerName} defeated ${loserName}`);

  // Save to database and report to user service
  await saveMatchResult(app, room, winnerSide);

  app.io.socketsLeave(room.id);
  rooms.delete(room.id);
}

async function saveMatchResult(app: FastifyInstance, room: GameRoom, winnerSide: "left" | "right") {
  const winner = room[winnerSide];
  const loser = winnerSide === "left" ? room.right : room.left;
  const winnerUser = winner.socket.data.user;
  const loserUser = loser.socket.data.user;

  if (!winnerUser || !loserUser) {
    app.log.warn("⚠️ Skipping match report — missing user data");
    return;
  }

  const duration = room.startTime ? Math.floor((Date.now() - room.startTime) / 1000) : null;

  // Save to local database
  try {
    const stmt = app.db.prepare(`
      INSERT INTO matches (winner_id, loser_id, left_score, right_score, duration)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(winnerUser.userId, loserUser.userId, room.left.score, room.right.score, duration);
    app.log.info({ winnerId: winnerUser.userId, loserId: loserUser.userId }, 'Match saved to database');
  } catch (error: any) {
    app.log.error({ error: error.message }, 'Failed to save match to database');
  }

  // Report to user service
  try {
    const token = generateServiceToken("pong");
    const response = await fetch(`${process.env.USER_SERVICE_URL || 'http://user-service:5000'}/internal/match-result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Service ${token}`,
      },
      body: JSON.stringify({
        winnerId: winnerUser.userId,
        loserId: loserUser.userId,
        leftScore: room.left.score,
        rightScore: room.right.score,
      }),
    });

    if (!response.ok) {
      app.log.error(`❌ Failed to report match to user service: ${response.statusText}`);
    } else {
      app.log.info(`✅ Reported match result to user service`);
    }
  } catch (err: any) {
    app.log.error({ error: err.message }, "Error reporting match result to user service");
  }
}
