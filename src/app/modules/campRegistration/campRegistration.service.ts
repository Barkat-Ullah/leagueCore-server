import { PaymentStatus, Prisma, UserRole } from "@prisma/client";
import httpStatus from "http-status";
import ApiError from "../../../errors/ApiErrors";
import { IPaginationOptions } from "../../../interfaces/paginations";
import { paginationHelper } from "../../../helpars/paginationHelper";
import prisma from "../../../shared/prisma";
import { stripe } from "../teamregistration/teamregistration.service";
import emailSender from "../../../shared/emailSender";
import {
  campRegistrationConfirmationEmail,
  campPaymentConfirmedEmail,
  campPaymentFailedEmail,
  campRefundProcessedEmail,
} from "../../../shared/emailHTML";

// Register players (public form)
const registerPlayer = async (data: any) => {
  const {
    schedulePeriodId,
    scheduleSessionIds,
    players,
    parentName,
    parentPhone,
    parentEmail,
  } = data;

  // Derive counts from arrays
  const numberOfKids = players.length;
  const numberOfWeeks = scheduleSessionIds.length;

  // Compute total amount (processing fee = 3% of base, charged on top)
  const basePrice = 225;
  const baseAmount = basePrice * numberOfKids * numberOfWeeks;
  const processingFee = Math.round(baseAmount * 0.03 * 100) / 100;
  const totalAmount = Math.round((baseAmount + processingFee) * 100) / 100;

  // Validate schedule period exists and is active
  const period = await prisma.schedulePeriod.findUnique({
    where: { id: schedulePeriodId },
  });
  if (!period || period.isDeleted) {
    throw new ApiError(httpStatus.NOT_FOUND, "Schedule not found");
  }
  if (period.status === "CLOSED") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Registrations for this camp are closed");
  }

  // Fetch all specified sessions
  const targetSessions = await prisma.scheduleSession.findMany({
    where: { id: { in: scheduleSessionIds } },
  });

  if (targetSessions.length !== scheduleSessionIds.length) {
    throw new ApiError(httpStatus.NOT_FOUND, "One or more sessions not found");
  }

  // Check capacity and goalie slots on ALL specified sessions
  const goalieCount = players.filter((p: any) => p.playerType === "GOALIE").length;
  for (const sess of targetSessions) {
    if (sess.totalRegistered + numberOfKids > sess.capacity) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Session "${sess.title}" does not have enough capacity. Please join the waitlist.`
      );
    }
    if (goalieCount > 0 && sess.totalGoalieRegistered + goalieCount > sess.goalieSlots) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Goalie slots are full for session "${sess.title}". Please join the goalie waitlist.`
      );
    }
  }

  const result = await prisma.campRegistration.create({
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

  // Send confirmation email to parent
  try {
    const emailHtml = campRegistrationConfirmationEmail(
      parentName,
      result.players,
      numberOfWeeks,
      totalAmount
    );
    await emailSender(parentEmail, emailHtml, "Camp Registration Confirmation");
  } catch (error) {
    console.error("Failed to send registration email:", error);
  }

  return result;
};

type IParticipantFilter = {
  searchTerm?: string;
  schedulePeriodId?: string;
};

const participantSearchFields = ["parentName", "parentEmail"];

// List participants (admin dashboard)
const getParticipants = async (
  options: IPaginationOptions,
  filters: IParticipantFilter
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;
  const andConditions: Prisma.CampRegistrationWhereInput[] = [];

  if (filters.schedulePeriodId) {
    andConditions.push({ schedulePeriodId: filters.schedulePeriodId });
  }

  if (searchTerm) {
    andConditions.push({
      OR: participantSearchFields.map((field) => ({
        [field]: { contains: searchTerm, mode: "insensitive" },
      })),
    });
  }

  const whereConditions: Prisma.CampRegistrationWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const [data, total] = await Promise.all([
    prisma.campRegistration.findMany({
      skip,
      take: limit,
      where: whereConditions,
      orderBy: { createdAt: "desc" },
      include: { players: true },
    }),
    prisma.campRegistration.count({ where: whereConditions }),
  ]);

  return {
    meta: { total, page, limit },
    data,
  };
};

// Get single registration by id
const getRegistrationById = async (id: string) => {
  const result = await prisma.campRegistration.findUnique({
    where: { id },
    include: { schedulePeriod: true, players: true },
  });

  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, "Registration not found");
  }

  const sessions = await prisma.scheduleSession.findMany({
    where: { id: { in: result.scheduleSessionIds } },
    include: { scheduleWeek: { select: { weekNumber: true, startDate: true, endDate: true } } },
  });

  return { ...result, sessions };
};

