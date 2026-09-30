import { COINBASE_REFERRAL_URL, INVESTMENTS_IMAGE_URL } from "@/content";
import { Reveal } from "@/components/ui";
import { trackReferral } from "@/lib/analytics";

const allocation = [
  { label: "Property", value: "45%", width: "45%", tone: "bg-gold-400" },
  { label: "S&P 500", value: "17%", width: "17%", tone: "bg-blood-400" },
  { label: "Gold", value: "15%", width: "15%", tone: "bg-gold-600" },
  { label: "Bitcoin", value: "12%", width: "12%", tone: "bg-blood-600" },
  {
    label: "Cash on hand for arbitrage plays",
    value: "~10%",
    width: "10%",
    tone: "bg-bone-200",
  },
];

export default function Investments() {
  return (
    <section
      id="investments"
      className="relative scroll-mt-24 overflow-hidden border-t border-gold-500/10 py-20 sm:py-28"
    >
      <div className="absolute inset-0">
        <img
          src={INVESTMENTS_IMAGE_URL}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover object-center scale-[1.04]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-ink-950/48" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/88 via-ink-950/48 to-ink-950/18" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/65 via-transparent to-ink-950/15" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(155,27,46,0.2),transparent_50%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
          <div>
            <Reveal>
              <span className="label text-[0.6rem] text-blood-400">Brenda's investments</span>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="mt-5 font-display text-5xl leading-[0.95] font-light text-bone-100 sm:text-7xl">
                I like my money
                <span className="block italic text-gold-400">working.</span>
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <div className="mt-8 border border-[#1652f0]/35 bg-ink-950/35 px-5 py-5 backdrop-blur-sm shadow-[0_18px_45px_-30px_rgba(22,82,240,0.65)] sm:px-6">
                <p className="label text-[0.55rem] text-[#78a2ff]">Coinbase referral</p>
                <p className="mt-3 font-display text-2xl leading-tight text-bone-100 sm:text-3xl">
                  Direct access to S&amp;P 500, Gold, Bitcoin &amp; more.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-bone-200/85">
                  Explore big assets in one place, depending on your region and
                  product availability.
                </p>
                <a
                  href={COINBASE_REFERRAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackReferral("coinbase")}
                  className="sheen mt-5 inline-flex items-center justify-center gap-2 border border-[#4d7dff] bg-[#1652f0] px-5 py-3 text-[0.68rem] font-medium tracking-[0.16em] text-white uppercase shadow-[0_14px_30px_-18px_rgba(22,82,240,0.95)] transition-all duration-300 hover:border-[#83a5ff] hover:bg-[#2864ff] hover:shadow-[0_18px_36px_-16px_rgba(22,82,240,0.95)]"
                >
                  Sign up for Coinbase
                  <span aria-hidden>-&gt;</span>
                </a>
                <p className="mt-4 text-[0.62rem] leading-relaxed text-blue-100/65">
                  Referral link. Fees and availability vary by region, product,
                  order type, and volume.
                </p>
              </div>
            </Reveal>
          </div>

          <Reveal delay={180}>
            <div className="p-0 sm:p-2">
              <div className="flex items-end justify-between gap-5 border-b border-gold-500/15 pb-5">
                <div>
                  <p className="label text-[0.55rem] text-gold-400">Current allocation</p>
                  <h3 className="mt-2 font-display text-3xl text-bone-100 sm:text-4xl">
                    My portfolio
                  </h3>
                </div>
                <span className="font-display text-2xl text-bone-400">~99%</span>
              </div>

              <div className="mt-8 flex h-3 overflow-hidden bg-ink-700">
                {allocation.map((item) => (
                  <span
                    key={item.label}
                    className={`${item.tone} h-full border-r border-ink-950/50 last:border-r-0`}
                    style={{ width: item.width }}
                    title={`${item.label}: ${item.value}`}
                  />
                ))}
              </div>

              <div className="mt-8 divide-y divide-gold-500/12">
                {allocation.map((item, index) => (
                  <div key={item.label} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                    <span className={`h-2.5 w-2.5 shrink-0 rotate-45 ${item.tone}`} />
                    <span className="flex-1 text-sm text-bone-300">{item.label}</span>
                    <span className="font-display text-2xl text-bone-100">{item.value}</span>
                    {index === allocation.length - 1 && (
                      <span className="hidden text-right text-[0.6rem] leading-tight text-bone-400 sm:block sm:w-32">
                        Sports bets,
                        <br />
                        hedges & "sure wins"
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-8 border border-dashed border-gold-500/25 px-5 py-4 text-xs leading-relaxed text-bone-400">
                <span className="font-medium text-bone-200">Important:</span>{" "}
                This is for information only, based on my own portfolio. It is
                not financial advice, an offer, or a recommendation to buy or
                sell anything. Do your own research and speak to a qualified
                financial professional.
              </div>

            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}