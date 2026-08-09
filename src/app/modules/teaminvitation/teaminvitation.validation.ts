import { z } from "zod";
import { InviteStatus } from "@prisma/client";

const objectId = z
  .string({
    required_error: "Id is required",
    invalid_type_error: "Id must be a text value",
  })
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid Id");

// ✅ CREATE
const createSchema = z
  .object({
    // if you pass toTournamentId via params, keep this optional
    toTournamentId: objectId.optional(),

    toTournamentDivisionId: objectId,

    status: z
      .nativeEnum(InviteStatus, {
        errorMap: () => ({ message: "Please select a valid Status" }),
      })
      .optional(),

    // ✅ FIX: expect array of ObjectId strings
    teamIds: z.array(objectId).min(1, "At least 1 teamId is required"),
  })
  .strict();

// ✅ UPDATE (keep optional)
const updateSchema = z
  .object({
    toTournamentId: objectId.optional(),
    toTournamentDivisionId: objectId.optional(),
    status: z
      .nativeEnum(InviteStatus, {
        errorMap: () => ({ message: "Please select a valid Status" }),
      })
      .optional(),

    // allow updating invite list if you want
    teamIds: z.array(objectId).optional(),
  })
  .strict();

export const teaminvitationValidation = {
  createSchema,
  updateSchema,
};