// Move a single player to a new set of sessions (admin action)
const movePlayer = async (
  playerId: string,
  toSessionIds: string[],
  reason: string,
  movedByUserId: string
) => {
  // Find the player with their current registration and all siblings
  const player = await prisma.campPlayer.findUnique({
    where: { id: playerId },
    include: {
      campRegistration: {
        include: { players: true },
      },
    },
  });

  if (!player || !player.campRegistration) {
    throw new ApiError(httpStatus.NOT_FOUND, "Player or registration not found");
  }

  const registration = player.campRegistration;
  const isGoalie = player.playerType === "GOALIE";

  // Validate target sessions
  const targetSessions = await prisma.scheduleSession.findMany({
    where: { id: { in: toSessionIds } },
  });

  if (targetSessions.length !== toSessionIds.length) {
    throw new ApiError(httpStatus.NOT_FOUND, "One or more target sessions not found");
  }

  for (const sess of targetSessions) {
    if (sess.totalRegistered + 1 > sess.capacity) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Session "${sess.title}" does not have enough capacity`
      );
    }
    if (isGoalie && sess.totalGoalieRegistered + 1 > sess.goalieSlots) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Goalie slots are full for session "${sess.title}"`
      );
    }
  }

  const isOnlyPlayer = registration.players.length === 1;
  const newWeeks = toSessionIds.length;

  const result = await prisma.$transaction(async (tx) => {
    if (registration.status === "CONFIRMED") {
      // Decrement source sessions by 1 (this player only)
      await tx.scheduleSession.updateMany({
        where: { id: { in: registration.scheduleSessionIds } },
        data: {
          totalRegistered: { decrement: 1 },
          ...(isGoalie ? { totalGoalieRegistered: { decrement: 1 } } : {}),
        },
      });
      // Increment destination sessions by 1
      await tx.scheduleSession.updateMany({
        where: { id: { in: toSessionIds } },
        data: {
          totalRegistered: { increment: 1 },
          ...(isGoalie ? { totalGoalieRegistered: { increment: 1 } } : {}),
        },
      });
    }

    if (isOnlyPlayer) {
      // Simple case: update the registration sessions in-place
      const baseAmount = 225 * 1 * newWeeks;
      const processingFee = Math.round(baseAmount * 0.03 * 100) / 100;
      const totalAmount = Math.round((baseAmount + processingFee) * 100) / 100;

      return tx.campRegistration.update({
        where: { id: registration.id },
        data: {
          scheduleSessionIds: toSessionIds,
          numberOfWeeks: newWeeks,
          amount: 225,
          processingFee,
          totalAmount,
          moveReason: reason,
          movedAt: new Date(),
          movedByUserId,
        },
        include: { players: true },
      });
    } else {
      // Multi-player case: split — create a new registration for this player only
      const remainingKids = registration.players.length - 1;

      // Calculate per-player price and update remaining registration proportionally
      const perPlayerPrice = registration.totalAmount / registration.numberOfKids;
      const newTotalAmountForRemaining = Math.round(perPlayerPrice * remainingKids * 100) / 100;

      await tx.campRegistration.update({
        where: { id: registration.id },
        data: {
          numberOfKids: remainingKids,
          totalAmount: newTotalAmountForRemaining,
        },
      });

      const baseAmount = 225 * 1 * newWeeks;
      const processingFee = Math.round(baseAmount * 0.03 * 100) / 100;
      const totalAmount = Math.round((baseAmount + processingFee) * 100) / 100;

      const newReg = await tx.campRegistration.create({
        data: {
          schedulePeriodId: registration.schedulePeriodId,
          scheduleSessionIds: toSessionIds,
          numberOfKids: 1,
          numberOfWeeks: newWeeks,
          parentName: registration.parentName,
          parentPhone: registration.parentPhone,
          parentEmail: registration.parentEmail,
          amount: 225,
          processingFee,
          totalAmount,
          status: "CONFIRMED",
          paymentStatus: registration.paymentStatus,
          moveReason: reason,
          movedAt: new Date(),
          movedByUserId,
        },
        include: { players: true },
      });

      // Re-link this player to the new registration
      await tx.campPlayer.update({
        where: { id: playerId },
        data: { campRegistrationId: newReg.id, campWaitlistId: null },
      });

      return newReg;
    }
  });

  await prisma.activityLog.create({
    data: {
      userId: movedByUserId,
      title: "Player Session Moved",
      content: `Moved player "${player.playerName}" (${registration.parentEmail}) to ${toSessionIds.length} new session(s). Reason: ${reason}`,
    },
  });

  return result;
};

