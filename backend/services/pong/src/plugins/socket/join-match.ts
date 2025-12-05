import type { MatchConfig, PlayerSide } from "../../game/types";
import { getRoom } from "../../game/room";
import { setupRoom } from "./room-setup";
import { getDisplayName } from "./user";
import type { JoinMatchPayload, SocketContext } from "./types";

export function handleJoinMatch(
  ctx: SocketContext,
  payload: JoinMatchPayload,
  userServiceUrl: string,
  defaultScoreLimit: number
): void {
  const { fastify, socket, user, session } = ctx;
  const { matchId, scoreLimit, tournamentId, tournamentMatchId } = payload;

  if (!matchId) {
    socket.emit("error", { message: "matchId is required" });
    return;
  }

  if (tournamentId && user.userId === null) {
    socket.emit("error", { message: "Guests cannot join tournaments" });
    return;
  }

  const displayName = getDisplayName(user);
  let room = getRoom(matchId);

  if (!room) {
    const config: MatchConfig = {
      scoreLimit: scoreLimit ?? defaultScoreLimit,
      allowSpectators: true,
      enableAi: false,
      tournamentId,
      tournamentMatchId,
    };
    room = setupRoom(fastify, matchId, config, userServiceUrl);
  }

  const side = room.addHumanPlayer({
    socketId: socket.id,
    userId: user.userId,
    displayName,
    avatarUrl: undefined,
  });

  if (!side) {
    session.roomId = room.id;
    socket.join(room.id);
    socket.emit("spectator_joined", {
      matchId: room.id,
      mode: tournamentId ? "tournament" : "casual",
    });
    return;
  }

  session.roomId = room.id;
  session.side = side;
  socket.join(room.id);

  const opponent =
    side === "left"
      ? room.players.right?.displayName
      : room.players.left?.displayName;

  socket.emit("match_start", {
    matchId: room.id,
    you: side,
    opponent: opponent ?? "Waiting...",
    mode: tournamentId ? "tournament" : "casual",
  });

  if (room.players.left && room.players.right) {
    room.forceStart();
    fastify.log.info({ roomId: room.id }, "Both players joined — starting match");
  }

  fastify.log.info(
    { roomId: room.id, side, as: displayName, tournamentId },
    "Player joined match via join_match"
  );
}
