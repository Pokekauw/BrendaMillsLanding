import Nav from "@/components/Nav";
import WhoIsShe from "@/components/WhoIsShe";
import MyWeakness from "@/components/MyWeakness";
import Investments from "@/components/Investments";
import AdminPanel from "@/components/AdminPanel";
import ChatWithMe from "@/components/ChatWithMe";
import { useEffect } from "react";
import { recordVisit } from "@/lib/analytics";

export default function App() {
  useEffect(() => {
    recordVisit();
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
