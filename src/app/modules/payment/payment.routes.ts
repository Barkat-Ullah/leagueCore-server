import express from "express";
import { paymentController } from "./payment.controller";
import auth from "../../middlewares/auth";
import { UserRole } from "@prisma/client";

const router = express.Router();


router.get("/", auth(UserRole.ADMIN, UserRole.COACH), paymentController.getPayments);
// Stripe
router.post("/stripe", auth(), paymentController.createPayment);



export const paymentRoutes = router;
