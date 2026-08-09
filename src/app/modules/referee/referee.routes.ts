import express from 'express';
import auth from '../../middlewares/auth';
import { refereeController } from './referee.controller';
import validateRequest from "../../middlewares/validateRequest";
import { refereeValidation } from "./referee.validation";

const router = express.Router();

router.post('/', auth(), validateRequest(refereeValidation.createSchema), refereeController.createReferee);

router.get('/', auth(), refereeController.getRefereeList);

router.get('/get/by/userId', auth(), refereeController.getRefereeByUserId);

router.put('/:id',auth(),validateRequest(refereeValidation.updateSchema),refereeController.updateReferee);

router.delete('/:id', auth(), refereeController.deleteReferee);

export const refereeRoutes = router;