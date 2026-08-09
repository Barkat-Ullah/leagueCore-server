import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { tournamentService } from './tournament.service';
import { Request, Response } from 'express';
import pick from '../../../shared/pick';
import { Division } from '@prisma/client';

// create Tournament
const createTournament = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await tournamentService.createTournament(req, userId);
  console.log(result);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Tournament created successfully',
    data: result,
  });
});

// get all Tournament
const tournamentFilterableFields = [
  'searchTerm',
  'id',
  'createdAt',
  'tournamentStage',
  'name',
  'startDate',
  'endDate',
  'location',
  'registrationDeadline',
  'numberOfFields',
  'youthFee',
  'adultFee',
  'status',
  'isDeleted',
  'gameStyle',
  'divisionName',
  'maxTeams',
];
const getTournamentList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, tournamentFilterableFields);
  const userId = req.user?.id;
  const userRole = req.user?.role;
  const result = await tournamentService.getTournamentList(options, filters, userId, userRole);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tournament list retrieved successfully',
    data: result,
  });
});

// get Tournament by id for admin
const getTournamentByIdByAdmin = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await tournamentService.getTournamentByIdByAdmin(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tournament details retrieved successfully',
    data: result,
  });
});

// update Tournament
const updateTournament = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await tournamentService.updateTournament(id, req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tournament updated successfully',
    data: result,
  });
});

// delete Tournament
const deleteTournament = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await tournamentService.deleteTournament(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tournament deleted successfully',
    data: result,
  });
});

// delete Tournament Division
const deleteTournamentDivision = catchAsync(async (req: Request, res: Response) => {
  const { divisionId } = req.params;
  const result = await tournamentService.deleteTournamentDivision(divisionId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tournament Division deleted successfully',
    data: result,
  });
});

// get all Teamregistration for admin
const tournamentDivisionFilterableFields = [
  'searchTerm',
  'teamName',
];
const getTeamsUnderDivision = catchAsync(async (req: Request, res: Response) => {
  const { teamDivisionId } = req.params;
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, tournamentDivisionFilterableFields);
  const result = await tournamentService.getTeamsUnderDivision(teamDivisionId, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Teams under division retrieved successfully',
    data: result,
  });
});

// Generate Division Schedule
const generateDivisionSchedule = catchAsync(async (req: Request, res: Response) => {
  const { divisionId } = req.params;
  const result = await tournamentService.generateDivisionSchedule(divisionId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

const getDivisionScheduleData = catchAsync(async (req: Request, res: Response) => {
  const { divisionId } = req.params;
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const result = await tournamentService.getDivisionScheduleData(divisionId, options);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Division schedule data retrieved successfully',
    data: result,
  });
});

const editMatchSchedule = catchAsync(async (req: Request, res: Response) => {
  const { matchId } = req.params;
  const result = await tournamentService.editMatchSchedule(matchId, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result.data,
  });
});

// Publish Division Schedule
const publishDivisionSchedule = catchAsync(async (req: Request, res: Response) => {
  const { divisionId } = req.params;
  const result = await tournamentService.publishDivisionSchedule(divisionId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

// Get Division Standings
const getDivisionStandings = catchAsync(async (req: Request, res: Response) => {
  const { divisionId } = req.params;
  const result = await tournamentService.getDivisionStandings(divisionId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Division standings retrieved successfully',
    data: result,
  });
});

// Get Series Leaderboard
const getSeriesLeaderboard = catchAsync(async (req: Request, res: Response) => {
  const { divisionName } = req.params;
  const result = await tournamentService.getSeriesLeaderboard(divisionName as Division);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Series leaderboard retrieved successfully',
    data: result,
  });
});


// Set Team Discount Override
const setTeamDiscountOverride = catchAsync(async (req: Request, res: Response) => {
  const { teamId } = req.params;
  const userId = req.user.id;
  const data = req.body;
  const result = await tournamentService.setTeamDiscountOverride(teamId, userId, data);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Team discount override set successfully',
    data: result,
  });
});

export const tournamentController = {
  createTournament,
  getTournamentList,
  getTournamentByIdByAdmin,
  updateTournament,
  deleteTournament,
  deleteTournamentDivision,
  getTeamsUnderDivision,
  generateDivisionSchedule,
  getDivisionScheduleData,
  editMatchSchedule,
  publishDivisionSchedule,
  getDivisionStandings,
  getSeriesLeaderboard,
  setTeamDiscountOverride,
};