import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { campRegistrationController } from "./campRegistration.controller";
import { campRegistrationValidation } from "./campRegistration.validation";

const router = express.Router();

// Public registration (no auth)
router.post(
  "/",
  validateRequest(campRegistrationValidation.createSchema),
  campRegistrationController.registerPlayer
);

// List participants (admin)
router.get("/participants", auth(), campRegistrationController.getParticipants);

// Get registration by id
router.get("/:id", auth(), campRegistrationController.getRegistrationById);

// Move individual player to new sessions (admin)
router.put(
  "/player/:playerId/move-session",
  auth(),
  validateRequest(campRegistrationValidation.moveSessionSchema),
  campRegistrationController.movePlayer
);

// Cancel registration
router.put(
  "/:id/cancel",
  auth(),
  campRegistrationController.cancelRegistration
);

// Create payment for registration (public - parent pays)
router.put(
  "/:id/pay",
  campRegistrationController.createRegistrationPayment
);

// Refund registration payment (admin)
router.put(
  "/:id/refund",
  auth(),
  validateRequest(campRegistrationValidation.refundSchema),
  campRegistrationController.refundRegistrationPayment
);

// Camp Overview dashboard (admin)
router.get(
  "/dashboard/overview",
  auth(),
  campRegistrationController.getCampOverview
);

export const campRegistrationRoutes = router;
