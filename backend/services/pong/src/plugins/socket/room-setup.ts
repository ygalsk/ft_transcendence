import type { FastifyInstance } from "fastify";
import { createRoom, removeRoom, Room } from "../../game/room";
import type { RoomHooks } from "../../game/room";
import type { MatchConfig } from "../../game/types";
import { reportCasualMatch, reportTournamentMatch } from "./reporters";

export function setupRoom(
  fastify: FastifyInstance,
  matchId: string,
  config: MatchConfig,
  userServiceUrl: string
): Room {
  return createRoom(matchId, config, buildHooks(fastify, matchId, userServiceUrl));
}

function buildHooks(
  fastify: FastifyInstance,
  roomId: string,
  userServiceUrl: string
): RoomHooks {
  return {
    log: (level, message, meta) => (fastify.log as any)[level](meta || {}, message),
    broadcastState: (state) => fastify.io.to(roomId).emit("state", state),
    onMatchFinished: async (payload) => {
      const {
        matchId,
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
          roomId,
          matchId,
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

      fastify.io.to(roomId).emit("match_end", {
        winnerSide,
        score,
        reason,
        players: {
          left: leftPlayer && { displayName: leftPlayer.displayName, userId: leftPlayer.userId },
          right: rightPlayer && { displayName: rightPlayer.displayName, userId: rightPlayer.userId },
        },
        tournamentId,
      });

      fastify.io.socketsLeave(roomId);
      removeRoom(roomId);

      if (tournamentId && tournamentMatchId) {
        await reportTournamentMatch(fastify, payload);
        return;
      }

      await reportCasualMatch(fastify, payload, userServiceUrl);
    },
  };
}
