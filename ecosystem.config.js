module.exports = {
  apps: [
    {
      name: "server",
      script: "bootstrap.js",
      cwd: __dirname,
      env: {
        PORT: 3000,
        SERVICE_NAME: "server",
        SERVICE_REGISTRY_PATH: "./SERVICE_REGISTRY.json",
        TARGET_SCRIPT: "./server.js"
      }
    },
    {
      name: "pm2-health-monitor",
      script: "bootstrap.js",
      cwd: __dirname,
      env: {
        PORT: 0,
        SERVICE_NAME: "pm2-health-monitor",
        SERVICE_REGISTRY_PATH: "./SERVICE_REGISTRY.json",
        TARGET_SCRIPT: "./monitor.js"
      }
    }
  ]
};
