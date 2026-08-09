import { NextFunction, Request, Response } from "express";
import { UserStatus } from "@prisma/client";
import prisma from "../../shared/prisma";

export const checkUserActivity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = req.user; // assuming you have `req.user` from JWT middleware

  if (!user?.id) return next();

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      lastLoginAt: true,
      status: true,
    },
  });

  if (!dbUser) return next();

  const now = new Date();
  const lastLogin = dbUser.lastLoginAt || new Date(0); // fallback to very old date
  const daysSinceLogin =
    (now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24);

  // If more than 10 days inactive, mark as INACTIVE
  if (daysSinceLogin > 10 && dbUser.status === UserStatus.ACTIVE) {
    await prisma.user.update({
      where: { id: user.id },
      data: { status: UserStatus.INACTIVE },
    });
  }

  return next();
};
