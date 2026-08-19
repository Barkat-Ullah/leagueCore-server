import nodemailer from "nodemailer";
import config from "../config";
import { emailQueue } from "../lib/queue/queues";
import type { Job } from "bullmq";

/**
 * Payload contract for email jobs consumed by `src/workers/email.worker.ts`.
 * Kept small so BullMQ only serializes what the worker needs.
 */
export interface EmailJobPayload {
  to: string;
  subject: string;
  html: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton transporter — created ONCE at module load instead of per call.
// Callers can either send directly via `emailSender` (existing behavior, now
// reusing this single transporter) or enqueue via `enqueueEmail` for the
// background worker. Do NOT create a transporter per invocation.
// ─────────────────────────────────────────────────────────────────────────────
const FROM_NAME = "LeagueCore";
const FROM_EMAIL = config.emailSender.email || "noreply@crownandpitch.com";

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 2525,
  secure: false,
  auth: {
    user: "88803c001@smtp-brevo.com",
    pass: "OzqM8PBhVxbNYEUt",
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
});

const emailSender = async (to: string, html: string, subject: string) => {
  try {
    const mailOptions = {
      from: "<akonhasan680@gmail.com>",
      to,
      subject,
      text: html.replace(/<[^>]+>/g, ""),
      html,
    };
    // Send the email
    const info = await transporter.sendMail(mailOptions);
    return info.messageId;
  } catch (error) {
    throw new Error("Failed to send email. Please try again later.");
  }
};

/**
 * Enqueue an email for background delivery instead of sending inline.
 * The `emailQueue` default job options (attempts: 3, exponential backoff)
 * apply automatically; the worker in `src/workers/email.worker.ts` drains it.
 */
export const enqueueEmail = (payload: EmailJobPayload): Promise<Job> => {
  return emailQueue.add("send-email", payload);
};

export default emailSender;