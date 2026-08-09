import { UserRole } from "@prisma/client";
import prisma from "../../shared/prisma";
import * as bcrypt from "bcryptjs";
import config from "../../config";

export const initiateSuperAdmin = async () => {
  const hashedPassword = await bcrypt.hash('12345678', Number(config.bcrypt_salt_rounds))
  const payload: any = {
    fullName: "Super Admin",
    email: "admin@gmail.com",
    phoneNumber: "1234567890",
    password: hashedPassword,
    role: UserRole.ADMIN,
    emailVerified: true,
    status: "ACTIVE",
  };

  const isExistUser = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
  });

  if (isExistUser) {
    return isExistUser.id
  }

  if (!isExistUser) {
    const admin = await prisma.user.create({
      data: payload,
      select: {
        id: true
      }
    });
    return admin.id
  }
};

export const initiateAnotherAdmin = async () => {
  const hashedPassword = await bcrypt.hash('123456789', Number(config.bcrypt_salt_rounds))
  const payload: any = {
    fullName: "Main Admin",
    email: "brent@crownandpitch.com",
    phoneNumber: "1234567890",
    password: hashedPassword,
    role: UserRole.ADMIN,
    emailVerified: true,
    status: "ACTIVE",
  };

  const isExistUser = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
  });

  if (isExistUser) {
    return isExistUser.id
  }

  if (!isExistUser) {
    const admin = await prisma.user.create({
      data: payload,
      select: {
        id: true
      }
    });
    return admin.id
  }
};
