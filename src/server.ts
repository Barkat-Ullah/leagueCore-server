import { Server } from "http";
import config from "./config";
import app from "./app";
import { startCrons } from "./shared/cron";
import { seedSeries } from "./app/modules/series/seed.series";

let server: Server;

async function startServer() {
  server = app.listen(config.port, () => {
    console.log("Server is listening on port ", config.port);
  });
}

async function main() {
  await startServer();
  try {
    await seedSeries();
  } catch (error) {
    console.error("Seed failed (non-fatal):", error);
  }
  //Connect Websocket to Server
  // setupWebSocket(server);

  const exitHandler = () => {
    if (server) {
      server.close(() => {
        console.info("Server closed!");
        restartServer();
      });
    } else {
      process.exit(1);
    }
  };

  // START CRONS ONCE
  startCrons();

  const restartServer = () => {
    console.info("Restarting server...");
    main();
  };

  process.on("uncaughtException", (error) => {
    console.log("Uncaught Exception: ", error);
    exitHandler();
  });

  process.on("unhandledRejection", (error) => {
    console.log("Unhandled Rejection: ", error);
    exitHandler();
  });

  // Handling the server shutdown with SIGTERM and SIGINT
  process.on("SIGTERM", () => {
    console.log("SIGTERM signal received. Shutting down gracefully...");
    exitHandler();
  });

  process.on("SIGINT", () => {
    console.log("SIGINT signal received. Shutting down gracefully...");
    exitHandler();
  });
}

main();
