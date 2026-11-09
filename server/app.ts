import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { DeviceKind, PublicTrackingConfig, VisitorEvent } from "../shared/visitors.js";
import { hashPassword, newSessionToken, verifyPassword } from "./auth.js";
import type { AppConfig } from "./config.js";
import { GeoService, ipinfoResolver, type GeoResolver } from "./geo.js";
import { VisitorStore, type LogFilters } from "./store.js";
import { InputError, isPublicIp, normalizeIp, object, parseEvents, parseHeartbeat, parseStart, text } from "./validation.js";

export type AppDependencies = {
  config: AppConfig;
  store: VisitorStore;
  now?: () => number;
  resolver?: GeoResolver;
  passwordHash?: string;
};

const SESSION_COOKIE = /^[A-Za-z0-9_-]{43}$/;
const DAY_MS = 86400000;

function tokenFrom(req: Request, name: string) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    return SESSION_COOKIE.test(value) ? value : null;
  }
  return null;
}

function csvCell(value: unknown) {
  let string = value === null || value === undefined ? "" : String(value);
  // Neutralize spreadsheet formulas even if a referrer/UA begins with =, +, - or @.
  if (/^[=+\-@\t\r]/.test(string)) string = `'${string}`;
  return `"${string.replace(/"/g, '""')}"`;
}

