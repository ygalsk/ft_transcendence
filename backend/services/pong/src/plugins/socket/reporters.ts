import type { FastifyInstance } from "fastify";
import { generateServiceToken } from "../../../shared/plugins/auth";
import type { MatchFinishedPayload } from "../../game/room";

export async function reportTournamentMatch(
  fastify: FastifyInstance,
  payload: MatchFinishedPayload
): Promise<void> {
  const { tournamentId, tournamentMatchId, winnerSide, score, leftPlayer, rightPlayer } = payload;

  if (!tournamentId || !tournamentMatchId) return;

  const winnerId = winnerSide === "left" ? leftPlayer?.userId : rightPlayer?.userId;

  const baseUrl = `http://localhost:${process.env.PONG_PORT || 6061}`;
  async function attemptOnce() {
    const token = generateServiceToken("pong");
    return await fetch(`${baseUrl}/internal/tournaments/match-complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Service ${token}`,
      },
      body: JSON.stringify({
        tournamentId,
        tournamentMatchId,
        winnerId: winnerId ?? null,
        leftPlayerId: leftPlayer?.userId ?? null,
        rightPlayerId: rightPlayer?.userId ?? null,
        leftScore: score.left,
        rightScore: score.right,
      }),
    });
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    const attempts = 3;
    let response: Response | null = null;
    
    for (let i = 0; i < attempts; i++) {
      response = await attemptOnce();
      if (response.ok) break;
      
      fastify.log.warn(
        { attempt: i + 1, status: response.status, statusText: response.statusText },
        "Tournament match report failed, retrying"
      );
      await sleep(300 * (i + 1));
    }

    if (!response || !response.ok) {
      fastify.log.error(
        { status: response?.status, statusText: response?.statusText, tournamentMatchId },
        "Failed to report tournament match"
      );
    } else {
      fastify.log.info({ tournamentMatchId }, "Tournament match reported successfully");
    }
  } catch (err: any) {
    fastify.log.error(
      { err: err.message, tournamentMatchId },
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

  // Store locally
  try {
    fastify.db
      .prepare(
        `INSERT INTO matches (winner_id, loser_id, left_score, right_score, duration)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(winner.userId, loser.userId, score.left, score.right, null);
    
    fastify.log.info("Casual match stored locally");
  } catch (err: any) {
    fastify.log.error({ err: err.message }, "Failed to save match locally");
  }

  // Report to user-service
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
        "Failed to report casual match to user-service"
      );
    } else {
      fastify.log.info("Casual match reported to user-service");
    }
  } catch (err: any) {
    fastify.log.error({ err: err.message }, "Error reporting casual match to user-service");
  }
}
