import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { playerService } from "./player.service";
import { Request, Response } from "express";
import pick from "../../../shared/pick";

const addPlayer = catchAsync(async (req: Request, res: Response) => {
  const result = await playerService.addPlayer(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "create a player",
    data: result,
  });
});

// get Player
const teamregistrationFilterableFields = [
  "searchTerm",
  "id",
  "createdAt",
  "userId",
];
const getPlayerList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const filters = pick(req.query, teamregistrationFilterableFields);
  const result = await playerService.getAllPlayer(options, filters, req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All player retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getDashboard = catchAsync(async (req: Request, res: Response) => {
  const result = await playerService.playerDashboard(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Player home page data retrieved successfully",
    data: result,
  });
});
const getSchedule = catchAsync(async (req: Request, res: Response) => {
  const result = await playerService.playerSchedule(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Player schedule retrieved successfully",
    data: result,
  });
});

export const playerController = {
  getDashboard,
  getSchedule,
  getPlayerList,
  addPlayer,
};
