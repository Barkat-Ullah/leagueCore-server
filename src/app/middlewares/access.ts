import httpStatus from "http-status";
import prisma from "../../shared/prisma";
import ApiError from "../../errors/ApiErrors";
import { UserRole } from "@prisma/client";

export async function getEffectiveAccessId(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId, isDeleted: false },
    select: {
      role: true,
      createdBy: {
        select: { id: true },
      },
    },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role !== UserRole.MANAGER) {
    return userId;
  }

  if (!user.createdBy?.id) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Manager has no associated parent/creator → no access to team",
    );
  }

  return user.createdBy.id;
}
