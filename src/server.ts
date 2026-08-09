import { Server } from "http";
import config from "./config";
import app from "./app";
import { startCrons } from "./shared/cron";
import { seedSeries } from "./app/modules/series/seed.series";
import { initiateAnotherAdmin, initiateSuperAdmin } from "./app/db/db";

let server: Server;
let cronsStarted = false;

async function startServer() {
  server = app.listen(config.port, () => {
    console.log("Server is listening on port ", config.port);
  });
}

const gracefulExit = (exitCode: number) => {
  if (server) {
    server.close(() => {
      console.info("Server closed!");
      process.exit(exitCode);
    });
    // Safety net: force-exit if close() hangs (e.g. open keep-alive sockets)
    setTimeout(() => process.exit(exitCode), 10_000).unref();
  } else {
    process.exit(exitCode);
  }
};

async function main() {
  await startServer();

  try {
    // initiate super admin
    await initiateSuperAdmin();
    await initiateAnotherAdmin();
    await seedSeries();
  } catch (error) {
    console.error("Seed failed (non-fatal):", error);
  }

  //Connect Websocket to Server
  // setupWebSocket(server);

  // START CRONS ONCE — guarded so a stray re-entry into main() can't double-register
  if (!cronsStarted) {
    startCrons();
    cronsStarted = true;
  }

  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception: ", error);
    gracefulExit(1);
  });

  process.on("unhandledRejection", (error) => {
    console.error("Unhandled Rejection: ", error);
    gracefulExit(1);
  });

  // PM2 manages restarts now — just exit cleanly, don't call main() again
  process.on("SIGTERM", () => {
    console.log("SIGTERM signal received. Shutting down gracefully...");
    gracefulExit(0);
  });

  process.on("SIGINT", () => {
    console.log("SIGINT signal received. Shutting down gracefully...");
    gracefulExit(0);
  });
}

main();
