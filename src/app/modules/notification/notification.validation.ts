import { z } from 'zod';
import { Prisma } from '@prisma/client';

// Auto-generated from Prisma model: Notification
const createSchema = z.object({
  title: z.string({
        required_error: "Title is required",
        invalid_type_error: "Title must be a text value"
      }).min(1, "Title is required"),
  body: z.string({
        required_error: "Body is required",
        invalid_type_error: "Body must be a text value"
      }).min(1, "Body is required"),
  data: z.string({
        required_error: "Data is required",
        invalid_type_error: "Data must be a text value"
      }).optional(),
  read: z.boolean({
        required_error: "Read is required",
        invalid_type_error: "Read must be true/false"
      }).optional(),
}).strict();

const updateSchema = z.object({
  title: z.string({
        required_error: "Title is required",
        invalid_type_error: "Title must be a text value"
      }).min(1, "Title is required").optional(),
  body: z.string({
        required_error: "Body is required",
        invalid_type_error: "Body must be a text value"
      }).min(1, "Body is required").optional(),
  data: z.string({
        required_error: "Data is required",
        invalid_type_error: "Data must be a text value"
      }).optional(),
  read: z.boolean({
        required_error: "Read is required",
        invalid_type_error: "Read must be true/false"
      }).optional(),
}).strict();

export const notificationValidation = {
  createSchema,
  updateSchema,
};