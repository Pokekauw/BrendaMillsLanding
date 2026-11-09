import { useEffect, useRef, useState } from "react";
import { ADMIN_UNAUTHORIZED_EVENT, adminRequest } from "@/lib/adminApi";
import VisitorDashboard from "@/components/VisitorDashboard";
import CloudStats from "@/components/CloudStats";

type AuthState = "checking" | "locked" | "authenticated";

export default function AdminPanel() {
  const [open, setOpen] = useState(false);
  const [auth, setAuth] = useState<AuthState>("locked");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<"visits" | "counters">("visits");
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const expire = () => { setAuth("locked"); setPassword(""); setError("Din adminsession er udløbet. Log ind igen for at se besøgsdata."); };
    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, expire);
    return () => window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, expire);
  }, []);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAuth("checking"); setError("");
    adminRequest<{ authenticated: boolean }>("session").then(() => { if (!cancelled) setAuth("authenticated"); }).catch((caught) => {
      if (cancelled) return;
      setAuth("locked");
      if (caught.status !== 401) setError(caught.message);
    });
    return () => { cancelled = true; };
  }, [open]);
  useEffect(() => {
    if (!open || auth !== "authenticated") return;
    const timer = window.setInterval(() => {
      adminRequest("session").catch((caught) => {
        if (caught.status === 401) { setAuth("locked"); setPassword(""); setError("Din adminsession er udløbet. Log ind igen."); }
      });
    }, 60000);
    return () => window.clearInterval(timer);
  }, [open, auth]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab") return;
      const elements = dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]");
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", keydown); trigger.current?.focus(); };
  }, [open]);

  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setError("");
    try {
      await adminRequest("login", { method: "POST", body: { password } });
      setPassword("");
      if (alive.current) { setAuth("authenticated"); setTab("visits"); }
    } catch (caught) { if (alive.current) setError(caught instanceof Error ? caught.message : "Login fejlede."); }
    finally { if (alive.current) { setSubmitting(false); setPassword(""); } }
  };
  const logout = async () => {
    setSubmitting(true);
    try { await adminRequest("logout", { method: "POST" }); }
    catch { /* The cookie is HttpOnly; a network failure is surfaced below. */ setError("Forbindelsen fejlede. Prøv at logge ud igen."); setSubmitting(false); return; }
    setAuth("locked"); setPassword(""); setSubmitting(false); setError("");
  };

  return <>
    <button ref={trigger} type="button" onClick={() => setOpen(true)} className="fixed right-4 bottom-4 z-40 border border-gold-500/25 bg-ink-950/85 px-3 py-2 text-[0.58rem] tracking-[0.18em] text-bone-400 uppercase backdrop-blur-sm transition-colors hover:border-gold-400/70 hover:text-bone-100">Admin</button>
    {open && <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/85 px-3 py-6 backdrop-blur-sm sm:px-8 sm:py-8" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="admin-title" className="relative mx-auto w-full max-w-7xl border border-gold-500/25 bg-ink-900 shadow-[0_30px_110px_-35px_rgba(192,32,58,0.65)]">
        <button type="button" onClick={() => setOpen(false)} aria-label="Luk admin" className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center border border-gold-500/25 bg-ink-900 text-xl text-bone-300 hover:border-blood-500 hover:text-bone-100">×</button>
        {auth !== "authenticated" ? <div className="mx-auto max-w-md px-7 py-16 sm:px-10">
          <span className="label text-[0.58rem] text-blood-400">Privat område</span>
          <h2 id="admin-title" className="mt-4 font-display text-5xl text-bone-100 italic">Admin login</h2>
          <p className="mt-4 text-sm leading-relaxed text-bone-400">Log ind for at se besøgslog, IP-adresser, omtrentlig lokation, enheder og statistik.</p>
          {auth === "checking" ? <p role="status" className="mt-8 text-sm text-gold-300">Kontrollerer adminsession…</p> : <form onSubmit={(event) => void login(event)} className="mt-8">
            <label htmlFor="admin-password" className="label text-[0.58rem] text-bone-400">Adgangskode</label>
            <input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" autoFocus maxLength={256} required placeholder="Indtast admin-koden" className="mt-3 w-full border border-gold-500/25 bg-ink-950 px-4 py-3 text-bone-100 outline-none focus:border-blood-500" />
            <button type="submit" disabled={submitting || !password} className="mt-6 inline-flex border border-blood-500/60 bg-blood-700 px-6 py-3 text-[0.68rem] font-medium tracking-[0.2em] text-bone-100 uppercase hover:bg-blood-600 disabled:opacity-50">{submitting ? "Logger ind…" : "Åbn dashboard"}</button>
          </form>}
          {error && <p role="alert" className="mt-5 text-sm leading-relaxed text-blood-300">{error}</p>}
          <p className="mt-8 text-xs leading-relaxed text-bone-500">Adgang kontrolleres på serveren. Besøgsdata hentes først efter godkendt login. Sessionscookies er HttpOnly og beskyttet mod cross-site requests.</p>
        </div> : <div className="px-5 py-9 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-5 border-b border-gold-500/15 pb-6 pr-8 sm:flex-row sm:items-end sm:justify-between">
            <div><span className="label text-[0.58rem] text-blood-400">Privat område · Serverbeskyttet</span><h2 id="admin-title" className="mt-3 font-display text-4xl text-bone-100 italic sm:text-5xl">Besøgsindsigt</h2><p className="mt-2 text-xs text-bone-400">Brenda Mills · IP, lokation, enheder og aktivitet</p></div>
            <button type="button" onClick={() => void logout()} disabled={submitting} className="w-fit border border-gold-500/25 px-4 py-2 text-[0.62rem] tracking-[0.15em] text-bone-400 uppercase hover:border-gold-400 hover:text-bone-100 disabled:opacity-50">{submitting ? "Logger ud…" : "Log ud"}</button>
          </div>
          <div role="tablist" aria-label="Statistikvisning" className="mt-6 flex gap-6 border-b border-gold-500/15">
            <button id="visits-tab" type="button" role="tab" aria-selected={tab === "visits"} aria-controls="visits-panel" onClick={() => setTab("visits")} className={`border-b-2 pb-3 text-xs tracking-wider ${tab === "visits" ? "border-gold-400 text-gold-300" : "border-transparent text-bone-500 hover:text-bone-200"}`}>Besøg & enheder</button>
            <button id="counters-tab" type="button" role="tab" aria-selected={tab === "counters"} aria-controls="counters-panel" onClick={() => setTab("counters")} className={`border-b-2 pb-3 text-xs tracking-wider ${tab === "counters" ? "border-gold-400 text-gold-300" : "border-transparent text-bone-500 hover:text-bone-200"}`}>Globale kliktællere</button>
          </div>
          <div id={tab === "visits" ? "visits-panel" : "counters-panel"} role="tabpanel" aria-labelledby={tab === "visits" ? "visits-tab" : "counters-tab"}>{tab === "visits" ? <VisitorDashboard /> : <CloudStats />}</div>
          <p className="mt-8 border-t border-gold-500/15 pt-5 text-[0.65rem] leading-relaxed text-bone-500">Besøgsloggen opdaterer automatisk hvert minut og forsvinder fra visningen ved logout. Kun den eksisterende, anonyme kliktæller-service er offentlig; IP-adresser og besøgsdetaljer gemmes ikke der.</p>
        </div>}
      </div>
    </div>}
  </>;
}
