import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { refereeService } from "./referee.service";
import { Request, Response } from "express";
import pick from "../../../shared/pick";

// create Referee
const createReferee = catchAsync(async (req: Request, res: Response) => {
  const data = req.body;
  const result = await refereeService.createReferee(data);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Referee created successfully",
    data: result,
  });
});

// get all Referee
const refereeFilterableFields = ["searchTerm", "id", "createdAt"];
const getRefereeList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const filters = pick(req.query, refereeFilterableFields);
  const result = await refereeService.getRefereeList(options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Referee list retrieved successfully",
    // meta: result.meta,
    data: result.data,
  });
});

// get Referee by userId
const getRefereeByUserId = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await refereeService.getRefereeByUserId(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Referee details retrieved successfully",
    data: result,
  });
});

// update Referee
const updateReferee = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body;
  const result = await refereeService.updateReferee(id, data);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Referee updated successfully",
    data: result,
  });
});

// delete Referee
const deleteReferee = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await refereeService.deleteReferee(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Referee deleted successfully",
    data: result,
  });
});

export const refereeController = {
  createReferee,
  getRefereeList,
  getRefereeByUserId,
  updateReferee,
  deleteReferee,
};
