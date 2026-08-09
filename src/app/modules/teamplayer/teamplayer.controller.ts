import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { teamplayerService } from "./teamplayer.service";
import { Request, Response } from "express";
import pick from "../../../shared/pick";

// create Teamplayer
const createTeamplayer = catchAsync(async (req: Request, res: Response) => {
  const result = await teamplayerService.createTeamplayer(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: result.message || "Teamplayer created successfully",
    data: result,
  });
});

// get all Teamplayer
const teamplayerFilterableFields = [
  "searchTerm",
  "id",
  "createdAt",
  "jerseyNum",
  "status",
  "ageVerified",
  "teamregistrationId",
  "playerId",
  "userId",
  "teamId",
];
const getTeamplayerList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const filters = pick(req.query, teamplayerFilterableFields);
  const result = await teamplayerService.getTeamplayerList(
    options,
    filters,
    req.user.id,
    req.user.role,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Teamplayer list retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

// get Teamplayer by userId
const getTeamplayerByUserId = catchAsync(
  async (req: Request, res: Response) => {
    const result = await teamplayerService.getTeamplayerByUserId(req.params.id);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Teamplayer details retrieved successfully",
      data: result,
    });
  },
);

// update Teamplayer
const updateTeamplayer = catchAsync(async (req: Request, res: Response) => {
  const result = await teamplayerService.updateTeamplayer(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Teamplayer updated successfully",
    data: result,
  });
});

// delete Teamplayer
const deleteTeamplayer = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await teamplayerService.deleteTeamplayer(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Teamplayer deleted successfully",
    data: result,
  });
});

export const teamplayerController = {
  createTeamplayer,
  getTeamplayerList,
  getTeamplayerByUserId,
  updateTeamplayer,
  deleteTeamplayer,
};
