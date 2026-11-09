import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FREE_GALLERY_IMAGES } from "@/content";
import { fetchStats, getStats, resetStats, STATS_EVENT, type SiteStats } from "@/lib/analytics";
import { cloudProviderLabel, cloudProviderSupportsReset } from "@/lib/cloudStore";

const AUTO_REFRESH_MS = 60000;
type CloudStatus = "idle" | "syncing" | "live" | "partial" | "error";

/** Existing public, aggregate-only counters. No IP addresses are sent to this API. */
export default function CloudStats() {
  const [stats, setStats] = useState<SiteStats>(() => getStats());
  const [status, setStatus] = useState<CloudStatus>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [notice, setNotice] = useState("");
  const [resetting, setResetting] = useState(false);
  const mounted = useRef(true);
  const provider = cloudProviderLabel();
  const canReset = cloudProviderSupportsReset();

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const sync = useCallback(async () => {
    setStatus("syncing"); setNotice(""); setProgress({ done: 0, total: 0 });
    try {
      const result = await fetchStats({ force: true, onProgress: (done, total) => { if (mounted.current) setProgress({ done, total }); } });
      if (!mounted.current) return;
      setStats(result.stats);
      setStatus(result.live ? "live" : "partial");
      if (!result.live) setNotice(`${result.countersFailed} tællere kunne ikke læses. Sidst kendte værdi vises.`);
    } catch (error) {
      if (!mounted.current) return;
      setStatus("error"); setStats(getStats());
      setNotice(error instanceof Error ? error.message : "Cloudtælleren kunne ikke nås.");
    }
  }, []);
  useEffect(() => {
    void sync();
    const timer = window.setInterval(() => void sync(), AUTO_REFRESH_MS);
    const refresh = () => setStats(getStats());
    window.addEventListener(STATS_EVENT, refresh);
    return () => { window.clearInterval(timer); window.removeEventListener(STATS_EVENT, refresh); };
  }, [sync]);
  const totals = useMemo(() => FREE_GALLERY_IMAGES.reduce((sum, image) => {
    const item = stats.images[image.src] ?? { views: 0, downloads: 0 };
    return { views: sum.views + item.views, downloads: sum.downloads + item.downloads };
  }, { views: 0, downloads: 0 }), [stats]);
  const reset = async () => {
    if (!window.confirm("Nulstil alle globale klik- og besøgstællere? Det sletter IKKE den private besøgslog og kan ikke fortrydes.")) return;
    setResetting(true); setNotice("");
    try {
      const result = await resetStats();
      if (!mounted.current) return;
      setStats(result.stats); setStatus(result.live ? "live" : "partial"); setNotice("De globale tællere er nulstillet.");
    } catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : "Nulstilling fejlede."); }
    finally { if (mounted.current) setResetting(false); }
  };
  const statusLine = status === "syncing" ? `Læser ${progress.done}/${progress.total || "…"} tællere…` : status === "live" ? "Live globale tal fra skyen." : status === "partial" ? "Delvist live — nogle tal er sidst kendte værdier." : status === "error" ? "Skyen kan ikke nås — viser cachede tal." : "Henter globale tal…";

  return <div className="mt-7">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-xs text-bone-400"><span className={status === "live" ? "text-gold-300" : "text-bone-300"}>{statusLine}</span><span className="mt-2 block text-bone-500">{provider}</span></p>
      <div className="flex gap-3">
        <button type="button" onClick={() => void sync()} disabled={status === "syncing"} className="border border-gold-500/30 px-4 py-2 text-[0.62rem] tracking-[0.15em] text-gold-300 uppercase hover:bg-gold-500/10 disabled:opacity-50">{status === "syncing" ? "Synkroniserer…" : "Opdater tællere"}</button>
        <button type="button" onClick={() => void reset()} disabled={resetting || !canReset} className="border border-blood-500/45 px-4 py-2 text-[0.62rem] tracking-[0.15em] text-blood-300 uppercase hover:bg-blood-500/10 disabled:opacity-50">{resetting ? "Nulstiller…" : "Nulstil tællere"}</button>
      </div>
    </div>
    {notice && <p className="mt-4 border-l border-gold-500/35 pl-4 text-xs leading-relaxed text-bone-400">{notice}</p>}
    <div className="mt-6 grid gap-px bg-gold-500/10 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Sidebesøg (global tæller)" value={stats.visits} />
      <Stat label="Referral-klik" value={stats.referrals.health + stats.referrals.coinbase} />
      <Stat label="Billedvisninger" value={totals.views} />
      <Stat label="Billeddownloads" value={totals.downloads} />
    </div>
    <div className="mt-9 grid gap-8 lg:grid-cols-2">
      <div><h3 className="font-display text-3xl text-bone-100">Referral-links</h3><div className="mt-4 divide-y divide-gold-500/15 border-y border-gold-500/15"><MetricRow label="Health recommendation" value={stats.referrals.health} /><MetricRow label="Coinbase" value={stats.referrals.coinbase} /></div></div>
      <div><h3 className="font-display text-3xl text-bone-100">Gratis galleri</h3><div className="mt-4 max-h-80 divide-y divide-gold-500/15 overflow-y-auto border-y border-gold-500/15">{FREE_GALLERY_IMAGES.map((image, index) => {
        const item = stats.images[image.src] ?? { views: 0, downloads: 0 };
        return <div key={image.src} className="flex items-center gap-3 py-3"><span className="font-display text-lg text-gold-400">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm text-bone-300">{image.alt}</span><span className="text-xs text-bone-400">{item.views} visninger</span><span className="text-xs text-bone-400">{item.downloads} gemt</span></div>;
      })}</div></div>
    </div>
    <p className="mt-7 text-xs leading-relaxed text-bone-500">Disse eksisterende tællere er globale og offentligt læsbare via deres nøgler. De indeholder ikke besøgsloggens IP-adresser eller enhedsoplysninger. Nulstilling her påvirker ikke besøgsloggen. {stats.updatedAt > 0 && `Sidst læst: ${new Date(stats.updatedAt).toLocaleString("da-DK")}.`}</p>
  </div>;
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="bg-ink-950 px-5 py-6"><p className="label text-[0.55rem] text-bone-400">{label}</p><p className="mt-2 font-display text-4xl text-bone-100">{value}</p></div>; }
function MetricRow({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between gap-5 py-4"><span className="text-sm text-bone-300">{label}</span><span className="font-display text-2xl text-gold-400">{value}</span></div>; }
