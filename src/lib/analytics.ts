/**
 * Site statistics for the Brenda Mills landing page.
 *
 * The cloud counters in `@/lib/cloudStore` are the single source of truth, so the
 * numbers are shared by every visitor, browser and device. localStorage is only
 * used as (a) a cache of the last known cloud snapshot, so the page still shows
 * something while offline, and (b) a small outbox for hits that could not be
 * delivered yet - those are retried and never silently dropped.
 */
import { FREE_GALLERY_IMAGES } from "@/content";
import {
  VISITS_COUNTER,
  bulkHitLimit,
  cloudProviderLabel,
  hitCounter,
  imageCounterName,
  readCounters,
  referralCounter,
  resetCounters,
} from "@/lib/cloudStore";

export type ReferralKey = "health" | "coinbase";

export type GalleryStat = {
  views: number;
  downloads: number;
};

export type SiteStats = {
  visits: number;
  referrals: Record<ReferralKey, number>;
  images: Record<string, GalleryStat>;
  updatedAt: number;
};

export type StatsSyncResult = {
  stats: SiteStats;
  /** true when every counter was read from the cloud in this run. */
  live: boolean;
  provider: string;
  countersRead: number;
  countersFailed: number;
};

const CACHE_KEY = "brenda-mills-cloud-stats-cache-v1";
const OUTBOX_KEY = "brenda-mills-cloud-stats-outbox-v1";
const STATS_EVENT = "brenda-stats-updated";
const REUSE_WINDOW_MS = 4000;

const REFERRAL_KEYS: ReferralKey[] = ["health", "coinbase"];

let visitRecordedForPageLoad = false;
let inFlightFetch: Promise<StatsSyncResult> | null = null;
let pendingFlush: Promise<number> | null = null;
const inFlightHits = new Set<string>();
let lastFetchAt = 0;
let lastResult: StatsSyncResult | null = null;

function galleryStat(stats: SiteStats, src: string) {
  if (!stats.images[src]) stats.images[src] = { views: 0, downloads: 0 };
  return stats.images[src];
}

/**
 * Every global counter of the site plus how it maps onto the stats object.
 * This table is the only place where counters and UI numbers are connected.
 */
type CounterDefinition = {
  counter: string;
  add: (stats: SiteStats, amount: number) => void;
  set: (stats: SiteStats, value: number) => void;
};

const COUNTERS: CounterDefinition[] = [
  {
    counter: VISITS_COUNTER,
    add: (stats, amount) => {
      stats.visits += amount;
    },
    set: (stats, value) => {
      stats.visits = value;
    },
  },
  ...REFERRAL_KEYS.map((type) => ({
    counter: referralCounter(type),
    add: (stats: SiteStats, amount: number) => {
      stats.referrals[type] += amount;
    },
    set: (stats: SiteStats, value: number) => {
      stats.referrals[type] = value;
    },
  })),
  ...FREE_GALLERY_IMAGES.flatMap((image) => [
    {
      counter: imageCounterName(image.src, "view"),
      add: (stats: SiteStats, amount: number) => {
        galleryStat(stats, image.src).views += amount;
      },
      set: (stats: SiteStats, value: number) => {
        galleryStat(stats, image.src).views = value;
      },
    },
    {
      counter: imageCounterName(image.src, "save"),
      add: (stats: SiteStats, amount: number) => {
        galleryStat(stats, image.src).downloads += amount;
      },
      set: (stats: SiteStats, value: number) => {
        galleryStat(stats, image.src).downloads = value;
      },
    },
  ]),
];

function emptyStats(): SiteStats {
  return {
    visits: 0,
    referrals: { health: 0, coinbase: 0 },
    images: Object.fromEntries(
      FREE_GALLERY_IMAGES.map((image) => [image.src, { views: 0, downloads: 0 }]),
    ),
    updatedAt: 0,
  };
}

function cloneStats(stats: SiteStats): SiteStats {
  return {
    ...stats,
    referrals: { ...stats.referrals },
    images: Object.fromEntries(
      FREE_GALLERY_IMAGES.map((image) => [image.src, { ...galleryStat(stats, image.src) }]),
    ),
  };
}

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STATS_EVENT));
}

function readCache(): SiteStats {
  if (typeof window === "undefined") return emptyStats();

  try {
    const stored = window.localStorage.getItem(CACHE_KEY);
    if (!stored) return emptyStats();
    const parsed = JSON.parse(stored) as Partial<SiteStats>;
    const base = emptyStats();
    return {
      ...base,
      ...parsed,
      referrals: { ...base.referrals, ...(parsed.referrals ?? {}) },
      images: { ...base.images, ...(parsed.images ?? {}) },
    };
  } catch {
    return emptyStats();
  }
}

function writeCache(stats: SiteStats) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(stats));
  } catch {
    // Storage can be full or blocked; the cloud stays the source of truth.
  }
}

