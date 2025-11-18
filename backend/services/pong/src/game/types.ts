//
// src/game/types.ts
//

// ---------------------------
// Game State & Core Constants
// ---------------------------

export type PlayerSide = "left" | "right";

export type GameState =
  | "waiting"     // room created, waiting for players
  | "starting"    // both players are present; serve countdown running
  | "playing"     // ball is in motion
  | "paused"      // after a goal, before next serve
  | "finished";   // match ended

// ---------------------------
// Geometry Types
// ---------------------------

export interface Vec2 {
  x: number;
  y: number;
}

export interface PaddleState {
  y: number;        // paddle Y position
  height: number;   // paddle height (default: 100)
}

export interface BallState {
  position: Vec2;
  velocity: Vec2;
}

// ---------------------------
// Score & Match Tracking
// ---------------------------

export interface ScoreState {
  left: number;
  right: number;
}

export interface MatchConfig {
  scoreLimit: number;          // default: 11
  allowSpectators: boolean;    // default: true
  enableAi: boolean;           // match may spawn an AI for absent player
  tournamentId?: number;       // set only for tournament matches
}

// ---------------------------
// Player Identity in Room
// ---------------------------

// Sent from frontend → backend when joining a match
export interface JoinPayload {
  matchId: string;
  userId: number | null;       // null = guest
  displayName: string;
  avatarUrl?: string;
  side?: PlayerSide | null;    // optional: client may suggest, but server decides
}

// Stored internally in the Room
export interface RoomPlayer {
  socketId: string;            // socket.io id
  userId: number | null;       // permanent ID or null for guests
  displayName: string;
  avatarUrl?: string;
  side: PlayerSide;            // left or right
  isAi: boolean;               // AI-controlled?
  connected: boolean;          // for disconnect/reconnect logic
  disconnectTimer?: NodeJS.Timeout; // grace timer if disconnected
}

// ---------------------------
// Player Inputs (authoritative server-side)
// ---------------------------

export interface PlayerInput {
  up: boolean;
  down: boolean;
}

// ---------------------------
// Serialized Game State (sent to frontend)
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

