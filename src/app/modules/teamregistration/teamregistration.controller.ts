import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { teamregistrationService } from "./teamregistration.service";
import { Request, Response } from "express";
import pick from "../../../shared/pick";

// create Teamregistration
const createTeamregistration = catchAsync(
  async (req: Request, res: Response) => {
    const result = await teamregistrationService.createTeamregistration(req);
    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Teamregistration created successfully",
      data: result,
    });
  },
);

// get all Teamregistration
const teamregistrationFilterableFields = [
  "searchTerm",
  "id",
  "createdAt",
  "userId",
  "managerId",
  "tournamentId",
  "teamDivisionId",
  "teamName",
  "registrationPayStatus",
];
const getTeamregistrationList = catchAsync(
  async (req: Request, res: Response) => {
    const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
    const filters = pick(req.query, teamregistrationFilterableFields);
    const result = await teamregistrationService.getTeamregistrationList(
      options,
      filters,
      req.user.id,
      req.user.role,
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Teamregistration list retrieved successfully",
      meta: result.meta,
      data: result.data,
    });
  },
);

// get Teamregistration by userId
const coachDashboardData = catchAsync(async (req: Request, res: Response) => {
  const result = await teamregistrationService.coachesHomepageData(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Home page data retrieved successfully",
    data: result,
  });
});
// get Teamregistration by userId
const getTeamregistrationoffAllTour = catchAsync(
  async (req: Request, res: Response) => {
    const result = await teamregistrationService.getATeamIdUnderTour(req);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Teamregistration details retrieved successfully",
      data: result,
    });
  },
);
// get Teamregistration by userId
const historyAndResult = catchAsync(async (req: Request, res: Response) => {
  const result = await teamregistrationService.getTeamAchievementsDashboard(
    req.params.teamId,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "History and result data retrieved successfully",
    data: result,
  });
});
const DetailsHistoryAndResult = catchAsync(
  async (req: Request, res: Response) => {
    const result = await teamregistrationService.getTeamTournamentDetails(req);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Details of History and result data retrieved successfully",
      data: result,
    });
  },
);
// get Teamregistration by userId
const getTeamregistrationByUserId = catchAsync(
  async (req: Request, res: Response) => {
    const result =
      await teamregistrationService.getTeamregistrationByUserId(req);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Teamregistration details retrieved successfully",
      data: result,
    });
  },
);

// update Teamregistration
const updateTeamregistration = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await teamregistrationService.updateTeamregistration(
      id,
      req,
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Teamregistration updated successfully",
      data: result,
    });
  },
);

// delete Teamregistration
const deleteTeamregistration = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await teamregistrationService.deleteTeamregistration(id);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Teamregistration deleted successfully",
      data: result,
    });
  },
);

// Invite team Manager
const inviteManager = catchAsync(async (req: Request, res: Response) => {

  const result = await teamregistrationService.inviteManager(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Manager invited successfully",
    data: result,
  });
});
const sendMailToPlayer = catchAsync(async (req: Request, res: Response) => {
  const result = await teamregistrationService.sendMailToAPlayer(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Player mailed successfully",
    data: result,
  });
});

const getMyTeams = catchAsync(async (req, res) => {
  const { id, role } = req.user;
  const teams = await teamregistrationService.getMyTeams(id, role);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Successfully retrieved teams",
    data: teams,
  });
});

// Admin: Cancel team registration with refund
const cancelTeamRegistration = catchAsync(
  async (req: Request, res: Response) => {
    const { registrationId } = req.params;
    const { cancellationType, gamesCompleted, adminNotes } = req.body;
    const adminId = req.user.id;

    const result = await teamregistrationService.cancelTeamRegistration(
      registrationId,
      cancellationType,
      gamesCompleted,
      adminId,
      adminNotes
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Team registration cancelled successfully",
      data: result,
    });
  },
);

export const teamregistrationController = {
  createTeamregistration,
  getTeamregistrationList,
  getTeamregistrationByUserId,
  updateTeamregistration,
  deleteTeamregistration,
  getMyTeams,
  inviteManager,
  getTeamregistrationoffAllTour,
  coachDashboardData,
  historyAndResult,
  DetailsHistoryAndResult,
  sendMailToPlayer,
  cancelTeamRegistration,
};
