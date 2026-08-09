import { Prisma, TournamentStage } from "@prisma/client";
import prisma from "../shared/prisma";
import ApiError from "../errors/ApiErrors";
import httpStatus from "http-status";

const ADULT_DIVISIONS = new Set([
  "MENS_DIV_1",
  "MENS_DIV_2",
  "MENS_DIV_3",
  "WOMENS",
  "COED",
  "HS_BOYS",
  "HS_GIRLS",
  "U17_BOYS",
  "U18_BOYS",
  "U17_GIRLS",
  "U18_GIRLS",
] as const);
type DivisionEnum = Prisma.TournamentDivisionGetPayload<{
  select: { divisionName: true };
}>["divisionName"];

export const isAdultDivision = (divisionName: DivisionEnum) =>
  ADULT_DIVISIONS.has(divisionName as any);

export function buildAllPairs(teamIds: string[]) {
  const teams = [...teamIds];
  if (teams.length < 2) return [];

  if (teams.length % 2 === 1) teams.push("__BYE__");

  const n = teams.length;
  const rounds: Array<Array<{ home: string; away: string }>> = [];

  const fixed = teams[0];
  let rotating = teams.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<{ home: string; away: string }> = [];

    const left = [fixed, ...rotating.slice(0, n / 2 - 1)];
    const right = [...rotating.slice(n / 2 - 1)].reverse();

    for (let i = 0; i < left.length; i++) {
      const a = left[i];
      const b = right[i];
      if (a === "__BYE__" || b === "__BYE__") continue;

      const even = r % 2 === 0;
      pairs.push(even ? { home: a, away: b } : { home: b, away: a });
    }

    rounds.push(pairs);

    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, rotating.length - 1)];
  }

  const firstLeg = rounds.flat();
  const secondLeg = firstLeg.map(m => ({ home: m.away, away: m.home }));

  return [...firstLeg, ...secondLeg]; // ✅ double round robin
};

