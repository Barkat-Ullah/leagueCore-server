import { z } from 'zod';
import { Prisma, UserRole, UserStatus } from '@prisma/client';

// Auto-generated from Prisma model: User
const createSchema = z.object({
  fullName: z.string({
    required_error: "Full Name is required",
    invalid_type_error: "Full Name must be a text value"
  }),
  userName: z.string({
    required_error: "User Name is required",
    invalid_type_error: "User Name must be a text value"
  }).optional(),
  email: z.string({
    required_error: "Email is required",
    invalid_type_error: "Email must be a text value"
  }).min(1, "Email is required"),
  password: z.string({
    required_error: "Password is required",
    invalid_type_error: "Password must be a text value"
  }).min(8, "Password must be at least 8 characters long"),
  phoneNumber: z.string({
    required_error: "Phone Number is required",
    invalid_type_error: "Phone Number must be a text value"
  }),
  profileImage: z.string({
    required_error: "Profile Image is required",
    invalid_type_error: "Profile Image must be a text value"
  }).optional(),
  coverImage: z.string({
    required_error: "Cover Image is required",
    invalid_type_error: "Cover Image must be a text value"
  }).optional(),
  role: z.nativeEnum(UserRole, {
    errorMap: () => ({ message: "Please select a valid Role" })
  }).optional(),
  status: z.nativeEnum(UserStatus, {
    errorMap: () => ({ message: "Please select a valid Status" })
  }).optional(),
  emailVerified: z.boolean({
    required_error: "Email Verified is required",
    invalid_type_error: "Email Verified must be true/false"
  }).optional(),
  isBlocked: z.boolean({
    required_error: "Is Blocked is required",
    invalid_type_error: "Is Blocked must be true/false"
  }).optional(),
  isDeleted: z.boolean({
    required_error: "Is Deleted is required",
    invalid_type_error: "Is Deleted must be true/false"
  }).optional(),
  lat: z.number({
    required_error: "Lat is required",
    invalid_type_error: "Lat must be a number"
  }).optional(),
  lon: z.number({
    required_error: "Lon is required",
    invalid_type_error: "Lon must be a number"
  }).optional(),
  suspendedUntil: z.coerce.date({
    required_error: "Suspended Until is required",
    invalid_type_error: "Please provide a valid Suspended Until"
  }).optional(),
  lastLoginAt: z.coerce.date({
    required_error: "Last Login At is required",
    invalid_type_error: "Please provide a valid Last Login At"
  }).optional(),
  expirationOtp: z.coerce.date({
    required_error: "Expiration Otp is required",
    invalid_type_error: "Please provide a valid Expiration Otp"
  }).optional(),
  otp: z.number({
    required_error: "Otp is required",
    invalid_type_error: "Otp must be a number"
  }).int("Otp must be an integer").optional(),
  fcmToken: z.string({
    required_error: "Fcm Token is required",
    invalid_type_error: "Fcm Token must be a text value"
  }).optional(),
  onBoarding: z.boolean({
    required_error: "On Boarding is required",
    invalid_type_error: "On Boarding must be true/false"
  }).optional(),
  accountLink: z.string({
    required_error: "Account Link is required",
    invalid_type_error: "Account Link must be a text value"
  }).optional(),
  stripeAccountId: z.string({
    required_error: "Stripe Account Id is required",
    invalid_type_error: "Stripe Account Id must be a text value"
  }).optional(),
  customerId: z.string({
    required_error: "Customer Id is required",
    invalid_type_error: "Customer Id must be a text value"
  }).optional(),
  paymentMethodId: z.string({
    required_error: "Payment Method Id is required",
    invalid_type_error: "Payment Method Id must be a text value"
  }).optional(),
}).strict();

const updateSchema = z.object({
  fullName: z.string({
    required_error: "Full Name is required",
    invalid_type_error: "Full Name must be a text value"
  }).optional(),
  userName: z.string({
    required_error: "User Name is required",
    invalid_type_error: "User Name must be a text value"
  }).optional(),
  email: z.string({
    required_error: "Email is required",
    invalid_type_error: "Email must be a text value"
  }).min(1, "Email is required").optional(),
  password: z.string({
    required_error: "Password is required",
    invalid_type_error: "Password must be a text value"
  }).optional(),
  phoneNumber: z.string({
    required_error: "Phone Number is required",
    invalid_type_error: "Phone Number must be a text value"
  }).optional(),
  profileImage: z.string({
    required_error: "Profile Image is required",
    invalid_type_error: "Profile Image must be a text value"
  }).optional(),
  coverImage: z.string({
    required_error: "Cover Image is required",
    invalid_type_error: "Cover Image must be a text value"
  }).optional(),
  role: z.nativeEnum(UserRole, {
    errorMap: () => ({ message: "Please select a valid Role" })
  }).optional(),
  status: z.nativeEnum(UserStatus, {
    errorMap: () => ({ message: "Please select a valid Status" })
  }).optional(),
  emailVerified: z.boolean({
    required_error: "Email Verified is required",
    invalid_type_error: "Email Verified must be true/false"
  }).optional(),
  isBlocked: z.boolean({
    required_error: "Is Blocked is required",
    invalid_type_error: "Is Blocked must be true/false"
  }).optional(),
  isDeleted: z.boolean({
    required_error: "Is Deleted is required",
    invalid_type_error: "Is Deleted must be true/false"
  }).optional(),
  lat: z.number({
    required_error: "Lat is required",
    invalid_type_error: "Lat must be a number"
  }).optional(),
  lon: z.number({
    required_error: "Lon is required",
    invalid_type_error: "Lon must be a number"
  }).optional(),
  suspendedUntil: z.coerce.date({
    required_error: "Suspended Until is required",
    invalid_type_error: "Please provide a valid Suspended Until"
  }).optional(),
  lastLoginAt: z.coerce.date({
    required_error: "Last Login At is required",
    invalid_type_error: "Please provide a valid Last Login At"
  }).optional(),
  expirationOtp: z.coerce.date({
    required_error: "Expiration Otp is required",
    invalid_type_error: "Please provide a valid Expiration Otp"
  }).optional(),
  otp: z.number({
    required_error: "Otp is required",
    invalid_type_error: "Otp must be a number"
  }).int("Otp must be an integer").optional(),
  fcmToken: z.string({
    required_error: "Fcm Token is required",
    invalid_type_error: "Fcm Token must be a text value"
  }).optional(),
  onBoarding: z.boolean({
    required_error: "On Boarding is required",
    invalid_type_error: "On Boarding must be true/false"
  }).optional(),
  accountLink: z.string({
    required_error: "Account Link is required",
    invalid_type_error: "Account Link must be a text value"
  }).optional(),
  stripeAccountId: z.string({
    required_error: "Stripe Account Id is required",
    invalid_type_error: "Stripe Account Id must be a text value"
  }).optional(),
  customerId: z.string({
    required_error: "Customer Id is required",
    invalid_type_error: "Customer Id must be a text value"
  }).optional(),
  paymentMethodId: z.string({
    required_error: "Payment Method Id is required",
    invalid_type_error: "Payment Method Id must be a text value"
  }).optional(),
  dob: z.string({
    required_error: "Dob is required",
    invalid_type_error: "Dob must be a text value"
  }).optional(),
}).strict();

export const userValidation = {
  createSchema,
  updateSchema,
};