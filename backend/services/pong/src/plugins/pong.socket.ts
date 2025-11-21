//
// src/plugins/pong.socket.ts — with AI difficulty + guest support
//

import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { Socket } from "socket.io";

import { createRoom, getRoom, removeRoom, Room } from "../game/room";
import { MatchConfig, PlayerSide, PlayerInput, AiDifficulty } from "../game/types";
import { generateServiceToken } from "../../shared/plugins/auth";

const DEFAULT_SCORE_LIMIT = 11;

// Simple casual matchmaking: only one waiting player for now
let waitingSocket: Socket | null = null;

interface AuthUser {
  userId: number | null;
  email: string | null;
  display_name?: string;
}

function getDisplayName(user: AuthUser): string {
  return (
    user.display_name ||
    user.email ||
    (user.userId ? `User#${user.userId}` : "Guest")
  );
}

export default fp(async function pongSocketPlugin(fastify: FastifyInstance) {
  fastify.addHook("onReady", async () => {
    const io = fastify.io;

    io.on("connection", async (socket: Socket) => {
      //
      // 1️⃣ Get authenticated user OR create guest identity
      //
      let user = socket.data.user as AuthUser | null;

      if (!user) {
        // Guest user — allowed for casual
        user = {
          userId: null,
          email: null,
          display_name: "Guest#" + Math.floor(Math.random() * 9999),
        };

        socket.data.user = user;

        fastify.log.info(
          { socketId: socket.id, as: user.display_name },
          "Guest connected to Pong service"
        );
      } else {
        // Authenticated user: enrich display name if missing
        if (!user.display_name && user.userId !== null) {
          try {
            const res = await fetch(
              `${process.env.USER_SERVICE_URL || "http://user-service:5000"}/users/${user.userId}`
            );
            if (res.ok) {
              const data = (await res.json()) as { display_name?: string };
              user.display_name = data.display_name || user.email || "User";
            }
          } catch {
            fastify.log.warn(
              { userId: user.userId },
              "Could not fetch display name for authenticated user"
            );
          }
        }

        socket.data.user = user;

        fastify.log.info(
          { socketId: socket.id, userId: user.userId, displayName: user.display_name },
          "Authenticated player connected via WebSocket"
        );
      }

      //
      // At this point: socket.data.user is ALWAYS defined (guest or real)
      //

      // ------------------------
      // CASUAL MATCHMAKING
      // ------------------------

      socket.on(
        "join_casual",
        (payload?: { vsAi?: boolean; difficulty?: AiDifficulty }) => {
        const vsAi = payload?.vsAi ?? false;
        const difficulty: AiDifficulty = payload?.difficulty ?? "medium";
        const displayName = getDisplayName(user!);

      if (vsAi) {
        const matchId = `casual-${socket.id}-${Date.now()}`;

        const config: MatchConfig = {
          scoreLimit: DEFAULT_SCORE_LIMIT,
          allowSpectators: true,
          enableAi: true,
          aiDifficulty: difficulty,
        };

        const room = setupRoom(fastify, matchId, config);

        const side: PlayerSide | null = room.addHumanPlayer({
          socketId: socket.id,
          userId: user!.userId,
          displayName,
          avatarUrl: undefined,
        });

        if (!side) {
          fastify.log.error({ matchId, userId: user!.userId }, "Failed to assign side in vsAi match");
          socket.emit("error", { message: "Unable to join match" });
          return;
        }

        const aiSide: PlayerSide = side === "left" ? "right" : "left";

        // 👇 Correct call
        room.addAi(aiSide, `AI (${difficulty})`, difficulty);

        socket.data.roomId = room.id;
        socket.data.side = side;
        socket.join(room.id);

        socket.emit("match_start", {
          matchId: room.id,
          you: side,
          opponent: `AI (${difficulty})`,
          mode: "casual",
        });

        fastify.log.info(
          { roomId: room.id, playerSide: side, as: displayName, difficulty },
          "Casual vs AI match started"
        );
        return;
}
        //
        // 🤝 Human vs Human casual matchmaking
        //
        if (!waitingSocket) {
          waitingSocket = socket;
          socket.emit("waiting", { message: "🕐 Waiting for opponent..." });
          fastify.log.info({ socketId: socket.id }, "Player added to matchmaking queue");
        } else if (waitingSocket.id !== socket.id) {
          const p1 = waitingSocket;
          const p1User = p1.data.user as AuthUser;
          waitingSocket = null;

          const matchId = `casual-${p1.id}-${socket.id}-${Date.now()}`;
          const config: MatchConfig = {
            scoreLimit: DEFAULT_SCORE_LIMIT,
            allowSpectators: true,
            enableAi: false,
          };

          const room = setupRoom(fastify, matchId, config);

          const p1Side = room.addHumanPlayer({
            socketId: p1.id,
            userId: p1User.userId,
            displayName: getDisplayName(p1User),
            avatarUrl: undefined,
          });

          const p2Side = room.addHumanPlayer({
            socketId: socket.id,
            userId: user!.userId,
            displayName: getDisplayName(user!),
            avatarUrl: undefined,
          });

          if (!p1Side || !p2Side) {
            fastify.log.error({ matchId }, "Failed to assign sides in casual matchmaking");
            p1.emit("error", { message: "Failed to create match" });
            socket.emit("error", { message: "Failed to create match" });
            return;
          }

          p1.data.roomId = room.id;
          p1.data.side = p1Side;
          socket.data.roomId = room.id;
          socket.data.side = p2Side;

          p1.join(room.id);
          socket.join(room.id);

          const left = room.players.left;
          const right = room.players.right;

          p1.emit("match_start", {
            matchId: room.id,
            you: p1Side,
            opponent: p1Side === "left" ? right?.displayName : left?.displayName,
            mode: "casual",
          });

          socket.emit("match_start", {
            matchId: room.id,
            you: p2Side,
            opponent: p2Side === "left" ? right?.displayName : left?.displayName,
            mode: "casual",
          });

          fastify.log.info(
            {
              roomId: room.id,
              leftUserId: left?.userId,
              rightUserId: right?.userId,
            },
            "Casual human-vs-human match started"
          );
        }
      });

      // ------------------------
      // JOIN MATCH (tournament / direct)
      // ------------------------

      socket.on(
        "join_match",
        (payload: { matchId: string; scoreLimit?: number; tournamentId?: number }) => {
          const { matchId, scoreLimit, tournamentId } = payload;

          if (!matchId) {
            socket.emit("error", { message: "matchId is required" });
            return;
          }

          // Guests cannot join tournaments
          if (tournamentId && user!.userId === null) {
            socket.emit("error", { message: "Guests cannot join tournaments" });
            return;
          }

          const displayName = getDisplayName(user!);
          let room = getRoom(matchId);

          if (!room) {
            const config: MatchConfig = {
              scoreLimit: scoreLimit ?? DEFAULT_SCORE_LIMIT,
              allowSpectators: true,
              enableAi: false,
              tournamentId,
            };
            room = setupRoom(fastify, matchId, config);
          }

          const side = room.addHumanPlayer({
            socketId: socket.id,
            userId: user!.userId,
            displayName,
            avatarUrl: undefined,
          });

          if (!side) {
            socket.data.roomId = room.id;
            socket.join(room.id);
            socket.emit("spectator_joined", {
              matchId: room.id,
              mode: tournamentId ? "tournament" : "casual",
            });
            return;
          }

          socket.data.roomId = room.id;
          socket.data.side = side;
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

          fastify.log.info(
            { roomId: room.id, side, as: displayName },
            "Player joined match via join_match"
          );
        }
      );

      // ------------------------
      // INPUT EVENTS
      // ------------------------

      socket.on("input", (data: { up?: boolean; down?: boolean }) => {
        const roomId = socket.data.roomId as string | undefined;
        const side = socket.data.side as PlayerSide | undefined;
        if (!roomId || !side) return;

        const room = getRoom(roomId);
        if (!room) return;

        const input: PlayerInput = {
          up: !!data.up,
          down: !!data.down,
        };

        room.setInput(side, input);
      });

      // ------------------------
      // DISCONNECT
      // ------------------------

      socket.on("disconnect", () => {
        fastify.log.info({ socketId: socket.id }, "Socket disconnected");

        if (waitingSocket?.id === socket.id) {
          waitingSocket = null;
        }

        const roomId = socket.data.roomId as string | undefined;
        if (!roomId) return;

        const room = getRoom(roomId);
        if (!room) return;

        room.handleDisconnect(socket.id);
      });
    });
  });
});

