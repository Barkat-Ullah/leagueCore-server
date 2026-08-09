import httpStatus from 'http-status';
import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import pick from '../../../shared/pick';
import sendResponse from '../../../shared/sendResponse';
import { coachService } from './coach.service';

// Create coach
const createCoach = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.createCoach(req, req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Coach created successfully',
    data: result,
  });
});

// List coaches
const coachFilterableFields = ['searchTerm', 'id', 'createdAt', 'userId'];
const getCoachList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, coachFilterableFields);
  // const authUserId = req.user?.id;
  const result = await coachService.getCoachList(options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Coach list retrieved successfully',
    meta: result.meta,
    data: result.data,
  });
});

// Get coach by user
const getCoachByUserId = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.getCoachByUserId(req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Coach details retrieved successfully',
    data: result,
  });
});

// Get coach by id
const getCoachById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await coachService.getCoachById(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Coach retrieved successfully',
    data: result,
  });
});

// Update coach
const updateCoach = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await coachService.updateCoach(id, req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Coach updated successfully',
    data: result,
  });
});

// Delete coach
const deleteCoach = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await coachService.deleteCoach(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Coach deleted successfully',
    data: result,
  });
});

export const coachController = {
  createCoach,
  getCoachList,
  getCoachByUserId,
  getCoachById,
  updateCoach,
  deleteCoach,
};
