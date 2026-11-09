import Nav from "@/components/Nav";
import WhoIsShe from "@/components/WhoIsShe";
import MyWeakness from "@/components/MyWeakness";
import Investments from "@/components/Investments";
import AdminPanel from "@/components/AdminPanel";
import ChatWithMe from "@/components/ChatWithMe";
import PrivacyNotice from "@/components/PrivacyNotice";
import { trackVisitorEvent } from "@/lib/visitorTracker";
import { useEffect } from "react";
import { flushPendingHits, recordVisit } from "@/lib/analytics";

export default function App() {
  useEffect(() => {
    // Counts this page load in the global cloud counter, and retries any hit that
    // could not be delivered earlier (offline visitors, short outages).
    recordVisit();
    void flushPendingHits();

    const retryQueuedHits = () => void flushPendingHits();
    window.addEventListener("online", retryQueuedHits);
    const seen = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target.id)) continue;
        seen.add(entry.target.id);
        trackVisitorEvent("section_view", entry.target.id);
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.35 });
    for (const id of ["who-am-i", "my-weakness", "investments", "chat-with-me"]) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => {
      window.removeEventListener("online", retryQueuedHits);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="grain vignette relative min-h-screen bg-ink-950 selection:bg-blood-600">
      <Nav />
      <main>
        <WhoIsShe />
        <MyWeakness />
        <Investments />
        <ChatWithMe />
      </main>
      <PrivacyNotice />
      <AdminPanel />
    </div>
  );
}
