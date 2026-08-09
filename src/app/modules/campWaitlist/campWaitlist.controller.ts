import httpStatus from "http-status";
import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import pick from "../../../shared/pick";
import sendResponse from "../../../shared/sendResponse";
import { campWaitlistService } from "./campWaitlist.service";

// Join waitlist (public)
const joinWaitlist = catchAsync(async (req: Request, res: Response) => {
  const result = await campWaitlistService.joinWaitlist(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Added to waitlist successfully",
    data: result,
  });
});

// List waitlist (admin)
const waitlistFilterableFields = [
  "searchTerm",
  "schedulePeriodId",
  "status",
];
const getWaitlist = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const filters = pick(req.query, waitlistFilterableFields);
  const result = await campWaitlistService.getWaitlist(options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Waitlist retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

// Get single waitlist entry (admin)
const getSingleWaitlistEntry = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await campWaitlistService.getSingleWaitlistEntry(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Waitlist entry retrieved successfully",
    data: result,
  });
});

// Get waitlist stats
const getWaitlistStats = catchAsync(async (req: Request, res: Response) => {
  const { schedulePeriodId } = req.query;
  const result = await campWaitlistService.getWaitlistStats(
    schedulePeriodId as string
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Waitlist stats retrieved successfully",
    data: result,
  });
});

// Confirm offer and create registration (user)
const confirmOfferAndRegister = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await campWaitlistService.confirmOfferAndRegister(id);
    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Offer confirmed, registration created pending payment",
      data: result,
    });
  }
);

// Admin force-move waitlist entry to a session (bypasses capacity)
const adminMoveWaitlistToSession = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { toSessionIds } = req.body;
    const result = await campWaitlistService.adminMoveWaitlistToSession(
      id,
      toSessionIds,
      req.user.id
    );
    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Waitlist player moved to registration successfully",
      data: result,
    });
  }
);

// Remove from waitlist
const removeFromWaitlist = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await campWaitlistService.removeFromWaitlist(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Removed from waitlist successfully",
    data: result,
  });
});

export const campWaitlistController = {
  joinWaitlist,
  getWaitlist,
  getSingleWaitlistEntry,
  getWaitlistStats,
  confirmOfferAndRegister,
  adminMoveWaitlistToSession,
  removeFromWaitlist,
};
