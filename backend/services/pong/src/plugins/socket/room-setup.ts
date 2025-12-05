import type { FastifyInstance } from "fastify";
import { Room, createRoom, removeRoom } from "../../game/room";
import type { MatchConfig } from "../../game/types";
import { reportCasualMatch, reportTournamentMatch } from "./reporters";

export function setupRoom(
  fastify: FastifyInstance,
  matchId: string,
  config: MatchConfig,
  userServiceUrl: string
): Room {
  const room = createRoom(matchId, config);

  room.log = (level, message, meta) => {
    (fastify.log as any)[level](meta || {}, message);
  };

  room.broadcastState = (state) => {
    fastify.io.to(room.id).emit("state", state);
  };

  room.onMatchFinished = async (payload) => {
    const {
      matchId: finishedMatchId,
      tournamentId,
      tournamentMatchId,
      winnerSide,
      score,
      leftPlayer,
      rightPlayer,
      reason,
    } = payload;

    const winner = winnerSide === "left" ? leftPlayer : rightPlayer;
    const loser = winnerSide === "left" ? rightPlayer : leftPlayer;

    fastify.log.info(
      {
        roomId: room.id,
        matchId: finishedMatchId,
        winnerSide,
        score,
        reason,
        tournamentId,
        tournamentMatchId,
        winnerUserId: winner?.userId,
        loserUserId: loser?.userId,
      },
      "Match finished"
    );

    fastify.io.to(room.id).emit("match_end", {
      winnerSide,
      score,
      reason,
      players: {
        left: leftPlayer && {
          displayName: leftPlayer.displayName,
          userId: leftPlayer.userId,
        },
        right: rightPlayer && {
          displayName: rightPlayer.displayName,
          userId: rightPlayer.userId,
        },
      },
      tournamentId,
    });

    fastify.io.socketsLeave(room.id);
    removeRoom(room.id);

    if (tournamentId && tournamentMatchId) {
      await reportTournamentMatch(fastify, payload, userServiceUrl);
      return;
    }

    await reportCasualMatch(fastify, payload, userServiceUrl);
  };

  return room;
}
