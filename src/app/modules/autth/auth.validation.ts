import { z } from "zod";

const createSchema = z.object({
  email: z
    .string({
      required_error: "Email is required",
      invalid_type_error: "Email must be a text value",
    })
    .email("Please provide a valid email address"),

  password: z
    .string({
      required_error: "Password is required",
      invalid_type_error: "Password must be a text value",
    })
    .min(8, "Password must be at least 8 characters long"),
});

const changePasswordValidationSchema = z.object({
  oldPassword: z
    .string({
      required_error: "Old password is required",
      invalid_type_error: "Old password must be a text value",
    })
    .min(8, "Old password must be at least 8 characters long"),

  newPassword: z
    .string({
      required_error: "New password is required",
      invalid_type_error: "New password must be a text value",
    })
    .min(8, "New password must be at least 8 characters long")
    .refine((val) => val.trim().length > 0, {
      message: "New password cannot be empty",
    }),
});

export const authValidation = {
  createSchema,
  changePasswordValidationSchema,
};
