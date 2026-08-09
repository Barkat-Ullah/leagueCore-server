import { NextFunction, Request, Response } from "express";
import config from "../../config";
import { JwtPayload, Secret } from "jsonwebtoken";
import httpStatus from "http-status";
import ApiError from "../../errors/ApiErrors";
import { jwtHelpers } from "../../helpars/jwtHelpers";
import prisma from "../../shared/prisma";
import {
  cacheOr,
  CacheKeys,
  getUserTokenRevokedAt,
  isTokenBlacklisted,
  TTL,
} from "../../lib/redis";

const auth = (...roles: string[]) => {
  return async (
    req: Request & { user?: any },
    res: Response,
    next: NextFunction
  ) => {
    try {
      const token = req.headers.authorization;

      if (!token) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "You are not authorized!");
      }

      const verifiedUser = jwtHelpers.verifyToken(
        token,
        config.jwt.jwt_secret as Secret
      );
      const { id, role, iat } = verifiedUser;

      // Layer 2 — authoritative, immediate revocation (no DB, no cache TTL)
      if (await isTokenBlacklisted(token)) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "Session has been revoked");
      }

      const revokedAt = await getUserTokenRevokedAt(id);
      if (revokedAt && iat && iat * 1000 < revokedAt) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "Session has been revoked");
      }

      // 🔎 Layer 1 — cached status lookup (5-min safety net)
      const user = await cacheOr(
        await CacheKeys.single("user", id),
        TTL.AUTH_CHECK,
        () =>
          prisma.user.findUnique({
            where: { id },
            select: {
              id: true,
              isDeleted: true,
              status: true,
              suspendedUntil: true,
              role: true,
            },
          })
      );

      if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, "User not found!");
      }

      //Block deleted users
      if (user.isDeleted) {
        throw new ApiError(httpStatus.FORBIDDEN, "Your account has been deleted!");
      }

      //Handle suspended usersPENDED")
      const now = new Date();
      if (user.suspendedUntil && now < new Date(user.suspendedUntil)) {
        throw new ApiError(403, `Account suspended until ${user.suspendedUntil}`);
      }

      //Blocked users
      if (user.status === "BLOCKED") {
        throw new ApiError(httpStatus.FORBIDDEN, "Your account is blocked!");
      }

      req.user = verifiedUser as JwtPayload;

      // ✅ Role-based access
      if (roles.length && !roles.includes(role)) {
        throw new ApiError(httpStatus.FORBIDDEN, "Forbidden!");
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

export default auth;
