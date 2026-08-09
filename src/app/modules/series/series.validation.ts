import { z } from 'zod';
import { Prisma, TournamentStage } from '@prisma/client';

// Auto-generated from Prisma model: Series
const createSchema = z.object({
  youthFee: z.number({
        required_error: "Youth Fee is required",
        invalid_type_error: "Youth Fee must be a number"
      }).int("Youth Fee must be an integer").optional(),
  adultFee: z.number({
        required_error: "Adult Fee is required",
        invalid_type_error: "Adult Fee must be a number"
      }).int("Adult Fee must be an integer").optional(),
  type: z.nativeEnum(TournamentStage, {
    errorMap: () => ({ message: "Please select a valid Type" })
  }).optional(),
}).strict();

const updateSchema = z.object({
  youthFee: z.number({
        required_error: "Youth Fee is required",
        invalid_type_error: "Youth Fee must be a number"
      }).int("Youth Fee must be an integer").optional(),
  adultFee: z.number({
        required_error: "Adult Fee is required",
        invalid_type_error: "Adult Fee must be a number"
      }).int("Adult Fee must be an integer").optional(),
  type: z.nativeEnum(TournamentStage, {
    errorMap: () => ({ message: "Please select a valid Type" })
  }).optional(),
}).strict();

export const seriesValidation = {
  createSchema,
  updateSchema,
};