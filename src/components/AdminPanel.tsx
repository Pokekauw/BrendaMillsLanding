import { useEffect, useMemo, useState } from "react";
import { FREE_GALLERY_IMAGES } from "@/content";
import {
  getStats,
  resetStats,
  type SiteStats,
} from "@/lib/analytics";

const ADMIN_CODE = "stats";

export default function AdminPanel() {
  const [open, setOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [stats, setStats] = useState<SiteStats>(() => getStats());

  useEffect(() => {
    const refresh = () => setStats(getStats());
    window.addEventListener("brenda-stats-updated", refresh);
    return () => window.removeEventListener("brenda-stats-updated", refresh);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

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

  const handleReset = () => {
    if (window.confirm("Reset all Brenda Mills statistics? This cannot be undone.")) {
      setStats(resetStats());
    }
  };

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
                  Enter the admin code to view the local site statistics.
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
                  Client-side admin only for now. Stats are stored in this browser.
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
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="border border-blood-500/45 px-4 py-2 text-[0.62rem] tracking-[0.15em] text-blood-300 uppercase transition-colors hover:border-blood-400 hover:bg-blood-500/10"
                    >
                      Reset stats
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
                  Last updated: {new Date(stats.updatedAt).toLocaleString()}. This
                  dashboard tracks this browser only until a real backend is connected.
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