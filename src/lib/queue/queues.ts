import { Queue } from "bullmq";
import type { DefaultJobOptions } from "bullmq";
import { bullMQRedisOptions } from "../redis";

// Shared default job options applied to every queue defined in this module.
// BullMQ will manage its own internal ioredis client from `bullMQRedisOptions`,
// so we must NOT create/attach a separate connection instance here.
const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

/**
 * Email delivery queue — invitations, OTPs, waitlist offers, receipts.
 */
export const emailQueue = new Queue("email", {
  connection: bullMQRedisOptions,
  defaultJobOptions,
});

/**
 * In-app / push notification fan-out queue.
 */
export const notificationQueue = new Queue("notification", {
  connection: bullMQRedisOptions,
  defaultJobOptions,
});

/**
 * Waiver reminder alerts queue.
 */
export const waiverAlertQueue = new Queue("waiver-alert", {
  connection: bullMQRedisOptions,
  defaultJobOptions,
});