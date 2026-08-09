import express from "express";
import { AuthController } from "./auth.controller";
import auth from "../../middlewares/auth";
import { UserRole } from "@prisma/client";
import validateRequest from "../../middlewares/validateRequest";
import { authValidation } from "./auth.validation";

const router = express.Router();

router.post("/login", AuthController.loginUser);

router.post("/logout", AuthController.logoutUser);

router.get("/profile", auth(), AuthController.getMyProfile);

router.put("/change-password", auth(), validateRequest(authValidation.changePasswordValidationSchema), AuthController.changePassword);

router.post('/forgot-password', AuthController.forgotPassword);

router.post('/resend-otp', AuthController.resendOtp);

router.post('/verify-otp', AuthController.verifyOtp);

router.post('/reset-password', AuthController.resetPassword);

export const AuthRoutes = router;