import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, test, type TestContext } from "node:test";
import { createApp } from "./app.js";
import { hashPassword, verifyPassword } from "./auth.js";
import { loadConfig, type AppConfig } from "./config.js";
import { EMPTY_GEO, VisitorStore } from "./store.js";
import { normalizeIp, parseStart, safeReferrer } from "./validation.js";
import type { VisitorLogResponse } from "../shared/visitors.js";

const PASSWORD = "correct-horse-battery-123";
const passwordHash = await hashPassword(PASSWORD);
const SESSION = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const EVENT = "b1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const servers: http.Server[] = [];
after(() => { servers.forEach((server) => server.closeAllConnections()); });

async function harness(t: TestContext, overrides: Partial<AppConfig> = {}, resolver?: import("./geo.js").GeoResolver) {
  const config = { ...loadConfig({ NODE_ENV: "test", ADMIN_PASSWORD: PASSWORD, GEOIP_ENABLED: "false", DEMO_MODE: "false" }), ...overrides };
  const store = new VisitorStore(":memory:");
  let current = Date.parse("2026-11-08T12:00:00Z");
  const now = () => current;
  const { app, geo } = createApp({ config, store, now, passwordHash, resolver: resolver ?? (async () => null) });
  const server = http.createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async () => { await geo.whenIdle(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); store.close(); servers.splice(servers.indexOf(server), 1); });
  const request = (path: string, options: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string>; origin?: string | null; raw?: string } = {}) => {
    const method = options.method || (options.body !== undefined ? "POST" : "GET");
    const headers: Record<string, string> = { "X-Requested-With": "XMLHttpRequest", "User-Agent": IPHONE, ...options.headers };
    if (options.body !== undefined || options.raw) headers["Content-Type"] = "application/json";
    if (method !== "GET" && options.origin !== null) headers.Origin = options.origin || base;
    if (options.cookie) headers.Cookie = options.cookie;
    return fetch(`${base}${path}`, { method, headers, body: options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body)) });
  };
  const login = async () => {
    const response = await request("/api/admin/login", { body: { password: PASSWORD } });
    assert.equal(response.status, 200);
    const setCookie = response.headers.getSetCookie()[0];
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    return { cookie: setCookie.split(";")[0], setCookie };
  };
  const start = (id = SESSION, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) => request("/api/visits/session", {
    headers,
    body: { sessionId: id, page: { path: "/", referrer: "https://facebook.com/some/private-path?token=secret", utmSource: "newsletter" }, context: { language: "da-DK", timezone: "Europe/Copenhagen", viewportWidth: 390, viewportHeight: 844 }, ...extra },
  });
  return { config, store, geo, request, login, start, base, advance: (ms: number) => { current += ms; }, now };
}

test("passwords are salted/scrypt hashed and malformed hashes fail closed", async () => {
  const second = await hashPassword(PASSWORD);
  assert.notEqual(passwordHash, second);
  assert.equal(await verifyPassword(PASSWORD, passwordHash), true);
  assert.equal(await verifyPassword("wrong", passwordHash), false);
  assert.equal(await verifyPassword(PASSWORD, "scrypt$999999999$8$1$bad$bad"), false);
  await assert.rejects(hashPassword("short"));
});

