import { z } from "zod";
import { UserRole } from "@prisma/client";

const createTeamRegistrationSchema = z
  .object({
    teamName: z
      .string()
      .min(2, "Team name must be at least 2 characters")
      .max(100).optional(),

    registrationPayStatus: z.string().optional(),
    image: z.string().url().optional(),

    teamId: z.string().min(24, "Invalid team ID format").optional(),
    tournamentId: z.string().min(24, "Invalid tournament ID format"),
    teamDivisionId: z.string().min(24, "Invalid division ID format"),
    methodId: z.string().optional(),
    isBundle: z.boolean().optional(),

    manager: z
      .object({
        firstName: z.string().min(1).max(50),
        lastName: z.string().min(1).max(50),
        email: z.string().email(),
        phone: z.string().optional(),
        password: z.string().min(8),
      })
      .optional(),
  })
  .strict();


// For update – most fields optional
const updateTeamRegistrationSchema = z
  .object({
    teamName: z.string().min(2).max(100).optional(),
    image: z.string().url().optional(),
    tournamentId: z.string().optional(),
    teamDivisionId: z.string().optional(),
    password: z.string().min(8).optional(),
  })
  .strict();

const inviteManagerSchema = z.object({
  fullName: z.string({
    required_error: "Full Name is required",
    invalid_type_error: "Full Name must be a text value",
  }).min(2).max(100),
  phoneNumber: z.string({
    required_error: "Phone Number is required",
    invalid_type_error: "Phone Number must be a text value",
  }),
  email: z.string({
    required_error: "Email is required",
    invalid_type_error: "Email must be a text value",
  }).email("Invalid email format"),
  password: z.string({
    required_error: "Password is required",
    invalid_type_error: "Password must be a text value",
  }).min(8, "Password must be at least 8 characters long"),
});

export const teamRegistrationValidation = {
  create: createTeamRegistrationSchema,
  update: updateTeamRegistrationSchema,
  inviteManager: inviteManagerSchema,
};
