import { useEffect, useState } from "react";
import { cn } from "@/utils/cn";
import { FACEBOOK_URL } from "@/content";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-500",
          scrolled
            ? "border-b border-gold-500/10 bg-ink-950/85 py-3 backdrop-blur-md"
            : "py-6",
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 sm:px-8">
          <a href="#who-am-i" className="group flex items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center border border-gold-500/40 text-gold-400 transition-colors duration-300 group-hover:border-gold-400">
              <span className="font-display text-lg leading-none">BM</span>
              <span className="absolute -top-px -left-px h-2 w-2 border-t border-l border-blood-500" />
              <span className="absolute -right-px -bottom-px h-2 w-2 border-r border-b border-blood-500" />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-xl tracking-wide text-bone-100">
                Brenda Mills
              </span>
              <span className="label block text-[0.55rem] text-blood-400">
                Official Page
              </span>
            </span>
          </a>

          <nav className="hidden items-center gap-8 lg:flex">
            <a
              href="#who-am-i"
              className="group relative text-[0.7rem] font-medium tracking-[0.18em] text-bone-400 uppercase transition-colors duration-300 hover:text-bone-100"
            >
              Who Am I
              <span className="absolute -bottom-2 left-0 h-px w-0 bg-blood-500 transition-all duration-300 group-hover:w-full" />
            </a>
            <a
              href="#my-weakness"
              className="group relative text-[0.7rem] font-medium tracking-[0.18em] text-bone-400 uppercase transition-colors duration-300 hover:text-bone-100"
            >
              My Weakness
              <span className="absolute -bottom-2 left-0 h-px w-0 bg-blood-500 transition-all duration-300 group-hover:w-full" />
            </a>
            <a
              href="#investments"
              className="group relative text-[0.7rem] font-medium tracking-[0.18em] text-bone-400 uppercase transition-colors duration-300 hover:text-bone-100"
            >
              Investments
              <span className="absolute -bottom-2 left-0 h-px w-0 bg-blood-500 transition-all duration-300 group-hover:w-full" />
            </a>
            <a
              href="#chat-with-me"
              className="group relative text-[0.7rem] font-medium tracking-[0.18em] text-bone-400 uppercase transition-colors duration-300 hover:text-bone-100"
            >
              Chat with me
              <span className="absolute -bottom-2 left-0 h-px w-0 bg-blood-500 transition-all duration-300 group-hover:w-full" />
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href={FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="sheen hidden items-center gap-2 rounded-sm border border-gold-500/30 px-5 py-3 text-[0.65rem] font-medium tracking-[0.2em] text-bone-200 uppercase transition-colors duration-300 hover:border-gold-400/70 hover:text-bone-100 sm:inline-flex"
            >
              <FbIcon className="h-3.5 w-3.5" />
              Subscribe
            </a>

            <button
              aria-label="Menu"
              onClick={() => setOpen((v) => !v)}
              className="flex h-10 w-10 flex-col items-center justify-center gap-[5px] border border-gold-500/25 lg:hidden"
            >
              <span
                className={cn(
                  "h-px w-4 bg-bone-200 transition-all duration-300",
                  open && "translate-y-[6px] rotate-45",
                )}
              />
              <span
                className={cn(
                  "h-px w-4 bg-bone-200 transition-all duration-300",
                  open && "opacity-0",
                )}
              />
              <span
                className={cn(
                  "h-px w-4 bg-bone-200 transition-all duration-300",
                  open && "-translate-y-[6px] -rotate-45",
                )}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 flex flex-col justify-center bg-ink-950/97 px-8 transition-all duration-500 lg:hidden",
          open ? "visible opacity-100" : "invisible opacity-0",
        )}
      >
        <div className="glow-blood pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full opacity-50" />
        <nav className="relative flex flex-col gap-6">
          <a
            href="#who-am-i"
            onClick={() => setOpen(false)}
            className="font-display text-3xl text-bone-200 transition-colors hover:text-blood-400"
          >
            <span className="mr-3 align-middle text-xs tracking-[0.3em] text-gold-500/60">
              01
            </span>
            Who Am I
          </a>
          <a
            href="#my-weakness"
            onClick={() => setOpen(false)}
            className="font-display text-3xl text-bone-200 transition-colors hover:text-blood-400"
          >
            <span className="mr-3 align-middle text-xs tracking-[0.3em] text-gold-500/60">
              02
            </span>
            My Weakness
          </a>
          <a
            href="#investments"
            onClick={() => setOpen(false)}
            className="font-display text-3xl text-bone-200 transition-colors hover:text-blood-400"
          >
            <span className="mr-3 align-middle text-xs tracking-[0.3em] text-gold-500/60">
              03
            </span>
            Investments
          </a>
          <a
            href="#chat-with-me"
            onClick={() => setOpen(false)}
            className="font-display text-3xl text-bone-200 transition-colors hover:text-blood-400"
          >
            <span className="mr-3 align-middle text-xs tracking-[0.3em] text-gold-500/60">
              04
            </span>
            Chat with me
          </a>
          <a
            href={FACEBOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex w-fit items-center gap-2 border border-gold-500/30 px-6 py-4 text-[0.68rem] tracking-[0.2em] text-bone-100 uppercase"
          >
            <FbIcon className="h-3.5 w-3.5" /> Subscribe on Facebook
          </a>
        </nav>
      </div>
    </>
  );
}

export function FbIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.19 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22c4.78-.75 8.44-4.92 8.44-9.94Z" />
    </svg>
  );
}
