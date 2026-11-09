import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BreakdownItem, Visit, VisitorEvent, VisitorLogResponse } from "../../shared/visitors";
import { adminRequest, downloadVisitorCsv } from "@/lib/adminApi";

const PAGE_SIZE = 25;
const deviceLabels: Record<string, string> = { desktop: "Computer", mobile: "Mobil", tablet: "Tablet", bot: "Bot/crawler", other: "Anden enhed", Unknown: "Ukendt" };
const eventLabels: Record<string, string> = { page_view: "Side åbnet", section_view: "Sektion set", referral_click: "Referral-link klikket", image_view: "Billede åbnet", image_download: "Download klikket" };
const geoLabels: Record<string, string> = { pending: "Lokation slås op…", unavailable: "Ikke tilgængelig", disabled: "IP-opslag slået fra", local: "Lokal/private IP", error: "IP-opslag fejlede" };
const formatDate = (value: number) => new Date(value).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "medium" });
function duration(seconds: number) { return seconds >= 60 ? `${Math.floor(seconds / 60)} min ${seconds % 60} sek.` : `${seconds} sek.`; }
const buttonClass = "border border-gold-500/30 px-4 py-2 text-[0.62rem] tracking-[0.12em] text-gold-300 uppercase transition-colors hover:border-gold-300 hover:bg-gold-500/10 disabled:cursor-not-allowed disabled:opacity-45";
const selectClass = "border border-gold-500/25 bg-ink-950 px-3 py-2.5 text-xs text-bone-200 outline-none focus:border-gold-400";

