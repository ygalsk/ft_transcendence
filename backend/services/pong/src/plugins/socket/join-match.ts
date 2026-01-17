import type { MatchConfig, PlayerSide } from "../../game/types";
import { getRoom } from "../../game/room";
import { setupRoom } from "./room-setup";
import { getDisplayName } from "./user";
import { emitMatchReady, scheduleStart } from "./notifications";
import type { JoinMatchPayload, SocketContext } from "./types";

function parseMatchKey(matchId: string): { tournamentId: number; round: number; index: number } | null {
  // Expected format: t{tid}-r{round}-m{index}
  const m = matchId.match(/^t(\d+)-r(\d+)-m(\d+)$/);
  if (!m) return null;
  return {
    tournamentId: Number(m[1]),
    round: Number(m[2]),
    index: Number(m[3]),
  };
}

async function isTournamentMatchFinished(
  fastify: any,
  userServiceUrl: string,
  tournamentId: number,
  tournamentMatchId: number,
  matchId: string
): Promise<boolean> {
  const parsed = parseMatchKey(matchId);
  if (!parsed) return false;

  try {
    const res = await fetch(
      `${userServiceUrl}/tournaments/${tournamentId}/round/${parsed.round}`
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { matches?: any[] };
    const match = data.matches?.find(
      (m) => m.matchId === tournamentMatchId || m.index === parsed.index
    );
    return match?.status === "finished";
  } catch (err) {
    fastify.log.warn(
      { err, matchId, tournamentId, tournamentMatchId },
      "Failed to verify tournament match status"
    );
    return false;
  }
}

export async function handleJoinMatch(
  ctx: SocketContext,
  payload: JoinMatchPayload,
  userServiceUrl: string,
  defaultScoreLimit: number
): Promise<void> {
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

  // Prevent replaying finished tournament matches by checking bracket status if possible
  if (tournamentId && tournamentMatchId) {
    const finished = await isTournamentMatchFinished(
      fastify,
      userServiceUrl,
      tournamentId,
      tournamentMatchId,
      matchId
    );
    if (finished) {
      socket.emit("error", { message: "This tournament match is already finished" });
      return;
    }
  }

  const displayName = getDisplayName(user);
  let room = getRoom(matchId);

  // --------------------------------------------
  // Reconnect path: same authenticated user returns
  // --------------------------------------------
  if (room && user.userId !== null) {
    if (room.state === "finished") {
      socket.emit("error", { message: "This match has already finished" });
      return;
    }
    const side = room.handleReconnect({
      socketId: socket.id,
      userId: user.userId,
    });

    if (side) {
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
        reconnected: true,
      });

      // Send current state immediately so the client doesn't wait
      socket.emit("state", room.getSerializedState());
      if (room.startAt && room.state !== "playing") {
        socket.emit("match_ready", {
          matchId: room.id,
          mode: tournamentId ? "tournament" : "casual",
          startAt: room.startAt,
        });
      }

      fastify.log.info(
        { roomId: room.id, side, as: displayName, tournamentId },
        "Player reconnected to match via join_match"
      );
      return;
    }
  }

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
    displayName: displayName,
    avatarUrl: undefined,
  });

  if (!side) {
    session.roomId = room.id;
    socket.join(room.id);
    socket.emit("spectator_joined", {
      matchId: room.id,
      mode: tournamentId ? "tournament" : "casual",
    });
    socket.emit("state", room.getSerializedState());
    if (room.startAt && room.state !== "playing") {
      socket.emit("match_ready", {
        matchId: room.id,
        mode: tournamentId ? "tournament" : "casual",
        startAt: room.startAt,
      });
    }
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
  socket.emit("state", room.getSerializedState());
  if (room.startAt && room.state !== "playing") {
    socket.emit("match_ready", {
      matchId: room.id,
      mode: tournamentId ? "tournament" : "casual",
      startAt: room.startAt,
    });
  }

  if (room.players.left && room.players.right) {
    room.clearNoShowForfeit();
    const startAt = emitMatchReady(
      fastify,
      room,
      tournamentId ? "tournament" : "casual"
    );
    room.startAt = startAt ?? null;
    scheduleStart(room, startAt);
    fastify.log.info({ roomId: room.id }, "Both players joined — starting match");
  } else {
    // Only one player present in a tournament: schedule no-show forfeit
    if (tournamentId) {
      const presentSide = room.players.left ? "left" : "right";
      room.scheduleNoShowForfeit(presentSide as PlayerSide);
    }
  }

  fastify.log.info(
    { roomId: room.id, side, as: displayName, tournamentId },
    "Player joined match via join_match"
  );
}
