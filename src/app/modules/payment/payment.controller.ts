import httpStatus from "http-status";
import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { paymentService } from "./payment.service";
import pick from "../../../shared/pick";

// stripe
const createPayment = catchAsync(async (req: Request, res: Response) => {
  const result = await paymentService.createPayment(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Payment created successfully",
    data: result,
  });
});

const getPayments = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const filters = pick(req.query, ["searchTerm", "id", "createdAt"]);
  const result = await paymentService.getPaymentList(options, filters, req.user.id, req.user.role);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payments retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});


export const paymentController = {
  createPayment,
  getPayments,
};
