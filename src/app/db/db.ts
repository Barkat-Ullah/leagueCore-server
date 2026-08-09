import { UserRole } from "@prisma/client";
import prisma from "../../shared/prisma";
import * as bcrypt from "bcryptjs";
import config from "../../config";

export const initiateSuperAdmin = async () => {
  const email = process.env.EMAIL;
  const isExistUser = await prisma.user.findUnique({
    where: { email },
  });

  if (isExistUser) {
    return isExistUser.id;
  }

  const hashedPassword = await bcrypt.hash(
    process.env.ADMIN_PASSWORD as string,
    Number(config.bcrypt_salt_rounds),
  );

  const payload: any = {
    fullName: "Super Admin",
    email,
    phoneNumber: "1234567890",
    password: hashedPassword,
    role: UserRole.ADMIN,
    emailVerified: true,
    status: "ACTIVE",
  };

  const admin = await prisma.user.create({
    data: payload,
    select: { id: true },
  });
  return admin.id;
};

export const initiateAnotherAdmin = async () => {
  const email = process.env.ADMIN_EMAIL;

  // Check FIRST — avoid an unnecessary bcrypt hash on every restart
  const isExistUser = await prisma.user.findUnique({
    where: { email },
  });

  if (isExistUser) {
    return isExistUser.id;
  }

  const hashedPassword = await bcrypt.hash(
    process.env.ADMIN_PASSWORD!,
    Number(config.bcrypt_salt_rounds),
  );

  const payload: any = {
    fullName: "Main Admin",
    email,
    phoneNumber: "1234567890",
    password: hashedPassword,
    role: UserRole.ADMIN,
    emailVerified: true,
    status: "ACTIVE",
  };

  const admin = await prisma.user.create({
    data: payload,
    select: { id: true },
  });
  return admin.id;
};
