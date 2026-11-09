import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { BreakdownItem, DeviceKind, GeoStatus, Visit, VisitorEvent, VisitorGeo, VisitorLogResponse, VisitorSummary } from "../shared/visitors.js";
import { hashSessionToken } from "./auth.js";
import { parseDevice } from "./validation.js";

export type NewVisit = ReturnType<typeof import("./validation.js").parseStart> & {
  ip: string;
  userAgent: string;
  startedAt: number;
  geoStatus: GeoStatus;
  demo?: boolean;
};

export type LogFilters = {
  q?: string;
  device?: DeviceKind;
  country?: string;
  since?: number;
  limit?: number;
  offset?: number;
};

export const EMPTY_GEO: VisitorGeo = {
  city: null, region: null, country: null, countryCode: null,
  latitude: null, longitude: null, network: null, asn: null,
};

const GEO_COLUMNS = ["city", "region", "country", "countryCode", "latitude", "longitude", "network", "asn"] as const;
const VISIT_COLUMNS = [
  "id", "startedAt", "lastSeenAt", "activeSeconds", "ip", "lastIp", "userAgent",
  "deviceType", "deviceVendor", "deviceModel", "browser", "browserVersion", "os", "osVersion",
  "landingPath", "referrer", "source", "utmSource", "utmMedium", "utmCampaign", "language", "timezone",
  "viewportWidth", "viewportHeight", "geoStatus", "geoUpdatedAt", ...GEO_COLUMNS,
] as const;
const SELECT_VISIT = `SELECT ${VISIT_COLUMNS.join(", ")}, isDemo AS demo FROM visits`;

function mapVisit(row: Record<string, unknown>): Visit {
  return { ...row, demo: Boolean(row.demo) } as unknown as Visit;
}

