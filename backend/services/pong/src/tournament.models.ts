import type { MatchFinishedPayload } from "./game/room";
import type { TournamentMatchCompleteType } from "../shared/schemas/tournament.schema";

export interface TournamentMatchReport {
  payload: MatchFinishedPayload;
  body: TournamentMatchCompleteType;
}

export interface TournamentRegistration {
  tournamentId: number;
  userId: number;
  alias?: string;
}

export interface TournamentMatchSeed {
  tournamentId: number;
  tournamentMatchId: number;
  matchId: string;
}
