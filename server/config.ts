import path from "node:path";

export type AppConfig = {
  production: boolean;
  port: number;
  databasePath: string;
  adminPasswordHash: string | null;
  adminPassword: string | null;
  trackingEnabled: boolean;
  retentionDays: number;
  maxVisits: number;
  geoEnabled: boolean;
  ipinfoToken: string | null;
  privacyController: string;
  privacyContact: string;
  publicOrigin: string | null;
  trustProxyHops: number;
  demoMode: boolean;
  cookieSecure: boolean;
  cookieName: string;
};

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function boolean(env: NodeJS.ProcessEnv, name: string, fallback: boolean) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`${name} must be true or false.`);
}

function origin(env: NodeJS.ProcessEnv) {
  const raw = env.PUBLIC_ORIGIN?.trim();
  if (!raw) return null;
  const url = new URL(raw);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PUBLIC_ORIGIN must be an origin such as https://example.com, without a path or credentials.");
  }
  return url.origin;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === "production";
  const demoMode = boolean(env, "DEMO_MODE", false);
  if (production && demoMode) throw new Error("DEMO_MODE cannot be enabled in production.");
  if (production && env.ADMIN_PASSWORD) {
    throw new Error("Use ADMIN_PASSWORD_HASH in production. Run npm run admin:hash to create it.");
  }
  const adminPassword = env.ADMIN_PASSWORD || null;
  if (adminPassword && (adminPassword.length < 12 || adminPassword.length > 256)) {
    throw new Error("ADMIN_PASSWORD must contain between 12 and 256 characters.");
  }
  const adminPasswordHash = env.ADMIN_PASSWORD_HASH?.trim() || null;
  if (adminPasswordHash && !/^scrypt\$(16384|32768|65536)\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/.test(adminPasswordHash)) {
    throw new Error("ADMIN_PASSWORD_HASH is malformed. Create a new one with npm run admin:hash.");
  }
  const publicOrigin = origin(env);
  if (production && publicOrigin && !publicOrigin.startsWith("https://")) {
    throw new Error("PUBLIC_ORIGIN must use HTTPS in production.");
  }
  const trackingEnabled = boolean(env, "VISITOR_LOG_ENABLED", true);
  if (production && trackingEnabled && !env.PRIVACY_CONTACT?.trim()) {
    throw new Error("Set PRIVACY_CONTACT to the site owner's real privacy contact before enabling visitor logging in production.");
  }
  if (production && trackingEnabled && !env.PRIVACY_CONTROLLER?.trim()) {
    throw new Error("Set PRIVACY_CONTROLLER to the real site owner/controller identity before enabling visitor logging in production.");
  }
  if (production && trackingEnabled && !publicOrigin) {
    throw new Error("Set PUBLIC_ORIGIN to the site's HTTPS origin before enabling visitor logging in production.");
  }
  return {
    production,
    port: integer(env, "PORT", 3000, 1, 65535),
    databasePath: demoMode ? ":memory:" : path.resolve(env.DATA_DIR || ".data", "visitors.sqlite"),
    adminPasswordHash,
    adminPassword,
    trackingEnabled,
    retentionDays: integer(env, "VISITOR_LOG_RETENTION_DAYS", 30, 1, 90),
    maxVisits: integer(env, "VISITOR_LOG_MAX_ROWS", 50000, 100, 500000),
    geoEnabled: boolean(env, "GEOIP_ENABLED", true),
    ipinfoToken: env.IPINFO_TOKEN?.trim() || null,
    privacyController: env.PRIVACY_CONTROLLER?.trim().slice(0, 200) || "",
    privacyContact: env.PRIVACY_CONTACT?.trim().slice(0, 200) || "",
    publicOrigin,
    trustProxyHops: integer(env, "TRUST_PROXY_HOPS", 0, 0, 5),
    demoMode,
    cookieSecure: production,
    cookieName: production ? "__Host-bm_admin" : "bm_admin",
  };
}
