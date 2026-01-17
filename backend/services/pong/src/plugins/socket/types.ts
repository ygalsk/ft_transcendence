import type { FastifyInstance } from "fastify";
import type { Socket } from "socket.io";
import type { AiDifficulty, PlayerSide } from "../../game/types";

export interface SocketUser {
  userId: number | null;
  email: string | null;
  display_name?: string;
}

export interface SocketSession {
  roomId?: string;
  side?: PlayerSide;
}

export interface SocketContext {
  fastify: FastifyInstance;
  socket: Socket;
  user: SocketUser;
  session: SocketSession;
}

export interface CasualJoinPayload {
  vsAi?: boolean;
  difficulty?: AiDifficulty;
}

export interface JoinMatchPayload {
  matchId: string;
  scoreLimit?: number;
  tournamentId?: number;
  tournamentMatchId?: number;
}

export interface InputPayload {
  up?: boolean;
  down?: boolean;
}