// ------------------------
// Room setup helper
// ------------------------

function setupRoom(
  fastify: FastifyInstance,
  matchId: string,
  config: MatchConfig
): Room {
  const room = createRoom(matchId, config);

  room.log = (level, message, meta) => {
    (fastify.log as any)[level](meta || {}, message);
  };

  room.broadcastState = (state) => {
    fastify.io.to(room.id).emit("state", state);
  };

  room.onMatchFinished = async (payload) => {
    const { winnerSide, score, leftPlayer, rightPlayer, reason, tournamentId } = payload;

    const winner = winnerSide === "left" ? leftPlayer : rightPlayer;
    const loser = winnerSide === "left" ? rightPlayer : leftPlayer;

    fastify.log.info(
      {
        roomId: room.id,
        winnerSide,
        score,
        reason,
        tournamentId,
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

    // Persist only authenticated vs authenticated results
    if (!winner?.userId || !loser?.userId) {
      fastify.log.warn(
        { roomId: room.id },
        "Skipping match persistence — missing authenticated users"
      );
      return;
    }

    try {
      const insert = fastify.db.prepare(
        `INSERT INTO matches (winner_id, loser_id, left_score, right_score, duration)
         VALUES (?, ?, ?, ?, ?)`
      );
      insert.run(
        winner.userId,
        loser.userId,
        score.left,
        score.right,
        null
      );
    } catch (err: any) {
      fastify.log.error({ err: err.message }, "Failed to save match");
    }

    try {
      const token = generateServiceToken("pong");
      const response = await fetch(
        `${process.env.USER_SERVICE_URL || "http://user-service:5000"}/internal/match-result`,
        {
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
            tournamentId,
            leftUserId: leftPlayer?.userId,
            rightUserId: rightPlayer?.userId,
          }),
        }
      );

      if (!response.ok) {
        fastify.log.error(
          { status: response.status, statusText: response.statusText },
          "Failed to report match to user service"
        );
      }
    } catch (err: any) {
      fastify.log.error({ err: err.message }, "Error reporting match result");
    }
  };

  return room;
}