export function buildDailySlots(params: {
  date: Date; // midnight date
  dailyStartHour: number;
  dailyEndHour: number;
  slotStepMinutes: number;
  fieldCount: number;
}) {
  const { date, dailyStartHour, dailyEndHour, slotStepMinutes, fieldCount } = params;

  const dayStart = new Date(date);
  dayStart.setHours(dailyStartHour, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(dailyEndHour, 0, 0, 0);

  const slots: Array<{ scheduledAt: Date; fields: string[] }> = [];

  for (let t = new Date(dayStart); t.getTime() < dayEnd.getTime();) {
    slots.push({
      scheduledAt: new Date(t),
      fields: Array.from({ length: fieldCount }, (_, i) => `Field ${i + 1}`),
    });
    t = new Date(t.getTime() + slotStepMinutes * 60_000);
  }

  return slots;
}

export type StandingRow = {
  teamId: string;
  points: number;
  gd: number;
  gf: number;
};

export const computeGroupStandings = async (divisionId: string): Promise<StandingRow[]> => {
  // ✅ include ALL teams (even if played=0)
  const teams = await prisma.teamregistration.findMany({
    where: { teamDivisionId: divisionId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const map = new Map<string, StandingRow>();
  for (const t of teams) {
    map.set(t.id, { teamId: t.id, points: 0, gd: 0, gf: 0 });
  }

  // ✅ use only matches with scores
  const matches = await prisma.match.findMany({
    where: {
      divisionId,
      stage: "GROUP",
      status: "COMPLETED",
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
  });

  const ensure = (teamId: string) => {
    if (!map.has(teamId)) map.set(teamId, { teamId, points: 0, gd: 0, gf: 0 });
    return map.get(teamId)!;
  };

  for (const m of matches) {
    const hs = m.homeScore as number;
    const as = m.awayScore as number;

    const h = ensure(m.homeTeamId);
    const a = ensure(m.awayTeamId);

    h.gf += hs;
    a.gf += as;

    h.gd += hs - as;
    a.gd += as - hs;

    if (hs > as) h.points += 3;
    else if (hs < as) a.points += 3;
    else {
      h.points += 1;
      a.points += 1;
    }
  }

  return Array.from(map.values()).sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (y.gd !== x.gd) return y.gd - x.gd;
    return y.gf - x.gf;
  });
};

export const syncPlayoffsFromStandings = async (
  divisionId: string,
  tournamentId: string,
  standings: StandingRow[]
) => {
  if (standings.length < 4) return;

  // ✅ Only start playoffs when GROUP fully finished
  const totalGroup = await prisma.match.count({ where: { divisionId, stage: "GROUP" } });
  const finishedGroup = await prisma.match.count({
    where: {
      divisionId,
      stage: "GROUP",
      status: "COMPLETED",
      homeScore: { not: null },
      awayScore: { not: null },
    },
  });

  if (totalGroup === 0 || finishedGroup !== totalGroup) return;

  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId },
    select: { endDate: true, numberOfFields: true },
  });
  if (!tournament) return;

  const fieldCount = Math.max(1, tournament.numberOfFields || 1);
  const fields = Array.from({ length: fieldCount }, (_, i) => `Field ${i + 1}`);

  const winnerId = (m: { homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number }) => {
    if (m.homeScore === m.awayScore) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Playoff matches cannot end in a draw");
    }
    return m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
  };

  // ------------------------------------------------------------
  // 1) QUARTER FINALS (Top 8) if standings >= 8
  // ------------------------------------------------------------
  if (standings.length >= 8) {
    const existingQF = await prisma.match.count({
      where: { divisionId, tournamentId, stage: "QUARTER_FINAL" },
    });

    if (existingQF === 0) {
      const qfTime1 = new Date(tournament.endDate); qfTime1.setHours(9, 0, 0, 0);
      const qfTime2 = new Date(tournament.endDate); qfTime2.setHours(10, 30, 0, 0);

      const s = standings.map(x => x.teamId); // sorted already
      // Seeds: 1..8 -> index 0..7
      const qfPairs: Array<[string, string]> = [
        [s[0], s[7]], // 1 vs 8
        [s[1], s[6]], // 2 vs 7
        [s[2], s[5]], // 3 vs 6
        [s[3], s[4]], // 4 vs 5
      ];

      await prisma.match.createMany({
        data: qfPairs.map(([homeTeamId, awayTeamId], idx) => {
          const slotTime = idx < 2 ? qfTime1 : qfTime2; // 2 matches per slot
          const field = fields[Math.min(idx % fields.length, fields.length - 1)];

          return {
            tournamentId,
            divisionId,
            stage: "QUARTER_FINAL",
            round: idx + 1,
            homeTeamId,
            awayTeamId,
            scheduledAt: new Date(slotTime),
            field,
            status: "SCHEDULED",
            isPublished: true,
          };
        }),
      });
    }

    // If QFs exist, wait until all completed before semis
    const qfs = await prisma.match.findMany({
      where: { divisionId, tournamentId, stage: "QUARTER_FINAL" },
      select: { status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, round: true },
      orderBy: { round: "asc" },
    });

    if (qfs.length < 4) return;

    const qfCompleted = qfs.every(
      m =>
        m.status === "COMPLETED" &&
        typeof m.homeScore === "number" &&
        typeof m.awayScore === "number"
    );
    if (!qfCompleted) return;

    // Build semifinalists from QF winners in bracket order:
    // (QF1 winner vs QF4 winner) and (QF2 winner vs QF3 winner) OR typical bracket:
    // winner(1vs8) vs winner(4vs5) and winner(2vs7) vs winner(3vs6)
    const qfWinners = qfs.map(m =>
      winnerId({
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeScore: m.homeScore as number,
        awayScore: m.awayScore as number,
      })
    );

    const sfPairs: Array<[string, string]> = [
      [qfWinners[0], qfWinners[3]],
      [qfWinners[1], qfWinners[2]],
    ];

    const existingSemis = await prisma.match.count({
      where: { divisionId, tournamentId, stage: "SEMI_FINAL" },
    });

    if (existingSemis === 0) {
      const sfTime1 = new Date(tournament.endDate); sfTime1.setHours(12, 0, 0, 0);
      const sfTime2 = new Date(tournament.endDate); sfTime2.setHours(13, 30, 0, 0);

      await prisma.match.createMany({
        data: sfPairs.map(([homeTeamId, awayTeamId], idx) => ({
          tournamentId,
          divisionId,
          stage: "SEMI_FINAL",
          round: idx + 1,
          homeTeamId,
          awayTeamId,
          scheduledAt: new Date(idx === 0 ? sfTime1 : sfTime2),
          field: fields[Math.min(idx, fields.length - 1)],
          status: "SCHEDULED",
          isPublished: true,
        })),
      });
    }
  }

  // ------------------------------------------------------------
  // 2) SEMI FINALS (Top 4) if no QF path
  // ------------------------------------------------------------
  if (standings.length < 8) {
    const existingSemis = await prisma.match.count({
      where: { divisionId, tournamentId, stage: "SEMI_FINAL" },
    });

    if (existingSemis === 0) {
      const s = standings.map(x => x.teamId);
      const seed1 = s[0], seed2 = s[1], seed3 = s[2], seed4 = s[3];

      const semi1Time = new Date(tournament.endDate); semi1Time.setHours(9, 0, 0, 0);
      const semi2Time = new Date(tournament.endDate); semi2Time.setHours(10, 30, 0, 0);

      await prisma.match.createMany({
        data: [
          {
            tournamentId,
            divisionId,
            stage: "SEMI_FINAL",
            round: 1,
            homeTeamId: seed1,
            awayTeamId: seed4,
            scheduledAt: semi1Time,
            field: fields[0],
            status: "SCHEDULED",
            isPublished: true,
          },
          {
            tournamentId,
            divisionId,
            stage: "SEMI_FINAL",
            round: 2,
            homeTeamId: seed2,
            awayTeamId: seed3,
            scheduledAt: semi2Time,
            field: fields[Math.min(1, fields.length - 1)],
            status: "SCHEDULED",
            isPublished: true,
          },
        ],
      });
    }
  }

  // ------------------------------------------------------------
  // 3) FINAL (after SEMIS completed)
  // ------------------------------------------------------------
  const existingFinal = await prisma.match.findFirst({
    where: { divisionId, tournamentId, stage: "FINAL" },
    select: { id: true },
  });
  if (existingFinal) return;

  const semis = await prisma.match.findMany({
    where: { divisionId, tournamentId, stage: "SEMI_FINAL" },
    select: { status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, round: true },
    orderBy: { round: "asc" },
  });

  if (semis.length < 2) return;

  const semisCompleted = semis.every(
    s =>
      s.status === "COMPLETED" &&
      typeof s.homeScore === "number" &&
      typeof s.awayScore === "number"
  );
  if (!semisCompleted) return;

  const finalist1 = winnerId({
    homeTeamId: semis[0].homeTeamId,
    awayTeamId: semis[0].awayTeamId,
    homeScore: semis[0].homeScore as number,
    awayScore: semis[0].awayScore as number,
  });

  const finalist2 = winnerId({
    homeTeamId: semis[1].homeTeamId,
    awayTeamId: semis[1].awayTeamId,
    homeScore: semis[1].homeScore as number,
    awayScore: semis[1].awayScore as number,
  });

  const finalTime = new Date(tournament.endDate);
  finalTime.setHours(15, 0, 0, 0);

  await prisma.match.create({
    data: {
      tournamentId,
      divisionId,
      stage: "FINAL",
      round: 1,
      homeTeamId: finalist1,
      awayTeamId: finalist2,
      scheduledAt: finalTime,
      field: fields[0],
      status: "SCHEDULED",
      isPublished: true,
    },
  });
};

