import { TournamentStage } from "@prisma/client";
import prisma from "../../../shared/prisma";

const seriesSeedData = [
  {
    type: TournamentStage.PROVING,
    youthFee: 0,
    adultFee: 0,
  },
  {
    type: TournamentStage.CROWN,
    youthFee: 0,
    adultFee: 0,
  },
  {
    type: TournamentStage.ROYAL,
    youthFee: 0,
    adultFee: 0,
  },
];

export const seedSeries = async () => {
  for (const series of seriesSeedData) {
    await prisma.series.upsert({
      where: { type: series.type }, // no duplicate — finds by type
      update: {}, // already exists → do nothing
      create: series, // not exists → create it
    });
  }

  console.log("✅ Series seed completed");
};
