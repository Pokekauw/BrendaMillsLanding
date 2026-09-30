import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";

/* ------------------------------------------------------------------ */
/*  Reveal on scroll                                                   */
/* ------------------------------------------------------------------ */

export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section" | "span" | "p";
}) {
  const Tag: any = as;
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn("reveal", shown && "is-in", className)}
      style={{ ["--reveal-delay" as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/*  Section heading                                                    */
/* ------------------------------------------------------------------ */

export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = "left",
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      <Reveal>
        <div
          className={cn(
            "mb-5 flex items-center gap-3",
            align === "center" && "justify-center",
          )}
        >
          <span className="h-px w-8 bg-blood-500" />
          <span className="label text-blood-400">{eyebrow}</span>
        </div>
      </Reveal>
      <Reveal delay={90}>
        <h2 className="font-display text-4xl leading-[1.05] font-light text-bone-100 sm:text-5xl md:text-6xl">
          {title}
        </h2>
      </Reveal>
      {intro && (
        <Reveal delay={170}>
          <p className="mt-6 text-base leading-relaxed text-bone-400 sm:text-lg">
            {intro}
          </p>
        </Reveal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Buttons                                                            */
/* ------------------------------------------------------------------ */

export function PrimaryButton({
  href,
  children,
  className,
  target,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  target?: string;
}) {
  return (
    <a
      href={href}
      target={target}
      rel={target === "_blank" ? "noopener noreferrer" : undefined}
      className={cn(
        "sheen group inline-flex items-center justify-center gap-3 rounded-sm bg-gradient-to-b from-blood-500 to-blood-700 px-7 py-4 text-[0.72rem] font-medium tracking-[0.22em] text-bone-100 uppercase shadow-[0_18px_40px_-20px_rgba(192,32,58,0.9)] transition-all duration-300 hover:from-blood-400 hover:to-blood-600 hover:shadow-[0_22px_55px_-18px_rgba(226,58,85,0.85)]",
        className,
      )}
    >
      {children}
    </a>
  );
}

export function GhostButton({
  href,
  children,
  className,
  target,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  target?: string;
}) {
  return (
    <a
      href={href}
      target={target}
      rel={target === "_blank" ? "noopener noreferrer" : undefined}
      className={cn(
        "sheen inline-flex items-center justify-center gap-3 rounded-sm border border-gold-500/35 px-7 py-4 text-[0.72rem] font-medium tracking-[0.22em] text-bone-200 uppercase transition-all duration-300 hover:border-gold-400/70 hover:text-bone-100",
        className,
      )}
    >
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/*  Decorative divider – a riding crop laid across the page            */
/* ------------------------------------------------------------------ */

export function CropDivider({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-4 py-2", className)}>
      <span className="hairline w-24 sm:w-40" />
      <svg
        viewBox="0 0 120 24"
        className="h-5 w-28 text-gold-500/70"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      >
        <path d="M6 12h74" />
        <rect x="80" y="7.5" width="16" height="9" rx="2" />
        <circle cx="4" cy="12" r="2.6" />
        <path d="M100 12h14" />
      </svg>
      <span className="hairline w-24 sm:w-40" />
    </div>
  );
}
