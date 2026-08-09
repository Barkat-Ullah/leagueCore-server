import { z } from 'zod';

const createSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).min(1),
  badge: z.string({ required_error: 'Badge is required' }).min(1),
  role: z.string({ required_error: 'Role is required' }).min(1),
  coachBio: z.string({ required_error: 'Coach bio is required' }).min(1),
}).strict();

const updateSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).optional(),
  badge: z.string({ required_error: 'Badge is required' }).min(1).optional(),
  role: z.string({ required_error: 'Role is required' }).optional(),
  coachBio: z.string({ required_error: 'Coach bio is required' }).optional(),
}).strict();

export const coachValidation = {
  createSchema,
  updateSchema,
};
