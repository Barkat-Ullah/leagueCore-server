import prisma from "../../../shared/prisma";
import { getAdminId, invalidateAdminCache } from "../../../shared/getAdminId";
import ApiError from "../../../errors/ApiErrors";
import * as bcrypt from "bcryptjs";
import { IPaginationOptions } from "../../../interfaces/paginations";
import { paginationHelper } from "../../../helpars/paginationHelper";
import {
  ageVerifiedStatus,
  Prisma,
  User,
  UserRole,
  wavierStatus,
} from "@prisma/client";
import config from "../../../config";
import httpStatus from "http-status";
import { Request } from "express";
import { fileUploader } from "../../../helpars/fileUploader";
import { Secret } from "jsonwebtoken";
import { jwtHelpers } from "../../../helpars/jwtHelpers";
import { generateUsername } from "../../../helpars/generateUsername";
import crypto from "crypto";
import { generateOtpEmail } from "../../../shared/emailHTML";
import { enqueueEmail } from "../../../shared/emailSender";
import { blacklistUserTokens, CacheInvalidator } from "../../../lib/redis";

// Create a new user in the database.
const createUserIntoDb = async (payload: any) => {
  const adminId = await getAdminId();

  const existingUser = await prisma.user.findFirst({
    where: {
      email: payload.email,
    },
  });

  if (existingUser) {
    if (existingUser.email === payload.email) {
      throw new ApiError(
        400,
        `User with this email ${payload.email} already exists`,
      );
    }
  }

  const otp = Number(crypto.randomInt(1000, 9999));
  const expirationOtp = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  const hashedPassword: string = await bcrypt.hash(
    payload.password,
    Number(config.bcrypt_salt_rounds),
  );

  // Generate unique username
  // const uniqueUsername = await generateUsername(payload.firstName, payload.lastName);

  const uniqueUsername = await generateUsername(payload.fullName);

  const result = await prisma.user.create({
    data: {
      fullName: payload.fullName,
      email: payload.email,
      phoneNumber: payload.phoneNumber,
      role: payload.role,
      password: hashedPassword,
      userName: uniqueUsername,
      otp: otp,
      expirationOtp: expirationOtp,
    },
    select: {
      otp: true,
      id: true,
      fullName: true,
      userName: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (payload.role === UserRole.ADMIN) {
    await invalidateAdminCache();
  }

  const token = jwtHelpers.generateToken(
    {
      id: result.id,
      email: result.email,
      role: result.role,
    },
    config.jwt.jwt_secret as Secret,
    config.jwt.expires_in as string,
  );

  await prisma.notification.create({
    data: {
      userId: adminId!,
      title: "New User Registration",
      body: `A new Coach ${result.fullName} has registered with the email ${result.email}.`,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: adminId!,
      title: "New User Registration",
      content: `A new Coach ${result.fullName} has registered with the email ${result.email}.`,
    },
  });

  const html = generateOtpEmail(otp);
  await enqueueEmail({ to: payload.email, subject: "OTP Verification", html });
  return {
    result,
    message: "An OTP has been sent to your email. Please verify your account.",
    token,
  };
};

//Reterive all users from the database also searcing and filetering
type IUserFilterRequest = {
  searchTerm?: string | undefined;
  createdAt?: string | undefined;
  id?: string | undefined;
  fullName?: string | undefined;
  email?: string | undefined;
  role?: string | undefined;
  status?: string | undefined;
};
const userSearchAbleFields = ["email", "fullName"];

const getUsersFromDb = async (
  filters: IUserFilterRequest,
  options: IPaginationOptions,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andCondions: Prisma.UserWhereInput[] = [];

  andCondions.push({
    isDeleted: false,
  });

  if (searchTerm) {
    andCondions.push({
      OR: [
        ...userSearchAbleFields.map((field) => ({
          [field]: {
            contains: searchTerm,
            mode: "insensitive",
          },
        })),
      ],
    });
  }

  if (Object.keys(filterData).length) {
    Object.keys(filterData).forEach((key) => {
      const value = (filterData as any)[key];
      if (value === "" || value === null || value === undefined) return;
      if (["createdAt"].includes(key) && value) {
        const start = new Date(value);
        start.setHours(0, 0, 0, 0);
        const end = new Date(value);
        end.setHours(23, 59, 59, 999);
        andCondions.push({
          createdAt: {
            gte: start.toISOString(),
            lte: end.toISOString(),
          },
        });
        return;
      }
      if (key === "status") {
        const statuses = Array.isArray(value) ? value : [value];
        andCondions.push({
          status: { in: statuses },
        });
        return;
      }
      andCondions.push({ [key]: value });
    });
  }

  const whereConditons: Prisma.UserWhereInput = { AND: andCondions };

  const result = await prisma.user.findMany({
    skip,
    take: limit,
    where: whereConditons,
    orderBy:
      options.sortBy && options.sortOrder
        ? {
            [options.sortBy]: options.sortOrder,
          }
        : {
            createdAt: "desc",
          },
    select: {
      id: true,
      fullName: true,
      userName: true,
      phoneNumber: true,
      email: true,
      profileImage: true,
      role: true,
      status: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const total = await prisma.user.count({
    where: whereConditons,
  });

  return {
    meta: {
      page,
      limit,
      total,
    },
    data: result,
    message:
      !result || result.length === 0
        ? "No users found! Try again."
        : "Users fetched successfully.",
  };
};

const adminHomePageData = async () => {
  const totalRevenue = await prisma.payment.aggregate({
    _sum: {
      amount: true,
    },
  });
  const totalAmount = totalRevenue._sum.amount || 0;

  const totalTeam = await prisma.teams.count();
  const totalPendingWavier = await prisma.teamplayer.count({
    where: {
      ageVerified: ageVerifiedStatus.Check_in_required,
    },
  });

  return {
    totalAmount,
    totalTeam,
    totalPendingWavier,
  };
};

// Get user by id
const getUserById = async (id: string) => {
  const result = await prisma.user.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      fullName: true,
      userName: true,
      email: true,
      profileImage: true,
      role: true,
      status: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return result;
};

// update profile by user own profile uisng token or email or id
const updateProfile = async (req: Request) => {
  const file = req.file;
  const data = req.body;
  let image = "";

  console.log(data, file);

  const existingUser = await prisma.user.findFirst({
    where: {
      id: req.user.id,
    },
  });

  if (!existingUser) {
    throw new ApiError(404, "User not found");
  }

  if (file) {
    image = (await fileUploader.uploadToDigitalOcean(file)).Location;
  }

  const result = await prisma.user.update({
    where: {
      id: existingUser.id,
    },
    data: {
      fullName: data.fullName ?? existingUser.fullName,
      email: data.email ?? existingUser.email,
      phoneNumber: data.phoneNumber ?? existingUser.phoneNumber,
      profileImage: image || existingUser.profileImage,
    },
    select: {
      id: true,
      fullName: true,
      userName: true,
      email: true,
      phoneNumber: true,
      profileImage: true,
    },
  });

  console.log(result);

  return result;
};

const updatePlayerProfile = async (req: Request) => {
  const { id } = req.params;
  const file = req.file;
  const data = req.body;
  let image = "";
  const existingUser = await prisma.user.findFirst({
    where: {
      id,
    },
  });

  if (!existingUser) {
    throw new ApiError(404, "User not found");
  }

  if (file) {
    image = (await fileUploader.uploadToDigitalOcean(file)).Location;
  }

  const result = await prisma.user.update({
    where: {
      id: existingUser.id,
    },
    data: {
      fullName: data.fullName ?? existingUser.fullName,
      email: data.email ?? existingUser.email,
      phoneNumber: data.phoneNumber ?? existingUser.phoneNumber,
      profileImage: image || existingUser.profileImage,
      dob: new Date(data.dob) || existingUser.dob,
      jerseyNum: data.jerseyNum || existingUser.jerseyNum,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phoneNumber: true,
      profileImage: true,
      dob: true,
      jerseyNum: true,
    },
  });

  console.log(result);

  return result;
};

//Soft Delete
const softDeleteUser = async (id: string) => {
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id },
      select: { email: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return tx.user.update({
      where: { id },
      data: {
        email: `deleted_${id}@deleted.local`,
        password: "DELETED",
        isDeleted: true,
        emailVerified: false,
        status: "DELETED",
      },
    });
  });

  // Revoke active sessions (no JWT string in scope — per-user marker)
  await blacklistUserTokens(id);

  // Clear the cached auth status immediately (defense in depth)
  await CacheInvalidator.onRecordUpdate("user", id);

  return result;
};

// Temporarily block
const toggleBlock = async (userId: string, blockDays: number) => {
  const result = await prisma.$transaction(async (tx) => {
    const profile = await tx.user.findUnique({
      where: { id: userId },
    });

    if (!profile) {
      throw new Error("User not found");
    }

    if (profile.isBlocked) {
      await tx.user.update({
        where: { id: userId },
        data: {
          isBlocked: false,
          status: "ACTIVE",
          suspendedUntil: null,
        },
      });

      return {
        action: "UNBLOCKED" as const,
      };
    } else {
      const suspendedUntil = new Date(
        Date.now() + blockDays * 24 * 60 * 60 * 1000,
      );

      await tx.user.update({
        where: { id: userId },
        data: {
          isBlocked: true,
          status: "SUSPENDED",
          suspendedUntil,
          fcmToken: null,
        },
      });

      return {
        action: "BLOCKED" as const,
        blockedForDays: blockDays,
      };
    }
  });

  // Revoke active sessions only on block; unblock restores access
  if (result.action === "BLOCKED") {
    await blacklistUserTokens(userId);
  }

  // Clear the cached auth status in both cases (block AND unblock)
  await CacheInvalidator.onRecordUpdate("user", userId);

  return result;
};

// Upload photo
const uploadPhoto = async (req: Request) => {
  const file = req.file;

  let imageUrl;

  if (!file) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No file uploaded");
  }

  const uploadResult = await fileUploader.uploadToDigitalOcean(file);
  imageUrl = uploadResult.Location;

  return imageUrl;
};

// Get user activity logs with pagination
const getActivityLogs = async (userId: string, options: IPaginationOptions) => {
  const { page, skip, limit } = paginationHelper.calculatePagination(options);

  const logs = await prisma.activityLog.findMany({
    skip,
    take: limit,
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const total = await prisma.activityLog.count({ where: { userId } });

  return {
    total,
    page,
    limit,
    data: logs,
  };
};

export const userService = {
  createUserIntoDb,
  getUsersFromDb,
  getUserById,
  updateProfile,
  softDeleteUser,
  toggleBlock,
  uploadPhoto,
  getActivityLogs,
  adminHomePageData,
  updatePlayerProfile,
};
