import express from "express";
import auth from "../../middlewares/auth";
import { teamregistrationController } from "./teamregistration.controller";
import { fileUploader } from "../../../helpars/fileUploader";
import prisma from "../../../shared/prisma";
import { UserRole } from "@prisma/client";
import validateRequest from "../../middlewares/validateRequest";
import { teamRegistrationValidation, } from "./teamregistration.validation";

const router = express.Router();

router.post(
  "/",
  auth(),
  validateRequest(teamRegistrationValidation.create),
  teamregistrationController.createTeamregistration,
);

router.get("/", auth(), teamregistrationController.getTeamregistrationList);

router.get("/my-team", auth(UserRole.COACH,UserRole.MANAGER), teamregistrationController.getMyTeams);

router.get("/my-team/:id", auth(), async (req, res) => {
  try {
    const teams = await prisma.teams.findFirst({
      where: {
        id: req.params.id,
      },
      select: {
        id: true,
        teamName: true,
        division: true,
        image: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Successfully get my team",
      data: teams,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch teams",
    });
  }
});

router.get(
  "/all/:teamId",
  auth(),
  teamregistrationController.getTeamregistrationoffAllTour,
);

router.get(
  "/all/:teamId",
  auth(),
  teamregistrationController.getTeamregistrationoffAllTour,
);

router.get(
  "/history/:teamId",
  auth(),
  teamregistrationController.historyAndResult,
);
router.get(
  "/details-history/:teamId",
  auth(),
  teamregistrationController.DetailsHistoryAndResult,
);

router.get(
  "/dashboard/:teamId",
  auth(),
  teamregistrationController.coachDashboardData,
);

router.get(
  "/:registrationId",
  auth(),
  teamregistrationController.getTeamregistrationByUserId,
);

router.put(
  "/:id",
  auth(),
  fileUploader.uploadSingle,
  validateRequest(teamRegistrationValidation.update),
  teamregistrationController.updateTeamregistration,
);

router.delete(
  "/:id",
  auth(),
  teamregistrationController.deleteTeamregistration,
);

router.post(
  "/invite-manager/:teamId",
  auth(),
  validateRequest(teamRegistrationValidation.inviteManager),
  teamregistrationController.inviteManager,
);
router.post(
  "/send-mail/:id",
  auth(),
  teamregistrationController.sendMailToPlayer,
);

// Admin: Cancel team registration with refund
router.post(
  "/:registrationId/cancel",
  auth(UserRole.ADMIN),
  teamregistrationController.cancelTeamRegistration,
);

export const teamregistrationRoutes = router;
