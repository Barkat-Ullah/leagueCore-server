import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { Request, Response } from "express";
import pick from "../../../shared/pick";
import { userService } from "./user.services";

// create user
const createUser = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.createUserIntoDb(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User Registered successfully!",
    data: result,
  });
});

// get all user form db
const getUsers = catchAsync(async (req: Request, res: Response) => {
  const userFilterableFields = [
    "searchTerm",
    "createdAt",
    "id",
    "fullName",
    "email",
    "role",
    "status",
  ];
  const filters = pick(req.query, userFilterableFields);
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder'])
  const result = await userService.getUsersFromDb(filters, options);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Users retrieve successfully!",
    data: result,
  });
});


const dashboardData = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.adminHomePageData();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Admin home data retrieve successfully!",
    data: result,
  });
});
const getUserById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await userService.getUserById(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User retrieve successfully!",
    data: result,
  });
});

// Update userProfile form db
const updateProfile = catchAsync(async (req: Request & { user?: any }, res: Response) => {
  const result = await userService.updateProfile(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated successfully!",
    data: result,
  });
});

const updatePlayerProfile = catchAsync(async (req: Request & { user?: any }, res: Response) => {
  const result = await userService.updatePlayerProfile(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Player Profile updated successfully!",
    data: result,
  });
});

//Soft Delete
const softDeleteUser = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await userService.softDeleteUser(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User deleted successfully!",
    data: result,
  });
});

const toggleBlock = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { blockDays } = req.body;
  const result = await userService.toggleBlock(userId, blockDays);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.action === "BLOCKED" ? "User Blocked successfully!" : "User Unblocked successfully!",
    data: result,
  });
});

const uploadPhoto = catchAsync(async (req: Request, res: Response) => {
  const result = await userService.uploadPhoto(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Photo uploaded successfully!",
    data: result,
  });
});

const getActivityLogs = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const result = await userService.getActivityLogs(userId, options);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Activity logs retrieved successfully!",
    data: result,
  });
});

export const userController = {
  createUser,
  getUsers,
  getUserById,
  updateProfile,
  softDeleteUser,
  toggleBlock,
  uploadPhoto,
  getActivityLogs,
  dashboardData,
  updatePlayerProfile,
};
