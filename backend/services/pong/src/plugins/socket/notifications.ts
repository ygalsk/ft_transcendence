import type { FastifyInstance } from "fastify";
import type { Room } from "../../game/room";
import type { AiDifficulty } from "../../game/types";

const READY_LEAD_MS = 3000; // 3s countdown for clearer start

export function emitMatchReady(
  fastify: FastifyInstance,
  room: Room,
  mode: "casual" | "tournament",
  options?: { aiDifficulty?: AiDifficulty }
): number | null {
  const left = room.players.left;
  const right = room.players.right;
  if (!left || !right) return null;

  const startAt = Date.now() + READY_LEAD_MS;

  fastify.io.to(room.id).emit("match_ready", {
    matchId: room.id,
    mode,
    startAt,
    aiDifficulty: options?.aiDifficulty,
    players: {
      left: { displayName: left.displayName, userId: left.userId },
      right: { displayName: right.displayName, userId: right.userId },
    },
  });

  return startAt;
}

export function scheduleStart(room: Room, startAt: number | null): void {
  if (!startAt) return;
  const delay = Math.max(0, startAt - Date.now());
  setTimeout(() => room.startFromCountdown(), delay);
}
