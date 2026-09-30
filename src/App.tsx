import Nav from "@/components/Nav";
import WhoIsShe from "@/components/WhoIsShe";
import MyWeakness from "@/components/MyWeakness";
import Investments from "@/components/Investments";
import AdminPanel from "@/components/AdminPanel";
import ChatWithMe from "@/components/ChatWithMe";
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
    return () => window.removeEventListener("online", retryQueuedHits);
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
      <AdminPanel />
    </div>
  );
}
