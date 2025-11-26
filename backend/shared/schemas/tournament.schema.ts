import { Type, Static } from "@sinclair/typebox";

// ============================
// Create Tournament
// ============================

export const CreateTournamentSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 50 }),
  max_players: Type.Integer({ minimum: 2, maximum: 128 }),
  is_public: Type.Optional(Type.Boolean()),
});

export type CreateTournamentType = Static<typeof CreateTournamentSchema>;

// ============================
// Join Tournament (with alias)
// ============================

export const JoinTournamentSchema = Type.Object({
  tournamentId: Type.Integer({ minimum: 1 }),
  alias: Type.String({ minLength: 1, maxLength: 32 }), // ⭐ NEW
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