export default function VisitorDashboard() {
  const [data, setData] = useState<VisitorLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("7d");
  const [device, setDevice] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ visit: Visit; events: VisitorEvent[] } | null>(null);
  const [detailError, setDetailError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const mounted = useRef(true);
  const revision = useRef(0);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current += 1; }; }, []);
  useEffect(() => { const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(0); }, 300); return () => window.clearTimeout(timer); }, [search]);
  const params = useMemo(() => {
    const value = new URLSearchParams({ period, limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (query) value.set("q", query);
    if (device) value.set("device", device);
    return value;
  }, [period, page, query, device]);
  const load = useCallback(async (background = false) => {
    const current = ++revision.current;
    if (!background) setLoading(true);
    try {
      const result = await adminRequest<VisitorLogResponse>(`visits?${params}`);
      if (!mounted.current || current !== revision.current) return;
      setData(result); setError("");
      if (page > 0 && result.total <= page * PAGE_SIZE) setPage(Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1));
    } catch (caught) {
      if (!mounted.current || current !== revision.current) return;
      setError(caught instanceof Error ? caught.message : "Besøgsloggen kunne ikke hentes.");
    } finally { if (mounted.current && current === revision.current) setLoading(false); }
  }, [params, page]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => void load(true), 60000); return () => window.clearInterval(timer); }, [load]);

  const showDetail = async (id: string) => {
    if (selected === id) { setSelected(null); setDetail(null); return; }
    setSelected(id); setDetail(null); setDetailError("");
    try {
      const result = await adminRequest<{ visit: Visit; events: VisitorEvent[] }>(`visits/${encodeURIComponent(id)}`);
      if (mounted.current) setDetail(result);
    } catch (caught) { if (mounted.current) setDetailError(caught instanceof Error ? caught.message : "Detaljerne kunne ikke hentes."); }
  };
  const remove = async (id?: string) => {
    const confirmation = id
      ? window.confirm("Slet dette besøg og dets hændelser permanent?")
      : window.prompt("Dette sletter HELE besøgsloggen, inklusive demo-rækker og IP-cache. Skriv DELETE VISITOR LOG for at bekræfte. Globale kliktællere bevares.");
    if (!confirmation || (!id && confirmation !== "DELETE VISITOR LOG")) return;
    setBusy(true); setNotice("");
    try {
      await adminRequest(id ? `visits/${encodeURIComponent(id)}` : "visits", { method: "DELETE", ...(id ? {} : { body: { confirm: confirmation } }) });
      setSelected(null); setDetail(null); setPage(0);
      setNotice(id ? "Besøget er slettet." : "Besøgsloggen er slettet. Nye besøg registreres igen, hvis logning er slået til.");
      await load(true);
    } catch (caught) { if (mounted.current) setNotice(caught instanceof Error ? caught.message : "Sletning fejlede."); }
    finally { if (mounted.current) setBusy(false); }
  };
  const exportCsv = async () => {
    setBusy(true); setNotice("");
    try { await downloadVisitorCsv(params.toString()); setNotice("CSV-eksporten er hentet. Den indeholder personoplysninger — opbevar den sikkert."); }
    catch (caught) { if (mounted.current) setNotice(caught instanceof Error ? caught.message : "Eksporten fejlede."); }
    finally { if (mounted.current) setBusy(false); }
  };
  const summary = data?.summary;

  return <div className="mt-7">
    {data?.demo && <p className="mb-5 border border-gold-500/35 bg-gold-500/8 px-4 py-3 text-xs leading-relaxed text-gold-300"><strong>Forhåndsvisning med demo-data.</strong> Eksempelbesøgene er fiktive og mærket “DEMO”. Denne previews database ligger i hukommelsen og nulstilles ved genstart. Produktionsloggen er serverbeskyttet og separat.</p>}
    {data?.capacityReached && <p role="alert" className="mb-5 border border-blood-500/40 bg-blood-500/8 px-4 py-3 text-xs text-blood-300">Loggens pladsgrænse er nået. Nye besøg afvises midlertidigt; slet gamle poster eller hæv VISITOR_LOG_MAX_ROWS på serveren.</p>}
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-1 flex-wrap gap-3">
        <label className="min-w-52 flex-1"><span className="sr-only">Søg i besøgsloggen</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søg IP, by, land, browser, netværk…" className="w-full border border-gold-500/25 bg-ink-950 px-4 py-2.5 text-sm text-bone-100 outline-none placeholder:text-bone-500 focus:border-gold-400" /></label>
        <label><span className="sr-only">Periode</span><select value={period} onChange={(event) => { setPeriod(event.target.value); setPage(0); }} className={selectClass}><option value="24h">Seneste 24 timer</option><option value="7d">Seneste 7 dage</option><option value="30d">Seneste 30 dage</option><option value="all">Hele logperioden</option></select></label>
        <label><span className="sr-only">Enhedstype</span><select value={device} onChange={(event) => { setDevice(event.target.value); setPage(0); }} className={selectClass}><option value="">Alle enheder</option>{Object.entries(deviceLabels).filter(([key]) => key !== "Unknown").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void load()} disabled={loading} className={buttonClass}>{loading ? "Henter…" : "Opdater"}</button><button type="button" onClick={() => void exportCsv()} disabled={busy || !data?.total} className={buttonClass}>Eksportér CSV</button><button type="button" onClick={() => void remove()} disabled={busy || !data?.total} className="border border-blood-500/40 px-4 py-2 text-[0.62rem] tracking-[0.12em] text-blood-300 uppercase hover:bg-blood-500/10 disabled:opacity-40">Slet log</button></div>
    </div>
    {error && <p role="alert" className="mt-4 border-l-2 border-blood-500 pl-4 text-sm leading-relaxed text-blood-300">{error}</p>}
    {notice && <p role="status" className="mt-4 border-l-2 border-gold-500/50 pl-4 text-xs leading-relaxed text-bone-300">{notice}</p>}
    {summary && <div className="mt-6 grid gap-px bg-gold-500/15 sm:grid-cols-2 lg:grid-cols-5">
      <Stat label="Besøg i udvalg" value={summary.visits.toLocaleString("da-DK")} />
      <Stat label="Unikke IP'er" value={summary.uniqueIps.toLocaleString("da-DK")} note="Ikke nødvendigvis unikke personer" />
      <Stat label="Aktive nu" value={String(summary.activeNow)} note="Heartbeat inden for 45 sekunder" />
      <Stat label="Gennemsnitlig aktiv tid" value={duration(summary.averageActiveSeconds)} />
      <Stat label="Mobil/tablet" value={`${summary.mobileShare}%`} />
    </div>}
    {summary && <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><Breakdown title="Lande (IP-estimat)" items={summary.countries} /><Breakdown title="Enheder" items={summary.devices} labels={deviceLabels} /><Breakdown title="Browsere" items={summary.browsers} /><Breakdown title="Kilder" items={summary.sources} /></div>}
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3"><h3 className="font-display text-3xl text-bone-100">Besøgslog</h3><p className="text-xs text-bone-400">{data ? `${data.total} besøg matcher udvalget` : "Ingen data hentet endnu"}{loading && data ? " · opdaterer…" : ""}</p></div>
    <div className="mt-4 overflow-x-auto border border-gold-500/20">
      <table className="w-full min-w-[1000px] text-left text-xs">
        <thead className="bg-ink-950 text-[0.58rem] tracking-[0.13em] text-bone-400 uppercase"><tr>{["Tidspunkt", "IP-adresse", "Lokation", "Enhed / browser", "Kilde", "Aktiv tid", "Status", ""].map((label, index) => <th key={index} scope="col" className="px-4 py-4 font-medium">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-gold-500/12">
          {data?.visits.map((visit) => {
            const active = data.generatedAt - visit.lastSeenAt < 45000;
            return <VisitRow key={visit.id} visit={visit} active={active} expanded={selected === visit.id} onToggle={() => void showDetail(visit.id)} detail={selected === visit.id ? detail : null} detailError={selected === visit.id ? detailError : ""} onDelete={() => void remove(visit.id)} busy={busy} />;
          })}
          {!data?.visits.length && <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-bone-400">{loading ? "Henter besøgsloggen fra serveren…" : error ? "Ingen besøgsdata at vise." : "Ingen besøg matcher dine filtre."}</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-bone-400"><span>Side {page + 1} af {Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))} · {PAGE_SIZE} besøg pr. side</span><div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0 || loading} className={buttonClass}>Forrige</button><button type="button" onClick={() => setPage((value) => value + 1)} disabled={!data || (page + 1) * PAGE_SIZE >= data.total || loading} className={buttonClass}>Næste</button></div></div>
    <div className="mt-7 border border-gold-500/20 bg-ink-950/60 p-4 text-xs leading-relaxed text-bone-400"><p><strong className="text-bone-200">Om målingerne:</strong> Aktiv tid tæller kun mens siden er synlig. “Sidste aktivitet” er seneste heartbeat, ikke et præcist lukketidspunkt. IP-lokation er et omtrentligt netværksestimat — aldrig en præcis adresse. Enhedsmodel kan være skjult eller upræcis i browserens user-agent.</p><p className="mt-2">Loggen slettes automatisk efter {data?.retentionDays ?? "…"} dage. {data?.geoEnabled ? `IP-opslag bruger ${data.geoProvider}; private/lokale adresser slås ikke op.` : "IP-lokationsopslag er slået fra i serverkonfigurationen."} CSV-eksporten omfatter højst 10.000 besøg i det valgte udvalg.</p></div>
  </div>;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) { return <div className="bg-ink-950 px-4 py-5"><p className="label text-[0.52rem] text-bone-400">{label}</p><p className="mt-3 font-display text-3xl text-bone-100">{value}</p>{note && <p className="mt-2 text-[0.6rem] leading-relaxed text-bone-500">{note}</p>}</div>; }
