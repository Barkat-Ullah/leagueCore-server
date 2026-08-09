import { Prisma, WaitlistStatus } from "@prisma/client";
import httpStatus from "http-status";
import ApiError from "../../../errors/ApiErrors";
import { IPaginationOptions } from "../../../interfaces/paginations";
import { paginationHelper } from "../../../helpars/paginationHelper";
import sendWaitlistOfferEmail from "../../../helpars/sendWaitlistOfferEmail";
import prisma from "../../../shared/prisma";

// Join waitlist (public, no payment)
const joinWaitlist = async (data: any) => {
  const {
    scheduleSessionIds,
    players,
    parentName,
    parentPhone,
    parentEmail,
  } = data;

  // Derive counts from arrays
  const numberOfKids = players.length;
  const numberOfWeeks = scheduleSessionIds.length;

  // Validate sessions exist and get schedulePeriodId from first session
  const sessions = await prisma.scheduleSession.findMany({
    where: { id: { in: scheduleSessionIds } },
    include: { scheduleWeek: { select: { schedulePeriodId: true } } },
  });
  if (sessions.length !== scheduleSessionIds.length) {
    throw new ApiError(httpStatus.NOT_FOUND, "One or more sessions not found");
  }
  const schedulePeriodId = sessions[0].scheduleWeek.schedulePeriodId;

  // Determine waitlistType based on player types
  const goalieCount = players.filter((p: any) => p.playerType === "GOALIE").length;
  const waitlistType = goalieCount > 0 ? "GOALIE_FULL" : "SESSION_FULL";

  // Queue position: based on primary (first) session
  const primarySessionId = scheduleSessionIds[0];
  const lastEntry = await prisma.campWaitlist.findFirst({
    where: {
      scheduleSessionIds: { has: primarySessionId },
      waitlistType,
      status: "ACTIVE",
    },
    orderBy: { queuePosition: "desc" },
  });
  const queuePosition = (lastEntry?.queuePosition || 0) + 1;

  const basePrice = 225;
  const baseAmount = basePrice * numberOfKids * numberOfWeeks;
  const processingFee = Math.round(baseAmount * 0.03 * 100) / 100;
  const totalAmount = Math.round((baseAmount + processingFee) * 100) / 100;

  const [waitlistEntry, registration] = await prisma.$transaction(async (tx) => {
    const entry = await tx.campWaitlist.create({
      data: {
        scheduleSessionIds,
        numberOfKids,
        numberOfWeeks,
        players: {
          create: players.map((p: any) => ({
            playerName: p.playerName,
            dateOfBirth: new Date(p.dateOfBirth),
            playerType: p.playerType,
            shirtSize: p.shirtSize,
          })),
        },
        waitlistType,
        parentName,
        parentPhone,
        parentEmail,
        queuePosition,
        status: "ACTIVE",
      },
      include: { players: true },
    });

    // Auto-create registration with PENDING_PAYMENT so it's ready when offer is sent
    const reg = await tx.campRegistration.create({
      data: {
        schedulePeriodId,
        scheduleSessionIds,
        numberOfKids,
        numberOfWeeks,
        players: {
          create: players.map((p: any) => ({
            playerName: p.playerName,
            dateOfBirth: new Date(p.dateOfBirth),
            playerType: p.playerType,
            shirtSize: p.shirtSize,
          })),
        },
        parentName,
        parentPhone,
        parentEmail,
        amount: basePrice,
        processingFee,
        totalAmount,
        status: "PENDING_PAYMENT",
      },
      include: { players: true },
    });

    return [entry, reg] as const;
  });

  return { ...waitlistEntry, registrationId: registration.id };
};

type IWaitlistFilter = {
  searchTerm?: string;
  schedulePeriodId?: string;
  status?: WaitlistStatus;
};

const waitlistSearchFields = ["parentName", "parentEmail"];

