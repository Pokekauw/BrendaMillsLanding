/**
 * Global cloud counters for the Brenda Mills landing page.
 *
 * Instead of storing statistics in localStorage (this browser only), every
 * counter now lives in a free public counter API, so visits and clicks are
 * shared by every visitor, device and browser.
 *
 * Two free, key-less services are supported:
 *   - "countapi" -> https://countapi.mileshilliard.com  (default, read + write + reset)
 *   - "abacus"   -> https://abacus.jasoncameron.dev     (alternative, read + write)
 *
 * No account, no API key and no server of your own are required. Switch provider
 * by changing CLOUD_CONFIG.provider below.
 */
import { FREE_GALLERY_IMAGES } from "@/content";

export type CloudProviderId = "countapi" | "abacus";

export type CloudConfig = {
  provider: CloudProviderId;
  /** Prefix for every counter, so the numbers never collide with other sites. */
  counterPrefix: string;
  /** Abacus stores counters inside a namespace (3-64 chars, letters/numbers/._-). */
  abacusNamespace: string;
  requestTimeoutMs: number;
  /**
   * Reads are spread out over small batches to stay far below the public rate
   * limits of both services (CountAPI: 10 requests/second, Abacus: 30/10 seconds).
   */
  readBatch: Record<CloudProviderId, { size: number; delayMs: number }>;
};

export const CLOUD_CONFIG: CloudConfig = {
  provider: "countapi",
  counterPrefix: "brendamills-site-v1",
  abacusNamespace: "brendamills-landing",
  requestTimeoutMs: 8000,
  readBatch: {
    countapi: { size: 3, delayMs: 250 },
    abacus: { size: 2, delayMs: 700 },
  },
};

const COUNTAPI_BASE = "https://countapi.mileshilliard.com/api/v1";
const ABACUS_BASE = "https://abacus.jasoncameron.dev";
const KEY_PATTERN = /^[A-Za-z0-9_.-]{3,64}$/;
const MAX_BULK_HIT = 100;

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function shortHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/** Builds the global counter key for a metric, e.g. "brendamills-site-v1-page-visits". */
export function counterName(suffix: string) {
  const name = `${slug(CLOUD_CONFIG.counterPrefix)}-${slug(suffix)}`;
  const trimmed = name.length > 64 ? name.slice(0, 64) : name;
  return KEY_PATTERN.test(trimmed) ? trimmed : `${slug(CLOUD_CONFIG.counterPrefix)}-${shortHash(suffix)}`;
}

export const VISITS_COUNTER = counterName("page-visits");

export function referralCounter(type: string) {
  return counterName(`referral-${type}`);
}

/** Stable key per gallery image, based on the download file name (falls back to a hash). */
export function imageCounterName(src: string, kind: "view" | "save") {
  const image = FREE_GALLERY_IMAGES.find((item) => item.src === src);
  const base = image ? image.fileName.replace(/\.[a-z0-9]+$/i, "") : `img-${shortHash(src)}`;
  return counterName(`${base}-${kind === "view" ? "views" : "saves"}`);
}

type ProviderResponse = {
  status: number;
  body: unknown;
};

type Provider = {
  id: CloudProviderId;
  label: string;
  supportsReset: boolean;
  /** How many hits may be sent in one request (CountAPI supports ?amount=). */
  maxBulkHit: number;
  hit(name: string, amount: number): Promise<number>;
  read(name: string): Promise<number>;
  set(name: string, value: number): Promise<number>;
};

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function request(url: string): Promise<ProviderResponse> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), CLOUD_CONFIG.requestTimeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Reads and writes may be retried safely. Hits are never retried here, so a
 * timeout can never count the same click twice.
 */
async function requestWithRetry(url: string, retries = 2): Promise<ProviderResponse> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await request(url);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) return response;
      if (attempt >= retries) return response;
    } catch (error) {
      if (attempt >= retries) throw error;
    }
    await delay(700 * (attempt + 1));
  }
}

/** Counter APIs return numbers as numbers or as strings; "" / null / -1 mean "no counter yet". */
function numberValue(body: unknown, allowNegative = false) {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { value?: unknown }).value;
  const value = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : Number.NaN;
  if (!Number.isFinite(value)) return null;
  if (value < 0 && !allowNegative) return null;
  return value;
}

function errorMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object") {
    const raw = (body as { error?: unknown }).error;
    if (typeof raw === "string" && raw.trim()) return raw;
  }
  return fallback;
}

