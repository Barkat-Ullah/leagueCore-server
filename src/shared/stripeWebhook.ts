import { Request, Response } from "express";
import { stripe, teamregistrationService } from "../app/modules/teamregistration/teamregistration.service";
import { campRegistrationService } from "../app/modules/campRegistration/campRegistration.service";
import config from "../config";

export const stripeWebhookHandler = async (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"] as string;
    const webhookSecret = config.stripe.webhook_secret as string;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
        console.log("Stripe webhook received:", event.type);
    } catch (err: any) {
        console.error("Stripe webhook signature error:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case "payment_intent.succeeded":
                // Both handlers check metadata internally and skip if not their registration
                await campRegistrationService.handlePaymentIntentSucceeded(event.data.object);
                await teamregistrationService.handlePaymentIntentSucceeded(event.data.object);
                break;

            case "payment_intent.payment_failed":
                await campRegistrationService.handlePaymentIntentFailed(event.data.object);
                await teamregistrationService.handlePaymentIntentFailed(event.data.object);
                break;

            case "charge.refunded":
                await campRegistrationService.handleChargeRefunded(event.data.object);
                await teamregistrationService.handleChargeRefunded(event.data.object);
                break;

            default:
                console.log("Unhandled Stripe event:", event.type);
                break;
        }

        return res.status(200).json({ received: true });
    } catch (error: any) {
        console.error("Stripe webhook processing failed:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Webhook processing failed",
        });
    }
};