// Cancel registration
const cancelRegistration = async (registrationId: string) => {
  const registration = await prisma.campRegistration.findUnique({
    where: { id: registrationId },
    include: { players: true },
  });

  if (!registration) {
    throw new ApiError(httpStatus.NOT_FOUND, "Registration not found");
  }

  const goalieCount = registration.players.filter(
    (p) => p.playerType === "GOALIE"
  ).length;

  return prisma.$transaction(async (tx) => {
    if (registration.status === "CONFIRMED") {
      const sessionUpdateData: any = {
        totalRegistered: { decrement: registration.numberOfKids },
      };

      if (goalieCount > 0) {
        sessionUpdateData.totalGoalieRegistered = { decrement: goalieCount };
      }

      await tx.scheduleSession.updateMany({
        where: { id: { in: registration.scheduleSessionIds } },
        data: sessionUpdateData,
      });
    }

    return tx.campRegistration.update({
      where: { id: registrationId },
      data: { status: "CANCELLED" },
    });
  });
};

//********************PAYMENTS********************//

// Helper: convert dollar amount to Stripe cents
const toStripeAmount = (amount: number) => Math.round(amount * 100);

// Create payment for a camp registration
const createRegistrationPayment = async (
  registrationId: string,
  paymentMethodId: string
) => {
  if (!paymentMethodId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "paymentMethodId is required");
  }

  const registration = await prisma.campRegistration.findUnique({
    where: { id: registrationId },
    include: { players: true },
  });

  if (!registration) {
    throw new ApiError(httpStatus.NOT_FOUND, "Registration not found");
  }

  if (registration.status !== "PENDING_PAYMENT") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Registration is not pending payment");
  }

  if (registration.paymentStatus === "PAID") {
    throw new ApiError(httpStatus.BAD_REQUEST, "This registration is already paid");
  }

  // Check if a successful payment already exists
  if (registration.stripePaymentId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Payment already exists for this registration");
  }

  const totalAmount = registration.totalAmount;

  if (!totalAmount || totalAmount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid registration amount");
  }

  // Find or create Stripe customer by parentEmail
  const existingCustomers = await stripe.customers.list({
    email: registration.parentEmail,
    limit: 1,
  });

  let customerId: string;

  if (existingCustomers.data.length > 0) {
    customerId = existingCustomers.data[0].id;
  } else {
    const customer = await stripe.customers.create({
      email: registration.parentEmail,
      name: registration.parentName,
      metadata: { registrationId: registration.id },
    });
    customerId = customer.id;
  }

  // Attach payment method to customer
  try {
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  } catch (error: any) {
    if (error?.code !== "payment_method_unexpected_state") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        error?.message || "Failed to attach payment method"
      );
    }
  }

  await stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });

  // Create and confirm PaymentIntent
  let paymentIntent: any;

  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: toStripeAmount(totalAmount),
      currency: "usd",
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
      metadata: {
        registrationId: registration.id,
        parentEmail: registration.parentEmail,
        numberOfKids: String(registration.numberOfKids),
        numberOfWeeks: String(registration.numberOfWeeks),
      },
    });
  } catch (error: any) {
    const message =
      error?.raw?.message || error?.message || "Payment confirmation failed";
    throw new ApiError(httpStatus.BAD_REQUEST, message);
  }

  // Map Stripe status to PaymentStatus enum
  const mappedStatus =
    paymentIntent.status === "succeeded"
      ? PaymentStatus.PAID
      : paymentIntent.status === "requires_action"
        ? PaymentStatus.AUTHORIZED
        : paymentIntent.status === "requires_payment_method"
          ? PaymentStatus.FAILED
          : PaymentStatus.PENDING;

  const goalieCount = registration.players.filter(
    (p) => p.playerType === "GOALIE"
  ).length;

  // Resolve all session IDs covered by this registration
  const allSessionIds = registration.scheduleSessionIds;

  const result = await prisma.$transaction(async (tx) => {
    if (paymentIntent.status === "succeeded") {
      // Update session counts for ALL weeks
      const sessionUpdateData: any = {
        totalRegistered: { increment: registration.numberOfKids },
      };

      if (goalieCount > 0) {
        sessionUpdateData.totalGoalieRegistered = { increment: goalieCount };
      }

      await tx.scheduleSession.updateMany({
        where: { id: { in: allSessionIds } },
        data: sessionUpdateData,
      });

      // Mark registration as confirmed
      const updatedRegistration = await tx.campRegistration.update({
        where: { id: registrationId },
        data: {
          status: "CONFIRMED",
          paymentStatus: "PAID",
          stripePaymentId: paymentIntent.id,
        },
      });

      return updatedRegistration;
    }

    if (paymentIntent.status === "requires_payment_method") {
      // Payment failed
      await tx.campRegistration.update({
        where: { id: registrationId },
        data: {
          paymentStatus: "FAILED",
          stripePaymentId: paymentIntent.id,
        },
      });
    } else {
      // Pending or authorized - store the intent ID
      await tx.campRegistration.update({
        where: { id: registrationId },
        data: {
          paymentStatus: mappedStatus,
          stripePaymentId: paymentIntent.id,
        },
      });
    }

    return null;
  });

  return {
    paymentIntentId: paymentIntent.id,
    paymentIntentStatus: paymentIntent.status,
    nextAction: paymentIntent.next_action ?? null,
    registration: result,
  };
};

