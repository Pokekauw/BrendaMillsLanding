import {
  HEALTH_PRODUCT_IMAGE_URL,
  HEALTH_PRODUCT_URL,
  WEAKNESS_IMAGE_URL,
} from "@/content";
import { Reveal } from "@/components/ui";
import { trackReferral } from "@/lib/analytics";

export default function MyWeakness() {
  return (
    <section id="my-weakness" className="relative scroll-mt-24 border-t border-gold-500/10 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <div className="relative min-h-[38rem] overflow-hidden border border-gold-500/20 sm:min-h-[44rem]">
            <img
              src={WEAKNESS_IMAGE_URL}
              alt="A woman in a poolside California setting"
              className="absolute inset-0 h-full w-full object-cover object-[55%_38%] scale-[1.16] sm:scale-[1.2]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/75 to-ink-950/15" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-transparent to-transparent" />

            <div className="relative grid min-h-[38rem] items-end gap-10 px-7 py-9 sm:min-h-[44rem] sm:px-14 sm:py-14 lg:grid-cols-[1.08fr_0.72fr] lg:items-center lg:gap-14">
              <div className="relative z-10 max-w-2xl self-end">
              <span className="label text-[0.6rem] text-blood-400">My weakness</span>
              <h2 className="mt-5 font-display text-5xl leading-[0.95] font-light text-bone-100 sm:text-7xl">
                The older man
                <span className="block italic text-gold-400">who still takes care.</span>
              </h2>
              <p className="mt-7 max-w-xl text-base leading-relaxed text-bone-200 sm:text-lg">
                I have always had a weakness for older men who take their health
                seriously and still care about how they present themselves. A
                man who moves his body, gets his sleep, keeps his word, and
                takes pride in looking well is difficult to ignore.
              </p>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-bone-300 sm:text-lg">
                It is not about trying to look twenty-five. It is about being
                comfortable in your own skin, with enough discipline to keep it
                in good shape.
              </p>

              <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <a
                  href={HEALTH_PRODUCT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  id="health-recommendation-button"
                  onClick={() => {
                    trackReferral("health");
                  }}
                  className="sheen inline-flex items-center justify-center gap-3 rounded-sm bg-gradient-to-b from-blood-500 to-blood-700 px-7 py-4 text-[0.72rem] font-medium tracking-[0.2em] text-bone-100 uppercase shadow-[0_18px_40px_-20px_rgba(192,32,58,0.9)] transition-all duration-300 hover:from-blood-400 hover:to-blood-600"
                >
                  See my health recommendation
                  <span aria-hidden>-&gt;</span>
                </a>
              </div>
              <p className="mt-5 max-w-xl border-l border-gold-500/35 pl-4 text-[0.68rem] leading-relaxed text-bone-300/75">
                <span className="font-medium text-bone-100">Affiliate disclosure:</span>{" "}
                This post contains an affiliate link. If you click the link and
                make a purchase, I may receive a commission at no additional
                cost to you. This is not medical advice or a guarantee of
                results. Please consult a qualified healthcare professional
                before using any health product.
              </p>
              </div>

              <div className="relative z-10 mx-auto w-full max-w-[30rem] self-start lg:mx-0 lg:mt-4 lg:self-center">
                <a
                  href={HEALTH_PRODUCT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackReferral("health")}
                  aria-label="Open the health product recommendation"
                  className="group block"
                >
                  <div className="relative overflow-hidden rounded-[2rem] border border-gold-400/45 bg-ink-950/35 p-2 shadow-[0_24px_70px_-35px_rgba(0,0,0,0.95)] backdrop-blur-[2px] transition-all duration-300 group-hover:border-gold-300 group-hover:shadow-[0_28px_80px_-32px_rgba(192,32,58,0.7)]">
                    <img
                      src={HEALTH_PRODUCT_IMAGE_URL}
                      alt="Health product recommendation"
                      className="h-96 w-full rounded-[1.5rem] object-cover opacity-90 contrast-110 brightness-110 transition-transform duration-700 group-hover:scale-[1.03] sm:h-[30rem]"
                      loading="lazy"
                    />
                  </div>
                </a>
              </div>

              <svg
                viewBox="0 0 240 135"
                className="pointer-events-none absolute right-[27%] bottom-[9rem] hidden h-32 w-56 text-gold-400/80 lg:block"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <defs>
                  <marker id="health-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                    <path d="M0 0l7 3.5L0 7z" fill="currentColor" stroke="none" />
                  </marker>
                </defs>
                <path
                  d="M224 10C185 18 184 48 151 72C119 95 82 112 18 119"
                  markerEnd="url(#health-arrow)"
                />
              </svg>
            </div>

            <span className="absolute -top-3 -left-3 h-12 w-12 border-t border-l border-gold-400/60" />
            <span className="absolute -right-3 -bottom-3 h-12 w-12 border-r border-b border-blood-500/70" />
          </div>
        </Reveal>
      </div>

    </section>
  );
}