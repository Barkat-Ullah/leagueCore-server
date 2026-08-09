import express from "express";
import { stripeWebhookHandler } from "./stripeWebhook";

const router = express.Router();

router.post("/stripe", stripeWebhookHandler);

export default router;
