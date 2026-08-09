import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { campWaitlistController } from "./campWaitlist.controller";
import { campWaitlistValidation } from "./campWaitlist.validation";

const router = express.Router();

// Join waitlist (public, no auth)
router.post(
  "/",
  validateRequest(campWaitlistValidation.joinWaitlistSchema),
  campWaitlistController.joinWaitlist
);

// List waitlist (admin)
router.get("/", auth(), campWaitlistController.getWaitlist);

// Waitlist stats (admin)
router.get("/stats", auth(), campWaitlistController.getWaitlistStats);

// Confirm offer and create registration (user)
router.post("/:id/confirm-offer", campWaitlistController.confirmOfferAndRegister);

// Admin force-move waitlist entry to any session (bypasses capacity)
router.patch(
  "/:id/move-to-session",
  auth(),
  validateRequest(campWaitlistValidation.adminMoveWaitlistSchema),
  campWaitlistController.adminMoveWaitlistToSession
);

// Get single waitlist entry (admin)
router.get("/getSingle/:id", auth(), campWaitlistController.getSingleWaitlistEntry);

// Remove from waitlist (admin)
router.delete("/:id", auth(), campWaitlistController.removeFromWaitlist);

export const campWaitlistRoutes = router;

