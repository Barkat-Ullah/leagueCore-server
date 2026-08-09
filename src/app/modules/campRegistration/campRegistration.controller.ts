import httpStatus from "http-status";
import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import pick from "../../../shared/pick";
import sendResponse from "../../../shared/sendResponse";
import { campRegistrationService } from "./campRegistration.service";

// Register player (public)
const registerPlayer = catchAsync(async (req: Request, res: Response) => {
  const result = await campRegistrationService.registerPlayer(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Registration created successfully",
    data: result,
  });
});

// List participants (admin)
const participantFilterableFields = [
  "searchTerm",
  "schedulePeriodId",
];
const getParticipants = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const filters = pick(req.query, participantFilterableFields);
  const result = await campRegistrationService.getParticipants(options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Participants retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

// Get registration by id
const getRegistrationById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await campRegistrationService.getRegistrationById(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Registration retrieved successfully",
    data: result,
  });
});

// Move individual player to new sessions (admin)
const movePlayer = catchAsync(async (req: Request, res: Response) => {
  const { playerId } = req.params;
  const { toSessionIds, reason } = req.body;
  const result = await campRegistrationService.movePlayer(
    playerId,
    toSessionIds,
    reason,
    req.user.id
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Player moved successfully",
    data: result,
  });
});

// Cancel registration
const cancelRegistration = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await campRegistrationService.cancelRegistration(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Registration cancelled successfully",
    data: result,
  });
});

// Create payment for registration
const createRegistrationPayment = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { paymentMethodId } = req.body;
  const result = await campRegistrationService.createRegistrationPayment(
    id,
    paymentMethodId
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payment processed successfully",
    data: result,
  });
});

// Refund registration payment
const refundRegistrationPayment = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { refundType, isCancelledByOrganization } = req.body;
  const result = await campRegistrationService.refundRegistrationPayment(
    id,
    refundType,
    isCancelledByOrganization
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

// Camp Overview dashboard
const getCampOverview = catchAsync(async (req: Request, res: Response) => {
  const { schedulePeriodId } = req.query as { schedulePeriodId?: string };
  const result = await campRegistrationService.getCampOverview(schedulePeriodId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Camp overview fetched successfully",
    data: result,
  });
});

export const campRegistrationController = {
  registerPlayer,
  getParticipants,
  getRegistrationById,
  movePlayer,
  cancelRegistration,
  createRegistrationPayment,
  refundRegistrationPayment,
  getCampOverview,
};
