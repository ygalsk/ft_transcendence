import type { FastifyInstance } from "fastify";
import { generateServiceToken } from "../../../shared/plugins/auth";
import type { MatchFinishedPayload } from "../../game/room";

export async function reportTournamentMatch(
  fastify: FastifyInstance,
  payload: MatchFinishedPayload,
  userServiceUrl: string
): Promise<void> {
  const { tournamentId, tournamentMatchId, winnerSide, score, leftPlayer, rightPlayer } =
    payload;

  if (!tournamentId || !tournamentMatchId) return;

  const winner = winnerSide === "left" ? leftPlayer : rightPlayer;
  const loser = winnerSide === "left" ? rightPlayer : leftPlayer;

  try {
    const token = generateServiceToken("pong");

    const response = await fetch(
      `${userServiceUrl}/internal/tournaments/match-complete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Service ${token}`,
        },
        body: JSON.stringify({
          tournamentId,
          tournamentMatchId,
          winnerId: winner?.userId ?? null,
          leftPlayerId: leftPlayer?.userId ?? null,
          rightPlayerId: rightPlayer?.userId ?? null,
          leftScore: score.left,
          rightScore: score.right,
        }),
      }
    );

    if (!response.ok) {
      fastify.log.error(
        { status: response.status, statusText: response.statusText },
        "Failed to report tournament match"
      );
    } else {
      fastify.log.info("Tournament match reported to user-service");
    }
  } catch (err: any) {
    fastify.log.error(
      { err: err.message, loserUserId: loser?.userId },
      "Error reporting tournament match"
    );
  }
}

export async function reportCasualMatch(
  fastify: FastifyInstance,
  payload: MatchFinishedPayload,
  userServiceUrl: string
): Promise<void> {
  const { winnerSide, score, leftPlayer, rightPlayer } = payload;

  const winner = winnerSide === "left" ? leftPlayer : rightPlayer;
  const loser = winnerSide === "left" ? rightPlayer : leftPlayer;

  if (!winner?.userId || !loser?.userId) return;

  try {
    const insert = fastify.db.prepare(
      `INSERT INTO matches (winner_id, loser_id, left_score, right_score, duration)
       VALUES (?, ?, ?, ?, ?)`
    );
    insert.run(winner.userId, loser.userId, score.left, score.right, null);
    fastify.log.info("Normal match stored locally");
  } catch (err: any) {
    fastify.log.error({ err: err.message }, "Failed to save match locally");
  }

  try {
    const token = generateServiceToken("pong");

    const response = await fetch(`${userServiceUrl}/internal/match-result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Service ${token}`,
      },
      body: JSON.stringify({
        winnerId: winner.userId,
        loserId: loser.userId,
        leftScore: score.left,
        rightScore: score.right,
      }),
    });

    if (!response.ok) {
      fastify.log.error(
        { status: response.status, statusText: response.statusText },
        "Failed to report normal match"
      );
    } else {
      fastify.log.info("Normal match result reported to user-service");
    }
  } catch (err: any) {
    fastify.log.error(
      { err: err.message },
      "Error reporting normal match"
    );
  }
}
