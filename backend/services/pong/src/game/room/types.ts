import type {
  PlayerSide,
  RoomPlayer,
  ScoreState,
  SerializedGameState,
} from "../types";

export type MatchEndReason = "normal" | "disconnect" | "forfeit";

export interface MatchFinishedPayload {
  matchId: string;
  tournamentId?: number;
  tournamentMatchId?: number;
  winnerSide: PlayerSide;
  score: ScoreState;
  leftPlayer: RoomPlayer | null;
  rightPlayer: RoomPlayer | null;
  reason: MatchEndReason;
}

export type RoomLogLevel = "info" | "warn" | "error";
export type RoomLogger = (
  level: RoomLogLevel,
  message: string,
  meta?: unknown
) => void;

export interface RoomHooks {
  broadcastState: (state: SerializedGameState) => void;
  onMatchFinished: (payload: MatchFinishedPayload) => void;
  log: RoomLogger;
}

export type RoomPlayers = {
  left: RoomPlayer | null;
  right: RoomPlayer | null;
};