const countapiProvider: Provider = {
  id: "countapi",
  label: "CountAPI (countapi.mileshilliard.com)",
  supportsReset: true,
  maxBulkHit: MAX_BULK_HIT,
  async hit(name, amount) {
    const bulk = amount > 1 ? `?amount=${Math.min(amount, MAX_BULK_HIT)}` : "";
    const { status, body } = await request(`${COUNTAPI_BASE}/hit/${encodeURIComponent(name)}${bulk}`);
    const value = numberValue(body);
    if (status >= 400 || value === null) {
      throw new Error(errorMessage(body, `CountAPI hit failed (HTTP ${status})`));
    }
    return value;
  },
  async read(name) {
    const { status, body } = await requestWithRetry(`${COUNTAPI_BASE}/get/${encodeURIComponent(name)}`);
    // A counter that has never been used does not exist yet, which is zero.
    if (status === 404) return 0;
    const value = numberValue(body);
    if (value === null) {
      if (status >= 400) throw new Error(errorMessage(body, `CountAPI read failed (HTTP ${status})`));
      return 0;
    }
    return value;
  },
  async set(name, value) {
    // Setting a counter is idempotent, so retrying a failed attempt is safe.
    const { status, body } = await requestWithRetry(
      `${COUNTAPI_BASE}/set/${encodeURIComponent(name)}?value=${value}`,
    );
    const stored = numberValue(body);
    if (status >= 400 || stored === null) {
      throw new Error(errorMessage(body, `CountAPI set failed (HTTP ${status})`));
    }
    return stored;
  },
};

const abacusProvider: Provider = {
  id: "abacus",
  label: "Abacus (abacus.jasoncameron.dev)",
  // Abacus only allows writing a value with a per-counter admin key, so the
  // admin panel cannot reset counters while this provider is active.
  supportsReset: false,
  maxBulkHit: 1,
  async hit(name, amount) {
    const url = `${ABACUS_BASE}/hit/${encodeURIComponent(CLOUD_CONFIG.abacusNamespace)}/${encodeURIComponent(name)}`;
    let value = 0;
    for (let sent = 0; sent < amount; sent += 1) {
      const { status, body } = await request(url);
      const read = numberValue(body);
      if (status >= 400 || read === null) {
        throw new Error(errorMessage(body, `Abacus hit failed (HTTP ${status})`));
      }
      value = read;
    }
    return value;
  },
  async read(name) {
    const url = `${ABACUS_BASE}/info/${encodeURIComponent(CLOUD_CONFIG.abacusNamespace)}/${encodeURIComponent(name)}`;
    const { status, body } = await requestWithRetry(url);
    if (body && typeof body === "object" && (body as { exists?: unknown }).exists === false) return 0;
    const value = numberValue(body, true);
    if (value !== null && value >= 0) return value;
    if (status === 404) return 0;
    throw new Error(errorMessage(body, `Abacus read failed (HTTP ${status})`));
  },
  async set() {
    throw new Error(
      'Abacus needs a per-counter admin key to overwrite a value. Set CLOUD_CONFIG.provider to "countapi" in src/lib/cloudStore.ts to reset the statistics.',
    );
  },
};

function activeProvider(): Provider {
  return CLOUD_CONFIG.provider === "abacus" ? abacusProvider : countapiProvider;
}

export function cloudProviderLabel() {
  return activeProvider().label;
}

export function cloudProviderSupportsReset() {
  return activeProvider().supportsReset;
}

/**
 * +1 (or +amount) on a global counter. Counters are created on first use, so the
 * owner never has to set anything up beforehand.
 */
export function bulkHitLimit() {
  const provider = activeProvider();
  return Math.max(1, Math.min(provider.maxBulkHit, MAX_BULK_HIT));
}

export async function hitCounter(name: string, amount = 1) {
  const provider = activeProvider();
  return provider.hit(name, Math.max(1, Math.min(amount, provider.maxBulkHit)));
}

export type ReadCountersResult = {
  /** Values fetched from the cloud. Counters that failed are missing. */
  values: Record<string, number>;
  failed: string[];
};

export async function readCounters(
  names: string[],
  onValue?: (name: string, value: number) => void,
): Promise<ReadCountersResult> {
  const provider = activeProvider();
  const { size, delayMs } = CLOUD_CONFIG.readBatch[provider.id];
  const values: Record<string, number> = {};
  const failed: string[] = [];

  for (let index = 0; index < names.length; index += size) {
    const batch = names.slice(index, index + size);
    const results = await Promise.all(
      batch.map(async (name) => {
        try {
          return { name, value: await provider.read(name) };
        } catch {
          return { name, value: null };
        }
      }),
    );

    for (const result of results) {
      if (result.value === null) {
        failed.push(result.name);
        continue;
      }
      values[result.name] = result.value;
      onValue?.(result.name, result.value);
    }

    if (index + size < names.length) await delay(delayMs);
  }

  return { values, failed };
}

/** Puts every global counter back to 0. Returns how many counters were changed. */
export async function resetCounters(names: string[]) {
  const provider = activeProvider();
  if (!provider.supportsReset) {
    throw new Error(
      'The active cloud provider cannot reset counters without an admin key. Set CLOUD_CONFIG.provider to "countapi" in src/lib/cloudStore.ts.',
    );
  }

  const { values } = await readCounters(names);
  let reset = 0;
  let failed = 0;

  for (const name of names) {
    const current = values[name] ?? 0;
    if (current === 0) continue;
    try {
      await provider.set(name, 0);
      reset += 1;
    } catch {
      failed += 1;
    }
    await delay(200);
  }

  return { reset, failed };
}
