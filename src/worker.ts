import "./config";
import { disconnectRedis } from "./lib/redis";
import { emailWorker, startEmailWorker } from "./workers/email.worker";
import {
  notificationWorker,
  startNotificationWorker,
} from "./workers/notification.worker";

// ─────────────────────────────────────────────────────────────────────────────
// Worker process entrypoint
//
// Registers every background worker. Each handle only needs to expose the
// standard `close()` so shutdown is uniform. Add future workers here:
//
//   import { fooWorker, startFooWorker } from "./workers/foo.worker";
//   const workers = [emailWorker, fooWorker];
//   const startFns = [startEmailWorker, startFooWorker];
// ─────────────────────────────────────────────────────────────────────────────

interface WorkerHandle {
  name?: string;
  close: () => Promise<void>;
}

const workers: WorkerHandle[] = [emailWorker, notificationWorker];
const startFns: Array<() => Promise<unknown>> = [
  startEmailWorker,
  startNotificationWorker,
];

async function main() {
  console.log("🚀 Starting workers...");
  await Promise.all(startFns.map((start) => start()));
  console.log(
    `✅ ${workers.length} worker(s) started: ${workers
      .map((w) => w.name)
      .filter(Boolean)
      .join(", ")}`
  );
}

async function shutdown(signal: string) {
  console.log(`👋 Received ${signal}. Gracefully shutting down workers...`);

  try {
    await Promise.all(workers.map((w) => w.close()));
    console.log("✅ Workers closed.");
  } catch (err: any) {
    console.error("Error while closing workers:", err?.message ?? err);
  }

  try {
    // Reuse the existing graceful Redis shutdown helper from src/lib.
    await disconnectRedis();
  } catch (err: any) {
    console.error("Error while disconnecting Redis:", err?.message ?? err);
  }

  console.log("👋 Bye.");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  shutdown("unhandledRejection");
});

main().catch((err) => {
  console.error("Worker startup failed:", err);
  process.exit(1);
});