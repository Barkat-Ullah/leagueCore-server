import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { teaminvitationController } from './teaminvitation.controller';
import { teaminvitationValidation } from './teaminvitation.validation';

const router = express.Router();

router.post('/:id', auth(), validateRequest(teaminvitationValidation.createSchema), teaminvitationController.createTeaminvitation);

router.get('/', auth(), teaminvitationController.getTeaminvitationList);

router.get('/get/by/userId', auth(), teaminvitationController.getTeaminvitationByUserId);

router.get('/:id', auth(), teaminvitationController.getTeaminvitationById);

router.put('/:id', auth(), validateRequest(teaminvitationValidation.updateSchema), teaminvitationController.updateTeaminvitation);

router.delete('/:id', auth(), teaminvitationController.deleteTeaminvitation);

router.get('/get/by/coachId', auth(), teaminvitationController.getInvitationsForCoach);

router.put('/respond/:id', auth(), teaminvitationController.respondToInvitation);

export const teaminvitationRoutes = router;