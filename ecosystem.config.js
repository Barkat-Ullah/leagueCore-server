module.exports = {
  apps: [
    {
      name: "leaguecore-api",
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "300M",
      env: { NODE_ENV: "production" },
    },
    {
      name: "leaguecore-worker",
      script: "dist/worker.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "200M",
      env: { NODE_ENV: "production" },
    },
  ],
};
