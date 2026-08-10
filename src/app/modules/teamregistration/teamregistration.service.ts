import { getAdminId } from "../../../shared/getAdminId";
import prisma from "../../../shared/prisma";
import { invalidateOwnedLists } from "../../../lib/redis";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { IPaginationOptions } from "../../../interfaces/paginations";
import { paginationHelper } from "../../../helpars/paginationHelper";
import {
  PaymentStatus,
  Prisma,
  TournamentStage,
  TournamentStatus,
  UserRole,
  wavierStatus,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import config from "../../../config";
import {
  inviteUserEmail,
  waiverReminderEmailHtml,
} from "../../../shared/emailHTML";
import emailSender, { enqueueEmail } from "../../../shared/emailSender";
import { Request } from "express";
import { fileUploader } from "../../../helpars/fileUploader";
import { formatTimeUntil } from "./constant";
import Stripe from "stripe";
import {
  calcMatchResult,
  formatDate,
  placementLabel,
  TeamTournamentDetailsResponse,
  TournamentMatchRow,
} from "./types";
import { getEffectiveAccessId } from "../../middlewares/access";
import {
  getPendingInvitationForRegistration,
  markInvitationAccepted,
} from "../../../helpars/tourUtils";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

// Maps each division to its fee category
const ADULT_DIVISIONS = new Set([
  "MENS_DIV_1",
  "MENS_DIV_2",
  "MENS_DIV_3",
  "WOMENS",
  "COED",
  "U17_BOYS",
  "U18_BOYS",
  "U17_GIRLS",
  "U18_GIRLS",
]);

const isAdultDivision = (divisionName: string): boolean => {
  return ADULT_DIVISIONS.has(divisionName);
};

// Create team registration
const createTeamregistration = async (req: any) => {
  const {
    teamName,
    teamId,
    tournamentId,
    teamDivisionId,
    manager,
    isBundle,
    methodId,
  } = req.body;

  const coachId = req.user.id;

  const adminId = await getAdminId();

  // Fetch coach
  const coach = await prisma.user.findUnique({
    where: { id: coachId },
    select: {
      id: true,
      fullName: true,
      email: true,
      hasBundle: true,
      totalBundle: true,
      customerId: true,
      paymentMethodId: true,
    },
  });

  if (!coach) {
    throw new ApiError(httpStatus.NOT_FOUND, "Coach not found");
  }

  // Validate payment input
  if (isBundle !== true && !methodId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "methodId is required when not using bundle",
    );
  }

  // Bundle eligibility check
  if (isBundle === true) {
    if (!coach.hasBundle || coach.totalBundle <= 0) {
      throw new ApiError(
        httpStatus.PAYMENT_REQUIRED,
        "No bundle credits available. Please purchase a bundle or pay via Stripe.",
      );
    }
  }

  // Validate teamName / teamId — exactly one must be provided
  if (!!teamName === !!teamId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Provide exactly one of: teamName (for new team) or teamId (for existing team)",
    );
  }

  // Fetch tournament + division
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { tournamentDivisions: true },
  });

  if (!tournament) {
    throw new ApiError(httpStatus.NOT_FOUND, "Tournament not found");
  }

  const division = tournament.tournamentDivisions.find(
    (d) => d.id === teamDivisionId,
  );

  if (!division) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Division not found in this tournament",
    );
  }

  if (division.slotsLeft != null && division.slotsLeft <= 0) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "No slots available in this division",
    );
  }

  // Determine registration fee
  const registrationFee = isAdultDivision(division.divisionName)
    ? tournament.adultFee
    : tournament.youthFee;

  const processingFeeRate = 0.03; // 3%
  const processingFee = parseFloat(
    (registrationFee * processingFeeRate).toFixed(2),
  );
  const totalAmount = parseFloat((registrationFee + processingFee).toFixed(2));

  let finalTeamId: string;
  let finalTeamName: string;

  // NEW TEAM flow
  if (teamName) {
    if (!teamName.trim()) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Team name is required");
    }

    const trimmedName = teamName.trim();

    const existing = await prisma.teams.findFirst({
      where: {
        coachId,
        teamName: { equals: trimmedName, mode: "insensitive" },
      },
    });

    if (existing) {
      throw new ApiError(
        httpStatus.CONFLICT,
        `You already have a team named "${trimmedName}"`,
      );
    }

    const newTeam = await prisma.teams.create({
      data: {
        teamName: trimmedName,
        coachId,
        tournamentId,
        division: division.divisionName,
      },
    });

    finalTeamId = newTeam.id;
    finalTeamName = newTeam.teamName;
  }

  // EXISTING TEAM flow
  else {
    const team = await prisma.teams.findFirst({
      where: { id: teamId, coachId },
      select: {
        id: true,
        teamName: true,
        division: true,
      },
    });

    if (team?.division && team?.division !== division.divisionName) {
      throw new ApiError(
        httpStatus.CONFLICT,
        `This team is registered under "${team?.division}" division and cannot be entered into "${division.divisionName}"`,
      );
    }

    if (!team) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Team not found or you do not have permission",
      );
    }

    const alreadyRegistered = await prisma.teamregistration.findFirst({
      where: { teamId, tournamentId },
    });

    if (alreadyRegistered) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "This team is already registered to this tournament",
      );
    }

    finalTeamId = team.id;
    finalTeamName = team.teamName;
  }

  // ✅ INVITATION LOOKUP (optional)
  // If there is a pending invite for this team into this tournament/division, we'll accept it after successful registration
  const pendingInvite = await getPendingInvitationForRegistration({
    coachId,
    teamId: finalTeamId,
    tournamentId,
    teamDivisionId,
  });

  // manager handling
  let managerId: string | null = null;

  if (manager?.email?.trim()) {
    let managerUser = await prisma.user.findUnique({
      where: { email: manager.email.trim() },
    });

    if (!managerUser) {
      const fullName =
        [manager.firstName?.trim(), manager.lastName?.trim()]
          .filter(Boolean)
          .join(" ")
          .trim() || "Team Manager";

      const plainPassword =
        manager.password || Math.random().toString(36).slice(-8);

      const hashedPassword = await bcrypt.hash(
        plainPassword,
        Number(config.bcrypt_salt_rounds),
      );

      managerUser = await prisma.user.create({
        data: {
          email: manager.email.trim(),
          fullName,
          phoneNumber: manager.phone?.trim(),
          password: hashedPassword,
          role: UserRole.MANAGER,
          createdById: coachId,
        },
      });

      await prisma.teamManager.upsert({
        where: {
          teamId_managerId: {
            teamId: finalTeamId,
            managerId: managerUser.id,
          },
        },
        create: {
          teamId: finalTeamId,
          managerId: managerUser.id,
        },
        update: {},
      });

      const html = inviteUserEmail(fullName, plainPassword);
      await enqueueEmail({
        to: manager.email.trim(),
        subject: "Manager Account Invitation",
        html,
      });
    }

    managerId = managerUser.id;

    if (teamName) {
      await prisma.teams.update({
        where: { id: finalTeamId },
        data: { managerId },
      });
    }
  }

  // ---------------------------
  // ✅ Bundle Branch
  // ---------------------------
  if (isBundle === true) {
    const registration = await prisma.teamregistration.create({
      data: {
        teamId: finalTeamId,
        userId: coachId,
        tournamentId,
        teamDivisionId,
        teamName: finalTeamName,
        registrationPayStatus: PaymentStatus.PAID,
        maxPlayers: tournament.rosterSizeMax || 12,
      },
    });

    // ✅ accept invitation ONLY after success
    if (pendingInvite) {
      await markInvitationAccepted({
        invitedTeamId: pendingInvite.id,
        invitationId: pendingInvite.invitationId,
      });
    }

    await prisma.activityLog.create({
      data: {
        userId: adminId!,
        title: "Team Registered using Bundle Credit",
        content: `Registered ${finalTeamName} for ${tournament.name} (${division.divisionName}) using a bundle credit. Credits left: ${
          coach.totalBundle - 1
        }.`,
      },
    });
    await invalidateOwnedLists("activityLog", [adminId]);

    await prisma.activityLog.create({
      data: {
        userId: coachId,
        title: "Team Registered using Bundle Credit",
        content: `Registered ${finalTeamName} for ${tournament.name} (${division.divisionName}) using a bundle credit. Credits left: ${
          coach.totalBundle - 1
        }.`,
      },
    });
    await invalidateOwnedLists("activityLog", [coachId]);

    await prisma.tournamentDivision.update({
      where: { id: teamDivisionId },
      data: { slotsLeft: { decrement: 1 } },
    });

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { totalRegisteredTeams: { increment: 1 } },
    });

    const newTotalBundle = coach.totalBundle - 1;

    await prisma.user.update({
      where: { id: coachId },
      data: {
        totalBundle: newTotalBundle,
        ...(newTotalBundle <= 0 && { hasBundle: false }),
      },
    });

    const bundlePaymentId = `bundle_${registration.id}_${Date.now()}`;

    await prisma.payment.create({
      data: {
        userId: coachId,
        tournamentId: tournamentId,
        registrationId: registration.id,
        amount: 0,
        status: PaymentStatus.PAID,
        cardBrand: "bundle",
        cardHolderName: coach.fullName ?? null,
        stripePaymentId: bundlePaymentId,
        stripeCustomerId: null,
        description: `Bundle credit used for ${finalTeamName} in ${tournament.name} (${division.divisionName}). Credits remaining: ${newTotalBundle}.`,
      },
    });

    return {
      paymentMethod: "bundle",
      bundleCreditsLeft: newTotalBundle,
      registration,
      invitationAccepted: !!pendingInvite,
    };
  }

  // ---------------------------
  // ✅ Stripe Branch
  // ---------------------------

  // Get or create Stripe Customer
  let stripeCustomerId = coach.customerId;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: coach.email,
      name: coach.fullName ?? undefined,
      metadata: { coachId },
    });

    stripeCustomerId = customer.id;

    await prisma.user.update({
      where: { id: coachId },
      data: { customerId: stripeCustomerId },
    });
  }

  // Attach PaymentMethod to the Stripe Customer
  try {
    await stripe.paymentMethods.attach(methodId, {
      customer: stripeCustomerId,
    });
  } catch (err: any) {
    if (err?.code !== "resource_already_exists") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Failed to attach payment method: ${err.message}`,
      );
    }
  }

  const paymentMethodDetails = await stripe.paymentMethods.retrieve(methodId);
  const card = paymentMethodDetails.card;

  let paymentIntent: Stripe.PaymentIntent;

  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100),
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: methodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
      description: `Team registration: ${finalTeamName} — ${tournament.name}`,
      metadata: {
        coachId,
        tournamentId,
        teamDivisionId,
        teamId: finalTeamId,
        teamName: finalTeamName,
      },
    });
  } catch (err: any) {
    throw new ApiError(
      httpStatus.PAYMENT_REQUIRED,
      err?.raw?.message ??
        "Payment failed. Please check your card details and try again.",
    );
  }

  if (paymentIntent.status !== "succeeded") {
    throw new ApiError(
      httpStatus.PAYMENT_REQUIRED,
      `Payment not completed. Status: ${paymentIntent.status}`,
    );
  }

  await prisma.user.update({
    where: { id: coachId },
    data: { paymentMethodId: methodId },
  });

  const registration = await prisma.teamregistration.create({
    data: {
      teamId: finalTeamId,
      userId: coachId,
      tournamentId,
      teamDivisionId,
      teamName: finalTeamName,
      registrationPayStatus: PaymentStatus.PAID,
      maxPlayers: tournament.rosterSizeMax || 12,
    },
  });

  // ✅ accept invitation ONLY after success
  if (pendingInvite) {
    await markInvitationAccepted({
      invitedTeamId: pendingInvite.id,
      invitationId: pendingInvite.invitationId,
    });
  }

  await prisma.activityLog.create({
    data: {
      userId: adminId!,
      title: "Registration Succeessful",
      content: `Registered ${finalTeamName} for ${tournament.name} (${division.divisionName}). Payment of $${registrationFee.toFixed(2)} successful.`,
    },
  });
  await invalidateOwnedLists("activityLog", [adminId]);

  await prisma.activityLog.create({
    data: {
      userId: coachId,
      title: "Registration Succeessful",
      content: `Registered ${finalTeamName} for ${tournament.name} (${division.divisionName}). Payment of $${registrationFee.toFixed(2)} successful.`,
    },
  });
  await invalidateOwnedLists("activityLog", [coachId]);

  await prisma.tournamentDivision.update({
    where: { id: teamDivisionId },
    data: { slotsLeft: { decrement: 1 } },
  });

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { totalRegisteredTeams: { increment: 1 } },
  });

  await prisma.payment.create({
    data: {
      userId: coachId,
      tournamentId: tournamentId,
      registrationId: registration.id,
      amount: totalAmount,
      status: PaymentStatus.PAID,
      stripePaymentId: paymentIntent.id,
      stripeCustomerId,
      cardBrand: card?.brand ?? null,
      cardHolderName:
        paymentMethodDetails.billing_details?.name ?? coach.fullName ?? null,
      description: `$${registrationFee.toFixed(2)} paid via ${card?.brand?.toUpperCase() ?? "Card"} •••• ${card?.last4 ?? "****"} for ${finalTeamName} in ${tournament.name} (${division.divisionName}).`,
    },
  });

  return {
    paymentMethod: "stripe",
    amount: registrationFee,
    paymentIntentId: paymentIntent.id,
    card: {
      brand: card?.brand,
      last4: card?.last4,
      expMonth: card?.exp_month,
      expYear: card?.exp_year,
    },
    registration,
    invitationAccepted: !!pendingInvite,
  };
};

// Get all
type ITeamregistrationFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
  userId?: string;
  managerId?: string;
  tournamentId?: string;
  teamDivisionId?: string;
  teamName?: string;
  registrationPayStatus?: string;
};
const teamregistrationSearchAbleFields = ["teamName"];

const getTeamregistrationList = async (
  options: IPaginationOptions,
  filters: ITeamregistrationFilterRequest,
  userId: string,
  role: UserRole,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.TeamregistrationWhereInput[] = [];

  if (role === UserRole.COACH) {
    andConditions.push({ userId });
  } else if (role === UserRole.MANAGER) {
    const teams = await prisma.teams.findMany({
      where: { managerId: userId },
      select: { id: true },
    });

    const teamIds = teams.map((t) => t.id);

    andConditions.push({
      teamId: { in: teamIds },
    });
  }
  // ADMIN → no restriction

  if (searchTerm?.trim()) {
    andConditions.push({
      OR: teamregistrationSearchAbleFields.map((field) => ({
        [field]: {
          contains: searchTerm.trim(),
          mode: "insensitive",
        },
      })),
    });
  }

  // Dynamic filters
  Object.entries(filterData).forEach(([key, value]) => {
    if (value == null || value === "") return;

    if (key === "createdAt" && typeof value === "string") {
      const start = new Date(value);
      start.setHours(0, 0, 0, 0);
      const end = new Date(value);
      end.setHours(23, 59, 59, 999);

      andConditions.push({
        createdAt: { gte: start.toISOString(), lte: end.toISOString() },
      });
      return;
    }

    andConditions.push({ [key]: value });
  });

  const where = andConditions.length > 0 ? { AND: andConditions } : {};

  const registrations = await prisma.teamregistration.findMany({
    skip,
    take: limit,
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      teamName: true,
      image: true,
      registrationPayStatus: true,
      maxPlayers: true,
      totalRegisteredPlayers: true,
      createdAt: true,
      coach: {
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          email: true,
          profileImage: true,
        },
      },
      team: {
        select: {
          id: true,
          teamName: true,
          manager: {
            select: {
              id: true,
              fullName: true,
              phoneNumber: true,
              email: true,
              profileImage: true,
            },
          },
        },
      },
      tournament: {
        select: {
          id: true,
          tournamentStage: true,
          name: true,
          gameStyle: true,
          rosterSizeMax: true,
          status: true,
        },
      },
      tourDivision: {
        select: {
          id: true,
          divisionName: true,
          maxTeams: true,
          slotsLeft: true,
        },
      },
      teamplayers: {
        select: {
          id: true,

          status: true,
          ageVerified: true,
          isAgree: true,
          signName: true,
          player: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phoneNumber: true,
              dob: true,
              jerseyNum: true,
              profileImage: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const total = await prisma.teamregistration.count({ where });

  return {
    meta: { total, page, limit },
    data: registrations,
  };
};

// Coaches homepage data
const coachesHomepageData = async (req: Request) => {
  const { teamId } = req.params;

  const registration = await prisma.teamregistration.findFirst({
    where: {
      teamId,
    },
    orderBy: {
      createdAt: "desc",
      // createdAt: "asc",
    },
    select: {
      id: true,
      teamName: true,
      maxPlayers: true,
      totalRegisteredPlayers: true,
      createdAt: true,
      updatedAt: true,
      tournament: {
        select: {
          name: true,
          startDate: true,
          location: true,
          gameStyle: true,
          logo: true,
        },
      },
      tourDivision: {
        select: {
          divisionName: true,
        },
      },
      teamplayers: {
        select: {
          id: true,
          status: true,
          ageVerified: true,
          createdAt: true,
          updatedAt: true,
          signedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  // Handle case when no registration exists
  if (!registration) {
    throw new ApiError(404, "Team registration not found");
  }

  const players = registration.teamplayers;

  // Waivers
  const ageVerified = players.filter(
    (p) => p.ageVerified === "verified",
  ).length;
  const waiversSigned = players.filter((p) => p.status === "Signed").length;
  const waiversPending = players.filter((p) => p.status === "Pending").length;
  const totalWaivers = players.length;

  // Roster
  const registered = registration.totalRegisteredPlayers ?? players.length;
  const max = registration.maxPlayers || 12;
  const playersNeeded = Math.max(0, max - registered);

  // Time until
  const timeUntilStr = formatTimeUntil(
    registration.tournament?.startDate ?? null,
  );

  // Recent activity
  // const recentActivity = buildActivityList(players, registration);

  // Final shape
  const data = {
    teamName: registration.teamName,
    tournament: {
      name: registration.tournament?.name || "Proving Series",
      startDate: registration.tournament?.startDate ?? null,
      timeUntil: timeUntilStr,
      location: registration.tournament?.location || "Unknown",
      gameStyle: registration.tournament?.gameStyle
        ? registration.tournament.gameStyle
            .replace("FORMAT_", "")
            .replace("V", "v")
        : "7v7",
      logo: registration.tournament?.logo ?? null,
    },
    ageVerified,
    division: {
      name: registration.tourDivision?.divisionName || "Unknown",
    },
    roster: {
      registered,
      max,
      playersNeeded,
      incomplete: registered < max || waiversPending > 0,
    },
    waivers: {
      signed: waiversSigned,
      total: totalWaivers,
      pending: waiversPending,
    },
    pendingWaiversAlert:
      waiversPending > 0 ? `${waiversPending} pending waivers` : null,
    // recentActivity,
  };

  return data;
};

// Get team achievements dashboard
const getTeamAchievementsDashboard = async (teamId: string) => {
  // ─── Team + primary division ────────────────────────────────────────
  const team = await prisma.teams.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      teamName: true,
      division: true,
    },
  });

  if (!team) {
    throw new ApiError(httpStatus.NOT_FOUND, "Team not found");
  }

  // Division: prefer team's current division, fallback to latest reg
  let division = team.division;

  if (!division) {
    const latestReg = await prisma.teamregistration.findFirst({
      where: { teamId },
      orderBy: { createdAt: "desc" },
      select: {
        tourDivision: {
          select: { divisionName: true },
        },
      },
    });
    division = latestReg?.tourDivision?.divisionName ?? null;
  }

  if (!division) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Team has no division assigned yet",
    );
  }

  // ─── Last completed ROYAL (reset point) ─────────────────────────────
  const lastRoyal = await prisma.tournament.findFirst({
    where: {
      tournamentStage: TournamentStage.ROYAL,
      status: TournamentStatus.COMPLETED,
      teamRegistrations: {
        some: {
          teamId,
          tourDivision: { divisionName: division },
        },
      },
    },
    select: { endDate: true },
    orderBy: { endDate: "desc" },
  });

  const resetAfter = lastRoyal?.endDate ?? new Date(0);

  // ─── Ledgers (points) ───────────────────────────────────────────────
  type LedgerWithTournament = Prisma.SeriesPointsLedgerGetPayload<{
    select: {
      tournamentStage: true;
      placement: true;
      wins: true;
      basePoints: true;
      winPoints: true;
      totalPoints: true;
      tournament: {
        select: {
          id: true;
          name: true;
          tournamentStage: true;
          status: true;
          startDate: true;
          endDate: true;
          location: true;
          logo: true;
          gameStyle: true;
        };
      };
    };
  }>;

  const ledgers = await prisma.seriesPointsLedger.findMany({
    where: {
      teamId,
      divisionName: division,
      tournamentStage: {
        in: [TournamentStage.PROVING, TournamentStage.CROWN],
      },
      tournament: {
        endDate: { gt: resetAfter },
        isDeleted: false,
      },
    },
    orderBy: { tournament: { endDate: "desc" } },
    select: {
      tournamentStage: true,
      placement: true,
      wins: true,
      basePoints: true,
      winPoints: true,
      totalPoints: true,
      tournament: {
        select: {
          id: true,
          name: true,
          tournamentStage: true,
          status: true,
          startDate: true,
          endDate: true,
          location: true,
          logo: true,
          gameStyle: true,
        },
      },
    },
  });

  const ledgerMap = new Map<string, LedgerWithTournament>(
    ledgers.map((l) => [l.tournament.id, l]),
  );

  // ─── Registrations ──────────────────────────────────────────────────
  const registrations = await prisma.teamregistration.findMany({
    where: {
      teamId,
      tourDivision: { divisionName: division },
      tournament: {
        tournamentStage: {
          in: [TournamentStage.PROVING, TournamentStage.CROWN],
        },
        endDate: { gt: resetAfter },
        isDeleted: false,
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      registrationPayStatus: true,
      totalRegisteredPlayers: true,
      tournament: {
        select: {
          id: true,
          name: true,
          tournamentStage: true,
          status: true,
          startDate: true,
          endDate: true,
          location: true,
          logo: true,
          gameStyle: true,
        },
      },
    },
  });

  // ─── Build final tournament rows ────────────────────────────────────
  const tournaments = registrations.map((reg) => {
    const ledger = ledgerMap.get(reg.tournament.id);

    return {
      tournamentId: reg.tournament.id,
      tournamentName: reg.tournament.name,
      tournamentStage: reg.tournament.tournamentStage,
      tournamentStatus: reg.tournament.status,
      startDate: reg.tournament.startDate.toISOString().split("T")[0]!,
      endDate: reg.tournament.endDate.toISOString().split("T")[0]!,
      formattedDate: formatDate(reg.tournament.endDate),
      location: reg.tournament.location ?? null,
      logo: reg.tournament.logo ?? null,
      gameStyle: reg.tournament.gameStyle ?? null,
      registrationPayStatus: reg.registrationPayStatus,
      totalRegisteredPlayers: reg.totalRegisteredPlayers ?? 0,

      placement: ledger?.placement ?? null,
      placementLabel: ledger?.placement
        ? (placementLabel[ledger.placement] ?? null)
        : null,
      wins: ledger?.wins ?? 0,
      basePoints: ledger?.basePoints ?? 0,
      winPoints: ledger?.winPoints ?? 0,
      totalPoints: ledger?.totalPoints ?? 0,
      pointsLocked: !!ledger,
    };
  });

  // ─── Totals ─────────────────────────────────────────────────────────
  const totalPoints = tournaments.reduce((sum, t) => sum + t.totalPoints, 0);
  const totalWins = tournaments.reduce((sum, t) => sum + t.wins, 0);
  const totalBasePoints = tournaments.reduce((sum, t) => sum + t.basePoints, 0);
  const totalWinPoints = tournaments.reduce((sum, t) => sum + t.winPoints, 0);

  const provingPoints = tournaments
    .filter((t) => t.tournamentStage === TournamentStage.PROVING)
    .reduce((sum, t) => sum + t.totalPoints, 0);

  const crownPoints = tournaments
    .filter((t) => t.tournamentStage === TournamentStage.CROWN)
    .reduce((sum, t) => sum + t.totalPoints, 0);

  // ─── Final response ─────────────────────────────────────────────────
  return {
    teamId: team.id,
    teamName: team.teamName,
    divisionName: division.replace(/_/g, " "),

    meta: {
      resetAfter: resetAfter.toISOString(),
      lastRoyalEndedAt: lastRoyal?.endDate?.toISOString() ?? null,
      totalTournaments: tournaments.length,
    },

    totals: {
      historyPoints: totalPoints,
      totalWins,
      totalBasePoints,
      totalWinPoints,
      provingPoints,
      crownPoints,
    },

    tournaments,
  };
};

// Get team tournament details (for a specific tournament)
const getTeamTournamentDetails = async (req: Request) => {
  const { tournamentId } = req.params;
  // const { tournamentId } = req.query as { tournamentId?: string };

  const reg = await prisma.teamregistration.findFirst({
    where: { tournamentId },
    select: {
      id: true,
      teamName: true,
      tourDivision: { select: { divisionName: true } },
    },
  });

  if (!reg?.id || !reg.tourDivision?.divisionName) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Team is not registered in this tournament",
    );
  }

  const divisionName = reg.tourDivision.divisionName;
  const teamRegId = reg.id;

  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId },
    select: {
      id: true,
      name: true,
      tournamentStage: true,
      startDate: true,
      endDate: true,
    },
  });
  if (!tournament)
    throw new ApiError(httpStatus.NOT_FOUND, "Tournament not found");

  const ledger = await prisma.seriesPointsLedger.findFirst({
    where: { tournamentId, divisionName },
    select: {
      placement: true,
      basePoints: true,
      winPoints: true,
      totalPoints: true,
      wins: true,
    },
  });

  const matches = await prisma.match.findMany({
    where: {
      tournamentId,
      OR: [{ homeTeamId: teamRegId }, { awayTeamId: teamRegId }],
    },
    select: {
      id: true,
      scheduledAt: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { teamName: true } },
      awayTeam: { select: { teamName: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  // We'll collect only completed matches
  const completedMatches: TournamentMatchRow[] = [];
  let played = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let gf = 0;
  let ga = 0;

  for (const m of matches) {
    const isHome = m.homeTeamId === teamRegId;
    const opponentTeamName = isHome
      ? (m.awayTeam?.teamName ?? "Unknown")
      : (m.homeTeam?.teamName ?? "Unknown");

    const hs = typeof m.homeScore === "number" ? m.homeScore : null;
    const as = typeof m.awayScore === "number" ? m.awayScore : null;

    // Only process completed matches
    if (hs !== null && as !== null) {
      const result = calcMatchResult(isHome, hs, as);

      const myGoals = isHome ? hs : as;
      const oppGoals = isHome ? as : hs;

      gf += myGoals;
      ga += oppGoals;

      if (result === "WIN") wins += 1;
      else if (result === "LOSS") losses += 1;
      else if (result === "DRAW") draws += 1;

      played += 1;

      completedMatches.push({
        matchId: m.id,
        scheduledAt: m.scheduledAt,
        opponentTeamName,
        homeScore: hs,
        awayScore: as,
        result,
      });
    }
    // → pending matches are simply skipped
  }

  const resp: TeamTournamentDetailsResponse = {
    divisionName,
    tournament: {
      tournamentId: tournament.id,
      name: tournament.name,
      stage: tournament.tournamentStage,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
    },
    points: {
      placement: ledger?.placement ?? "PENDING",
      basePoints: ledger?.basePoints ?? 0,
      winPoints: ledger?.winPoints ?? 0,
      totalPoints: ledger?.totalPoints ?? 0,
      winsCounted: ledger?.wins ?? 0,
    },
    summary: {
      played,
      wins,
      draws,
      losses,
      gf,
      ga,
      gd: gf - ga,
    },
    matches: completedMatches,
  };

  return resp;
};

// Get all tournaments a team is registered under, with details
const getATeamIdUnderTour = async (req: Request) => {
  const { teamId } = req.params;

  const registrations = await prisma.teamregistration.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      teamName: true,
      image: true,
      registrationPayStatus: true,
      maxPlayers: true,
      totalRegisteredPlayers: true,
      createdAt: true,

      tournament: {
        select: {
          id: true,
          name: true,
          tournamentStage: true,
          status: true,
          startDate: true,
          endDate: true,
          location: true,
          gameStyle: true,
          logo: true,
          numberOfFields: true,
          rosterSizeMax: true,
        },
      },

      tourDivision: {
        select: {
          id: true,
          divisionName: true,
          status: true,
          slotsLeft: true,
          maxTeams: true,
          feeOverride: true,
        },
      },
      teamplayers: {
        select: { status: true },
      },
    },
  });

  if (!registrations.length) {
    return {
      teamId,
      totalTournaments: 0,
      tournaments: [],
    };
  }

  const formatDate = (date: Date) =>
    date
      .toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
      .toUpperCase()
      .replace(/,/g, "");

  const tournaments = registrations.map((reg) => {
    const tour = reg.tournament;
    const div = reg.tourDivision;

    const totalPlayers = reg.totalRegisteredPlayers;
    const signedCount = reg.teamplayers.filter(
      (p) => p.status === wavierStatus.Signed,
    ).length;

    return {
      registrationId: reg.id,
      registrationPayStatus: reg.registrationPayStatus,
      registeredAt: reg.createdAt.toISOString(),

      tournament: {
        id: tour.id,
        name: tour.name,
        stage: tour.tournamentStage,
        status: tour.status,
        startDate: tour.startDate.toISOString().split("T")[0],
        endDate: tour.endDate.toISOString().split("T")[0],
        formattedDate: `${formatDate(tour.startDate)} – ${formatDate(tour.endDate)}`,
        location: tour.location,
        gameStyle: tour.gameStyle,
        logo: tour.logo ?? null,
        rosterSizeMax: tour.rosterSizeMax,
        numberOfFields: tour.numberOfFields,
      },

      division: {
        id: div.id,
        name: div.divisionName.replace(/_/g, " "),
        raw: div.divisionName,
        status: div.status,
        slotsLeft: div.slotsLeft ?? null,
        maxTeams: div.maxTeams,
        feeOverride: div.feeOverride ?? null,
      },
      rosterSummary: {
        totalPlayers,
        signedCount,
        maxPlayers: reg.maxPlayers,
        badgeStatus:
          totalPlayers === 0
            ? "NO PLAYERS"
            : signedCount === totalPlayers
              ? "ROSTER COMPLETE"
              : "ROSTER INCOMPLETE",
        message:
          totalPlayers === 0
            ? "No players registered yet."
            : `${signedCount}/${totalPlayers} waivers signed`,
      },
    };
  });

  return {
    teamId,
    totalTournaments: tournaments.length,
    tournaments,
  };
};

// Get all tournaments a team is registered under
const getTeamregistrationByUserId = async (req: Request) => {
  const id = req.params.registrationId;

  const reg = await prisma.teamregistration.findUnique({
    where: { id },
    select: {
      id: true,
      teamName: true,
      image: true,
      registrationPayStatus: true,
      maxPlayers: true,
      totalRegisteredPlayers: true,
      createdAt: true,

      // Coach
      coach: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          profileImage: true,
        },
      },
      team: {
        select: {
          id: true,
          teamName: true,
          division: true,
          image: true,
          teamManagers: {
            where: {
              manager: {
                isDeleted: false,
              },
            },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              manager: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  phoneNumber: true,
                  profileImage: true,
                },
              },
            },
          },
        },
      },
      tournament: {
        select: {
          id: true,
          name: true,
          tournamentStage: true,
          status: true,
          startDate: true,
          endDate: true,
          location: true,
          mapLink: true,
          gameStyle: true,
          logo: true,
          rosterSizeMax: true,
          numberOfFields: true,
        },
      },
      tourDivision: {
        select: {
          id: true,
          divisionName: true,
          maxTeams: true,
          matches: {
            orderBy: { scheduledAt: "asc" },
            select: {
              id: true,
              scheduledAt: true,
              field: true,
              status: true,
              stage: true,
              homeTeam: {
                select: { id: true, teamName: true },
              },
              awayTeam: {
                select: { id: true, teamName: true },
              },
            },
          },
        },
      },
      teamplayers: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          ageVerified: true,
          isAgree: true,
          signName: true,
          signedAt: true,
          isDeletedTeamPlayer: true,
          player: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phoneNumber: true,
              dob: true,
              jerseyNum: true,
              profileImage: true,
              status: true,
              isDeleted: true,
            },
          },
        },
      },
    },
  });

  if (!reg) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      `Registration not found for id: "${id}"`,
    );
  }

  if (!reg.tournament) {
    throw new ApiError(httpStatus.NOT_FOUND, "Tournament data missing");
  }
  if (!reg.team) {
    throw new ApiError(httpStatus.NOT_FOUND, "Team data missing");
  }
  if (!reg.tourDivision) {
    throw new ApiError(httpStatus.NOT_FOUND, "Division data missing");
  }

  const formatDate = (date: Date) =>
    date
      .toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
      .toUpperCase()
      .replace(/,/g, "");

  const formatTime = (date: Date) =>
    date
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .replace(/^0/, "");

  const ourId = reg.id;

  // Roster stats
  const totalPlayers = reg.totalRegisteredPlayers;
  const signedCount = reg.teamplayers.filter(
    (p) => p.status === wavierStatus.Signed,
  ).length;

  const players = reg.teamplayers
    .filter((tp) => !tp.isDeletedTeamPlayer)
    .map((tp, index) => ({
      teamPlayerId: tp.id,
      number: index + 1,
      waiverStatus: tp.status,
      ageVerified: tp.ageVerified,
      isAgree: tp.isAgree,
      signName: tp.signName ?? null,
      signedAt: tp.signedAt ?? null,
      player: {
        id: tp.player.id,
        fullName: tp.player.fullName,
        email: tp.player.email,
        phoneNumber: tp.player.phoneNumber ?? null,
        jerseyNum: tp.player.jerseyNum ?? null,
        dob: tp.player.dob ?? null,
        profileImage: tp.player.profileImage ?? null,
        status: tp.player.status,
      },
    }));

  // Match schedule
  const matchSchedule = reg.tourDivision.matches
    .filter((m) => m.homeTeam?.id === ourId || m.awayTeam?.id === ourId)
    .map((m) => {
      const isHome = m.homeTeam?.id === ourId;
      const opponent = isHome ? m.awayTeam : m.homeTeam;

      return {
        matchId: m.id,
        time: formatTime(m.scheduledAt),
        match: `${reg.teamName} vs ${opponent?.teamName ?? "TBD"}`,
        date: formatDate(m.scheduledAt),
        field: m.field ?? "TBD",
        stage: m.stage,
        status: m.status,
        isHome,
        opponent: {
          id: opponent?.id ?? null,
          teamName: opponent?.teamName ?? "TBD",
        },
      };
    });

  // ── Format managers (all equal — no primary) ───────────────────────────
  const managers = reg.team.teamManagers.map((tm) => ({
    id: tm.manager.id,
    fullName: tm.manager.fullName,
    role: "Team Manager",
    email: tm.manager.email,
    phoneNumber: tm.manager.phoneNumber ?? null,
    profileImage: tm.manager.profileImage ?? null,
    teamManagerId: tm.id,
  }));

  return {
    registrationId: reg.id,
    teamName: reg.teamName,
    image: reg.image ?? null,
    registrationPayStatus: reg.registrationPayStatus,

    coachingStaff: {
      coach: reg.coach
        ? {
            id: reg.coach.id,
            fullName: reg.coach.fullName,
            role: "Head Coach",
            email: reg.coach.email,
            phoneNumber: reg.coach.phoneNumber ?? null,
            profileImage: reg.coach.profileImage ?? null,
            isPrimary: true,
          }
        : null,

      managers,
    },

    tournament: {
      id: reg.tournament.id,
      name: reg.tournament.name,
      stage: reg.tournament.tournamentStage,
      status: reg.tournament.status,
      date: formatDate(reg.tournament.startDate),
      startDate: reg.tournament.startDate.toISOString().split("T")[0],
      endDate: reg.tournament.endDate.toISOString().split("T")[0],
      location: reg.tournament.location,
      mapLink: reg.tournament.mapLink,
      gameStyle: reg.tournament.gameStyle,
      logo: reg.tournament.logo ?? null,
      numberOfFields: reg.tournament.numberOfFields,
    },

    division: {
      id: reg.tourDivision.id,
      name: reg.tourDivision.divisionName.replace(/_/g, " "),
      raw: reg.tourDivision.divisionName,
      maxTeams: reg.tourDivision.maxTeams,
    },

    roster: {
      maxPlayers: reg.maxPlayers,
      totalPlayers,
      signedCount,
      pendingCount: totalPlayers - signedCount,
      slotsRemaining: reg.maxPlayers - totalPlayers,
      isComplete: totalPlayers > 0 && signedCount === totalPlayers,
      badgeStatus:
        totalPlayers === 0
          ? "NO PLAYERS"
          : signedCount === totalPlayers
            ? "ROSTER COMPLETE"
            : "ROSTER INCOMPLETE",
      message:
        totalPlayers === 0
          ? "No players registered yet."
          : `Currently ${signedCount}/${totalPlayers} waivers signed.`,
      players,
    },

    matchSchedule,
    totalMatches: matchSchedule.length,
  };
};

// Send email to a player
const sendMailToAPlayer = async (req: Request) => {
  const playerId = req.params.id;
  const coachId = req.user.id;

  const player = await prisma.teamplayer.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      isAgree: true,
      status: true,
      player: {
        select: {
          fullName: true,
          email: true,
        },
      },
    },
  });

  if (!player) {
    throw new ApiError(404, "Player not found");
  }

  if (player.status === wavierStatus.Signed) {
    throw new ApiError(502, "Player is already signed");
  }

  const playerName = player?.player?.fullName;
  const playerEmail = player.player.email;

  const html = waiverReminderEmailHtml(playerName as string);

  const messageId = await emailSender(
    playerEmail,
    html,
    "Action Required: Complete Your Waiver Signing",
  );

  await prisma.activityLog.create({
    data: {
      userId: coachId,
      title: "Waiver Reminder",
      content: `Sent waiver reminder email to ${playerName}`,
    },
  });
  await invalidateOwnedLists("activityLog", [coachId]);

  return { success: true, messageId };
};

// update Teamregistration
const updateTeamregistration = async (id: string, req: Request) => {
  const data = req.body;
  const file = req.file;

  const team = await prisma.teams.findUnique({
    where: { id },
    include: {
      teamregistrations: true,
    },
  });

  if (!team) {
    throw new ApiError(httpStatus.NOT_FOUND, "Team not found");
  }

  let imageUrl: string | undefined;
  if (file) {
    imageUrl = (await fileUploader.uploadToCloudinary(file)).Location;
  }

  const teamUpdateData: Prisma.TeamsUpdateInput = {};

  if (data.teamName?.trim()) {
    teamUpdateData.teamName = data.teamName.trim();
  }
  if (data.division) {
    teamUpdateData.division = data.division;
  }
  if (imageUrl) {
    teamUpdateData.image = imageUrl;
  }

  const registrationUpdateData: Prisma.TeamregistrationUpdateInput = {};

  if (data.teamName?.trim()) {
    registrationUpdateData.teamName = data.teamName.trim();
  }
  if (imageUrl) {
    registrationUpdateData.image = imageUrl;
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.teams.update({
      where: { id },
      data: teamUpdateData,
    });

    await tx.teamregistration.updateMany({
      where: { teamId: id },
      data: registrationUpdateData,
    });

    const refreshed = await tx.teams.findUnique({
      where: { id },
      select: {
        id: true,
        teamName: true,
        division: true,
        image: true,
        updatedAt: true,
        coach: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        teamregistrations: {
          select: {
            id: true,
            teamName: true,
            image: true,
            registrationPayStatus: true,
            maxPlayers: true,
            totalRegisteredPlayers: true,
            teamDivisionId: true,
            tournamentId: true,
            tournament: {
              select: {
                id: true,
                name: true,
                startDate: true,
                status: true,
              },
            },
            tourDivision: {
              select: {
                id: true,
                divisionName: true,
              },
            },
          },
        },
      },
    });

    return refreshed;
  });

  return result;
};

// delete Teamregistration
const deleteTeamregistration = async (id: string) => {
  const result = await prisma.teamregistration.delete({ where: { id } });

  return result;
};

// Invite manager
const inviteManager = async (req: Request) => {
  const data = req.body;
  const userId = req.user.id;
  const { teamId } = req.params;

  const team = await prisma.teams.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      coachId: true,
      managerId: true,
      teamManagers: {
        select: { managerId: true },
      },
    },
  });

  if (!team) {
    throw new ApiError(httpStatus.NOT_FOUND, "Team not found");
  }

  if (team.coachId !== userId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only the team coach can invite managers",
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `User with email ${data.email} already exists`,
    );
  }

  const hashedPassword = await bcrypt.hash(
    data.password,
    Number(config.bcrypt_salt_rounds),
  );

  const manager = await prisma.user.create({
    data: {
      createdById: userId,
      email: data.email,
      fullName: data.fullName,
      phoneNumber: data.phoneNumber,
      password: hashedPassword,
      role: UserRole.MANAGER,
    },
  });

  await prisma.teamManager.create({
    data: {
      teamId,
      managerId: manager.id,
    },
  });

  const html = inviteUserEmail(data.fullName, data.password);
  await enqueueEmail({
    to: data.email,
    subject: "Manager Account Invitation",
    html,
  });

  return {
    message: "Manager invited successfully",
    manager: {
      id: manager.id,
      fullName: manager.fullName,
      email: manager.email,
      role: UserRole.MANAGER,
    },
  };
};

// Get teams for a user (coach or manager)
const getMyTeams = async (userId: string, role: UserRole) => {
  const whereCondition =
    role === UserRole.COACH
      ? { coachId: userId }
      : role === UserRole.MANAGER
        ? {
            teamManagers: {
              some: {
                managerId: userId,
                manager: { isDeleted: false },
              },
            },
          }
        : { id: "" };

  const teams = await prisma.teams.findMany({
    where: whereCondition,
    select: {
      id: true,
      teamName: true,
      division: true,
      image: true,
      coach: {
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          email: true,
        },
      },
      teamManagers: {
        where: { manager: { isDeleted: false } },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          manager: {
            select: {
              id: true,
              fullName: true,
              phoneNumber: true,
              email: true,
            },
          },
        },
      },
    },
  });

  return teams.map((team) => ({
    id: team.id,
    teamName: team.teamName,
    division: team.division,
    image: team.image,
    coach: team.coach,
    manager: team.teamManagers.length > 0 ? team.teamManagers[0].manager : null,
  }));
};

// ============ CROWN & PITCH REFUND SYSTEM (April 2026) ============

const PROCESSING_FEE_CENTS = 5000; // $50 non-waivable processing fee

// Calculate refund based on Crown & Pitch policy
// Section 1.2: Standard Cancellation
// Section 1.3: Weather/Force Majeure
// Section 1.6: No-Shows
const calculateRefund = (
  registrationFeeCents: number,
  daysBeforeEvent: number,
  cancellationType: string,
  gamesCompleted: number = 0,
) => {
  let refundCents = 0;
  let creditCents = 0;
  let tier = "";
  let locked = false;
  let reason = "";

  // Standard Cancellation (1.2)
  if (cancellationType === "voluntary") {
    creditCents = registrationFeeCents; // Credit always equals full registration

    if (daysBeforeEvent > 14) {
      // More than 14 days: Full refund minus $50 fee
      refundCents = Math.max(0, registrationFeeCents - PROCESSING_FEE_CENTS);
      tier = "gt14days";
      reason = "Full refund minus $50 processing fee";
    } else if (daysBeforeEvent >= 7 && daysBeforeEvent <= 14) {
      // 7-14 days: 50% refund minus $50 fee
      refundCents = Math.max(
        0,
        Math.floor(registrationFeeCents * 0.5) - PROCESSING_FEE_CENTS,
      );
      tier = "days7to14";
      reason = "50% refund minus $50 processing fee";
    } else {
      // Less than 7 days: No refund (credit at sole discretion)
      refundCents = 0;
      tier = "lt7days";
      reason = "No refund; credit may be offered at sole discretion";
    }
  }
  // Weather/Force Majeure (1.3)
  else if (cancellationType === "weather") {
    creditCents = registrationFeeCents; // Credit always full

    if (gamesCompleted === 0) {
      // Tournament not started: Full refund
      refundCents = registrationFeeCents;
      tier = "weather_not_started";
      reason = "Full refund - tournament not started";
    } else if (gamesCompleted === 1) {
      // 1 game completed: 50% refund (results voided)
      refundCents = Math.floor(registrationFeeCents * 0.5);
      tier = "weather_partial";
      reason = "50% refund - partial play (1 game completed, results voided)";
    } else {
      // More than 1 game: No refund (results stand as final)
      refundCents = 0;
      tier = "weather_complete";
      reason = "No refund - 2+ games completed (results stand as final)";
      locked = true;
    }
  }
  // No-Show (1.6)
  else if (cancellationType === "no_show") {
    refundCents = 0;
    creditCents = 0;
    tier = "no_show";
    reason =
      "No refund and no credit - team no-show without prior written notice";
    locked = true;
  }
  // Code of Conduct Violation
  else if (cancellationType === "code_of_conduct") {
    refundCents = 0;
    creditCents = 0;
    tier = "code_of_conduct";
    reason = "No refund and no credit - code of conduct violation";
    locked = true;
  }

  return {
    refundAmountCents: refundCents,
    creditAmountCents: creditCents,
    processingFeeRetainedCents: registrationFeeCents - refundCents,
    tier,
    locked,
    reason,
  };
};

// Webhook: handle payment_intent.succeeded
const handlePaymentIntentSucceeded = async (paymentIntent: any) => {
  const registrationId = paymentIntent.metadata?.registrationId;
  if (!registrationId) return;

  await prisma.$transaction(async (tx) => {
    const registration = await tx.teamregistration.findUnique({
      where: { id: registrationId },
    });

    if (!registration) return;
    if (registration.registrationPayStatus === "PAID") return;

    // Update registration status
    await tx.teamregistration.update({
      where: { id: registrationId },
      data: {
        registrationPayStatus: "PAID",
      },
    });

    // Update payment status
    await tx.payment
      .updateMany({
        where: { stripePaymentId: paymentIntent.id },
        data: { status: "PAID" },
      })
      .catch(() => {});
  });

  // Send confirmation notification to admins and coach
  try {
    const registration = await prisma.teamregistration.findUnique({
      where: { id: registrationId },
      include: { tournament: true },
    });

    if (registration) {
      const admins = await prisma.user.findMany({
        where: { role: UserRole.ADMIN },
        select: { id: true },
      });

      for (const admin of admins) {
        await prisma.notification
          .create({
            data: {
              userId: admin.id,
              title: "Tournament Payment Received",
              body: `Payment confirmed for ${registration.teamName} in ${registration.tournament.name}`,
            },
          })
          .catch(() => {});
      }

      // Notify coach
      await prisma.notification
        .create({
          data: {
            userId: registration.userId,
            title: "Payment Confirmed",
            body: `Your registration for ${registration.teamName} in ${registration.tournament.name} has been confirmed.`,
          },
        })
        .catch(() => {});
    }
  } catch (error) {
    console.error("Failed to send payment confirmation notification:", error);
  }
};

// Webhook: handle payment_intent.payment_failed
const handlePaymentIntentFailed = async (paymentIntent: any) => {
  const registrationId = paymentIntent.metadata?.registrationId;
  if (!registrationId) return;

  const registration = await prisma.teamregistration.findUnique({
    where: { id: registrationId },
  });

  await prisma.$transaction(async (tx) => {
    if (!registration) return;
    if (registration.registrationPayStatus === "FAILED") return;

    // Update registration status
    await tx.teamregistration.update({
      where: { id: registrationId },
      data: {
        registrationPayStatus: "FAILED",
      },
    });

    // Update payment status
    await tx.payment
      .updateMany({
        where: { stripePaymentId: paymentIntent.id },
        data: { status: "FAILED" },
      })
      .catch(() => {});
  });

  // Send failure notification to admins and coach
  if (registration) {
    try {
      const admins = await prisma.user.findMany({
        where: { role: UserRole.ADMIN },
        select: { id: true },
      });

      for (const admin of admins) {
        await prisma.notification
          .create({
            data: {
              userId: admin.id,
              title: "Tournament Payment Failed",
              body: `Payment failed for ${registration.teamName} - ${paymentIntent.last_payment_error?.message || "Unknown error"}`,
            },
          })
          .catch(() => {});
      }

      // Notify coach
      await prisma.notification
        .create({
          data: {
            userId: registration.userId,
            title: "Payment Failed",
            body: `Payment failed for ${registration.teamName} - ${paymentIntent.last_payment_error?.message || "Unknown error"}. Please try again.`,
          },
        })
        .catch(() => {});
    } catch (error) {
      console.error("Failed to send payment failure notification:", error);
    }
  }
};

// Webhook: handle charge.refunded
const handleChargeRefunded = async (charge: any) => {
  const chargeId = charge.id;
  if (!chargeId) return;

  const run = async () => {
    await prisma.$transaction(async (tx) => {
      // Find payment record by stripe charge ID (from latest_charge)
      const payment = await tx.payment.findFirst({
        where: { stripePaymentId: charge.payment_intent || chargeId },
      });

      if (!payment || !payment.registrationId) return;

      const registration = await tx.teamregistration.findUnique({
        where: { id: payment.registrationId },
      });

      if (!registration) return;
      if (registration.refundStatus === "issued") return;

      // Update refund status to issued (confirmed by Stripe)
      await tx.teamregistration.update({
        where: { id: registration.id },
        data: {
          refundStatus: "issued",
        },
      });

      // Create activity log if admin initiated
      if (registration.cancelledByAdminId) {
          await tx.activityLog
            .create({
              data: {
                userId: registration.cancelledByAdminId,
                title: "Refund Completed",
                content: `Stripe refund completed for ${registration.teamName}. Amount: $${(registration.refundAmountCents! / 100).toFixed(2)}`,
              },
            })
            .catch(() => {});
          await invalidateOwnedLists(
            "activityLog",
            [registration.cancelledByAdminId],
          );
      }

      // Notify admins and coach
      const admins = await tx.user.findMany({
        where: { role: UserRole.ADMIN },
        select: { id: true },
      });

      for (const admin of admins) {
        await tx.notification
          .create({
            data: {
              userId: admin.id,
              title: "Refund Completed",
              body: `Refund of $${(registration.refundAmountCents! / 100).toFixed(2)} for ${registration.teamName} has been processed.`,
            },
          })
          .catch(() => {});
      }

      // Notify coach
      await tx.notification
        .create({
          data: {
            userId: registration.userId,
            title: "Refund Processed",
            body: `Refund of $${(registration.refundAmountCents! / 100).toFixed(2)} for ${registration.teamName} has been processed. Credit: $${(registration.creditAmountCents! / 100).toFixed(2)} (expires ${registration.creditExpiryDate?.toLocaleDateString()}).`,
          },
        })
        .catch(() => {});
    });
  };

  try {
    await run();
  } catch (error: any) {
    const message = error?.message || "";
    if (message.includes("write conflict") || message.includes("deadlock")) {
      await run();
      return;
    }
    throw error;
  }
};

// Admin action: Cancel team registration with refund and credit
const cancelTeamRegistration = async (
  registrationId: string,
  cancellationType: string,
  gamesCompleted: number = 0,
  adminId?: string,
  adminNotes?: string,
) => {
  const registration = await prisma.teamregistration.findUnique({
    where: { id: registrationId },
    include: { tournament: true },
  });

  if (!registration) {
    throw new ApiError(httpStatus.NOT_FOUND, "Team registration not found");
  }

  if (registration.cancellationStatus === "cancelled") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Team already cancelled");
  }

  // Calculate days before tournament
  const daysBeforeEvent = Math.ceil(
    (registration.tournament.startDate.getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24),
  );

  // Calculate refund using Crown & Pitch policy
  const refund = calculateRefund(
    registration.registrationFeeCents || 0,
    daysBeforeEvent,
    cancellationType,
    gamesCompleted,
  );

  // Determine credit expiry (1 year from tournament start date)
  const creditExpiryDate = new Date(registration.tournament.startDate);
  creditExpiryDate.setFullYear(creditExpiryDate.getFullYear() + 1);

  // Initiate Stripe refund if amount > 0 and already paid
  let stripeRefund = null;
  if (
    refund.refundAmountCents > 0 &&
    registration.registrationPayStatus === "PAID"
  ) {
    const payment = await prisma.payment.findFirst({
      where: { registrationId },
    });

    if (payment?.stripePaymentId) {
      try {
        stripeRefund = await stripe.refunds.create({
          payment_intent: payment.stripePaymentId,
          amount: refund.refundAmountCents,
        });
      } catch (error: any) {
        console.error("Stripe refund failed:", error);
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Failed to process Stripe refund",
        );
      }
    }
  }

  // Update registration with cancellation and refund details
  const updatedRegistration = await prisma.teamregistration.update({
    where: { id: registrationId },
    data: {
      cancellationStatus: "cancelled",
      cancellationType,
      cancellationDate: new Date(),
      cancelledByAdminId: adminId,
      refundStatus: refund.refundAmountCents > 0 ? "pending" : "none",
      refundAmountCents: refund.refundAmountCents,
      creditAmountCents: refund.creditAmountCents,
      creditExpiryDate: refund.creditAmountCents > 0 ? creditExpiryDate : null,
      refundTier: refund.tier,
      processingFeeRetainedCents: refund.processingFeeRetainedCents,
      stripeRefundId: stripeRefund?.id || null,
      adminNotes: adminNotes || refund.reason,
      gamesCompleted,
    },
  });

  // Create activity log for admin action
  if (adminId) {
      await prisma.activityLog
        .create({
          data: {
            userId: adminId,
            title: "Team Registration Cancelled",
            content: `${registration.teamName} cancelled as ${cancellationType}. Refund: $${(refund.refundAmountCents / 100).toFixed(2)}, Credit: $${(refund.creditAmountCents / 100).toFixed(2)}. ${refund.reason}`,
          },
        })
        .catch(() => {}); // Graceful fail if activityLog doesn't exist
    await invalidateOwnedLists("activityLog", [adminId]);
  }

  // Notify admins and coach
  try {
    const admins = await prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: { id: true },
    });

    const notificationData = {
      title: "Team Cancellation Processed",
      body: `${registration.teamName} cancelled (${cancellationType}). Refund: $${(refund.refundAmountCents / 100).toFixed(2)}, Credit: $${(refund.creditAmountCents / 100).toFixed(2)}.`,
    };

    // Notify all admins
    for (const admin of admins) {
      await prisma.notification
        .create({
          data: {
            userId: admin.id,
            ...notificationData,
          },
        })
        .catch(() => {});
    }

    // Notify coach
    await prisma.notification
      .create({
        data: {
          userId: registration.userId,
          title: "Team Registration Cancelled",
          body: `Your team ${registration.teamName} has been cancelled. ${refund.reason} Refund: $${(refund.refundAmountCents / 100).toFixed(2)}, Credit: $${(refund.creditAmountCents / 100).toFixed(2)}.`,
        },
      })
      .catch(() => {});
  } catch (error) {
    console.error("Failed to send notifications:", error);
  }

  return {
    registration: updatedRegistration,
    refund,
    stripeRefund,
  };
};

export const teamregistrationService = {
  createTeamregistration,
  getTeamregistrationList,
  getTeamregistrationByUserId,
  updateTeamregistration,
  deleteTeamregistration,
  inviteManager,
  getATeamIdUnderTour,
  coachesHomepageData,
  getTeamAchievementsDashboard,
  getTeamTournamentDetails,
  sendMailToAPlayer,
  getMyTeams,
  calculateRefund,
  cancelTeamRegistration,
  handlePaymentIntentSucceeded,
  handlePaymentIntentFailed,
  handleChargeRefunded,
};
