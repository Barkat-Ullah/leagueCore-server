import { z } from "zod";
import { ageVerifiedStatus, Prisma, wavierStatus } from "@prisma/client";

// Auto-generated from Prisma model: Teamplayer
const createSchema = z
  .object({
    fullName: z
      .string({
        required_error: "Full name is required",
        invalid_type_error: "Full name must be a string",
      })
      .min(2, "Full name must be at least 2 characters"),

    email: z
      .string({
        required_error: "Email is required",
        invalid_type_error: "Email must be a string",
      })
      .email("Invalid email")
      .optional(),

    phone: z
      .string({
        required_error: "Phone is required",
        invalid_type_error: "Phone must be a string",
      })
      .min(8, "Phone number is too short")
      .max(15, "Phone number is too long"),

    dob: z.coerce.date({
      required_error: "Date of birth is required",
      invalid_type_error: "Invalid date of birth",
    }),

    password: z
      .string({
        required_error: "Password is required",
        invalid_type_error: "Password must be a string",
      })
      .min(6, "Password must be at least 6 characters"),

    jerseyNum: z
      .string({
        required_error: "Jersey number is required",
        invalid_type_error: "Jersey number must be a string",
      })
      .min(1, "Jersey number cannot be empty"),
  })
  .strict();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId");
const addPlayersToRosterSchema = z
  .object({
    teamregisterId: objectId,
    existingPlayerIds: z.array(objectId).optional().default([]),
    newPlayers: z.array(createSchema).optional().default([]),
  })
  .strict();

const updateSchema = z
  .object({
    ageVerified: z
      .nativeEnum(ageVerifiedStatus, {
        errorMap: () => ({
          message: "Please select a valid age verified status",
        }),
      })
      .optional(),
    note: z
      .string({
        required_error: "Note is required",
        invalid_type_error: "Note must be a string",
      })
      .optional(),
    signName: z
      .string({
        required_error: "Sign name is required",
        invalid_type_error: "Sign name must be a string",
      })
      .optional(),
    isAgree: z
      .boolean({
        required_error: "isAgree is required",
        invalid_type_error: "is Agree must be a boolean",
      })
      .optional(),
  })
  .strict();

export const teamplayerValidation = {
  createSchema: addPlayersToRosterSchema,
  updateSchema,
};
