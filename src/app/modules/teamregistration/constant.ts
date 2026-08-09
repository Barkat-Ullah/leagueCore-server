// Helpers ────────────────────────────────────────────────

function formatTimeUntil(start: Date): string {
  const now = new Date();
  const diffMs = start.getTime() - now.getTime();

  if (diffMs <= 0) return "Started";

  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);

  return `${days} DAYS : ${hours.toString().padStart(2, "0")} HOURS`;
}

function buildActivityList(players: any[], reg: any): any[] {
  const events: { message: string; time: string }[] = [];

  // Registration event
  if (reg.createdAt) {
    events.push({
      message: "Tournament registration confirmed",
      time: formatRelativeTime(reg.createdAt),
    });
  }

  // Player events — newest first (already ordered in query)
  players.slice(0, 6).forEach((p) => {
    if (p.status === "Signed" && p.signedAt) {
      events.push({
        message: "Player signed waiver",
        time: formatRelativeTime(p.signedAt),
      });
    } else if (p.status === "Pending") {
      events.push({
        message: "New player added – waiver pending",
        time: formatRelativeTime(p.createdAt),
      });
    }
  });

  // Sort newest → oldest
  return events.sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const min = Math.floor(diffMs / 60000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day > 1) return `${day} days ago`;
  if (day === 1) return "1 day ago";
  if (hr > 1) return `${hr} hours ago`;
  if (hr === 1) return "1 hour ago";
  if (min > 1) return `${min} minutes ago`;
  return "just now";
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TournamentStage = "PROVING" | "CROWN" | "ROYAL";
type MatchStage = "GROUP" | "QUARTER_FINAL" | "SEMI_FINAL" | "FINAL";
type MatchOutcome = "WIN" | "DRAW" | "LOSS" | "PENDING";
type Placement =
  | "CHAMPION"
  | "RUNNER_UP"
  | "SEMI_FINALIST"
  | "QUARTER_FINALIST"
  | "PARTICIPANT";

export interface RawMatch {
  id: string;
  scheduledAt: Date;
  field: string | null;
  stage: MatchStage;
  homeScore: number | null;
  awayScore: number | null;
  round: number | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: { id: string; teamName: string };
  awayTeam: { id: string; teamName: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Point tables — keyed by TournamentStage
// ─────────────────────────────────────────────────────────────────────────────

export const SERIES_POINTS: Record<
  TournamentStage,
  {
    CHAMPION: number;
    RUNNER_UP: number;
    SEMI_FINALIST: number;
    QUARTER_FINALIST: number;
    PARTICIPANT: number;
    perWin: number;
  }
> = {
  PROVING: {
    CHAMPION: 25,
    RUNNER_UP: 15,
    SEMI_FINALIST: 10,
    QUARTER_FINALIST: 5,
    PARTICIPANT: 1,
    perWin: 1,
  },
  CROWN: {
    CHAMPION: 50,
    RUNNER_UP: 30,
    SEMI_FINALIST: 20,
    QUARTER_FINALIST: 10,
    PARTICIPANT: 2,
    perWin: 2,
  },
  // Royal Cup resets accumulated points — no new series points awarded
  ROYAL: {
    CHAMPION: 0,
    RUNNER_UP: 0,
    SEMI_FINALIST: 0,
    QUARTER_FINALIST: 0,
    PARTICIPANT: 0,
    perWin: 0,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine a single match outcome from the perspective of `teamRegId`.
 */
function getMatchOutcome(
  teamRegId: string,
  match: RawMatch
): MatchOutcome {
  const { homeTeamId, awayTeamId, homeScore, awayScore } = match;

  if (homeScore === null || awayScore === null) return "PENDING";

  const isHome = teamRegId === homeTeamId;

  // Safety: if this team is not a participant in the match, skip
  if (!isHome && teamRegId !== awayTeamId) return "PENDING";

  const teamScore = isHome ? homeScore : awayScore;
  const opponentScore = isHome ? awayScore : homeScore;

  if (teamScore > opponentScore) return "WIN";
  if (teamScore === opponentScore) return "DRAW";
  return "LOSS";
}

/**
 * Infer the deepest placement this team achieved in the tournament.
 *
 * Priority order: FINAL → SEMI_FINAL → QUARTER_FINAL → GROUP
 *
 * - Won FINAL   → CHAMPION
 * - Lost FINAL  → RUNNER_UP
 * - Reached SEMI_FINAL (regardless of result, since losing SEMI
 *   means they didn't reach FINAL) → SEMI_FINALIST
 * - Reached QUARTER_FINAL but not SEMI → QUARTER_FINALIST
 * - Otherwise → PARTICIPANT
 */
function derivePlacement(
  teamRegId: string,
  matches: RawMatch[]
): Placement {
  // Matches where this team actually played
  const myMatches = matches.filter(
    (m) => m.homeTeamId === teamRegId || m.awayTeamId === teamRegId
  );

  const stageOrder: MatchStage[] = [
    "FINAL",
    "SEMI_FINAL",
    "QUARTER_FINAL",
    "GROUP",
  ];

  for (const stage of stageOrder) {
    const stageMatch = myMatches.find((m) => m.stage === stage);
    if (!stageMatch) continue;

    if (stage === "FINAL") {
      const outcome = getMatchOutcome(teamRegId, stageMatch);
      // If FINAL is still PENDING, we can't determine placement yet
      if (outcome === "PENDING") return "PARTICIPANT";
      return outcome === "WIN" ? "CHAMPION" : "RUNNER_UP";
    }

    if (stage === "SEMI_FINAL") return "SEMI_FINALIST";
    if (stage === "QUARTER_FINAL") return "QUARTER_FINALIST";
  }

  return "PARTICIPANT";
}

/**
 * Enrich all division matches and compute summary stats for `teamRegId`.
 */
function computeTeamSummary(
  teamRegId: string,
  tournamentStage: TournamentStage,
  allDivisionMatches: RawMatch[]
) {
  // Split into "my matches" and "other matches"
  const myMatches: RawMatch[] = [];
  const otherMatches: RawMatch[] = [];

  for (const m of allDivisionMatches) {
    if (m.homeTeamId === teamRegId || m.awayTeamId === teamRegId) {
      myMatches.push(m);
    } else {
      otherMatches.push(m);
    }
  }

  // ── Per-match enrichment ──────────────────────────────────────────────────
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let totalMatchPoints = 0; // within-tournament 3/1/0 system

  const enrichedMyMatches = myMatches.map((m) => {
    const outcome = getMatchOutcome(teamRegId, m);
    const isHome = m.homeTeamId === teamRegId;

    // Match points (within-tournament, never changes)
    const pts =
      outcome === "WIN" ? 3 : outcome === "DRAW" ? 1 : 0;

    // Tally completed matches only
    if (outcome === "WIN") wins++;
    else if (outcome === "DRAW") draws++;
    else if (outcome === "LOSS") losses++;

    if (outcome !== "PENDING") {
      const gf = isHome
        ? (m.homeScore ?? 0)
        : (m.awayScore ?? 0);
      const ga = isHome
        ? (m.awayScore ?? 0)
        : (m.homeScore ?? 0);
      goalsFor += gf;
      goalsAgainst += ga;
      totalMatchPoints += pts;
    }

    return {
      id: m.id,
      scheduledAt: m.scheduledAt,
      field: m.field,
      stage: m.stage,
      round: m.round,
      isHome,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      outcome,       // "WIN" | "DRAW" | "LOSS" | "PENDING"
      matchPoints: pts,
    };
  });

  // ── Placement & series points ─────────────────────────────────────────────
  const placement = derivePlacement(teamRegId, allDivisionMatches);
  const table = SERIES_POINTS[tournamentStage];

  // ROYAL Cup: points reset, no accumulation
  const placementPoints =
    tournamentStage === "ROYAL" ? 0 : table[placement];
  const winBonusPoints =
    tournamentStage === "ROYAL" ? 0 : wins * table.perWin;
  const totalSeriesPoints = placementPoints + winBonusPoints;

  return {
    summary: {
      placement,           // CHAMPION | RUNNER_UP | SEMI_FINALIST | QUARTER_FINALIST | PARTICIPANT
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      totalMatchPoints,    // within-tournament points (3 win / 1 draw / 0 loss)
      placementPoints,     // Crown Series qualification points from placement
      winBonusPoints,      // Crown Series qualification points from wins
      totalSeriesPoints,   // Total Crown Series qualification points earned
    },
    myMatches: enrichedMyMatches,
    otherMatches: otherMatches.map((m) => ({
      id: m.id,
      scheduledAt: m.scheduledAt,
      field: m.field,
      stage: m.stage,
      round: m.round,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    })),
  };
}

export {
  formatRelativeTime,
  buildActivityList,
  formatTimeUntil,
  computeTeamSummary,
};