// Webhook: handle payment_intent.succeeded
const handlePaymentIntentSucceeded = async (paymentIntent: any) => {
  const registrationId = paymentIntent.metadata?.registrationId;
  if (!registrationId) return;

  // Pre-fetch to resolve all session IDs before entering the transaction
  const regSnapshot = await prisma.campRegistration.findUnique({
    where: { id: registrationId },
  });
  if (!regSnapshot || regSnapshot.paymentStatus === "PAID") return;

  const allSessionIds = regSnapshot.scheduleSessionIds;

  const chargeId =
    typeof paymentIntent.latest_charge === "string"
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id;

  let charge: any = null;

  if (chargeId) {
    charge = await stripe.charges.retrieve(chargeId);
  }

  await prisma.$transaction(async (tx) => {
    const registration = await tx.campRegistration.findUnique({
      where: { id: registrationId },
      include: { players: true },
    });

    if (!registration) return;
    if (registration.paymentStatus === "PAID") return;

    const goalieCount = registration.players.filter(
      (p) => p.playerType === "GOALIE"
    ).length;

    // Increment session counts for ALL weeks
    const sessionUpdateData: any = {
      totalRegistered: { increment: registration.numberOfKids },
    };

    if (goalieCount > 0) {
      sessionUpdateData.totalGoalieRegistered = { increment: goalieCount };
    }

    await tx.scheduleSession.updateMany({
      where: { id: { in: allSessionIds } },
      data: sessionUpdateData,
    });

    await tx.campRegistration.update({
      where: { id: registrationId },
      data: {
        status: "CONFIRMED",
        paymentStatus: "PAID",
        stripePaymentId: paymentIntent.id,
        stripeChargeId: charge?.id ?? null,
        receiptUrl: charge?.receipt_url ?? null,
        paymentMethodType: paymentIntent.payment_method_types?.[0] || null,
        paidAt: new Date(),
      },
    });
  });

  // Send confirmation email to parent and notification to admin
  try {
    const registration = await prisma.campRegistration.findUnique({
      where: { id: registrationId },
      include: { players: true },
    });

    if (registration) {
      // Email to parent
      const emailHtml = campPaymentConfirmedEmail(
        registration.parentName,
        registration.players,
        registration.numberOfWeeks,
        registration.totalAmount
      );
      await emailSender(registration.parentEmail, emailHtml, "Payment Confirmed - Camp Registration");

      // Notification to admins
      const admins = await prisma.user.findMany({
        where: { role: UserRole.ADMIN },
        select: { id: true },
      });

      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            title: "Camp Registration Payment Received",
            body: `Payment confirmed for ${registration.parentEmail} — ${registration.numberOfKids} player(s), ${registration.numberOfWeeks} week(s)`,
          },
        });
      }
    }
  } catch (error) {
    console.error("Failed to send payment confirmation email/notification:", error);
  }
};