export function createApp({ config, store, now = Date.now, resolver, passwordHash }: AppDependencies) {
  const app = express();
  const geo = new GeoService(store, config, resolver ?? ipinfoResolver(config.ipinfoToken), now);
  let passwordCheck: Promise<string> | null = passwordHash || config.adminPasswordHash
    ? Promise.resolve(passwordHash || config.adminPasswordHash!)
    : config.adminPassword ? hashPassword(config.adminPassword) : null;
  let passwordChecks = 0;
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxyHops);

  app.use("/api", (_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" });
    next();
  });
  app.use("/api", express.json({ limit: "8kb", strict: true }));
  app.use("/api", (req, res, next) => {
    if (!["POST", "DELETE", "PATCH", "PUT"].includes(req.method)) return next();
    const origin = req.get("origin");
    const fetchSite = req.get("sec-fetch-site");
    let sameOrigin = !origin;
    if (origin) {
      try {
        const parsed = new URL(origin);
        sameOrigin = config.publicOrigin
          ? parsed.origin === config.publicOrigin
          : parsed.host === req.get("host") && ["http:", "https:"].includes(parsed.protocol);
      } catch { sameOrigin = false; }
    }
    if (!sameOrigin || (fetchSite && !["same-origin", "none"].includes(fetchSite)) || req.get("x-requested-with") !== "XMLHttpRequest") {
      res.status(403).json({ error: "Same-origin request required." });
      return;
    }
    next();
  });

  const limiter = (limit: number, windowMs: number, skipSuccessfulRequests = false) => rateLimit({
    windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false, skipSuccessfulRequests,
    message: { error: "Too many requests. Please try again later." },
    // The preview proxy may add XFF even when we deliberately do not trust it.
    // req.ip is still the actual socket peer unless TRUST_PROXY_HOPS is configured.
    validate: { xForwardedForHeader: false, forwardedHeader: false },
  });
  const trackingLimit = limiter(240, 60000);
  const globalTrackingLimit = rateLimit({
    windowMs: 60000, limit: 1200, keyGenerator: () => "all-visitor-writes",
    standardHeaders: false, legacyHeaders: false,
    message: { error: "Visitor logging is temporarily busy." },
    validate: { xForwardedForHeader: false, forwardedHeader: false },
  });
  app.use("/api/visits", globalTrackingLimit);
  const loginLimit = limiter(8, 15 * 60000, true);
  const globalLoginLimit = rateLimit({
    windowMs: 15 * 60000, limit: 40, skipSuccessfulRequests: true,
    keyGenerator: () => "all-admin-logins", standardHeaders: false, legacyHeaders: false,
    message: { error: "Login is temporarily busy. Please try again later." },
    validate: { xForwardedForHeader: false, forwardedHeader: false },
  });
  const adminLimit = limiter(180, 60000);
  const asyncRoute = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
    (req, res, next) => { void fn(req, res).catch(next); };

  const adminSession = (req: Request, extend = true) => {
    const token = tokenFrom(req, config.cookieName);
    return token ? store.getAdminSession(token, now(), extend) : null;
  };
  const requireAdmin: RequestHandler = (req, res, next) => {
    if (req.get("sec-fetch-site") === "cross-site") { res.status(403).json({ error: "Cross-site access denied." }); return; }
    if (!adminSession(req)) { res.status(401).json({ error: "Admin login required." }); return; }
    next();
  };
  const cookieOptions = { httpOnly: true, secure: config.cookieSecure, sameSite: "strict" as const, path: "/" };
  const publicConfig = (): PublicTrackingConfig => ({
    enabled: config.trackingEnabled,
    retentionDays: config.retentionDays,
    geoEnabled: config.geoEnabled,
    geoProvider: config.geoEnabled ? "ipinfo.io" : "",
    privacyController: config.privacyController,
    privacyContact: config.privacyContact,
    noticeVersion: "2026-11-08",
    demo: config.demoMode,
  });

  app.get("/api/health", (_req, res) => { res.json({ ok: true }); });
  app.get("/api/privacy", (_req, res) => { res.json(publicConfig()); });

  function loggingAllowed(req: Request) {
    return config.trackingEnabled && req.get("dnt") !== "1" && req.get("sec-gpc") !== "1" && !adminSession(req, false);
  }
  function requestIp(req: Request) {
    // Never accept an IP address from JSON, query parameters or a visitor-supplied header.
    const ip = normalizeIp(req.ip);
    if (!ip) throw new InputError("The network address could not be read.");
    return ip;
  }
  function disabled(res: Response) { res.status(202).json({ tracking: false }); }

  app.post("/api/visits/session", trackingLimit, (req, res) => {
    if (!loggingAllowed(req)) return disabled(res);
    const input = parseStart(req.body);
    const ip = requestIp(req);
    const existing = store.getVisit(input.id);
    if (existing) { res.json({ tracking: true, sessionId: existing.id }); return; }
    if (store.count() >= config.maxVisits) { res.status(503).json({ error: "Visitor log capacity reached." }); return; }
    const publicIp = isPublicIp(ip);
    const cached = config.geoEnabled && publicIp ? store.cachedGeo(ip, now()) : null;
    const geoStatus = !config.geoEnabled ? "disabled" : !publicIp ? "local" : cached?.status ?? "pending";
    const { visit } = store.createVisit({
      ...input, ip, userAgent: text(req.get("user-agent"), 1024), startedAt: now(), geoStatus,
    });
    if (cached) store.applyGeo(ip, cached.status, cached.geo, now(), cached.expiresAt - now());
    else if (geoStatus === "pending") geo.enqueue(ip);
    res.status(201).json({ tracking: true, sessionId: visit.id });
  });

  app.post("/api/visits/heartbeat", trackingLimit, (req, res) => {
    if (!loggingAllowed(req)) return disabled(res);
    const input = parseHeartbeat(req.body);
    const visit = store.heartbeat(input.id, input.activeSeconds, now(), input.viewportWidth, input.viewportHeight);
    if (!visit) { res.status(404).json({ error: "Session expired or deleted." }); return; }
    const ip = requestIp(req);
    if (ip !== visit.lastIp) {
      const publicIp = isPublicIp(ip);
      const status = !config.geoEnabled ? "disabled" : !publicIp ? "local" : "pending";
      store.db.prepare("UPDATE visits SET lastIp = ?, geoStatus = ?, geoUpdatedAt = ?, city = NULL, region = NULL, country = NULL, countryCode = NULL, latitude = NULL, longitude = NULL, network = NULL, asn = NULL WHERE id = ?").run(ip, status, now(), input.id);
      if (status === "pending") geo.enqueue(ip);
    }
    res.json({ tracking: true });
  });

  app.post("/api/visits/events", trackingLimit, (req, res) => {
    if (!loggingAllowed(req)) return disabled(res);
    const input = parseEvents(req.body);
    if (!store.getVisit(input.id)) { res.status(404).json({ error: "Session expired or deleted." }); return; }
    const timestamp = now();
    const accepted = store.recordEvents(input.id, input.events as Omit<VisitorEvent, "receivedAt">[], timestamp);
    res.json({ tracking: true, accepted });
  });

  app.post("/api/visits/forget", trackingLimit, (req, res) => {
    const body = object(req.body);
    const id = text(body.sessionId, 36);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new InputError("Invalid session id.");
    store.forget(id);
    res.json({ deleted: true });
  });

  app.post("/api/admin/login", loginLimit, globalLoginLimit, asyncRoute(async (req, res) => {
    if (!passwordCheck) { res.status(503).json({ error: "Admin login is not configured. Set ADMIN_PASSWORD_HASH on the server." }); return; }
    const body = object(req.body);
    const password = text(body.password, 256);
    if (passwordChecks >= 4) { res.set("Retry-After", "5").status(503).json({ error: "Login is busy. Try again shortly." }); return; }
    passwordChecks += 1;
    let valid = false;
    try {
      const hash = await passwordCheck;
      valid = await verifyPassword(password, hash);
    } finally { passwordChecks -= 1; }
    if (!valid) { res.status(401).json({ error: "The access code is not correct." }); return; }
    const previous = tokenFrom(req, config.cookieName);
    if (previous) store.deleteAdminSession(previous);
    const token = newSessionToken();
    store.createAdminSession(token, now());
    res.cookie(config.cookieName, token, { ...cookieOptions, maxAge: 8 * 3600000 });
    res.json({ authenticated: true, demo: config.demoMode });
  }));

  app.post("/api/admin/logout", (req, res) => {
    const token = tokenFrom(req, config.cookieName);
    if (token) store.deleteAdminSession(token);
    res.clearCookie(config.cookieName, cookieOptions);
    res.json({ authenticated: false });
  });

  app.use("/api/admin", requireAdmin, adminLimit);
  app.get("/api/admin/session", (req, res) => { res.json({ authenticated: true, demo: config.demoMode, expiresAt: adminSession(req, false)!.expiresAt }); });

  function filters(req: Request): LogFilters {
    const q = text(req.query.q, 120);
    const period = text(req.query.period, 10, "7d");
    const device = text(req.query.device, 10);
    const country = text(req.query.country, 2).toUpperCase();
    const limit = Number(req.query.limit ?? 25);
    const offset = Number(req.query.offset ?? 0);
    if (!["24h", "7d", "30d", "all"].includes(period)) throw new InputError("Invalid period.");
    if (device && !["desktop", "mobile", "tablet", "bot", "other"].includes(device)) throw new InputError("Invalid device filter.");
    if (country && !/^[A-Z]{2}$/.test(country)) throw new InputError("Invalid country filter.");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw new InputError("Invalid pagination.");
    const age = period === "24h" ? DAY_MS : period === "7d" ? 7 * DAY_MS : period === "30d" ? 30 * DAY_MS : config.retentionDays * DAY_MS;
    return { q, period, device: device as DeviceKind | undefined, country, since: now() - age, limit, offset } as LogFilters;
  }

  app.get("/api/admin/visits", (req, res) => {
    const result = store.list(filters(req), now(), config.retentionDays);
    res.json({ ...result, geoEnabled: config.geoEnabled, geoProvider: config.geoEnabled ? "ipinfo.io" : "", demo: config.demoMode, capacityReached: store.count() >= config.maxVisits });
  });

  app.get("/api/admin/visits/export", (req, res) => {
    const result = store.list({ ...filters(req), limit: 10000, offset: 0 }, now(), config.retentionDays);
    const columns = ["startedAt", "lastSeenAt", "activeSeconds", "ip", "lastIp", "city", "region", "countryCode", "network", "asn", "deviceType", "deviceVendor", "deviceModel", "browser", "browserVersion", "os", "osVersion", "source", "referrer", "landingPath", "language", "timezone", "viewportWidth", "viewportHeight", "demo"] as const;
    const rows = [columns.map(csvCell).join(","), ...result.visits.map((visit) => columns.map((column) => csvCell(column.endsWith("At") ? new Date(visit[column] as number).toISOString() : visit[column])).join(","))];
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="brenda-visits-${new Date(now()).toISOString().slice(0, 10)}.csv"` });
    res.send(`\uFEFF${rows.join("\r\n")}\r\n`);
  });

  app.get("/api/admin/visits/:id", (req, res) => {
    const id = text(req.params.id, 36);
    const visit = store.getVisit(id);
    if (!visit) { res.status(404).json({ error: "Visit not found." }); return; }
    res.json({ visit, events: store.events(id) });
  });

  app.delete("/api/admin/visits/:id", (req, res) => {
    const deleted = store.deleteVisit(text(req.params.id, 36));
    if (!deleted) { res.status(404).json({ error: "Visit not found." }); return; }
    res.json({ deleted: true });
  });

  app.delete("/api/admin/visits", (req, res) => {
    if (object(req.body).confirm !== "DELETE VISITOR LOG") throw new InputError("Explicit deletion confirmation is required.");
    res.json({ deleted: store.deleteAll() });
  });

  app.use("/api", (_req, res) => { res.status(404).json({ error: "API endpoint not found." }); });
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    if (error instanceof InputError) { res.status(400).json({ error: error.message }); return; }
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    if (status === 413) { res.status(413).json({ error: "Request is too large." }); return; }
    if (status === 400) { res.status(400).json({ error: "Invalid JSON request." }); return; }
    // Generic errors only: SQL, passwords, cookies and IP addresses must not reach logs/responses.
    console.error("API request failed:", error instanceof Error ? error.name : "UnknownError");
    res.status(500).json({ error: "The service is temporarily unavailable." });
  });

  return { app, geo };
}
