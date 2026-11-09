import { VISITOR_EVENT_TYPES, type VisitorEventType } from "../../shared/visitors";

const SESSION_KEY = "brenda-mills-visit-session-v1";
const DURATION_KEY = "brenda-mills-visit-active-ms-v1";
export const VISITOR_OPT_OUT_KEY = "brenda-mills-visitor-opt-out-v1";
export const VISITOR_PREFERENCE_EVENT = "brenda-visitor-preference-changed";

type QueuedEvent = { id: string; type: VisitorEventType; target: string | null; path: string; occurredAt: number };
let started = false;
let disabled = false;
let localOptOut = false;
let sessionPromise: Promise<string | null> | null = null;
let queue: QueuedEvent[] = [];
let flushTimer: number | undefined;
let flushing = false;
let activeMs = 0;
let lastTick = 0;
let ticks = 0;

function readStorage(key: string) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string) {
  try { sessionStorage.setItem(key, value); } catch { /* Tracking must never break the page. */ }
}
function removeStorage(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* Storage may be blocked. */ }
}
function randomId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function browserSignalsOptOut() {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string };
  return nav.globalPrivacyControl === true || nav.doNotTrack === "1" || (window as Window & { doNotTrack?: string }).doNotTrack === "1";
}
export function hasVisitorOptOut() {
  try { return localOptOut || localStorage.getItem(VISITOR_OPT_OUT_KEY) === "1" || browserSignalsOptOut(); }
  catch { return browserSignalsOptOut(); }
}

function context() {
  let timezone = "";
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* Optional field. */ }
  return {
    language: navigator.language || "",
    timezone,
    viewportWidth: Math.round(window.innerWidth),
    viewportHeight: Math.round(window.innerHeight),
  };
}
function page() {
  // Only campaign parameters are read. Arbitrary query strings and URL fragments
  // (which may contain tokens or personal information) are never sent or stored.
  const params = new URLSearchParams(location.search);
  return {
    path: location.pathname.slice(0, 200),
    referrer: document.referrer.slice(0, 2000),
    utmSource: params.get("utm_source")?.slice(0, 100) || "",
    utmMedium: params.get("utm_medium")?.slice(0, 100) || "",
    utmCampaign: params.get("utm_campaign")?.slice(0, 150) || "",
  };
}

async function post(path: string, body: unknown, keepalive = false): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`/api/visits/${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify(body),
      keepalive,
      signal: controller.signal,
    });
  } catch { return null; }
  finally { window.clearTimeout(timeout); }
}

function ensureSession(): Promise<string | null> {
  if (disabled || hasVisitorOptOut()) return Promise.resolve(null);
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const sessionId = readStorage(SESSION_KEY) || randomId();
    const response = await post("session", { sessionId, page: page(), context: context() });
    if (!response?.ok) { sessionPromise = null; return null; }
    const result = await response.json() as { tracking?: boolean };
    if (!result.tracking) { disabled = true; return null; }
    writeStorage(SESSION_KEY, sessionId);
    return sessionId;
  })().catch(() => { sessionPromise = null; return null; });
  return sessionPromise;
}

async function flushEvents(keepalive = false) {
  if (flushing || !queue.length || hasVisitorOptOut()) return;
  flushing = true;
  try {
    const sessionId = await ensureSession();
    if (!sessionId) return;
    const batch = queue.slice(0, 20);
    const response = await post("events", { sessionId, events: batch }, keepalive);
    if (response?.ok) {
      const ids = new Set(batch.map((event) => event.id));
      queue = queue.filter((event) => !ids.has(event.id));
    }
    if (response?.status === 404) resetSession();
  } finally { flushing = false; }
}

function enqueue(type: VisitorEventType, target: string | null = null) {
  if (hasVisitorOptOut() || disabled) return;
  if (!VISITOR_EVENT_TYPES.includes(type)) return;
  // Bounded, in-memory only: no personal event history is written to localStorage.
  queue = [...queue.slice(-99), { id: randomId(), type, target, path: location.pathname.slice(0, 200), occurredAt: Date.now() }];
  window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => void flushEvents(), 250);
}

export function trackVisitorEvent(type: VisitorEventType, target?: string) {
  enqueue(type, target?.slice(0, 80) || null);
}

function accumulateTime() {
  const now = performance.now();
  if (lastTick && document.visibilityState === "visible") activeMs += Math.min(Math.max(now - lastTick, 0), 2000);
  lastTick = now;
}
async function heartbeat(keepalive = false) {
  if (hasVisitorOptOut() || disabled) return;
  accumulateTime();
  const sessionId = await ensureSession();
  if (!sessionId) return;
  const activeSeconds = Math.min(86400, Math.floor(activeMs / 1000));
  writeStorage(DURATION_KEY, String(activeMs));
  const response = await post("heartbeat", { sessionId, activeSeconds, context: context() }, keepalive);
  if (response?.status === 404) resetSession();
  if (queue.length) void flushEvents(keepalive);
}
function resetSession() {
  removeStorage(SESSION_KEY);
  removeStorage(DURATION_KEY);
  sessionPromise = null;
  queue = [];
  activeMs = 0;
}

export function startVisitorTracking() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (hasVisitorOptOut()) return;
  activeMs = Math.min(86400000, Math.max(0, Number(readStorage(DURATION_KEY)) || 0));
  lastTick = performance.now();
  void ensureSession().then((sessionId) => {
    if (!sessionId) return;
    enqueue("page_view");
    void heartbeat();
  });

  window.setInterval(() => {
    if (document.visibilityState !== "visible" || hasVisitorOptOut()) { lastTick = performance.now(); return; }
    accumulateTime();
    ticks += 1;
    if (ticks >= 15) { ticks = 0; void heartbeat(); }
  }, 1000);
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      accumulateTime();
      window.clearTimeout(flushTimer);
      void heartbeat(true);
      void flushEvents(true);
    } else {
      // Time spent in a hidden tab does not count as active reading time.
      lastTick = performance.now();
    }
  };
  const onPageHide = () => { void heartbeat(true); void flushEvents(true); };
  const onOnline = () => { void ensureSession().then(() => flushEvents()); };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("online", onOnline);
  // Keep listeners intact for back/forward-cache restores; the started guard
  // prevents double registration when React remounts the page.
}

/** Deletes this browser's current session, not just future collection. */
export async function setVisitorOptOut(optOut: boolean) {
  const sessionId = readStorage(SESSION_KEY);
  if (optOut) {
    localOptOut = true;
    try { localStorage.setItem(VISITOR_OPT_OUT_KEY, "1"); } catch { /* Server-side GPC/DNT handling still applies. */ }
    disabled = true;
    window.clearTimeout(flushTimer);
    if (sessionId) await post("forget", { sessionId }, true);
    resetSession();
  } else {
    if (browserSignalsOptOut()) return;
    try { localStorage.removeItem(VISITOR_OPT_OUT_KEY); } catch { /* Optional storage. */ }
    disabled = false;
    localOptOut = false;
    sessionPromise = null;
    lastTick = performance.now();
    void ensureSession().then((id) => { if (id) enqueue("page_view"); });
  }
  window.dispatchEvent(new CustomEvent(VISITOR_PREFERENCE_EVENT));
}
