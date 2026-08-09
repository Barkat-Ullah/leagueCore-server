import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { fileUploader } from '../../../helpars/fileUploader';
import { coachController } from './coach.controller';
import { coachValidation } from './coach.validation';
import optionalAuth from '../../middlewares/optionalAuth';

const router = express.Router();

// Create coach
router.post('/', auth(), fileUploader.uploadSingle, validateRequest(coachValidation.createSchema), coachController.createCoach);

// List coaches
router.get('/', optionalAuth(), coachController.getCoachList);

// Get coach by user
router.get('/get/by/userId', auth(), coachController.getCoachByUserId);

// Get coach by id
router.get('/:id', auth(), coachController.getCoachById);

// Update coach
router.put('/:id', auth(), fileUploader.uploadSingle, validateRequest(coachValidation.updateSchema), coachController.updateCoach);

// Delete coach
router.delete('/:id', auth(), coachController.deleteCoach);

export const coachRoutes = router;