// Webhook: handle payment_intent.payment_failed
const handlePaymentIntentFailed = async (paymentIntent: any) => {
  const registrationId = paymentIntent.metadata?.registrationId;
  const registration = await prisma.campRegistration.findUnique({
    where: { id: registrationId },
  });

  await prisma.$transaction(async (tx) => {
    if (!registration) return;
    if (registration.paymentStatus === "FAILED") return;

    await tx.campRegistration.update({
      where: { id: registration.id },
      data: {
        paymentStatus: "FAILED",
        stripePaymentId: paymentIntent.id,
        failureCode: paymentIntent.last_payment_error?.code || null,
        failureMessage: paymentIntent.last_payment_error?.message || null,
      },
    });
  });

  // Send failure notification to parent and admin
  if (registration) {
    try {
      // Email to parent
      const retryLink = `${process.env.FRONTEND_URL}/camp/payment/${registration.id}`;
      const emailHtml = campPaymentFailedEmail(
        registration.parentName,
        paymentIntent.last_payment_error?.message || "Payment declined",
        retryLink
      );
      await emailSender(registration.parentEmail, emailHtml, "Camp Registration Payment Failed");

      // Notification to admins
      const admins = await prisma.user.findMany({
        where: { role: UserRole.ADMIN },
        select: { id: true },
      });

      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            title: "Camp Registration Payment Failed",
            body: `Payment failed for ${registration.parentEmail} — ${paymentIntent.last_payment_error?.message || 'Unknown error'}`,
          },
        });
      }
    } catch (error) {
      console.error("Failed to send payment failure email/notification:", error);
    }
  }
};

// Webhook: handle charge.refunded
const handleChargeRefunded = async (charge: any) => {
  const paymentIntentId = charge.payment_intent;
  if (!paymentIntentId) return;

  // Pre-fetch to resolve all session IDs before entering the transaction
  const regSnapshot = await prisma.campRegistration.findFirst({
    where: { stripePaymentId: paymentIntentId },
  });
  const allSessionIds = regSnapshot ? regSnapshot.scheduleSessionIds : [];

  const run = async () => {
    await prisma.$transaction(async (tx) => {
      const registration = await tx.campRegistration.findFirst({
        where: { stripePaymentId: paymentIntentId },
        include: { players: true },
      });

      if (!registration) return;
      if (registration.paymentStatus === "CANCELLED") return;

      // Decrement session counts for ALL weeks if registration is confirmed
      if (registration.status === "CONFIRMED") {
        const goalieCount = registration.players.filter(
          (p) => p.playerType === "GOALIE"
        ).length;

        const sessionUpdateData: any = {
          totalRegistered: { decrement: registration.numberOfKids },
        };

        if (goalieCount > 0) {
          sessionUpdateData.totalGoalieRegistered = { decrement: goalieCount };
        }

        await tx.scheduleSession.updateMany({
          where: { id: { in: allSessionIds } },
          data: sessionUpdateData,
        });
      }

      await tx.campRegistration.update({
        where: { id: registration.id },
        data: {
          status: "CANCELLED",
          paymentStatus: PaymentStatus.CANCELLED,
          stripeChargeId: charge.id ?? null,
          refundedAt: new Date(),
        },
      });
    });
  };

  try {
    await run();
  } catch (error: any) {
    const message = error?.message || "";
    if (
      message.includes("write conflict") ||
      message.includes("deadlock")
    ) {
      await run();
      return;
    }
    throw error;
  }
};

