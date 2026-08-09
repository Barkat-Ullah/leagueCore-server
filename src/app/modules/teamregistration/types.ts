import { Division, TournamentPlacement, TournamentStage } from "@prisma/client";

export type TeamTournamentRow = {
  tournamentId: string;
  tournamentName: string;
  tournamentStage: TournamentStage;
  tournamentEndDate: Date;
  totalPoints: number;
  placement: TournamentPlacement;
  winsInTournament: number;
};

export type TeamAchievementsDashboardResponse = {
  teamId: string;
  teamName: string;
  divisionName: Division;
  meta: {
    resetAfter: Date;
    lastRoyalEndedAt: Date | null;
    totalTournaments: number;
  };
  totals: {
    historyPoints: number;
  };
  tournaments: TeamTournamentRow[];
};

type MatchResult = "WIN" | "LOSS" | "DRAW" | "PENDING";

export type TournamentMatchRow = {
  matchId: string;
  scheduledAt: Date;
  opponentTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  result: MatchResult;
};

export type TeamTournamentDetailsResponse = {
  divisionName: Division;
  tournament: {
    tournamentId: string;
    name: string;
    stage: TournamentStage;
    startDate: Date;
    endDate: Date;
  };
  points: {
    placement: TournamentPlacement | "PENDING";
    basePoints: number;
    winPoints: number;
    totalPoints: number;
    winsCounted: number;
  };
  summary: {
    played: number;
    wins: number;
    draws: number;
    losses: number;
    gf: number;
    ga: number;
    gd: number;
  };
  matches: TournamentMatchRow[];
};

export function calcMatchResult(
  isHome: boolean,
  hs: number | null,
  as: number | null,
): MatchResult {
  if (typeof hs !== "number" || typeof as !== "number") return "PENDING";
  if (hs === as) return "DRAW";
  const homeWon = hs > as;
  const win = isHome ? homeWon : !homeWon;
  return win ? "WIN" : "LOSS";
}

export const placementLabel = {
  WINNER: "🥇 Winner",
  RUNNER_UP: "🥈 Runner Up",
  SEMI_FINALIST: "🥉 Semi Finalist",
  QUARTER_FINALIST: "Quarter Finalist",
  PARTICIPANT: "Participant",
  // add others if they exist in your enum
} as const;

export const formatDate = (date: Date): string =>
  date
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase()
    .replace(/,/g, "");