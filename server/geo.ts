import type { VisitorGeo } from "../shared/visitors.js";
import type { AppConfig } from "./config.js";
import { EMPTY_GEO, VisitorStore } from "./store.js";
import { isPublicIp, text } from "./validation.js";

export type GeoResolver = (ip: string, signal: AbortSignal) => Promise<VisitorGeo | null>;

/** Only the server contacts ipinfo. No token or visitor log is included in the JS bundle. */
export const ipinfoResolver = (token: string | null): GeoResolver => async (ip, signal) => {
  const response = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json`, {
    headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal,
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Geo provider returned HTTP ${response.status}.`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Geo provider returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65536) throw new Error("Geo response is too large.");
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  if (body.bogon === true) return null;
  const country = text(body.country, 2);
  const coordinates = text(body.loc, 40).split(",").map(Number);
  const validCoordinates = coordinates.length === 2 && coordinates.every(Number.isFinite) && Math.abs(coordinates[0]) <= 90 && Math.abs(coordinates[1]) <= 180;
  const org = text(body.org, 180);
  const asn = /^AS\d+/.exec(org)?.[0] ?? null;
  return {
    city: text(body.city, 100) || null,
    region: text(body.region, 100) || null,
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    countryCode: /^[A-Z]{2}$/.test(country) ? country : null,
    // Approximately city-level, never presented as a street address or live GPS.
    latitude: validCoordinates ? Math.round(coordinates[0] * 100) / 100 : null,
    longitude: validCoordinates ? Math.round(coordinates[1] * 100) / 100 : null,
    network: (asn ? org.slice(asn.length).trim() : org) || null,
    asn,
  };
};

export class GeoService {
  private queue: string[] = [];
  private queued = new Set<string>();
  private running = 0;
  private idleWaiters: (() => void)[] = [];

  constructor(private store: VisitorStore, private config: AppConfig, private resolver: GeoResolver, private now: () => number = Date.now) {}

  enqueue(ip: string) {
    if (!this.config.geoEnabled || !isPublicIp(ip) || this.queued.has(ip) || this.queue.length >= 100) return;
    const cached = this.store.cachedGeo(ip, this.now());
    if (cached) {
      this.store.applyGeo(ip, cached.status, cached.geo, this.now(), cached.expiresAt - this.now());
      return;
    }
    this.queued.add(ip);
    this.queue.push(ip);
    this.kick();
  }

  private kick() {
    while (this.running < 2 && this.queue.length) {
      const ip = this.queue.shift()!;
      this.queued.delete(ip);
      this.running += 1;
      void this.lookup(ip).finally(() => {
        this.running -= 1;
        this.kick();
        if (!this.running && !this.queue.length) {
          this.idleWaiters.splice(0).forEach((resolve) => resolve());
        }
      });
    }
  }

  private async lookup(ip: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const geo = await this.resolver(ip, controller.signal);
      this.store.applyGeo(ip, geo ? "ready" : "unavailable", geo ?? EMPTY_GEO, this.now());
    } catch {
      // Do not log provider response bodies, tokens, or visitor addresses.
      // A short negative cache prevents a failing provider from causing a retry storm.
      this.store.applyGeo(ip, "error", EMPTY_GEO, this.now(), 15 * 60000);
    } finally { clearTimeout(timeout); }
  }

  retryPending() { this.store.pendingGeoIps().forEach((ip) => this.enqueue(ip)); }

  whenIdle() {
    if (!this.running && !this.queue.length) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }
}
