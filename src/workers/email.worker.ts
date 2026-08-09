import { Worker, type Job } from "bullmq";
import { bullMQRedisOptions } from "../lib/redis";
import { emailQueue } from "../lib/queue/queues";
import emailSender, { type EmailJobPayload } from "../shared/emailSender";

// Single source of truth for the queue name (defined in src/lib/queue/queues.ts).
const EMAIL_QUEUE_NAME = emailQueue.name;

const processEmailJob = async (job: Job<EmailJobPayload>) => {
  const { to, subject, html } = job.data;
  const messageId = await emailSender(to, html, subject);
  job.log(`Sent "${subject}" to ${to} — ${messageId}`);
  return { success: true, messageId, to };
};

/**
 * Email worker — drains `emailQueue`. Concurrency 3 keeps memory low
 * (this host has <1GB RAM) while still allowing parallel SMTP deliveries.
 */
export const emailWorker = new Worker<EmailJobPayload>(
  EMAIL_QUEUE_NAME,
  processEmailJob,
  {
    connection: bullMQRedisOptions,
    concurrency: 3,
  }
);

emailWorker.on("completed", (job) => {
  console.log(`✅ Email job ${job.id} completed -> ${job.data.to}`);
});

emailWorker.on("failed", (job, err) => {
  console.error(`❌ Email job ${job?.id ?? "?"} failed after retries: ${err.message}`);
});

emailWorker.on("error", (err) => {
  console.error(`Email worker error: ${err.message}`);
});

export const startEmailWorker = async () => {
  await emailWorker.waitUntilReady();
  console.log(`📧 Email worker started (queue="${EMAIL_QUEUE_NAME}", concurrency=3)`);
  return emailWorker;
};

export const stopEmailWorker = async () => {
  await emailWorker.close();
  console.log("📧 Email worker closed");
};

// Allow standalone execution: `node dist/workers/email.worker.js`
if (require.main === module) {
  startEmailWorker().catch((err) => {
    console.error("Failed to start email worker:", err);
    process.exit(1);
  });
}

export default emailWorker;