function readOutbox(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(OUTBOX_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeOutbox(counters: string[]) {
  if (typeof window === "undefined") return;
  try {
    if (counters.length === 0) window.localStorage.removeItem(OUTBOX_KEY);
    else window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(counters));
  } catch {
    // Ignore storage failures.
  }
}

/** Applies hits that are queued but not yet delivered, so numbers never go backwards. */
function withPendingHits(stats: SiteStats): SiteStats {
  const pending = readOutbox();
  if (pending.length === 0) return stats;

  const merged = cloneStats(stats);
  for (const counter of pending) {
    COUNTERS.find((definition) => definition.counter === counter)?.add(merged, 1);
  }
  merged.updatedAt = stats.updatedAt;
  return merged;
}

function addToCache(counter: string, amount: number) {
  const definition = COUNTERS.find((item) => item.counter === counter);
  if (!definition) return;

  const stats = readCache();
  definition.add(stats, amount);
  stats.updatedAt = Date.now();
  writeCache(stats);
}

function dropFromOutbox(counter: string, amount: number) {
  const pending = readOutbox();
  for (let removed = 0; removed < amount; removed += 1) {
    const index = pending.indexOf(counter);
    if (index < 0) break;
    pending.splice(index, 1);
  }
  writeOutbox(pending);
}

/**
 * Sends one hit. The hit is only removed from the outbox once the cloud accepted
 * it, so a lost connection never costs a click - and never counts twice.
 */
async function deliverHit(counter: string) {
  // Another delivery for this counter is already running and will pick up our hit.
  if (inFlightHits.has(counter)) return false;

  inFlightHits.add(counter);
  let delivered = 0;

  try {
    // Everything queued for this counter can go out in one request (bulk hit),
    // so ten fast clicks never mean ten round trips.
    const limit = bulkHitLimit();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const queued = readOutbox().filter((item) => item === counter).length;
      if (queued === 0) break;

      const amount = Math.min(queued, limit);
      const value = await hitCounter(counter, amount);
      dropFromOutbox(counter, amount);
      addToCache(counter, amount);
      delivered += amount;
      notify();
      if (value < 0) break;
    }
  } catch {
    // Still queued: it is retried on reconnect, before the next sync or on the next page load.
  } finally {
    inFlightHits.delete(counter);
  }

  return delivered > 0;
}

function recordHit(counter: string) {
  if (!COUNTERS.some((item) => item.counter === counter)) return;

  // Queue first so the click is shown (and remembered) even if the cloud is slow.
  writeOutbox([...readOutbox(), counter]);
  notify();
  void deliverHit(counter);
}

/** Retries every queued hit. Called on page load, when the browser goes online and before a sync. */
export async function flushPendingHits() {
  if (pendingFlush) return pendingFlush;

  pendingFlush = (async () => {
    let delivered = 0;
    for (const counter of readOutbox()) {
      if (inFlightHits.has(counter)) continue;
      if (await deliverHit(counter)) delivered += 1;
    }
    return delivered;
  })().finally(() => {
    pendingFlush = null;
  });

  return pendingFlush;
}

/** Locally cached snapshot - instant, but may be a few seconds behind the cloud. */
export function getStats() {
  return withPendingHits(readCache());
}

export function recordVisit() {
  // React StrictMode mounts effects twice in development; count one page load once.
  if (visitRecordedForPageLoad) return;
  visitRecordedForPageLoad = true;
  recordHit(VISITS_COUNTER);
}

export function trackReferral(type: ReferralKey) {
  recordHit(referralCounter(type));
}

export function trackImageView(src: string) {
  recordHit(imageCounterName(src, "view"));
}

export function trackImageDownload(src: string) {
  recordHit(imageCounterName(src, "save"));
}

async function syncStats(onProgress?: (done: number, total: number) => void): Promise<StatsSyncResult> {
  await flushPendingHits();

  const total = COUNTERS.length;
  let done = 0;
  const { values, failed } = await readCounters(
    COUNTERS.map((definition) => definition.counter),
    () => {
      done += 1;
      onProgress?.(done, total);
    },
  );

  if (done === 0) {
    throw new Error("The cloud counter service could not be reached.");
  }

  // Start from the last known values, then overwrite everything that was read.
  const stats = cloneStats(readCache());
  for (const definition of COUNTERS) {
    const value = values[definition.counter];
    if (value === undefined) continue;
    definition.set(stats, value);
  }
  stats.updatedAt = Date.now();

  writeCache(stats);

  const result: StatsSyncResult = {
    stats: withPendingHits(stats),
    live: failed.length === 0,
    provider: cloudProviderLabel(),
    countersRead: done,
    countersFailed: failed.length,
  };

  lastFetchAt = Date.now();
  lastResult = result;
  notify();
  return result;
}

/**
 * Reads the true global numbers from the cloud.
 * `force` skips the short reuse window (used by the manual refresh button).
 */
export function fetchStats(options: { onProgress?: (done: number, total: number) => void; force?: boolean } = {}) {
  const { onProgress, force = false } = options;

  if (inFlightFetch) return inFlightFetch;
  if (!force && lastResult && Date.now() - lastFetchAt < REUSE_WINDOW_MS) {
    return Promise.resolve(lastResult);
  }

  const run = syncStats(onProgress).finally(() => {
    inFlightFetch = null;
  });
  inFlightFetch = run;
  return run;
}

/** Puts every global counter back to 0 in the cloud and returns the fresh numbers. */
export async function resetStats(): Promise<StatsSyncResult> {
  await flushPendingHits();

  const { failed } = await resetCounters(COUNTERS.map((definition) => definition.counter));
  writeOutbox([]);

  const zeroed: SiteStats = { ...emptyStats(), updatedAt: Date.now() };
  writeCache(zeroed);
  notify();

  // Only re-read the cloud when a counter could not be reset, so a normal reset
  // does not fire another 27 requests at the public API.
  if (failed > 0) {
    const fresh = await fetchStats({ force: true });
    return { ...fresh, countersFailed: fresh.countersFailed + failed };
  }

  return {
    stats: withPendingHits(zeroed),
    live: true,
    provider: cloudProviderLabel(),
    countersRead: COUNTERS.length,
    countersFailed: 0,
  };
}

export { STATS_EVENT };
