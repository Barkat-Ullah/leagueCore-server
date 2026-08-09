import express from 'express';
import auth from '../../middlewares/auth';
import { tournamentController } from './tournament.controller';
import { UserRole } from '@prisma/client';
import optionalAuth from '../../middlewares/optionalAuth';
import { fileUploader } from '../../../helpars/fileUploader';
import validateRequest from "../../middlewares/validateRequest";
import { tournamentValidation } from "./tournament.validation";

const router = express.Router();

router.post('/', auth(UserRole.ADMIN), fileUploader.uploadSingle, validateRequest(tournamentValidation.createSchema), tournamentController.createTournament);

router.get('/', optionalAuth(), tournamentController.getTournamentList);

router.get('/get/by/userId/:id', auth(UserRole.ADMIN), tournamentController.getTournamentByIdByAdmin);

router.put('/:id', auth(UserRole.ADMIN), fileUploader.uploadSingle, validateRequest(tournamentValidation.updateSchema), tournamentController.updateTournament);

router.delete('/:id', auth(UserRole.ADMIN), tournamentController.deleteTournament);

router.delete('/division/:divisionId', auth(), tournamentController.deleteTournamentDivision);

router.get('/division/:teamDivisionId/teams', auth(), tournamentController.getTeamsUnderDivision);

router.post("/division/:divisionId/generate", auth(UserRole.ADMIN), tournamentController.generateDivisionSchedule);

router.get("/division/:divisionId/schedule", auth(), tournamentController.getDivisionScheduleData);

router.patch("/match/:matchId/edit", auth(UserRole.ADMIN), validateRequest(tournamentValidation.editMatchSchema), tournamentController.editMatchSchedule);

router.patch("/division/:divisionId/publish", auth(UserRole.ADMIN), tournamentController.publishDivisionSchedule);

router.get("/division/:divisionId/standings", auth(), tournamentController.getDivisionStandings);

router.get("/series/:divisionName/leaderboard", optionalAuth(), tournamentController.getSeriesLeaderboard);

router.post("/team/:teamId/discount/override", auth(UserRole.ADMIN), tournamentController.setTeamDiscountOverride);

export const tournamentRoutes = router;