// List waitlist entries (admin dashboard)
const getWaitlist = async (
  options: IPaginationOptions,
  filters: IWaitlistFilter
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, status, ...filterData } = filters;
  const andConditions: Prisma.CampWaitlistWhereInput[] = [];

  // Show ACTIVE and OFFER_SENT by default (excludes CONVERTED, REMOVED, EXPIRED)
  if (status) {
    andConditions.push({ status });
  } else {
    andConditions.push({ status: { in: ["ACTIVE", "OFFER_SENT"] } });
  }

  if (filters.schedulePeriodId) {
    const periodSessions = await prisma.scheduleSession.findMany({
      where: { scheduleWeek: { schedulePeriodId: filters.schedulePeriodId } },
      select: { id: true },
    });
    const periodSessionIds = periodSessions.map((s) => s.id);
    andConditions.push({ scheduleSessionIds: { hasSome: periodSessionIds } });
  }

  if (searchTerm) {
    andConditions.push({
      OR: waitlistSearchFields.map((field) => ({
        [field]: { contains: searchTerm, mode: "insensitive" },
      })),
    });
  }

  const whereConditions: Prisma.CampWaitlistWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const [data, total] = await Promise.all([
    prisma.campWaitlist.findMany({
      skip,
      take: limit,
      where: whereConditions,
      orderBy: { queuePosition: "asc" },
      include: { players: true },
    }),
    prisma.campWaitlist.count({ where: whereConditions }),
  ]);

  return {
    meta: { total, page, limit },
    data,
  };
};

// Get single waitlist entry by id
const getSingleWaitlistEntry = async (id: string) => {
  const entry = await prisma.campWaitlist.findUnique({
    where: { id },
    include: { players: true },
  });

  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, "Waitlist entry not found");
  }

  const sessions = await prisma.scheduleSession.findMany({
    where: { id: { in: entry.scheduleSessionIds } },
    include: { scheduleWeek: { select: { weekNumber: true, startDate: true } } },
  });

  return { ...entry, sessions };
};

// Get waitlist stats - includes ACTIVE and OFFER_SENT
const getWaitlistStats = async (schedulePeriodId?: string) => {
  const baseWhere: Prisma.CampWaitlistWhereInput = { status: { in: ["ACTIVE", "OFFER_SENT"] } };

  if (schedulePeriodId) {
    const periodSessions = await prisma.scheduleSession.findMany({
      where: { scheduleWeek: { schedulePeriodId } },
      select: { id: true },
    });
    const periodSessionIds = periodSessions.map((s) => s.id);
    baseWhere.scheduleSessionIds = { hasSome: periodSessionIds };
  }

  const totalWaiting = await prisma.campWaitlist.count({ where: baseWhere });

  return { totalWaiting };
};

