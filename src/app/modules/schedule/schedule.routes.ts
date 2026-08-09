import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { scheduleController } from "./schedule.controller";
import { scheduleValidation } from "./schedule.validation";
import optionalAuth from "../../middlewares/optionalAuth";

const router = express.Router();

// Create schedule
router.post(
    "/",
    auth(),
    validateRequest(scheduleValidation.createSchema),
    scheduleController.createSchedule
);

// List schedules
router.get("/", optionalAuth(), scheduleController.getScheduleList);

// Get schedule by id
router.get("/:id", auth(), scheduleController.getScheduleById);

// Update schedule
router.put(
    "/:id",
    auth(),
    validateRequest(scheduleValidation.updateSchema),
    scheduleController.updateSchedule
);

// Update week capacity
router.put(
    "/week/:weekId/capacity",
    auth(),
    validateRequest(scheduleValidation.updateCapacitySchema),
    scheduleController.updateWeekCapacity
);

// Delete schedule
router.delete("/:id", auth(), scheduleController.deleteSchedule);

export const scheduleRoutes = router;
