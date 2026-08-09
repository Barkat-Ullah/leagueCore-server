import httpStatus from "http-status";
import { Division, TournamentPlacement } from "@prisma/client";
import prisma from "../shared/prisma";
import ApiError from "../errors/ApiErrors";
import { SERIES_RULES } from "./seriesRules";
import { resolvePlacements } from "./resolvePlacements";

export const awardSeriesPointsForTournament = async (tournamentId: string) => {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, status: true, tournamentStage: true },
  });

  if (!t) throw new ApiError(httpStatus.NOT_FOUND, "Tournament not found");
  if (t.status !== "COMPLETED") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Tournament must be COMPLETED to award series points");
  }

  // Only PROVING + CROWN award series points
  if (t.tournamentStage === "ROYAL") {
    return { message: "ROYAL tournament does not award series points", awarded: 0 };
  }

  const rules = SERIES_RULES[t.tournamentStage];

  // Registrations for this tournament with divisionName
  const regs = await prisma.teamregistration.findMany({
    where: { tournamentId },
    select: {
      id: true, // Teamregistration.id
      teamId: true, // Teams.id
      tourDivision: { select: { divisionName: true } },
    },
  });

  if (!regs.length) return { message: "No teams registered", awarded: 0 };

  // Group registrations by division
  const byDiv = new Map<Division, typeof regs>();
  for (const r of regs) {
    const dn = r.tourDivision.divisionName;
    const arr = byDiv.get(dn) ?? [];
    arr.push(r);
    byDiv.set(dn, arr);
  }

  let awarded = 0;

  await prisma.$transaction(async (tx) => {
    for (const [divisionName, divRegs] of byDiv.entries()) {
      const regIds = divRegs.map((r) => r.id);

      // Completed matches WITH scores, for teams in this division (by registration ids)
      const matches = await tx.match.findMany({
        where: {
          tournamentId,
          status: "COMPLETED",
          homeScore: { not: null },
          awayScore: { not: null },
          OR: [{ homeTeamId: { in: regIds } }, { awayTeamId: { in: regIds } }],
        },
        select: {
          stage: true,
          homeTeamId: true,
          awayTeamId: true,
          homeScore: true,
          awayScore: true,
        },
      });

      const scored = matches.map((m) => ({
        stage: m.stage,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeScore: m.homeScore as number,
        awayScore: m.awayScore as number,
      }));

      // wins per registration id
      const wins = new Map<string, number>();
      for (const rid of regIds) wins.set(rid, 0);

      for (const m of scored) {
        if (m.homeScore === m.awayScore) continue;
        const winnerRegId = m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
        wins.set(winnerRegId, (wins.get(winnerRegId) ?? 0) + 1);
      }

      // placements per registration id
      const placements = resolvePlacements(scored);

      // Persist ledger rows
      for (const reg of divRegs) {
        const teamId = reg.teamId;
        const placement: TournamentPlacement = placements.get(reg.id) ?? "PARTICIPANT";
        const w = wins.get(reg.id) ?? 0;

        const basePoints = rules.base[placement];
        const winPoints = w * rules.winBonus;
        const totalPoints = basePoints + winPoints;

        await tx.seriesPointsLedger.upsert({
          where: {
            teamId_tournamentId_divisionName: {
              teamId,
              tournamentId,
              divisionName,
            },
          },
          create: {
            teamId,
            tournamentId,
            divisionName,
            tournamentStage: t.tournamentStage,
            placement,
            wins: w,
            basePoints,
            winPoints,
            totalPoints,
          },
          update: {
            tournamentStage: t.tournamentStage,
            placement,
            wins: w,
            basePoints,
            winPoints,
            totalPoints,
          },
        });

        awarded += 1;
      }
    }
  });

  return { message: "Series points awarded", awarded };
};