test("all visitor data and exports require a real server session; logout revokes it", async (t) => {
  const h = await harness(t);
  for (const path of ["/api/admin/session", "/api/admin/visits", "/api/admin/visits/export", `/api/admin/visits/${SESSION}`]) {
    const response = await h.request(path);
    assert.equal(response.status, 401, path);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  assert.equal((await h.request("/api/admin/visits", { method: "DELETE", body: { confirm: "DELETE VISITOR LOG" } })).status, 401);
  assert.equal((await h.request("/api/admin/login", { body: { password: "wrong" } })).status, 401);
  const { cookie } = await h.login();
  const response = await h.request("/api/admin/visits", { cookie });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(JSON.stringify(body).includes("scrypt$"), false);
  const rawToken = cookie.split("=")[1];
  assert.equal((h.store.db.prepare("SELECT COUNT(*) AS n FROM admin_sessions WHERE tokenHash = ?").get(rawToken) as { n: number }).n, 0);
  assert.equal((await h.request("/api/admin/logout", { cookie, body: {} })).status, 200);
  assert.equal((await h.request("/api/admin/visits", { cookie })).status, 401);
});

test("cross-origin writes, cross-site reads and missing custom header are rejected", async (t) => {
  const h = await harness(t);
  const { cookie } = await h.login();
  assert.equal((await h.request("/api/admin/login", { body: { password: PASSWORD }, origin: "https://evil.example" })).status, 403);
  assert.equal((await h.request("/api/admin/visits", { cookie, headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
  const response = await fetch(`${h.base}/api/admin/logout`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{}" });
  assert.equal(response.status, 403);
  assert.equal((await h.request("/api/admin/visits", { cookie })).status, 200);
});

test("server derives IP and device; client spoofing, query secrets and excess duration are ignored", async (t) => {
  const h = await harness(t);
  const response = await h.start(SESSION, { ip: "8.8.8.8", deviceType: "desktop", startedAt: 1, page: { path: "/?token=secret", referrer: "https://example.com/private?token=secret" } }, { "X-Forwarded-For": "8.8.8.8", "X-Real-IP": "9.9.9.9" });
  assert.equal(response.status, 201);
  const visit = h.store.getVisit(SESSION)!;
  assert.equal(visit.ip, "127.0.0.1");
  assert.equal(visit.deviceType, "mobile");
  assert.equal(visit.browser, "Mobile Safari");
  assert.equal(visit.os, "iOS");
  assert.equal(visit.geoStatus, "disabled");
  assert.equal(visit.landingPath, "/");
  assert.equal(visit.referrer, "https://example.com");
  assert.equal(visit.source, "example.com");
  assert.equal(visit.startedAt, h.now());
  assert.equal((await h.start()).status, 200);
  assert.equal(h.store.list({}, h.now(), 30).total, 1);
  h.advance(60000);
  assert.equal((await h.request("/api/visits/heartbeat", { body: { sessionId: SESSION, activeSeconds: 86400, context: {} } })).status, 200);
  assert.equal(h.store.getVisit(SESSION)!.activeSeconds, 62);
  const event = { id: EVENT, type: "referral_click", target: "coinbase", path: "/", occurredAt: h.now() + 999999 };
  const eventResponse = await h.request("/api/visits/events", { body: { sessionId: SESSION, events: [event, event] } });
  assert.equal((await eventResponse.json()).accepted, 1);
  assert.equal(h.store.events(SESSION)[0].occurredAt, h.now());
});

test("privacy signals, disabled logging and authenticated admin visits do not create records", async (t) => {
  const h = await harness(t);
  assert.equal((await h.start(SESSION, {}, { "Sec-GPC": "1" })).status, 202);
  assert.equal((await h.start(SESSION, {}, { DNT: "1" })).status, 202);
  const { cookie } = await h.login();
  assert.equal((await h.start(SESSION, {}, { Cookie: cookie })).status, 202);
  assert.equal(h.store.list({}, h.now(), 30).total, 0);
  const off = await harness(t, { trackingEnabled: false });
  assert.equal((await off.start()).status, 202);
  assert.equal(off.store.list({}, off.now(), 30).total, 0);
});

test("IP lookup is server-side, cached, and never sent for private addresses", async (t) => {
  const calls: string[] = [];
  const h = await harness(t, { geoEnabled: true, trustProxyHops: 1 }, async (ip) => {
    calls.push(ip);
    return { ...EMPTY_GEO, city: "København", country: "Danmark", countryCode: "DK", network: "Example ISP", asn: "AS64500" };
  });
  assert.equal((await h.start(SESSION, {}, { "X-Forwarded-For": "8.8.8.8" })).status, 201);
  await h.geo.whenIdle();
  assert.equal(h.store.getVisit(SESSION)!.city, "København");
  assert.equal(h.store.getVisit(SESSION)!.geoStatus, "ready");
  const second = "c1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
  await h.start(second, {}, { "X-Forwarded-For": "8.8.8.8" });
  await h.geo.whenIdle();
  assert.deepEqual(calls, ["8.8.8.8"]);
  await h.start("d1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5", {}, { "X-Forwarded-For": "192.168.1.10" });
  await h.geo.whenIdle();
  assert.deepEqual(calls, ["8.8.8.8"]);
  assert.equal(h.store.getVisit("d1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5")!.geoStatus, "local");
});

test("geo failures are honest and do not expose provider errors", async (t) => {
  const h = await harness(t, { geoEnabled: true, trustProxyHops: 1 }, async () => { throw new Error("secret-token-in-provider-error"); });
  await h.start(SESSION, {}, { "X-Forwarded-For": "8.8.8.8" });
  await h.geo.whenIdle();
  const { cookie } = await h.login();
  const response = await h.request("/api/admin/visits", { cookie });
  const text = await response.text();
  assert.match(text, /"geoStatus":"error"/);
  assert.equal(text.includes("secret-token"), false);
});

test("search is parameterized; filters, pagination, CSV and deletion work", async (t) => {
  const h = await harness(t);
  await h.start(SESSION, { page: { path: "/", utmSource: "=HYPERLINK(\"https://evil.example\")" } });
  const { cookie } = await h.login();
  const injection = await h.request("/api/admin/visits?q=%27%20OR%201%3D1%20--", { cookie });
  assert.equal((await injection.json()).total, 0);
  const filtered = await h.request("/api/admin/visits?device=mobile&period=24h&limit=1", { cookie });
  const body = await filtered.json() as VisitorLogResponse;
  assert.equal(body.total, 1); assert.equal(body.summary.mobileShare, 100);
  const csv = await (await h.request("/api/admin/visits/export", { cookie })).text();
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /startedAt/);
  assert.equal((await h.request(`/api/admin/visits/${SESSION}`, { method: "DELETE", body: {}, cookie })).status, 200);
  assert.equal(h.store.getVisit(SESSION), null);
  await h.start();
  assert.equal((await h.request("/api/admin/visits", { method: "DELETE", body: { confirm: "wrong" }, cookie })).status, 400);
  assert.equal((await h.request("/api/admin/visits", { method: "DELETE", body: { confirm: "DELETE VISITOR LOG" }, cookie })).status, 200);
  assert.equal(h.store.list({}, h.now(), 30).total, 0);
});

test("a visitor can forget the current session without admin access", async (t) => {
  const h = await harness(t);
  await h.start();
  await h.request("/api/visits/events", { body: { sessionId: SESSION, events: [{ id: EVENT, type: "page_view", occurredAt: h.now() }] } });
  assert.equal((await h.request("/api/visits/forget", { body: { sessionId: SESSION } })).status, 200);
  assert.equal(h.store.getVisit(SESSION), null);
  assert.equal(h.store.events(SESSION).length, 0);
});

test("retention deletes old visits, cascaded events, expired cache and sessions", async (t) => {
  const h = await harness(t);
  await h.start();
  h.store.recordEvents(SESSION, [{ id: EVENT, type: "page_view", target: null, path: "/", occurredAt: h.now() }], h.now());
  h.store.applyGeo("8.8.8.8", "ready", EMPTY_GEO, h.now(), 1000);
  const { cookie } = await h.login();
  h.advance(31 * 86400000);
  assert.equal(h.store.purge(h.now(), 30), 1);
  assert.equal(h.store.getVisit(SESSION), null);
  assert.equal(h.store.events(SESSION).length, 0);
  assert.equal(h.store.cachedGeo("8.8.8.8", h.now()), null);
  assert.equal((await h.request("/api/admin/visits", { cookie })).status, 401);
});

test("network changes retain first IP and record the latest IP", async (t) => {
  const h = await harness(t, { trustProxyHops: 1 });
  await h.start(SESSION, {}, { "X-Forwarded-For": "8.8.8.8" });
  await h.request("/api/visits/heartbeat", { headers: { "X-Forwarded-For": "9.9.9.9" }, body: { sessionId: SESSION, activeSeconds: 5, context: {} } });
  const visit = h.store.getVisit(SESSION)!;
  assert.equal(visit.ip, "8.8.8.8"); assert.equal(visit.lastIp, "9.9.9.9");
});

test("invalid payloads and unknown API routes fail safely", async (t) => {
  const h = await harness(t);
  assert.equal((await h.start("not-a-uuid")).status, 400);
  assert.equal((await h.request("/api/visits/events", { body: { sessionId: SESSION, events: [{ id: EVENT, type: "keylogger", occurredAt: h.now() }] } })).status, 400);
  assert.equal((await h.request("/api/visits/session", { method: "POST", raw: "{bad json" })).status, 400);
  assert.equal((await h.request("/api/visits/session", { method: "POST", raw: JSON.stringify({ padding: "x".repeat(9000) }) })).status, 413);
  const unknown = await h.request("/api/does-not-exist");
  assert.equal(unknown.status, 404); assert.equal((await unknown.json()).error, "API endpoint not found.");
});

test("repeated password guessing is rate limited", async (t) => {
  const h = await harness(t);
  for (let index = 0; index < 8; index += 1) assert.equal((await h.request("/api/admin/login", { body: { password: "wrong" } })).status, 401);
  assert.equal((await h.request("/api/admin/login", { body: { password: "wrong" } })).status, 429);
});

test("production configuration refuses demo data, plaintext passwords and missing privacy settings", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "production", DEMO_MODE: "true" }), /DEMO_MODE/);
  assert.throws(() => loadConfig({ NODE_ENV: "production", ADMIN_PASSWORD: PASSWORD }), /ADMIN_PASSWORD_HASH/);
  assert.throws(() => loadConfig({ NODE_ENV: "production" }), /PRIVACY_CONTACT/);
  assert.throws(() => loadConfig({ NODE_ENV: "production", PRIVACY_CONTACT: "privacy@example.com", PUBLIC_ORIGIN: "http://example.com" }), /HTTPS/);
  assert.throws(() => loadConfig({ VISITOR_LOG_RETENTION_DAYS: "999" }), /between 1 and 90/);
  const config = loadConfig({ NODE_ENV: "production", ADMIN_PASSWORD_HASH: passwordHash, PRIVACY_CONTACT: "privacy@example.com", PRIVACY_CONTROLLER: "Example Owner", PUBLIC_ORIGIN: "https://example.com" });
  assert.equal(config.cookieSecure, true); assert.equal(config.cookieName, "__Host-bm_admin");
});

test("IP normalization and referrer minimization handle edge cases", () => {
  assert.equal(normalizeIp("::ffff:127.0.0.1"), "127.0.0.1");
  assert.equal(normalizeIp("not-an-ip"), null);
  assert.equal(normalizeIp("2001:0db8:0000:0000:0000:0000:0000:0001"), "2001:db8::1");
  assert.deepEqual(safeReferrer("https://user:password@example.com/path?secret=1", "/"), { referrer: null, source: "Direct" });
  assert.throws(() => parseStart({ sessionId: SESSION, page: {}, context: { viewportWidth: -1 } }));
});

test("explicit demo rows are marked fictional and use documentation IP ranges", async (t) => {
  const h = await harness(t, { demoMode: true });
  h.store.seedDemo(h.now());
  const result = h.store.list({}, h.now(), 30);
  assert.equal(result.total, 6);
  assert.equal(result.visits.every((visit) => visit.demo), true);
  assert.equal(result.visits.every((visit) => visit.ip.startsWith("203.0.113.") || visit.ip.startsWith("198.51.100.")), true);
});

test("storage and per-session event bounds prevent unbounded logging", async (t) => {
  const h = await harness(t, { maxVisits: 1 });
  assert.equal((await h.start()).status, 201);
  assert.equal((await h.start("e1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5")).status, 503);
  assert.equal((await h.start()).status, 200);
  const events = Array.from({ length: 20 }, (_, index) => ({ id: `f1b2c3d4-e5f6-4a7b-8c9d-${String(index).padStart(12, "0")}`, type: "section_view", target: "who-am-i", path: "/", occurredAt: h.now() }));
  for (let batch = 0; batch < 30; batch += 1) {
    const response = await h.request("/api/visits/events", { body: { sessionId: SESSION, events: events.map((event, index) => ({ ...event, id: `f1b2c3d4-e5f6-4a7b-8c9d-${String(batch * 20 + index).padStart(12, "0")}` })) } });
    assert.equal(response.status, 200);
  }
  assert.equal(h.store.events(SESSION).length, 500);
  assert.equal((h.store.db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n, 500);
});

test("forgetting a visit also removes its IP lookup cache", async (t) => {
  const h = await harness(t);
  await h.start();
  h.store.applyGeo("127.0.0.1", "local", EMPTY_GEO, h.now());
  await h.request("/api/visits/forget", { body: { sessionId: SESSION } });
  assert.equal(h.store.cachedGeo("127.0.0.1", h.now()), null);
});

test("malformed password hashes are rejected at configuration time", () => {
  assert.throws(() => loadConfig({ ADMIN_PASSWORD_HASH: "scrypt$bad" }), /malformed/);
});
