import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { teaminvitationService } from './teaminvitation.service';
import { Request, Response } from 'express';
import pick from '../../../shared/pick';

// create Teaminvitation
const createTeaminvitation = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const id = req.params.id;
  const data = req.body;
  const result = await teaminvitationService.createTeaminvitation(userId, id, data);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Teaminvitation created successfully',
    data: result,
  });
});

// get all Teaminvitation
const teaminvitationFilterableFields = [
  'searchTerm',
  'id',
  'userId',
  'toTournamentId',
  'toTournamentDivisionId',
  'createdAt',
  'justIgnore',
  'status',
];
const getTeaminvitationList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, teaminvitationFilterableFields);
  const result = await teaminvitationService.getTeaminvitationList(options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Teaminvitation list retrieved successfully',
    data: result,
  });
});

// get Teaminvitation by userId
const getTeaminvitationByUserId = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await teaminvitationService.getTeaminvitationByUserId(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Teaminvitation details retrieved successfully',
    data: result,
  });
});

// get Teaminvitation by id
const getTeaminvitationById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await teaminvitationService.getTeaminvitationById(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Teaminvitation retrieved successfully',
    data: result,
  });
});

// update Teaminvitation
const updateTeaminvitation = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body;
  const result = await teaminvitationService.updateTeaminvitation(id, data);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Teaminvitation updated successfully',
    data: result,
  });
});

// delete Teaminvitation
const deleteTeaminvitation = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await teaminvitationService.deleteTeaminvitation(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Teaminvitation deleted successfully',
    data: result,
  });
});

// get all Teaminvitation
const getInvitationsForCoach = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, teaminvitationFilterableFields);
  const result = await teaminvitationService.getInvitationsForCoach(userId, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Teaminvitation list retrieved successfully',
    data: result,
  });
})

const respondToInvitation = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const userId = req.user.id;
  const { action } = req.body;
  const result = await teaminvitationService.respondToInvitation(userId, id, action);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Teaminvitation responded successfully',
    data: result,
  });
})

export const teaminvitationController = {
  createTeaminvitation,
  getTeaminvitationList,
  getTeaminvitationByUserId,
  getTeaminvitationById,
  updateTeaminvitation,
  deleteTeaminvitation,
  getInvitationsForCoach,
  respondToInvitation,
};