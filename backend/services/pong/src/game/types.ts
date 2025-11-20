//
// src/game/types.ts
//

// ---------------------------
// Sides & Difficulty
// ---------------------------

export type PlayerSide = "left" | "right";

export type AiDifficulty = "easy" | "medium" | "hard";

export type GameState =
  | "waiting"
  | "starting"
  | "playing"
  | "paused"
  | "finished";

// ---------------------------
// Geometry
// ---------------------------

export interface Vec2 {
  x: number;
  y: number;
}

export interface PaddleState {
  y: number;
  height: number;
}

export interface BallState {
  position: Vec2;
  velocity: Vec2;
}

// ---------------------------
// Score & Config
// ---------------------------

export interface ScoreState {
  left: number;
  right: number;
}

export interface MatchConfig {
  scoreLimit: number;
  allowSpectators: boolean;
  enableAi: boolean;
  aiDifficulty?: AiDifficulty;      // ⭐ Used by Room.addAi()
  tournamentId?: number;
}

// ---------------------------
// Room Players
// ---------------------------

export interface JoinPayload {
  matchId: string;
  userId: number | null;            // null = guest
  displayName: string;
  avatarUrl?: string;
  side?: PlayerSide | null;
}

export interface RoomPlayer {
  socketId: string;
  userId: number | null;
  displayName: string;
  avatarUrl?: string;
  side: PlayerSide;
  isAi: boolean;
  connected: boolean;
  disconnectTimer?: NodeJS.Timeout;
}

// ---------------------------
// Inputs
// ---------------------------

export interface PlayerInput {
  up: boolean;
  down: boolean;
}

// ---------------------------
// Serialized State → Sent to client
// ---------------------------

export interface SerializedGameState {
  state: GameState;

  ball: BallState;

  paddles: {
    left: PaddleState;
    right: PaddleState;
  };

  score: ScoreState;

  players: {
    left: {
      displayName: string;
      avatarUrl?: string;
      userId: number | null;
    };
    right: {
      displayName: string;
      avatarUrl?: string;
      userId: number | null;
    };
  };

  meta: {
    roomId: string;
    timestamp: number;
    isTournament: boolean;
    tournamentId?: number;
  };
}
