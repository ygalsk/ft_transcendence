import type { MatchConfig } from "../types";
import { Room } from "./room";
import type { RoomHooks } from "./types";
import {
  pongActiveGames,
  pongMatchesTotal,
  pongMatchDuration,
} from "../../metrics/pong.metrics";

export const rooms = new Map<string, Room>();

export function createRoom(
  id: string,
  config: MatchConfig,
  hooks: Partial<RoomHooks> = {}
): Room {
  const room = new Room(id, config, hooks);
  rooms.set(id, room);

  // Track game start
  const gameType = config.tournamentId ? "tournament" : "casual";
  pongActiveGames.inc({ type: gameType });
  pongMatchesTotal.inc({ type: gameType, status: "started" });

  // Store metadata for metrics
  (room as any).startTime = Date.now();
  (room as any).gameType = gameType;

  room.start();
  return room;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

export function removeRoom(id: string): void {
  const room = rooms.get(id);
  if (room) {
    // Track game end
    const gameType = (room as any).gameType || "casual";
    pongActiveGames.dec({ type: gameType });

    // Track duration
    const startTime = (room as any).startTime;
    if (startTime) {
      const duration = (Date.now() - startTime) / 1000;
      pongMatchDuration.observe({ type: gameType }, duration);
    }

    // Track completion
    pongMatchesTotal.inc({ type: gameType, status: "completed" });

    room.stop();
    rooms.delete(id);
  }
}
