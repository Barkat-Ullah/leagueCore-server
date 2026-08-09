import { UserRole } from "@prisma/client";
import prisma from "./prisma";
import { cacheOr, invalidateKeys, TTL } from "../lib/redis";

const ADMIN_CACHE_KEY = "admin:primary";

export interface AdminInfo {
  id: string;
  isTeamUpdateNotify: boolean;
}

export const getAdmin = async (): Promise<AdminInfo | null> => {
  return cacheOr<AdminInfo | null>(
    ADMIN_CACHE_KEY,
    TTL.LONG, // 6 hours — admin identity rarely changes
    async () => {
      const admin = await prisma.user.findFirst({
        where: { role: UserRole.ADMIN, isDeleted: false },
        select: { id: true, isTeamUpdateNotify: true },
      });
      return admin ?? null;
    }
  );
};

export const getAdminId = async (): Promise<string | null> => {
  const admin = await getAdmin();
  return admin?.id ?? null;
};

export const invalidateAdminCache = async (): Promise<void> => {
  await invalidateKeys(ADMIN_CACHE_KEY);
};
