// shared/schemas/tournament.schema.ts
import { Type, Static } from "@sinclair/typebox";

// POST /tournaments
export const CreateTournamentSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  max_players: Type.Number({ minimum: 2, maximum: 256 }),
  is_public: Type.Optional(Type.Boolean()),
});

export type CreateTournamentType = Static<typeof CreateTournamentSchema>;

// POST /tournaments/join
export const JoinTournamentSchema = Type.Object({
  tournamentId: Type.Number(),
});

export type JoinTournamentType = Static<typeof JoinTournamentSchema>;

// POST /internal/tournament/match-complete
export const TournamentMatchCompleteSchema = Type.Object({
  tournamentId: Type.Number(),
  pongMatchId: Type.String(),      // 👈 links to tournament_matches.pong_match_id
  winnerId: Type.Number(),
  leftPlayerId: Type.Number(),
  rightPlayerId: Type.Number(),
  leftScore: Type.Number({ minimum: 0 }),
  rightScore: Type.Number({ minimum: 0 }),
});

export type TournamentMatchCompleteType = Static<
  typeof TournamentMatchCompleteSchema
>;
