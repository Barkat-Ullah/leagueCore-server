import { z } from 'zod';
import { Prisma, TournamentStage, GameStyle, TournamentStatus } from '@prisma/client';

const divisionSchema = z.object({
  id: z.string().optional(),
  divisionName: z.string({
    required_error: "Division Name is required",
    invalid_type_error: "Division Name must be a text value",
  }).min(1, "Division Name is required"),

  maxTeams: z.number({
    required_error: "Max Teams is required",
    invalid_type_error: "Max Teams must be a number",
  }).int("Max Teams must be an integer"),
}).strict();

// Auto-generated from Prisma model: Tournament
const createSchema = z.object({
  tournamentStage: z.nativeEnum(TournamentStage, {
    errorMap: () => ({ message: "Please select a valid Tournament Stage" })
  }).optional(),
  name: z.string({
    required_error: "Name is required",
    invalid_type_error: "Name must be a text value"
  }).min(1, "Name is required"),
  startDate: z.coerce.date({
    required_error: "Start Date is required",
    invalid_type_error: "Please provide a valid Start Date"
  }),
  endDate: z.coerce.date({
    required_error: "End Date is required",
    invalid_type_error: "Please provide a valid End Date"
  }),
  location: z.string({
    required_error: "Location is required",
    invalid_type_error: "Location must be a text value"
  }).min(1, "Location is required").optional(),
  mapLink: z.string({
    required_error: "Map Link is required",
    invalid_type_error: "Map Link must be a text value"
  }).min(1, "Map Link is required").optional(),
  registrationDeadline: z.coerce.date({
    required_error: "Registration Deadline is required",
    invalid_type_error: "Please provide a valid Registration Deadline"
  }),
  numberOfFields: z.number({
    required_error: "Number Of Fields is required",
    invalid_type_error: "Number Of Fields must be a number"
  }).int("Number Of Fields must be an integer"),
  youthFee: z.number({
    required_error: "Youth Fee is required",
    invalid_type_error: "Youth Fee must be a number"
  }),
  adultFee: z.number({
    required_error: "Adult Fee is required",
    invalid_type_error: "Adult Fee must be a number"
  }),
  notes: z.string({
    required_error: "Notes is required",
    invalid_type_error: "Notes must be a text value"
  }).min(1, "Notes is required").optional(),
  gameStyle: z.nativeEnum(GameStyle, {
    errorMap: () => ({ message: "Please select a valid Game Style" })
  }).optional(),
  rosterSizeMax: z.number({
    required_error: "Roster Size Max is required",
    invalid_type_error: "Roster Size Max must be a number"
  }).int("Roster Size Max must be an integer").optional(),
  status: z.nativeEnum(TournamentStatus, {
    errorMap: () => ({ message: "Please select a valid Status" })
  }).optional(),
  bathrooms: z.string().optional(),
  foods: z.string().optional(),
  parking: z.string().optional(),
  prizePool: z.string().optional(),
  isDeleted: z.boolean({
    required_error: "Is Deleted is required",
    invalid_type_error: "Is Deleted must be true/false"
  }).optional(),
  divisions: z.array(divisionSchema).min(1, "At least one division is required").optional(),
}).strict();

const updateSchema = z.object({
  tournamentStage: z.nativeEnum(TournamentStage, {
    errorMap: () => ({ message: "Please select a valid Tournament Stage" })
  }).optional(),
  name: z.string({
    required_error: "Name is required",
    invalid_type_error: "Name must be a text value"
  }).min(1, "Name is required").optional(),
  startDate: z.coerce.date({
    required_error: "Start Date is required",
    invalid_type_error: "Please provide a valid Start Date"
  }).optional(),
  endDate: z.coerce.date({
    required_error: "End Date is required",
    invalid_type_error: "Please provide a valid End Date"
  }).optional(),
  location: z.string({
    required_error: "Location is required",
    invalid_type_error: "Location must be a text value"
  }).min(1, "Location is required").optional(),
  mapLink: z.string({
    required_error: "Map Link is required",
    invalid_type_error: "Map Link must be a text value"
  }).min(1, "Map Link is required").optional(),
  registrationDeadline: z.coerce.date({
    required_error: "Registration Deadline is required",
    invalid_type_error: "Please provide a valid Registration Deadline"
  }).optional(),
  numberOfFields: z.number({
    required_error: "Number Of Fields is required",
    invalid_type_error: "Number Of Fields must be a number"
  }).int("Number Of Fields must be an integer").optional(),
  youthFee: z.number({
    required_error: "Youth Fee is required",
    invalid_type_error: "Youth Fee must be a number"
  }).optional(),
  adultFee: z.number({
    required_error: "Adult Fee is required",
    invalid_type_error: "Adult Fee must be a number"
  }).optional(),
  notes: z.string({
    required_error: "Notes is required",
    invalid_type_error: "Notes must be a text value"
  }).min(1, "Notes is required").optional(),
  gameStyle: z.nativeEnum(GameStyle, {
    errorMap: () => ({ message: "Please select a valid Game Style" })
  }).optional(),
  rosterSizeMax: z.number({
    required_error: "Roster Size Max is required",
    invalid_type_error: "Roster Size Max must be a number"
  }).int("Roster Size Max must be an integer").optional(),
  bathrooms: z.string().optional(),
  foods: z.string().optional(),
  parking: z.string().optional(),
  prizePool: z.string().optional(),
  status: z.nativeEnum(TournamentStatus, {
    errorMap: () => ({ message: "Please select a valid Status" })
  }).optional(),
  isDeleted: z.boolean({
    required_error: "Is Deleted is required",
    invalid_type_error: "Is Deleted must be true/false"
  }).optional(),
  divisions: z.array(divisionSchema).min(1, "At least one division is required").optional(),
}).strict();

export const editMatchSchema = z.object({
  scheduledAt: z.string().datetime().optional(), // ISO string
  field: z.string().min(1).optional(),
  refereeId: z.string().optional().nullable(),

  homeTeamId: z.string().optional(),
  awayTeamId: z.string().optional(),

  homeScore: z.number().int().min(0).optional().nullable(),
  awayScore: z.number().int().min(0).optional().nullable(),

  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).optional(),
  isPublished: z.boolean().optional(),
});

export const tournamentValidation = {
  createSchema,
  updateSchema,
  editMatchSchema,
};