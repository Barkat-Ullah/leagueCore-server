import { z } from "zod";

const campPlayerSchema = z.object({
  playerName: z.string({ required_error: "Player name is required" }).min(1),
  dateOfBirth: z.string({ required_error: "Date of birth is required" }).datetime(),
  playerType: z.enum(["FIELD_PLAYER", "GOALIE"]),
  shirtSize: z.enum(["YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL"]),
});

const createSchema = z
  .object({
    schedulePeriodId: z.string({ required_error: "Schedule period is required" }),
    scheduleSessionIds: z
      .array(z.string(), { required_error: "Session IDs are required" })
      .min(1, "At least one session ID is required"),
    players: z
      .array(campPlayerSchema, { required_error: "Players are required" })
      .min(1, "At least one player is required"),
    parentName: z.string({ required_error: "Parent name is required" }).min(1),
    parentPhone: z.string({ required_error: "Phone number is required" }).min(1),
    parentEmail: z.string({ required_error: "Email is required" }).email(),
  })
  .strict();

const moveSessionSchema = z
  .object({
    toSessionIds: z
      .array(z.string(), { required_error: "Target session IDs are required" })
      .min(1, "At least one target session ID is required"),
    reason: z.string({ required_error: "Reason is required" }).min(1),
  })
  .strict();

const refundSchema = z
  .object({
    refundType: z.enum(["CREDIT", "REFUND"]).optional(),
    isCancelledByOrganization: z.boolean().optional().default(false),
  })
  .strict();

export const campRegistrationValidation = {
  createSchema,
  moveSessionSchema,
  refundSchema,
};
