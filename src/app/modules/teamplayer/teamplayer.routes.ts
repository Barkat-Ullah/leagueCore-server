import express from 'express';
import auth from '../../middlewares/auth';
import { teamplayerController } from './teamplayer.controller';
import validateRequest from "../../middlewares/validateRequest";
import { teamplayerValidation } from "./teamplayer.validation";

const router = express.Router();

router.post('/', auth(), validateRequest(teamplayerValidation.createSchema), teamplayerController.createTeamplayer);

router.get('/', auth(), teamplayerController.getTeamplayerList);

router.get('/:id', auth(), teamplayerController.getTeamplayerByUserId);

router.put('/:id', auth(), validateRequest(teamplayerValidation.updateSchema), teamplayerController.updateTeamplayer);

router.delete('/:id', auth(), teamplayerController.deleteTeamplayer);

export const teamplayerRoutes = router;