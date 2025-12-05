import type { MatchConfig } from "../types";
import { Room } from "./room";
import type { RoomHooks } from "./types";

export const rooms = new Map<string, Room>();

export function createRoom(
  id: string,
  config: MatchConfig,
  hooks: Partial<RoomHooks> = {}
): Room {
  const room = new Room(id, config, hooks);
  rooms.set(id, room);
  room.start();
  return room;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

export function removeRoom(id: string): void {
  const room = rooms.get(id);
  if (room) {
    room.stop();
    rooms.delete(id);
  }
}