// Refund policy:
// - >30 days before: Full credit (no fee) OR cash refund - $25 fee (user choice)
// - 30-7 days before: NO refund (but can transfer to another player)
// - <7 days or no-show: Forfeited (no refund, no credit, no transfer)
// - Org cancels session: Full refund with no admin fee
const refundRegistrationPayment = async (
  registrationId: string,
  refundType?: "CREDIT" | "REFUND",
  isCancelledByOrganization: boolean = false
) => {
  const registration = await prisma.campRegistration.findUnique({
    where: { id: registrationId },
    include: { players: true },
  });

  if (!registration) {
    throw new ApiError(httpStatus.NOT_FOUND, "Registration not found");
  }

  if (registration.paymentStatus !== PaymentStatus.PAID) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Only paid registrations can be refunded"
    );
  }

  if (!registration.stripePaymentId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Missing payment intent");
  }

  if (registration.stripeRefundId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This registration has already been refunded"
    );
  }

  // Calculate days until first session starts
  const firstSession = await prisma.scheduleSession.findFirst({
    where: { id: { in: registration.scheduleSessionIds } },
    include: { scheduleWeek: { select: { startDate: true } } },
  });
  const sessionStartDate = firstSession?.scheduleWeek.startDate ?? new Date();
  const now = new Date();
  const daysUntilSession = Math.ceil(
    (sessionStartDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  let refundAmount = registration.totalAmount;
  let policyType = "";

  // Apply refund policy
  if (isCancelledByOrganization) {
    // Organization cancelled: full refund, no fee
    policyType = "CANCELLED_BY_ORGANIZER";
    refundAmount = registration.totalAmount;
  } else if (daysUntilSession > 30) {
    // >30 days: full credit OR refund - $25 fee
    if (!refundType) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Refund type (CREDIT or REFUND) required for >30 days out"
      );
    }
    if (refundType === "CREDIT") {
      policyType = "CREDIT";
      refundAmount = registration.totalAmount; // Full credit
    } else {
      // Cash refund with $25 admin fee
      policyType = "REFUND";
      refundAmount = Math.max(0, registration.totalAmount - 25);
    }
  } else if (daysUntilSession > 7) {
    // 30-7 days: no refund, but can transfer
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Refunds not allowed within 30 days of session start. You may transfer your spot to another eligible player at no charge."
    );
  } else {
    // <7 days or no-show: forfeited
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Refunds not allowed within 7 days of session start or for no-shows. Your spot has been forfeited."
    );
  }

  // Use all session IDs for this registration
  const allSessionIds = registration.scheduleSessionIds;

  // Only process actual Stripe refunds for cash refunds
  let stripeRefund = null;
  if (policyType === "REFUND" || policyType === "CANCELLED_BY_ORGANIZER") {
    stripeRefund = await stripe.refunds.create({
      payment_intent: registration.stripePaymentId,
      amount:
        policyType === "REFUND"
          ? Math.round(refundAmount * 100)
          : undefined,
    });
  }

  await prisma.$transaction(async (tx) => {
    // Decrement session counts for ALL weeks if registration is confirmed
    if (registration.status === "CONFIRMED") {
      const goalieCount = registration.players.filter(
        (p) => p.playerType === "GOALIE"
      ).length;

      const sessionUpdateData: any = {
        totalRegistered: { decrement: registration.numberOfKids },
      };

      if (goalieCount > 0) {
        sessionUpdateData.totalGoalieRegistered = { decrement: goalieCount };
      }

      await tx.scheduleSession.updateMany({
        where: { id: { in: allSessionIds } },
        data: sessionUpdateData,
      });
    }

    await tx.campRegistration.update({
      where: { id: registrationId },
      data: {
        status: "CANCELLED",
        paymentStatus: PaymentStatus.CANCELLED,
        stripeRefundId: stripeRefund?.id ?? null,
        refundType: policyType,
        refundAmount,
        refundedAt: new Date(),
      },
    });
  });

  // Send refund confirmation email to parent and notification to admin
  try {
    const emailHtml = campRefundProcessedEmail(
      registration.parentName,
      policyType,
      refundAmount
    );
    await emailSender(registration.parentEmail, emailHtml, "Camp Registration Refund Processed");

    // Notification to admins
    const admins = await prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: { id: true },
    });

    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          title: "Camp Registration Refund Processed",
          body: `Refund of $${refundAmount} for ${registration.parentEmail} — ${policyType}`,
        },
      });
    }
  } catch (error) {
    console.error("Failed to send refund email/notification:", error);
  }

  return {
    policyType,
    refundAmount,
    daysUntilSession,
    refund: stripeRefund,
    message:
      policyType === "CREDIT"
        ? `Full credit of $${registration.totalAmount} issued. Credit is valid for any 2026 session.`
        : policyType === "REFUND"
          ? `Cash refund of $${refundAmount} issued (after $25 administrative fee).`
          : `Full refund of $${refundAmount} issued due to session cancellation.`,
  };
};

