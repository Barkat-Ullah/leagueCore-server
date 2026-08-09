import { z } from "zod";
import { Season } from "@prisma/client";

const weekSchema = z.object({
  weekNumber: z.number({ required_error: "Week number is required" }),
  startDate: z.string({ required_error: "Start date is required" }),
  endDate: z.string({ required_error: "End date is required" }),
});

const createSchema = z
  .object({
    scheduleName: z
      .string({ required_error: "Schedule name is required" })
      .min(1),
    season: z.nativeEnum(Season, { required_error: "Season is required" }),
    numberOfWeek: z.number({ required_error: "Number of weeks is required" }),
    weeks: z.array(weekSchema).min(1, "At least one week is required"),
  })
  .strict();

const updateSchema = z
  .object({
    scheduleName: z.string().optional(),
    season: z.nativeEnum(Season).optional(),
    numberOfWeek: z.number().optional(),
    weeks: z.array(weekSchema).optional(),
  })
  .strict();

const updateCapacitySchema = z
  .object({
    capacity: z.number({ required_error: "Capacity is required" }).min(0),
  })
  .strict();

export const scheduleValidation = {
  createSchema,
  updateSchema,
  updateCapacitySchema,
};
