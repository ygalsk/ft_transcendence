import { Type, Static } from "@sinclair/typebox";

//
// Create a tournament (user-facing)
//
export const CreateTournamentSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  max_players: Type.Integer({ minimum: 2, maximum: 128 }),
  is_public: Type.Optional(Type.Boolean()),
});

export type CreateTournamentType = Static<typeof CreateTournamentSchema>;

//
// Join a tournament (user-facing)
//
export const JoinTournamentSchema = Type.Object({
  tournamentId: Type.Integer(),
});

export type JoinTournamentType = Static<typeof JoinTournamentSchema>;

//
// Internal: pong-service reports a tournament match result
//
export const TournamentMatchCompleteSchema = Type.Object({
  tournamentId: Type.Integer(),
  tournamentMatchId: Type.Integer(),

  // winner + scores
  winnerId: Type.Integer(),
  leftPlayerId: Type.Integer(),
  rightPlayerId: Type.Integer(),
  leftScore: Type.Integer({ minimum: 0 }),
  rightScore: Type.Integer({ minimum: 0 }),
});

export type TournamentMatchCompleteType = Static<typeof TournamentMatchCompleteSchema>;