export type StandingStatusBadge = "PENDING" | "QUALIFIED" | "ON_THE_BUBBLE" | "ELIMINATED";
export const clampDiscount = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
export const getDefaultDiscount = (rank: number) => {
  if (rank === 1) return 100;
  if (rank === 2) return 75;
  if (rank === 3) return 50;
  if (rank === 4) return 25;
  if (rank <= 7) return 10;
  return 0;
};
export const highestPowerOfTwoLE = (n: number) => {
  if (n <= 1) return 1;
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
};
export const winBonusByStage = (stage: TournamentStage) => (stage === "CROWN" ? 2 : 1);


export const markInvitationAccepted = async ({
  invitedTeamId,
  invitationId,
}: {
  invitedTeamId: string;
  invitationId: string;
}) => {
  await prisma.$transaction(async (tx) => {
    await tx.invitedTeam.update({
      where: { id: invitedTeamId },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });

    await tx.teaminvitation.update({
      where: { id: invitationId },
      data: { status: "ACCEPTED" },
    });
  });
};

export const getPendingInvitationForRegistration = async ({
  coachId,
  teamId,
  tournamentId,
  teamDivisionId,
}: {
  coachId: string;
  teamId: string; // Teams.id
  tournamentId: string;
  teamDivisionId: string;
}) => {
  return prisma.invitedTeam.findFirst({
    where: {
      status: "PENDING",
      teamId,
      team: { coachId },
      invitation: {
        toTournamentId: tournamentId,
        toTournamentDivisionId: teamDivisionId,
        status: "PENDING",
      },
    },
    select: {
      id: true,
      invitationId: true,
    },
  });
};