// Confirm offer — registration already exists from joinWaitlist, just mark waitlist as CONVERTED
const confirmOfferAndRegister = async (waitlistId: string) => {
  const entry = await prisma.campWaitlist.findUnique({
    where: { id: waitlistId },
  });

  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, "Waitlist entry not found");
  }

  if (entry.status !== "OFFER_SENT") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Offer is not pending");
  }

  if (entry.offerExpiresAt && new Date() > entry.offerExpiresAt) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Offer has expired");
  }

  // Find the existing PENDING_PAYMENT registration created at join time
  const registration = await prisma.campRegistration.findFirst({
    where: {
      parentEmail: entry.parentEmail,
      scheduleSessionIds: { hasSome: entry.scheduleSessionIds },
      status: "PENDING_PAYMENT",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!registration) {
    throw new ApiError(httpStatus.NOT_FOUND, "Registration not found for this waitlist entry");
  }

  await prisma.campWaitlist.update({
    where: { id: waitlistId },
    data: { status: "CONVERTED" },
  });

  return registration;
};

// Admin force-move a waitlist entry to any session (bypasses capacity)
const adminMoveWaitlistToSession = async (
  waitlistId: string,
  toSessionIds: string[],
  movedByUserId: string
) => {
  const entry = await prisma.campWaitlist.findUnique({
    where: { id: waitlistId },
    include: { players: true },
  });

  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, "Waitlist entry not found");
  }

  if (entry.status === "CONVERTED" || entry.status === "REMOVED") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Waitlist entry is already converted or removed");
  }

  const targetSessions = await prisma.scheduleSession.findMany({
    where: { id: { in: toSessionIds } },
    include: { scheduleWeek: { select: { schedulePeriodId: true } } },
  });

  if (targetSessions.length !== toSessionIds.length) {
    throw new ApiError(httpStatus.NOT_FOUND, "One or more target sessions not found");
  }

  const targetSchedulePeriodId = targetSessions[0].scheduleWeek.schedulePeriodId;

  const result = await prisma.$transaction(async (tx) => {
    // Update the existing PENDING_PAYMENT registration to the new sessions
    const existingRegistration = await tx.campRegistration.findFirst({
      where: {
        parentEmail: entry.parentEmail,
        scheduleSessionIds: { hasSome: entry.scheduleSessionIds },
        status: "PENDING_PAYMENT",
      },
      orderBy: { createdAt: "desc" },
    });

    let registration;
    if (existingRegistration) {
      registration = await tx.campRegistration.update({
        where: { id: existingRegistration.id },
        data: {
          schedulePeriodId: targetSchedulePeriodId,
          scheduleSessionIds: toSessionIds,
          numberOfWeeks: toSessionIds.length,
          movedByUserId,
          movedAt: new Date(),
        },
      });
    } else {
      // Fallback: create new registration if none found
      const basePrice = 225;
      const baseAmount = basePrice * entry.numberOfKids * toSessionIds.length;
      const processingFee = Math.round(baseAmount * 0.03 * 100) / 100;
      const totalAmount = Math.round((baseAmount + processingFee) * 100) / 100;
      registration = await tx.campRegistration.create({
        data: {
          schedulePeriodId: targetSchedulePeriodId,
          scheduleSessionIds: toSessionIds,
          numberOfKids: entry.numberOfKids,
          numberOfWeeks: toSessionIds.length,
          players: {
            create: entry.players.map((p) => ({
              playerName: p.playerName,
              dateOfBirth: p.dateOfBirth,
              playerType: p.playerType,
              shirtSize: p.shirtSize,
            })),
          },
          parentName: entry.parentName,
          parentPhone: entry.parentPhone,
          parentEmail: entry.parentEmail,
          amount: basePrice,
          processingFee,
          totalAmount,
          status: "PENDING_PAYMENT",
          movedByUserId,
          movedAt: new Date(),
        },
        include: { players: true },
      });
    }

    await tx.campWaitlist.update({
      where: { id: waitlistId },
      data: { status: "CONVERTED" },
    });

    return registration;
  });

  // Send payment email with direct registrationId
  sendWaitlistOfferEmail(waitlistId, result.id).catch(err =>
    console.error("Failed to send payment email after moving waitlist:", err)
  );

  await prisma.activityLog.create({
    data: {
      userId: movedByUserId,
      title: "Waitlist Player Moved to Registration",
      content: `Admin moved waitlist entry (${entry.parentEmail}) to ${toSessionIds.length} session(s). Capacity override applied.`,
    },
  });

  return result;
};

// Remove from waitlist
const removeFromWaitlist = async (waitlistId: string) => {
  const entry = await prisma.campWaitlist.findUnique({
    where: { id: waitlistId },
  });

  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, "Waitlist entry not found");
  }

  return prisma.campWaitlist.update({
    where: { id: waitlistId },
    data: { status: "REMOVED" },
  });
};

export const campWaitlistService = {
  joinWaitlist,
  getWaitlist,
  getSingleWaitlistEntry,
  getWaitlistStats,
  confirmOfferAndRegister,
  adminMoveWaitlistToSession,
  removeFromWaitlist,
};
