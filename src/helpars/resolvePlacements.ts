import { MatchStage, TournamentPlacement } from "@prisma/client";

type ScoredMatch = {
  stage: MatchStage;
  homeTeamId: string; // Teamregistration.id
  awayTeamId: string; // Teamregistration.id
  homeScore: number;
  awayScore: number;
};

const winnerId = (m: ScoredMatch) => (m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId);
const loserId = (m: ScoredMatch) => (m.homeScore > m.awayScore ? m.awayTeamId : m.homeTeamId);

export const resolvePlacements = (matches: ScoredMatch[]) => {
  const placement = new Map<string, TournamentPlacement>();

  const priority: Record<TournamentPlacement, number> = {
    WINNER: 5,
    RUNNER_UP: 4,
    SEMI_FINALIST: 3,
    QUARTER_FINALIST: 2,
    PARTICIPANT: 1,
  };

  const set = (teamRegId: string, p: TournamentPlacement) => {
    const cur = placement.get(teamRegId) ?? "PARTICIPANT";
    if (priority[p] > priority[cur]) placement.set(teamRegId, p);
  };

  const finals = matches.filter((m) => m.stage === "FINAL" && m.homeScore !== m.awayScore);
  if (finals.length) {
    const f = finals[0];
    set(winnerId(f), "WINNER");
    set(loserId(f), "RUNNER_UP");
  }

  for (const s of matches.filter((m) => m.stage === "SEMI_FINAL" && m.homeScore !== m.awayScore)) {
    set(loserId(s), "SEMI_FINALIST");
  }

  for (const q of matches.filter((m) => m.stage === "QUARTER_FINAL" && m.homeScore !== m.awayScore)) {
    set(loserId(q), "QUARTER_FINALIST");
  }

  return placement;
};