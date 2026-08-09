import { Worker, type Job } from "bullmq";
import { bullMQRedisOptions } from "../lib/redis";
import { notificationQueue } from "../lib/queue/queues";
import prisma from "../shared/prisma";

// Single source of truth for the queue name (defined in src/lib/queue/queues.ts).
const NOTIFICATION_QUEUE_NAME = notificationQueue.name;

export interface NotificationBatchJobPayload {
  recipientIds: string[];
  title: string;
  body: string;
  data: string;
}

const processNotificationJob = async (
  job: Job<NotificationBatchJobPayload>
) => {
  const { recipientIds, title, body, data } = job.data;

  if (!recipientIds?.length) {
    job.log("Empty recipientIds — skipping");
    return { success: true, count: 0 };
  }

  const result = await prisma.notification.createMany({
    data: recipientIds.map((userId) => ({ userId, title, body, data })),
  });

  job.log(
    `Created ${result.count} notification(s) for ${recipientIds.length} recipient(s)`
  );
  return { success: true, count: result.count };
};

/**
 * Notification worker — drains `notificationQueue`. Concurrency 3 keeps memory
 * low while still allowing parallel in-app notification batches.
 */
export const notificationWorker = new Worker<
  NotificationBatchJobPayload,
  { success: boolean; count: number }
>(NOTIFICATION_QUEUE_NAME, processNotificationJob, {
  connection: bullMQRedisOptions,
  concurrency: 3,
});

notificationWorker.on("completed", (job) => {
  console.log(
    `🔔 Notification job ${job.id} completed -> ${job.returnvalue?.count ?? "?"} notification(s)`
  );
});

notificationWorker.on("failed", (job, err) => {
  console.error(
    `❌ Notification job ${job?.id ?? "?"} failed after retries: ${err.message}`
  );
});

notificationWorker.on("error", (err) => {
  console.error(`Notification worker error: ${err.message}`);
});

export const startNotificationWorker = async () => {
  await notificationWorker.waitUntilReady();
  console.log(
    `🔔 Notification worker started (queue="${NOTIFICATION_QUEUE_NAME}", concurrency=3)`
  );
  return notificationWorker;
};

export const stopNotificationWorker = async () => {
  await notificationWorker.close();
  console.log("🔔 Notification worker closed");
};

// Allow standalone execution: `node dist/workers/notification.worker.js`
if (require.main === module) {
  startNotificationWorker().catch((err) => {
    console.error("Failed to start notification worker:", err);
    process.exit(1);
  });
}

export default notificationWorker;
