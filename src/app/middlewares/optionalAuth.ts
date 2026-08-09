import { NextFunction, Request, Response } from "express";

import { JwtPayload, Secret } from "jsonwebtoken";
import config from "../../config";

import httpStatus from "http-status";
import ApiError from "../../errors/ApiErrors";
import { jwtHelpers } from "../../helpars/jwtHelpers";
import prisma from "../../shared/prisma";
import {
  CacheInvalidator,
  cacheOr,
  CacheKeys,
  getUserTokenRevokedAt,
  isTokenBlacklisted,
  TTL,
} from "../../lib/redis";

const optionalAuth = (...roles: string[]) => {
    return async (
        req: Request & { user?: any },
        res: Response,
        next: NextFunction
    ) => {
        try {
            const token = req.headers.authorization;

            if (!token) {
                req.user = null;
                return next();
            }

            const verifiedUser = jwtHelpers.verifyToken(
                token,
                config.jwt.jwt_secret as Secret
            );
            const { id, role, iat } = verifiedUser;

            // 🚫 Layer 2 — authoritative, immediate revocation (no DB, no cache TTL)
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

            if (user.status === "SUSPENDED") {
                const now = new Date();
                if (user.suspendedUntil && now < new Date(user.suspendedUntil)) {
                    throw new ApiError(403, `Account suspended until ${user.suspendedUntil}`);
                }

                // Auto-reactivate after suspension ends
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        status: "ACTIVE",
                        suspendedUntil: null,
                    },
                });

                // Restore access — clear the cached status so ACTIVE is served immediately
                await CacheInvalidator.onRecordUpdate("user", user.id);
            }

            if (user.status === "BLOCKED") {
                throw new ApiError(httpStatus.FORBIDDEN, "Your account is blocked!");
            }

            req.user = verifiedUser as JwtPayload;

            if (roles.length && !roles.includes(verifiedUser.role)) {
                throw new ApiError(httpStatus.FORBIDDEN, "Forbidden!");
            }
            next();
        } catch (err) {
            next(err);
        }
    };
};

export default optionalAuth;