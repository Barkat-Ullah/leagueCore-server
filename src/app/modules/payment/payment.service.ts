import { Prisma, UserRole } from "@prisma/client";
import { Request } from "express";
import httpStatus from "http-status";
import Stripe from "stripe";
import ApiError from "../../../errors/ApiErrors";
import { paginationHelper } from "../../../helpars/paginationHelper";
import { IPaginationOptions } from "../../../interfaces/paginations";
import prisma from "../../../shared/prisma";
import { stripe } from "../teamregistration/teamregistration.service";


// stripe create Payment
const createPayment = async (req: Request) => {

  const { methodId, amount, category } = req.body;

  if (!["Youth", "Adult"].includes(category)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Invalid bundle category. Must be 'Youth' or 'Adult'",
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      fullName: true,
      email: true,
      BundleCategory: true,
      totalBundle: true,
      hasBundle: true,
      customerId: true,
    },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.hasBundle) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "User already has an active bundle",
    );
  }

  const userId = user.id;
  let stripeCustomerId = user.customerId;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.fullName ?? undefined,
      metadata: { userId },
    });

    stripeCustomerId = customer.id;

    await prisma.user.update({
      where: { id: userId },
      data: { customerId: stripeCustomerId },
    });
  }

  await stripe.paymentMethods.attach(methodId, {
    customer: stripeCustomerId,
  });

  const paymentMethodDetails = await stripe.paymentMethods.retrieve(methodId);
  const card = paymentMethodDetails.card;

  let paymentIntent: Stripe.PaymentIntent;

  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: methodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
      description: `Buy ${category} bundle: ${user.fullName}`,
      metadata: { userId, category },
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

  await prisma.payment.create({
    data: {
      userId,
      amount,
      status: "PAID",
      stripePaymentId: paymentIntent.id,
      stripeCustomerId,
      cardBrand: card?.brand ?? null,
      description: `${category} bundle purchase`,
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      paymentMethodId: methodId,
      hasBundle: true,
      totalBundle: 4,
      BundleCategory: category,
    },
  });

  return {
    success: true,
    paymentIntentId: paymentIntent.id,
    bundle: category,
  };
};

// get all Payment
type IPaymentFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
};

const paymentSearchAbleFields = ["fullName", "email", "userName"];

const getPaymentList = async (
  options: IPaginationOptions,
  filters: IPaymentFilterRequest,
  userId: string,
  role: string,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.PaymentWhereInput[] = [];

  if (role === UserRole.COACH) {
    andConditions.push({ userId });
  }

  if (searchTerm) {
    andConditions.push({
      OR: [
        ...paymentSearchAbleFields.map((field) => ({
          [field]: {
            contains: searchTerm,
            mode: "insensitive",
          },
        })),
      ],
    });
  }

  if (Object.keys(filterData).length) {
    Object.keys(filterData).forEach((key) => {
      const value = (filterData as any)[key];
      if (value === "" || value === null || value === undefined) return;

      if (key === "createdAt" && value) {
        const start = new Date(value);
        start.setHours(0, 0, 0, 0);

        const end = new Date(value);
        end.setHours(23, 59, 59, 999);

        andConditions.push({
          createdAt: {
            gte: start.toISOString(),
            lte: end.toISOString(),
          },
        });

        return;
      }

      andConditions.push({ [key]: value });
    });
  }

  const whereConditions: Prisma.PaymentWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const result = await prisma.payment.findMany({
    skip,
    take: limit,
    where: whereConditions,
    select: {
      id: true,
      createdAt: true,
      description: true,
      status: true,
      amount: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const total = await prisma.payment.count({ where: whereConditions });

  return {
    meta: { total, page, limit },
    data: result,
  };
};

const getPaymentByUserId = async (userId: string) => {
  const result = await prisma.payment.findMany({ where: { userId } });

  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, "Payment not found");
  }

  return result;
};

const updatePayment = async (id: string, data: any) => {
  const existingPayment = await prisma.payment.findUnique({ where: { id } });

  if (!existingPayment) {
    throw new ApiError(httpStatus.NOT_FOUND, "Payment not found");
  }

  return prisma.payment.update({
    where: { id },
    data,
  });
};

const deletePayment = async (id: string) => {
  return prisma.payment.delete({ where: { id } });
};

export const paymentService = {
  createPayment,
  getPaymentList,
  getPaymentByUserId,
  updatePayment,
  deletePayment,
};
