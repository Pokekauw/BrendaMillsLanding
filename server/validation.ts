import ipaddr from "ipaddr.js";
import { UAParser } from "ua-parser-js";
import { VISITOR_EVENT_TYPES, type DeviceKind, type VisitorEventType } from "../shared/visitors.js";

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Expected a JSON object.");
  return value as Record<string, unknown>;
}

export function text(value: unknown, max: number, fallback = "") {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw new InputError("Invalid text field.");
  // Do not persist control characters, including escaped newlines in log fields.
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim();
  if (clean.length > max) throw new InputError("A text field is too long.");
  return clean;
}

export function uuid(value: unknown) {
  const result = text(value, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new InputError("Invalid session or event id.");
  }
  return result.toLowerCase();
}

export function normalizeIp(value: string | undefined) {
  if (!value) return null;
  try {
    let address = ipaddr.parse(value);
    if (address.kind() === "ipv6" && (address as ipaddr.IPv6).isIPv4MappedAddress()) {
      address = (address as ipaddr.IPv6).toIPv4Address();
    }
    return address.toString();
  } catch {
    return null;
  }
}

export function isPublicIp(ip: string) {
  try {
    return ipaddr.parse(ip).range() === "unicast";
  } catch {
    return false;
  }
}

export function safePath(value: unknown) {
  const raw = text(value, 200, "/");
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("?") || raw.includes("#")) return "/";
  return raw;
}

/** Keep only the origin of external referrers: paths and queries can contain secrets. */
export function safeReferrer(value: unknown, landingPath: string) {
  const raw = text(value, 2000);
  if (!raw) return { referrer: null, source: "Direct" };
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return { referrer: null, source: "Direct" };
    const sameOrigin = url.pathname === landingPath && !url.search && !url.hash && text(value, 2000).startsWith("/");
    const referrer = sameOrigin ? landingPath : url.origin;
    return { referrer, source: sameOrigin ? "This site" : url.hostname.replace(/^www\./, "") };
  } catch {
    return { referrer: null, source: "Direct" };
  }
}

function integer(value: unknown, min: number, max: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new InputError("Invalid numeric field.");
  return value;
}

export function parseDevice(userAgent: string) {
  const parsed = new UAParser(userAgent).getResult();
  const ua = userAgent.toLowerCase();
  const bot = /bot|crawler|spider|crawling|preview|facebookexternalhit|slurp/.test(ua);
  let deviceType: DeviceKind = bot ? "bot" : parsed.device.type === "mobile" ? "mobile" : parsed.device.type === "tablet" ? "tablet" : parsed.device.type ? "other" : "desktop";
  // iPadOS can identify itself as a Mac. The client's coarse touch/viewport hint helps,
  // but no hardware fingerprint or high-entropy client-hints request is made.
  if (/macintosh/.test(ua) && /mobile/.test(ua)) deviceType = "tablet";
  return {
    deviceType,
    deviceVendor: text(parsed.device.vendor, 60) || null,
    deviceModel: text(parsed.device.model, 80) || null,
    browser: text(parsed.browser.name, 80, "Unknown"),
    browserVersion: text(parsed.browser.version, 40) || null,
    os: text(parsed.os.name, 80, "Unknown"),
    osVersion: text(parsed.os.version, 40) || null,
  };
}

export function parseStart(value: unknown) {
  const body = object(value);
  const page = object(body.page);
  const context = object(body.context);
  const landingPath = safePath(page.path);
  const { referrer, source } = safeReferrer(page.referrer, landingPath);
  const language = text(context.language, 35) || null;
  const timezone = text(context.timezone, 64) || null;
  if (timezone && !/^[A-Za-z0-9_+./-]+$/.test(timezone)) throw new InputError("Invalid timezone.");
  return {
    id: uuid(body.sessionId),
    landingPath,
    referrer,
    source: text(page.utmSource, 100) || source,
    utmSource: text(page.utmSource, 100) || null,
    utmMedium: text(page.utmMedium, 100) || null,
    utmCampaign: text(page.utmCampaign, 150) || null,
    language,
    timezone,
    viewportWidth: integer(context.viewportWidth, 0, 20000),
    viewportHeight: integer(context.viewportHeight, 0, 20000),
  };
}

export function parseHeartbeat(value: unknown) {
  const body = object(value);
  const context = object(body.context ?? {});
  const activeSeconds = integer(body.activeSeconds, 0, 86400);
  if (activeSeconds === null) throw new InputError("activeSeconds is required.");
  return {
    id: uuid(body.sessionId),
    activeSeconds,
    viewportWidth: integer(context.viewportWidth, 0, 20000),
    viewportHeight: integer(context.viewportHeight, 0, 20000),
  };
}

export function parseEvents(value: unknown): { id: string; events: { id: string; type: VisitorEventType; target: string | null; path: string | null; occurredAt: number }[] } {
  const body = object(value);
  if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 20) throw new InputError("Send between 1 and 20 events.");
  return {
    id: uuid(body.sessionId),
    events: body.events.map((item) => {
      const event = object(item);
      if (!VISITOR_EVENT_TYPES.includes(event.type as VisitorEventType)) throw new InputError("Unknown event type.");
      const occurredAt = integer(event.occurredAt, 0, 8640000000000000);
      if (occurredAt === null) throw new InputError("occurredAt is required.");
      const target = text(event.target, 80) || null;
      if (target && !/^[a-zA-Z0-9_.-]+$/.test(target)) throw new InputError("Invalid event target.");
      return { id: uuid(event.id), type: event.type as VisitorEventType, target, path: event.path === undefined ? null : safePath(event.path), occurredAt };
    }),
  };
}
