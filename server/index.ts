import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { attachFrontend } from "./frontend.js";
import { VisitorStore } from "./store.js";

// Existing environment variables win. .env is local-only and ignored by Git.
const envFile = path.resolve(".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const config = loadConfig();
if (config.production && !config.adminPasswordHash) {
  throw new Error("ADMIN_PASSWORD_HASH is required in production. Run npm run admin:hash.");
}
const store = new VisitorStore(config.databasePath);
store.purge(Date.now(), config.retentionDays);
if (config.demoMode) store.seedDemo(Date.now());
const { app, geo } = createApp({ config, store });
const server = http.createServer(app);
const closeFrontend = await attachFrontend(app, config, server);

const maintenance = setInterval(() => {
  store.purge(Date.now(), config.retentionDays);
}, 3600000);
const geoRetry = setInterval(() => geo.retryPending(), 5 * 60000);
maintenance.unref();
geoRetry.unref();
geo.retryPending();

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Brenda Mills is listening on http://0.0.0.0:${config.port}`);
  console.log(`Visitor logging: ${config.trackingEnabled ? "on" : "off"}; retention: ${config.retentionDays} days; IP lookup: ${config.geoEnabled ? "ipinfo.io" : "off"}.`);
  if (config.demoMode) console.log("DEMO: fictional visits are clearly marked; storage is in-memory and resets on restart.");
  if (!config.production) console.log("Development mode. Configure a private ADMIN_PASSWORD_HASH and HTTPS before production.");
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(maintenance);
  clearInterval(geoRetry);
  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();
  void closeFrontend().catch(() => undefined).finally(() => {
    server.close(async () => {
      await geo.whenIdle();
      store.close();
      clearTimeout(force);
      process.exit(0);
    });
    server.closeIdleConnections();
  });
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
