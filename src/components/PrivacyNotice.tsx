import { useEffect, useRef, useState } from "react";
import type { PublicTrackingConfig } from "../../shared/visitors";
import { browserSignalsOptOut, hasVisitorOptOut, setVisitorOptOut, VISITOR_PREFERENCE_EVENT } from "@/lib/visitorTracker";

const ACK_KEY = "brenda-mills-privacy-notice-2026-11-08";
function acknowledged() { try { return localStorage.getItem(ACK_KEY) === "1"; } catch { return false; } }

export default function PrivacyNotice() {
  const [config, setConfig] = useState<PublicTrackingConfig | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(acknowledged);
  const [optOut, setOptOut] = useState(hasVisitorOptOut);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/privacy", { signal: controller.signal, cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error("Unavailable");
      return response.json() as Promise<PublicTrackingConfig>;
    }).then(setConfig).catch((error) => { if (error.name !== "AbortError") setUnavailable(true); });
    const update = () => setOptOut(hasVisitorOptOut());
    window.addEventListener(VISITOR_PREFERENCE_EVENT, update);
    return () => { controller.abort(); window.removeEventListener(VISITOR_PREFERENCE_EVENT, update); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab") return;
      const items = dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled)");
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", keydown); trigger.current?.focus(); };
  }, [open]);

  const dismiss = () => { try { localStorage.setItem(ACK_KEY, "1"); } catch { /* Notice can appear again. */ } setDismissed(true); };
  const choose = async (value: boolean) => {
    setSaving(true); setSaveError(""); setOptOut(value);
    await setVisitorOptOut(value);
    setOptOut(hasVisitorOptOut());
    if (!value && !hasVisitorOptOut()) setSaveError("Valget kunne ikke gemmes i denne browser. Privatlivssignaler fra browseren respekteres stadig.");
    setSaving(false);
  };

  return <>
    <footer className="relative z-10 border-t border-gold-500/15 px-5 py-8 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 text-xs text-bone-400 sm:flex-row sm:items-center">
        <p>© {new Date().getFullYear()} Brenda Mills · A fictional persona for storytelling.</p>
        <button ref={trigger} type="button" onClick={() => setOpen(true)} className="text-gold-300 underline decoration-gold-500/40 underline-offset-4 hover:text-gold-100">Privacy & visitor statistics</button>
      </div>
    </footer>
    {!dismissed && !open && config?.enabled && !optOut && <aside aria-label="Visitor statistics notice" className="fixed bottom-16 left-4 z-[65] max-w-[calc(100vw-2rem)] border border-gold-500/30 bg-ink-950/97 p-4 shadow-2xl backdrop-blur-md sm:bottom-4 sm:max-w-sm">
      <p className="label text-[0.55rem] text-gold-400">A note about your privacy</p>
      <p className="mt-2 text-xs leading-relaxed text-bone-300">We log visits, IP addresses, approximate IP-based location and device information to understand site traffic. No GPS, camera or microphone access is requested.</p>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs"><button type="button" onClick={() => setOpen(true)} className="text-gold-300 underline underline-offset-4">Read more & choose</button><button type="button" onClick={() => void choose(true)} disabled={saving} className="text-bone-300 underline underline-offset-4">Only aggregate counts</button><button type="button" onClick={dismiss} aria-label="Dismiss privacy notice" className="ml-auto text-bone-400 hover:text-bone-100">Close</button></div>
    </aside>}
    {open && <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/85 px-4 py-8 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="privacy-title" className="max-h-full w-full max-w-2xl overflow-y-auto border border-gold-500/30 bg-ink-900 p-6 sm:p-9">
        <div className="flex items-start justify-between gap-5"><div><span className="label text-[0.58rem] text-blood-400">Transparency</span><h2 id="privacy-title" className="mt-3 font-display text-4xl text-bone-100">Your visit, your choice.</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close privacy settings" className="border border-gold-500/25 px-3 py-2 text-bone-300 hover:text-bone-100">×</button></div>
        <div className="mt-6 space-y-5 text-sm leading-relaxed text-bone-300">
          <p>This page records <strong className="text-bone-100">visit time, IP address, approximate IP-based location, device/browser information, referring site, pages/sections viewed, active reading time and gallery/referral clicks</strong>. The detailed log is available only through server-authenticated admin access.</p>
          <p>Location is an estimate from the IP address, often the network provider's city. It is not your street address or live GPS position. Device information comes from ordinary browser request headers and basic window/language information; no camera, microphone, contacts, files, keystrokes or advertising identifier is collected.</p>
          {unavailable ? <p className="text-blood-300">The privacy configuration could not be loaded. You can still turn detailed logging off below.</p> : config ? <p>Detailed logs are kept for <strong className="text-bone-100">{config.retentionDays} days</strong> and then deleted automatically. {config.geoEnabled ? `IP location is looked up by ${config.geoProvider}, which receives the IP address from our server.` : "IP location lookup is disabled."} {config.demo && "This preview also contains clearly labelled fictional demonstration visits."}</p> : <p>Loading the current retention and location settings…</p>}
          <p>IP addresses and visit records are personal data. You can ask the site owner about the legal basis, request access or deletion, and lodge a complaint with your data protection authority. Turning off detailed statistics does not affect your access to the page.</p>
          <p>{config?.privacyController && <>Data controller: <strong className="text-bone-100">{config.privacyController}</strong>. </>}{config?.privacyContact ? <>Privacy contact: <strong className="break-all text-bone-100">{config.privacyContact}</strong>. Contact the owner to request access or deletion of older records.</> : "A privacy contact has not been configured for this preview. Do not use this configuration for a public production site."}</p>
          <p className="text-xs text-bone-400">The existing aggregate counters, externally hosted images and Google Fonts still make ordinary network requests to their providers. Turning off detailed logging does not block those providers. This choice is stored in your browser; Global Privacy Control and Do Not Track are also respected.</p>
        </div>
        <div className="mt-7 border border-gold-500/25 bg-ink-950 p-5">
          <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={!optOut} disabled={saving || browserSignalsOptOut() || !config?.enabled} onChange={(event) => void choose(!event.target.checked)} className="mt-1 h-4 w-4 accent-[#b8913f]" /><span><span className="block text-sm text-bone-100">Allow detailed visitor statistics</span><span className="mt-1 block text-xs leading-relaxed text-bone-400">Turn off to delete this browser's current visit session and stop detailed logging. Aggregate click/page counts continue.</span></span></label>
          {browserSignalsOptOut() && <p className="mt-3 text-xs text-gold-300">Your browser's privacy signal is respected; detailed logging is off.</p>}
          {config && !config.enabled && <p className="mt-3 text-xs text-gold-300">Detailed visitor logging is disabled on this server.</p>}
          {saveError && <p role="status" className="mt-3 text-xs text-blood-300">{saveError}</p>}
          {saving && <p role="status" className="mt-3 text-xs text-bone-400">Saving your choice…</p>}
        </div>
        <button type="button" onClick={() => { dismiss(); setOpen(false); }} className="mt-6 border border-gold-500/40 px-5 py-3 text-xs tracking-wider text-gold-300 uppercase hover:bg-gold-500/10">Done</button>
      </div>
    </div>}
  </>;
}