function Breakdown({ title, items, labels = {} }: { title: string; items: BreakdownItem[]; labels?: Record<string, string> }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return <section className="border border-gold-500/15 bg-ink-950/50 p-4"><h4 className="text-xs font-medium text-bone-200">{title}</h4><div className="mt-4 space-y-3">{items.length ? items.map((item) => <div key={item.label}><div className="mb-1 flex justify-between gap-3 text-[0.65rem] text-bone-400"><span className="truncate">{labels[item.label] || (item.label === "Unknown" ? "Ukendt" : item.label)}</span><span className="text-gold-300">{item.count}</span></div><div className="h-1 bg-ink-700"><div className="h-full bg-gold-500/65" style={{ width: `${item.count / max * 100}%` }} /></div></div>) : <p className="text-xs text-bone-500">Ingen data endnu.</p>}</div></section>;
}
function VisitRow({ visit, active, expanded, onToggle, detail, detailError, onDelete, busy }: { visit: Visit; active: boolean; expanded: boolean; onToggle: () => void; detail: { visit: Visit; events: VisitorEvent[] } | null; detailError: string; onDelete: () => void; busy: boolean }) {
  return <>
    <tr className="bg-ink-900/60 transition-colors hover:bg-ink-850">
      <td className="whitespace-nowrap px-4 py-4 text-bone-300">{formatDate(visit.startedAt)}{visit.demo && <span className="mt-2 block text-[0.55rem] tracking-widest text-gold-400">DEMO · FIKTIVT</span>}</td>
      <td className="px-4 py-4 font-mono text-bone-200">{visit.ip}{visit.lastIp !== visit.ip && <span className="mt-1 block max-w-40 break-all text-[0.6rem] text-bone-400">Seneste: {visit.lastIp}</span>}</td>
      <td className="px-4 py-4 text-bone-300">{visit.geoStatus === "ready" ? <><span className="block">{[visit.city, visit.country || visit.countryCode].filter(Boolean).join(", ") || "Ukendt område"}</span><span className="mt-1 block text-[0.6rem] text-bone-500">IP-estimat{visit.region ? ` · ${visit.region}` : ""}</span></> : <span className="text-bone-500">{geoLabels[visit.geoStatus] || "Ukendt"}</span>}</td>
      <td className="px-4 py-4 text-bone-300"><span className="block text-bone-200">{deviceLabels[visit.deviceType]}{visit.deviceModel ? ` · ${visit.deviceModel}` : ""}</span><span className="mt-1 block text-[0.65rem] text-bone-400">{visit.browser} {visit.browserVersion?.split(".")[0]} · {visit.os} {visit.osVersion || ""}</span></td>
      <td className="max-w-40 break-words px-4 py-4 text-bone-300">{visit.source}</td>
      <td className="whitespace-nowrap px-4 py-4 text-gold-300">{duration(visit.activeSeconds)}</td>
      <td className="whitespace-nowrap px-4 py-4"><span className={active ? "text-gold-300" : "text-bone-500"}><span aria-hidden className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${active ? "bg-gold-400" : "bg-bone-500"}`} />{active ? "Aktiv nu" : "Set sidst"}</span><span className="mt-1 block text-[0.6rem] text-bone-500">{new Date(visit.lastSeenAt).toLocaleTimeString("da-DK")}</span></td>
      <td className="px-4 py-4"><button type="button" onClick={onToggle} aria-expanded={expanded} className="border border-gold-500/25 px-3 py-2 text-[0.6rem] text-gold-300 hover:border-gold-400">{expanded ? "Skjul" : "Detaljer"}</button></td>
    </tr>
    {expanded && <tr><td colSpan={8} className="border-t border-gold-500/20 bg-ink-950 px-5 py-6">{detailError ? <p role="alert" className="text-sm text-blood-300">{detailError}</p> : detail ? <VisitDetail visit={detail.visit} events={detail.events} onDelete={onDelete} busy={busy} /> : <p className="text-sm text-bone-400">Henter detaljer…</p>}</td></tr>}
  </>;
}
function VisitDetail({ visit, events, onDelete, busy }: { visit: Visit; events: VisitorEvent[]; onDelete: () => void; busy: boolean }) {
  return <div className="grid gap-8 lg:grid-cols-2">
    <div><div className="flex items-center justify-between gap-4"><h4 className="font-display text-2xl text-bone-100">Tekniske detaljer</h4><button type="button" onClick={onDelete} disabled={busy} className="border border-blood-500/40 px-3 py-2 text-[0.6rem] tracking-wider text-blood-300 uppercase disabled:opacity-40">Slet dette besøg</button></div>
      <dl className="mt-4 grid grid-cols-[130px_1fr] gap-x-4 gap-y-3 text-xs leading-relaxed">
        <Field label="Første besøg" value={formatDate(visit.startedAt)} /><Field label="Sidste aktivitet" value={formatDate(visit.lastSeenAt)} /><Field label="Aktiv tid" value={duration(visit.activeSeconds)} /><Field label="IP / seneste IP" value={`${visit.ip}${visit.lastIp !== visit.ip ? ` → ${visit.lastIp}` : ""}`} mono />
        <Field label="Lokation" value={[visit.city, visit.region, visit.country].filter(Boolean).join(", ") || geoLabels[visit.geoStatus]} /><Field label="Netværk / ASN" value={[visit.network, visit.asn].filter(Boolean).join(" · ") || "Ikke tilgængeligt"} /><Field label="Enhed" value={[deviceLabels[visit.deviceType], visit.deviceVendor, visit.deviceModel].filter(Boolean).join(" · ")} /><Field label="Browser / OS" value={`${visit.browser} ${visit.browserVersion || ""} · ${visit.os} ${visit.osVersion || ""}`} />
        <Field label="Sprog / tidszone" value={[visit.language, visit.timezone].filter(Boolean).join(" · ") || "Ikke oplyst"} /><Field label="Viewport" value={visit.viewportWidth ? `${visit.viewportWidth} × ${visit.viewportHeight} px` : "Ikke oplyst"} /><Field label="Landingsside" value={visit.landingPath} mono /><Field label="Henvisning" value={visit.referrer || "Direkte / ikke oplyst"} /><Field label="UTM" value={[visit.utmSource, visit.utmMedium, visit.utmCampaign].filter(Boolean).join(" / ") || "Ingen"} />
      </dl>
      {visit.latitude !== null && visit.longitude !== null && <a href={`https://www.openstreetmap.org/?mlat=${visit.latitude}&mlon=${visit.longitude}#map=10/${visit.latitude}/${visit.longitude}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-xs text-gold-300 underline underline-offset-4">Se omtrentligt IP-område på kort ↗</a>}
      <p className="mt-4 break-all font-mono text-[0.62rem] leading-relaxed text-bone-500">User-agent: {visit.userAgent || "Ikke oplyst"}</p>
    </div>
    <div><h4 className="font-display text-2xl text-bone-100">Hændelser</h4><p className="mt-1 text-[0.65rem] text-bone-500">Servermodtagne klik og sidevisninger · op til 500 pr. besøg</p><ol className="mt-4 max-h-96 space-y-3 overflow-y-auto border-l border-gold-500/25 pl-5">{events.length ? events.map((event) => <li key={event.id} className="relative text-xs"><span aria-hidden className="absolute -left-[23px] top-1 h-1 w-1 rounded-full bg-gold-400" /><span className="text-bone-200">{eventLabels[event.type]}</span>{event.target && <span className="ml-2 text-gold-300">{event.target}</span>}<span className="mt-1 block text-[0.62rem] text-bone-500">{formatDate(event.occurredAt)} · {event.path}</span></li>) : <li className="text-xs text-bone-500">Ingen hændelser registreret for dette besøg.</li>}</ol></div>
  </div>;
}
function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <><dt className="text-bone-500">{label}</dt><dd className={`break-words text-bone-300 ${mono ? "font-mono" : ""}`}>{value}</dd></>; }
