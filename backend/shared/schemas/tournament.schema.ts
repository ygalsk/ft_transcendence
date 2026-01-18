import { Type, Static } from "@sinclair/typebox";

// ============================
// Create Tournament
// ============================

export const CreateTournamentSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 50 }),
  max_players: Type.Integer({ minimum: 2, maximum: 128 }),
});

export type CreateTournamentType = Static<typeof CreateTournamentSchema>;

// ============================
// Join Tournament
// ============================

export const JoinTournamentSchema = Type.Object({
  tournamentId: Type.Integer({ minimum: 1 }),
});

export type JoinTournamentType = Static<typeof JoinTournamentSchema>;

// ============================
// Internal: match-complete
// Called by pong-service
// ============================

export const TournamentMatchCompleteSchema = Type.Object({
  tournamentId: Type.Integer(),
  tournamentMatchId: Type.Integer(),
  winnerId: Type.Integer(),
  leftPlayerId: Type.Integer(),
  rightPlayerId: Type.Integer(),
  leftScore: Type.Integer(),
  rightScore: Type.Integer(),
});

export type TournamentMatchCompleteType = Static<
  typeof TournamentMatchCompleteSchema
>;
