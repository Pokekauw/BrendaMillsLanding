import { FREE_GALLERY_IMAGES } from "@/content";

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

const STORAGE_KEY = "brenda-mills-site-stats-v1";
let visitRecordedForPageLoad = false;

function emptyStats(): SiteStats {
  return {
    visits: 0,
    referrals: { health: 0, coinbase: 0 },
    images: Object.fromEntries(
      FREE_GALLERY_IMAGES.map((image) => [image.src, { views: 0, downloads: 0 }]),
    ),
    updatedAt: Date.now(),
  };
}

function readStats(): SiteStats {
  if (typeof window === "undefined") return emptyStats();

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
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

function writeStats(stats: SiteStats) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  window.dispatchEvent(new CustomEvent("brenda-stats-updated"));
}

function updateStats(mutator: (stats: SiteStats) => void) {
  const stats = readStats();
  mutator(stats);
  stats.updatedAt = Date.now();
  writeStats(stats);
}

export function getStats() {
  return readStats();
}

export function recordVisit() {
  // React StrictMode can mount effects twice in development; count one page load once.
  if (visitRecordedForPageLoad) return;
  visitRecordedForPageLoad = true;
  updateStats((stats) => {
    stats.visits += 1;
  });
}

export function trackReferral(type: ReferralKey) {
  updateStats((stats) => {
    stats.referrals[type] += 1;
  });
}

export function trackImageView(src: string) {
  updateStats((stats) => {
    if (!stats.images[src]) stats.images[src] = { views: 0, downloads: 0 };
    stats.images[src].views += 1;
  });
}

export function trackImageDownload(src: string) {
  updateStats((stats) => {
    if (!stats.images[src]) stats.images[src] = { views: 0, downloads: 0 };
    stats.images[src].downloads += 1;
  });
}

export function resetStats() {
  const stats = emptyStats();
  writeStats(stats);
  return stats;
}