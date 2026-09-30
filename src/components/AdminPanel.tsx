import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FREE_GALLERY_IMAGES } from "@/content";
import { fetchStats, getStats, resetStats, STATS_EVENT, type SiteStats } from "@/lib/analytics";
import { cloudProviderLabel, cloudProviderSupportsReset } from "@/lib/cloudStore";

const ADMIN_CODE = "stats";
const AUTO_REFRESH_MS = 60000;

type CloudStatus = "idle" | "syncing" | "live" | "partial" | "error";

export default function AdminPanel() {
  const [open, setOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [stats, setStats] = useState<SiteStats>(() => getStats());
  const [status, setStatus] = useState<CloudStatus>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [notice, setNotice] = useState("");
  const [resetting, setResetting] = useState(false);
  const provider = cloudProviderLabel();
  const canReset = cloudProviderSupportsReset();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const syncFromCloud = useCallback(async (force = false) => {
    setStatus("syncing");
    setNotice("");
    setProgress({ done: 0, total: 0 });

    try {
      const result = await fetchStats({
        force,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (!mounted.current) return;

      setStats(result.stats);
      if (result.live) {
        setStatus("live");
      } else {
        setStatus("partial");
        setNotice(
          `${result.countersFailed} of ${result.countersRead + result.countersFailed} cloud counters could not be read - the last known value is shown for those.`,
        );
      }
    } catch (syncError) {
      if (!mounted.current) return;
      setStatus("error");
      setStats(getStats());
      setNotice(
        `${syncError instanceof Error ? syncError.message : "The cloud could not be reached."} Showing the last cached numbers and retrying automatically.`,
      );
    }
  }, []);

  useEffect(() => {
    const refresh = () => setStats(getStats());
    window.addEventListener(STATS_EVENT, refresh);
    return () => window.removeEventListener(STATS_EVENT, refresh);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // While the panel is open: read the true global numbers and keep them fresh.
  useEffect(() => {
    if (!open || !authenticated) return;

    void syncFromCloud(true);
    const timer = window.setInterval(() => void syncFromCloud(true), AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [open, authenticated, syncFromCloud]);

  const totals = useMemo(() => {
    return FREE_GALLERY_IMAGES.reduce(
      (sum, image) => {
        const item = stats.images[image.src] ?? { views: 0, downloads: 0 };
        return {
          views: sum.views + item.views,
          downloads: sum.downloads + item.downloads,
        };
      },
      { views: 0, downloads: 0 },
    );
  }, [stats]);

  const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (code === ADMIN_CODE) {
      setAuthenticated(true);
      setCode("");
      setError("");
      setStats(getStats());
    } else {
      setError("That code is not correct.");
    }
  };

  const handleReset = async () => {
    if (
      !window.confirm(
        "Reset all Brenda Mills statistics in the cloud? Every visitor will start from 0. This cannot be undone.",
      )
    ) {
      return;
    }

    setResetting(true);
    setNotice("");
    try {
      const result = await resetStats();
      if (!mounted.current) return;
      setStats(result.stats);
      setStatus(result.live ? "live" : "partial");
      setNotice("All global counters were set back to 0.");
    } catch (resetError) {
      if (!mounted.current) return;
      setNotice(resetError instanceof Error ? resetError.message : "The reset failed.");
    } finally {
      if (mounted.current) setResetting(false);
    }
  };

  const statusLine = (() => {
    if (status === "syncing") {
      return progress.total > 0
        ? `Reading ${progress.done}/${progress.total} cloud counters...`
        : "Contacting the cloud counter service...";
    }
    if (status === "live") return "Live global numbers, read from the cloud.";
    if (status === "partial") return "Partly live - some counters kept their last known value.";
    if (status === "error") return "Cloud unreachable - showing the last cached numbers.";
    return "Cloud statistics - every visitor and device is counted together.";
  })();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 border border-gold-500/25 bg-ink-950/80 px-3 py-2 text-[0.58rem] tracking-[0.18em] text-bone-400 uppercase backdrop-blur-sm transition-colors hover:border-gold-400/70 hover:text-bone-100"
      >
        Admin
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-sm sm:px-8"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-title"
            className="relative mx-auto w-full max-w-5xl border border-gold-500/25 bg-ink-900 shadow-[0_30px_110px_-35px_rgba(192,32,58,0.65)]"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close admin"
              className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center border border-gold-500/25 text-xl text-bone-300 transition-colors hover:border-blood-500 hover:text-bone-100"
            >
              x
            </button>

            {!authenticated ? (
              <div className="mx-auto max-w-md px-7 py-16 sm:px-12">
                <span className="label text-[0.58rem] text-blood-400">Private area</span>
                <h2 id="admin-title" className="mt-4 font-display text-5xl text-bone-100 italic">
                  Admin login
                </h2>
                <p className="mt-4 leading-relaxed text-bone-400">
                  Enter the admin code to view the global site statistics.
                </p>
                <form onSubmit={handleLogin} className="mt-8">
                  <label htmlFor="admin-code" className="label text-[0.58rem] text-bone-400">
                    Access code
                  </label>
                  <input
                    id="admin-code"
                    type="password"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    autoFocus
                    className="mt-3 w-full border border-gold-500/25 bg-ink-950 px-4 py-3 text-bone-100 outline-none transition-colors focus:border-blood-500"
                    placeholder="Enter code"
                  />
                  {error && <p className="mt-3 text-sm text-blood-400">{error}</p>}
                  <button
                    type="submit"
                    className="mt-6 inline-flex border border-blood-500/60 bg-blood-700 px-6 py-3 text-[0.68rem] font-medium tracking-[0.2em] text-bone-100 uppercase transition-colors hover:bg-blood-600"
                  >
                    Open dashboard
                  </button>
                </form>
                <p className="mt-8 text-xs leading-relaxed text-bone-500">
                  Client-side admin. The numbers are counted globally in the cloud, so
                  they are the same for every visitor, browser and device.
                </p>
              </div>
            ) : (
              <div className="px-5 py-10 sm:px-10">
                <div className="flex flex-col gap-5 border-b border-gold-500/15 pb-7 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <span className="label text-[0.58rem] text-blood-400">Private area</span>
                    <h2 id="admin-title" className="mt-3 font-display text-5xl text-bone-100 italic">
                      Brenda Mills stats
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void syncFromCloud(true)}
                      disabled={status === "syncing"}
                      className="border border-gold-500/30 px-4 py-2 text-[0.62rem] tracking-[0.15em] text-gold-300 uppercase transition-colors hover:border-gold-300 hover:bg-gold-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {status === "syncing" ? "Syncing..." : "Refresh from cloud"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReset()}
                      disabled={resetting || !canReset}
                      title={
                        canReset
                          ? undefined
                          : "The active cloud provider needs an admin key to reset counters. Switch the provider to CountAPI in src/lib/cloudStore.ts."
                      }
                      className="border border-blood-500/45 px-4 py-2 text-[0.62rem] tracking-[0.15em] text-blood-300 uppercase transition-colors hover:border-blood-400 hover:bg-blood-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {resetting ? "Resetting..." : "Reset stats"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthenticated(false)}
                      className="border border-gold-500/25 px-4 py-2 text-[0.62rem] tracking-[0.15em] text-bone-400 uppercase transition-colors hover:border-gold-400 hover:text-bone-100"
                    >
                      Log out
                    </button>
                  </div>
                </div>

                <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-bone-400">
                  <span
                    className={
                      status === "live"
                        ? "inline-flex items-center gap-2 text-gold-300"
                        : status === "error"
                          ? "inline-flex items-center gap-2 text-blood-300"
                          : "inline-flex items-center gap-2 text-bone-300"
                    }
                  >
                    <span
                      aria-hidden
                      className={
                        status === "live"
                          ? "h-1.5 w-1.5 rounded-full bg-gold-400"
                          : status === "error"
                            ? "h-1.5 w-1.5 rounded-full bg-blood-500"
                            : "h-1.5 w-1.5 rounded-full bg-bone-500"
                      }
                    />
                    {statusLine}
                  </span>
                  <span className="text-bone-500">Cloud service: {provider}</span>
                </p>

                {notice && (
                  <p className="mt-3 border-l border-gold-500/35 pl-4 text-xs leading-relaxed text-bone-400">
                    {notice}
                  </p>
                )}

                <div className="mt-8 grid gap-px bg-gold-500/10 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Page visits" value={stats.visits} />
                  <Stat label="Referral clicks" value={stats.referrals.health + stats.referrals.coinbase} />
                  <Stat label="Image previews" value={totals.views} />
                  <Stat label="Image downloads" value={totals.downloads} />
                </div>

                <div className="mt-10 grid gap-8 lg:grid-cols-2">
                  <div>
                    <h3 className="font-display text-3xl text-bone-100">Referral links</h3>
                    <div className="mt-4 divide-y divide-gold-500/12 border-y border-gold-500/12">
                      <MetricRow label="Health recommendation" value={stats.referrals.health} />
                      <MetricRow label="Coinbase" value={stats.referrals.coinbase} />
                    </div>
                  </div>

                  <div>
                    <h3 className="font-display text-3xl text-bone-100">Free gallery</h3>
                    <div className="mt-4 max-h-80 overflow-y-auto divide-y divide-gold-500/12 border-y border-gold-500/12">
                      {FREE_GALLERY_IMAGES.map((image, index) => {
                        const item = stats.images[image.src] ?? { views: 0, downloads: 0 };
                        return (
                          <div key={image.src} className="flex items-center gap-3 py-3">
                            <span className="font-display text-lg text-gold-400">{index + 1}</span>
                            <span className="min-w-0 flex-1 truncate text-sm text-bone-300">
                              {image.alt}
                            </span>
                            <span className="text-xs text-bone-400">{item.views} views</span>
                            <span className="text-xs text-bone-400">{item.downloads} saves</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <p className="mt-8 text-xs leading-relaxed text-bone-500">
                  {stats.updatedAt > 0
                    ? `Last read from the cloud: ${new Date(stats.updatedAt).toLocaleString()}. `
                    : "No cloud numbers read yet. "}
                  Every visit, referral click, preview and download is counted globally, so
                  these numbers are shared across all visitors and devices. The panel
                  refreshes itself every {AUTO_REFRESH_MS / 1000} seconds.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-ink-950 px-5 py-6">
      <p className="label text-[0.55rem] text-bone-400">{label}</p>
      <p className="mt-2 font-display text-4xl text-bone-100">{value}</p>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-5 py-4">
      <span className="text-sm text-bone-300">{label}</span>
      <span className="font-display text-2xl text-gold-400">{value}</span>
    </div>
  );
}
