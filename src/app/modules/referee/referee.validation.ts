import { z } from 'zod';
import { Prisma } from '@prisma/client';

// Auto-generated from Prisma model: Referee
const createSchema = z.object({
  name: z.string({
        required_error: "Name is required",
        invalid_type_error: "Name must be a text value"
      }).optional(),
  email: z.string({
        required_error: "Email is required",
        invalid_type_error: "Email must be a text value"
      }).min(1, "Email is required"),
  phoneNumber: z.string({
        required_error: "Phone Number is required",
        invalid_type_error: "Phone Number must be a text value"
      }).optional(),
}).strict();

const updateSchema = z.object({
  name: z.string({
        required_error: "Name is required",
        invalid_type_error: "Name must be a text value"
      }).optional(),
  email: z.string({
        required_error: "Email is required",
        invalid_type_error: "Email must be a text value"
      }).min(1, "Email is required").optional(),
  phoneNumber: z.string({
        required_error: "Phone Number is required",
        invalid_type_error: "Phone Number must be a text value"
      }).optional(),
}).strict();

export const refereeValidation = {
  createSchema,
  updateSchema,
};