// Camp Overview dashboard data
const getCampOverview = async (schedulePeriodId?: string) => {
  const periodFilter = schedulePeriodId ? { schedulePeriodId } : {};
  const paidFilter = { ...periodFilter, paymentStatus: PaymentStatus.PAID };

  // Total revenue from paid registrations
  const revenueAgg = await prisma.campRegistration.aggregate({
    where: paidFilter,
    _sum: { totalAmount: true },
  });

  // Revenue from same period last year for comparison
  const now = new Date();
  const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
  const lastYearRevAgg = await prisma.campRegistration.aggregate({
    where: { ...paidFilter, createdAt: { gte: lastYearStart, lte: lastYearEnd } },
    _sum: { totalAmount: true },
  });

  const totalRevenue = revenueAgg._sum.totalAmount ?? 0;
  // Growth comparison only makes sense when NOT filtered by a specific period
  // (a schedulePeriodId is unique per year, so last-year records never match it)
  const lastYearRevenue = schedulePeriodId ? 0 : (lastYearRevAgg._sum.totalAmount ?? 0);
  const revenueGrowthPct =
    !schedulePeriodId && lastYearRevenue > 0
      ? Math.round(((totalRevenue - lastYearRevenue) / lastYearRevenue) * 1000) / 10
      : null;

  // Total enrollment = total number of kids (not number of registrations)
  const enrollmentAgg = await prisma.campRegistration.aggregate({
    where: paidFilter,
    _sum: { numberOfKids: true },
  });
  const totalEnrollment = enrollmentAgg._sum.numberOfKids ?? 0;

  // Waitlist count — include OFFER_SENT as well (active waiters)
  let waitlistFilter: Prisma.CampWaitlistWhereInput = { status: { in: ["ACTIVE", "OFFER_SENT"] } };
  if (schedulePeriodId) {
    const periodSessionIds = await prisma.scheduleSession
      .findMany({
        where: { scheduleWeek: { schedulePeriodId } },
        select: { id: true },
      })
      .then((s) => s.map((x) => x.id));
    waitlistFilter = { scheduleSessionIds: { hasSome: periodSessionIds }, status: { in: ["ACTIVE", "OFFER_SENT"] } };
  }

  const totalWaitlist = await prisma.campWaitlist.count({
    where: waitlistFilter,
  });

  // Revenue & enrollment by week (via session -> week)
  const weeks = await prisma.scheduleWeek.findMany({
    where: schedulePeriodId ? { schedulePeriodId } : {},
    orderBy: { weekNumber: "asc" },
    include: {
      sessions: {
        select: { id: true, totalRegistered: true },
      },
    },
  });

  const revenueByWeek = await Promise.all(
    weeks.map(async (w) => {
      const weekSessionIds = w.sessions.map((s) => s.id);
      const regs = await prisma.campRegistration.findMany({
        where: {
          paymentStatus: PaymentStatus.PAID,
          ...(schedulePeriodId ? { schedulePeriodId } : {}),
          scheduleSessionIds: { hasSome: weekSessionIds },
        },
        select: { totalAmount: true, numberOfWeeks: true },
      });
      const revenue = regs.reduce(
        (sum, r) => sum + r.totalAmount / r.numberOfWeeks,
        0
      );
      return { week: `Week ${w.weekNumber}`, revenue: Math.round(revenue * 100) / 100 };
    })
  );

  const enrollmentByWeek = weeks.map((w) => ({
    week: `Week ${w.weekNumber}`,
    total: w.sessions.reduce((sum, s) => sum + s.totalRegistered, 0),
  }));

  return {
    totalRevenue,
    revenueGrowthPct,
    totalEnrollment,
    waitlist: { total: totalWaitlist },
    revenueByWeek,
    enrollmentByWeek,
  };
};

export const campRegistrationService = {
  registerPlayer,
  getParticipants,
  getRegistrationById,
  movePlayer,
  cancelRegistration,
  createRegistrationPayment,
  handlePaymentIntentSucceeded,
  handlePaymentIntentFailed,
  handleChargeRefunded,
  refundRegistrationPayment,
  getCampOverview,
};