/** Single-instance SQLite storage. All values, including searches, are parameterized. */
export class VisitorStore {
  readonly db: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ":memory:") {
      mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
      chmodSync(path.dirname(filename), 0o700);
    }
    this.db = new DatabaseSync(filename);
    if (filename !== ":memory:") chmodSync(filename, 0o600);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = ${filename === ":memory:" ? "MEMORY" : "WAL"};
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS visits (
        id TEXT PRIMARY KEY,
        startedAt INTEGER NOT NULL, lastSeenAt INTEGER NOT NULL, activeSeconds INTEGER NOT NULL DEFAULT 0,
        ip TEXT NOT NULL, lastIp TEXT NOT NULL, userAgent TEXT NOT NULL,
        deviceType TEXT NOT NULL, deviceVendor TEXT, deviceModel TEXT,
        browser TEXT NOT NULL, browserVersion TEXT, os TEXT NOT NULL, osVersion TEXT,
        landingPath TEXT NOT NULL, referrer TEXT, source TEXT NOT NULL,
        utmSource TEXT, utmMedium TEXT, utmCampaign TEXT,
        language TEXT, timezone TEXT, viewportWidth INTEGER, viewportHeight INTEGER,
        geoStatus TEXT NOT NULL, geoUpdatedAt INTEGER,
        city TEXT, region TEXT, country TEXT, countryCode TEXT,
        latitude REAL, longitude REAL, network TEXT, asn TEXT,
        isDemo INTEGER NOT NULL DEFAULT 0 CHECK (isDemo IN (0, 1))
      );
      CREATE INDEX IF NOT EXISTS visits_startedAt ON visits(startedAt DESC);
      CREATE INDEX IF NOT EXISTS visits_ip ON visits(ip);
      CREATE INDEX IF NOT EXISTS visits_geoStatus ON visits(geoStatus);
      CREATE TABLE IF NOT EXISTS events (
        sessionId TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
        id TEXT NOT NULL, type TEXT NOT NULL, target TEXT, path TEXT,
        occurredAt INTEGER NOT NULL, receivedAt INTEGER NOT NULL,
        PRIMARY KEY (sessionId, id)
      );
      CREATE TABLE IF NOT EXISTS admin_sessions (
        tokenHash TEXT PRIMARY KEY, createdAt INTEGER NOT NULL,
        expiresAt INTEGER NOT NULL, absoluteExpiresAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS geo_cache (
        ip TEXT PRIMARY KEY, status TEXT NOT NULL, payload TEXT NOT NULL, expiresAt INTEGER NOT NULL
      );
    `);
    for (const suffix of ["-wal", "-shm"]) {
      try { chmodSync(`${filename}${suffix}`, 0o600); } catch { /* These files may not exist yet. */ }
    }
  }

  close() { this.db.close(); }

  createVisit(input: NewVisit) {
    const device = parseDevice(input.userAgent);
    const values = {
      ...EMPTY_GEO, ...device, ...input,
      lastIp: input.ip, lastSeenAt: input.startedAt, activeSeconds: 0,
      geoUpdatedAt: null, isDemo: input.demo ? 1 : 0,
    };
    const columns = [...VISIT_COLUMNS, "isDemo"];
    const result = this.db.prepare(`INSERT OR IGNORE INTO visits (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
      .run(...columns.map((column) => {
        const value = values[column as keyof typeof values];
        return typeof value === "boolean" ? Number(value) : value ?? null;
      }));
    return { created: result.changes > 0, visit: this.getVisit(input.id)! };
  }

  count() { return Number((this.db.prepare("SELECT COUNT(*) AS count FROM visits").get() as { count: number }).count); }

  getVisit(id: string) {
    const row = this.db.prepare(`${SELECT_VISIT} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? mapVisit(row) : null;
  }

  heartbeat(id: string, activeSeconds: number, now: number, width: number | null, height: number | null) {
    const visit = this.getVisit(id);
    if (!visit) return null;
    // Client timestamps and durations are never trusted as server visitation times.
    // Cap reported active time to wall-clock age, and never let it go backwards.
    const capped = Math.min(activeSeconds, Math.floor((now - visit.startedAt) / 1000) + 2, 86400);
    this.db.prepare(`UPDATE visits SET lastSeenAt = MAX(lastSeenAt, ?), activeSeconds = MAX(activeSeconds, ?),
      viewportWidth = COALESCE(?, viewportWidth), viewportHeight = COALESCE(?, viewportHeight) WHERE id = ?`)
      .run(now, Math.max(0, capped), width, height, id);
    return this.getVisit(id);
  }

  recordEvents(sessionId: string, events: Omit<VisitorEvent, "receivedAt">[], now: number) {
    const visit = this.getVisit(sessionId);
    if (!visit) return 0;
    const existing = Number((this.db.prepare("SELECT COUNT(*) AS count FROM events WHERE sessionId = ?").get(sessionId) as { count: number }).count);
    const remaining = Math.max(0, 500 - existing);
    const insert = this.db.prepare("INSERT OR IGNORE INTO events (sessionId, id, type, target, path, occurredAt, receivedAt) VALUES (?, ?, ?, ?, ?, ?, ?)");
    let accepted = 0;
    this.db.exec("BEGIN");
    try {
      for (const event of events.slice(0, remaining)) {
        const occurredAt = Math.min(now, Math.max(visit.startedAt - 5000, event.occurredAt));
        accepted += Number(insert.run(sessionId, event.id, event.type, event.target, event.path, occurredAt, now).changes);
      }
      this.db.prepare("UPDATE visits SET lastSeenAt = MAX(lastSeenAt, ?) WHERE id = ?").run(now, sessionId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return accepted;
  }

  events(id: string): VisitorEvent[] {
    return this.db.prepare("SELECT id, type, target, path, occurredAt, receivedAt FROM events WHERE sessionId = ? ORDER BY occurredAt, receivedAt LIMIT 500").all(id) as unknown as VisitorEvent[];
  }

  cachedGeo(ip: string, now: number): { status: GeoStatus; geo: VisitorGeo; expiresAt: number } | null {
    const row = this.db.prepare("SELECT status, payload, expiresAt FROM geo_cache WHERE ip = ? AND expiresAt > ?").get(ip, now) as { status: GeoStatus; payload: string; expiresAt: number } | undefined;
    if (!row) return null;
    try { return { status: row.status, geo: JSON.parse(row.payload) as VisitorGeo, expiresAt: row.expiresAt }; }
    catch { return null; }
  }

  applyGeo(ip: string, status: GeoStatus, geo: VisitorGeo, now: number, cacheMs = 7 * 86400000) {
    this.db.prepare("INSERT INTO geo_cache (ip, status, payload, expiresAt) VALUES (?, ?, ?, ?) ON CONFLICT(ip) DO UPDATE SET status = excluded.status, payload = excluded.payload, expiresAt = excluded.expiresAt")
      .run(ip, status, JSON.stringify(geo), now + cacheMs);
    const columns = GEO_COLUMNS.map((column) => `${column} = ?`).join(", ");
    this.db.prepare(`UPDATE visits SET geoStatus = ?, geoUpdatedAt = ?, ${columns} WHERE ip = ? OR lastIp = ?`)
      .run(status, now, ...GEO_COLUMNS.map((column) => geo[column]), ip, ip);
  }

  pendingGeoIps(limit = 100) {
    return (this.db.prepare("SELECT DISTINCT lastIp AS ip FROM visits WHERE geoStatus = 'pending' ORDER BY lastSeenAt DESC LIMIT ?").all(limit) as { ip: string }[]).map((row) => row.ip);
  }

  private filter(filters: LogFilters) {
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    if (filters.since) { clauses.push("startedAt >= ?"); params.push(filters.since); }
    if (filters.device) { clauses.push("deviceType = ?"); params.push(filters.device); }
    if (filters.country) { clauses.push("countryCode = ?"); params.push(filters.country); }
    if (filters.q) {
      const search = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
      clauses.push("(ip LIKE ? ESCAPE '\\' OR lastIp LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\' OR country LIKE ? ESCAPE '\\' OR countryCode LIKE ? ESCAPE '\\' OR browser LIKE ? ESCAPE '\\' OR os LIKE ? ESCAPE '\\' OR source LIKE ? ESCAPE '\\' OR network LIKE ? ESCAPE '\\')");
      params.push(...Array<string>(9).fill(search));
    }
    return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
  }

  list(filters: LogFilters, now: number, retentionDays: number): Omit<VisitorLogResponse, "geoEnabled" | "geoProvider" | "demo" | "capacityReached"> {
    const { where, params } = this.filter(filters);
    const limit = filters.limit ?? 25;
    const offset = filters.offset ?? 0;
    const rows = this.db.prepare(`${SELECT_VISIT} ${where} ORDER BY startedAt DESC, id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Record<string, unknown>[];
    const total = Number((this.db.prepare(`SELECT COUNT(*) AS count FROM visits ${where}`).get(...params) as { count: number }).count);
    return { visits: rows.map(mapVisit), total, limit, offset, summary: this.summary(where, params, now), retentionDays, generatedAt: now };
  }

  private summary(where: string, params: (string | number)[], now: number): VisitorSummary {
    const row = this.db.prepare(`SELECT COUNT(*) AS visits, COUNT(DISTINCT ip) AS uniqueIps,
      COALESCE(AVG(activeSeconds), 0) AS averageActiveSeconds,
      COALESCE(SUM(CASE WHEN lastSeenAt >= ? THEN 1 ELSE 0 END), 0) AS activeNow,
      COALESCE(SUM(CASE WHEN deviceType IN ('mobile', 'tablet') THEN 1 ELSE 0 END), 0) AS mobile
      FROM visits ${where}`).get(now - 45000, ...params) as Record<string, number>;
    const breakdown = (column: "country" | "deviceType" | "browser" | "source"): BreakdownItem[] =>
      this.db.prepare(`SELECT COALESCE(NULLIF(${column}, ''), 'Unknown') AS label, COUNT(*) AS count FROM visits ${where} GROUP BY ${column} ORDER BY count DESC, label LIMIT 6`).all(...params) as unknown as BreakdownItem[];
    return {
      visits: row.visits, uniqueIps: row.uniqueIps, activeNow: row.activeNow,
      averageActiveSeconds: Math.round(row.averageActiveSeconds),
      mobileShare: row.visits ? Math.round(row.mobile / row.visits * 100) : 0,
      countries: breakdown("country"), devices: breakdown("deviceType"),
      browsers: breakdown("browser"), sources: breakdown("source"),
    };
  }

  deleteVisit(id: string) {
    const visit = this.getVisit(id);
    if (!visit) return 0;
    this.db.exec("BEGIN");
    try {
      const deleted = Number(this.db.prepare("DELETE FROM visits WHERE id = ?").run(id).changes);
      this.db.prepare("DELETE FROM geo_cache WHERE ip = ? OR ip = ?").run(visit.ip, visit.lastIp);
      this.db.exec("COMMIT");
      return deleted;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  deleteAll() {
    this.db.exec("BEGIN");
    try {
      const deleted = Number(this.db.prepare("DELETE FROM visits").run().changes);
      this.db.exec("DELETE FROM events; DELETE FROM geo_cache; COMMIT");
      return deleted;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  forget(id: string) { return this.deleteVisit(id) > 0; }

  purge(now: number, retentionDays: number) {
    const deleted = Number(this.db.prepare("DELETE FROM visits WHERE startedAt < ?").run(now - retentionDays * 86400000).changes);
    this.db.prepare("DELETE FROM admin_sessions WHERE expiresAt < ? OR absoluteExpiresAt < ?").run(now, now);
    this.db.prepare("DELETE FROM geo_cache WHERE expiresAt < ?").run(now);
    return deleted;
  }

  createAdminSession(token: string, now: number) {
    this.db.prepare("INSERT INTO admin_sessions (tokenHash, createdAt, expiresAt, absoluteExpiresAt) VALUES (?, ?, ?, ?)")
      .run(hashSessionToken(token), now, now + 2 * 3600000, now + 8 * 3600000);
  }

  getAdminSession(token: string, now: number, extend = true) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const hash = hashSessionToken(token);
    const session = this.db.prepare("SELECT expiresAt, absoluteExpiresAt FROM admin_sessions WHERE tokenHash = ? AND expiresAt > ? AND absoluteExpiresAt > ?").get(hash, now, now) as { expiresAt: number; absoluteExpiresAt: number } | undefined;
    if (!session) return null;
    const expiresAt = Math.min(now + 2 * 3600000, session.absoluteExpiresAt);
    if (extend) this.db.prepare("UPDATE admin_sessions SET expiresAt = ? WHERE tokenHash = ?").run(expiresAt, hash);
    return { expiresAt };
  }

  deleteAdminSession(token: string) { this.db.prepare("DELETE FROM admin_sessions WHERE tokenHash = ?").run(hashSessionToken(token)); }

  /** Explicitly fictional data, enabled only by DEMO_MODE outside production. */
  seedDemo(now: number) {
    if ((this.db.prepare("SELECT COUNT(*) AS count FROM visits WHERE isDemo = 1").get() as { count: number }).count) return;
    const examples = [
      { city: "København", region: "Hovedstaden", country: "Danmark", code: "DK", ip: "203.0.113.12", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", source: "facebook.com", seconds: 142 },
      { city: "Aarhus", region: "Midtjylland", country: "Danmark", code: "DK", ip: "203.0.113.28", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", source: "Google", seconds: 286 },
      { city: "London", region: "England", country: "United Kingdom", code: "GB", ip: "198.51.100.34", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", source: "Direct", seconds: 74 },
      { city: "Berlin", region: "Berlin", country: "Tyskland", code: "DE", ip: "198.51.100.71", ua: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36", source: "instagram.com", seconds: 193 },
      { city: "New York", region: "New York", country: "United States", code: "US", ip: "203.0.113.86", ua: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", source: "facebook.com", seconds: 328 },
      { city: "Odense", region: "Syddanmark", country: "Danmark", code: "DK", ip: "198.51.100.92", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0", source: "Direct", seconds: 51 },
    ];
    examples.forEach((example, index) => {
      const startedAt = now - (index * 47 + 8) * 60000;
      const { visit } = this.createVisit({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        ip: example.ip, userAgent: example.ua, startedAt, landingPath: "/", referrer: null,
        source: example.source, utmSource: null, utmMedium: null, utmCampaign: null,
        language: index < 2 ? "da-DK" : "en-US", timezone: index < 2 ? "Europe/Copenhagen" : "UTC",
        viewportWidth: index % 2 ? 1440 : 390, viewportHeight: index % 2 ? 900 : 844,
        geoStatus: "ready", demo: true,
      });
      this.applyGeo(example.ip, "ready", { ...EMPTY_GEO, city: example.city, region: example.region, country: example.country, countryCode: example.code, network: "Eksempel-netværk" }, startedAt);
      this.heartbeat(visit.id, example.seconds, startedAt + example.seconds * 1000, null, null);
      this.recordEvents(visit.id, [
        { id: `10000000-0000-4000-8000-${String(index * 3 + 1).padStart(12, "0")}`, type: "page_view", target: null, path: "/", occurredAt: startedAt },
        { id: `10000000-0000-4000-8000-${String(index * 3 + 2).padStart(12, "0")}`, type: "section_view", target: "my-weakness", path: "/", occurredAt: startedAt + 15000 },
        { id: `10000000-0000-4000-8000-${String(index * 3 + 3).padStart(12, "0")}`, type: "image_view", target: "brenda-poolside", path: "/", occurredAt: startedAt + 30000 },
      ], startedAt + 30000);
    });
  }
}
