import { TournamentPlacement, TournamentStage } from "@prisma/client";

export const SERIES_RULES: Record<
  TournamentStage,
  { base: Record<TournamentPlacement, number>; winBonus: number }
> = {
  PROVING: {
    base: {
      WINNER: 25,
      RUNNER_UP: 15,
      SEMI_FINALIST: 10,
      QUARTER_FINALIST: 5,
      PARTICIPANT: 1,
    },
    winBonus: 1,
  },
  CROWN: {
    base: {
      WINNER: 50,
      RUNNER_UP: 30,
      SEMI_FINALIST: 20,
      QUARTER_FINALIST: 10,
      PARTICIPANT: 2,
    },
    winBonus: 2,
  },
  ROYAL: {
    base: {
      WINNER: 0,
      RUNNER_UP: 0,
      SEMI_FINALIST: 0,
      QUARTER_FINALIST: 0,
      PARTICIPANT: 0,
    },
    winBonus: 0,
  },
};