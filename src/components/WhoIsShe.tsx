import { useEffect, useState, type ReactNode } from "react";
import {
  FACEBOOK_URL,
  FREE_GALLERY_IMAGES,
  PROFILE_IMAGE_URL,
} from "@/content";
import { FbIcon } from "@/components/Nav";
import { GhostButton, PrimaryButton, Reveal } from "@/components/ui";
import { trackImageDownload, trackImageView } from "@/lib/analytics";

type GalleryImage = (typeof FREE_GALLERY_IMAGES)[number];

export default function WhoIsShe() {
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);

  useEffect(() => {
    if (!selectedImage) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedImage(null);
    };

    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [selectedImage]);

  return (
    <section
      id="who-am-i"
      className="relative scroll-mt-24 overflow-hidden px-5 pt-28 pb-16 sm:px-8 sm:pt-36 sm:pb-24"
    >
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <div className="relative overflow-hidden border border-gold-500/20">
            <img
              src={PROFILE_IMAGE_URL}
              alt="Brenda Mills in California"
              className="absolute inset-0 h-full w-full object-cover object-center scale-[1.08]"
              loading="eager"
            />
            <div className="absolute inset-0 bg-ink-950/48" />
            <div className="absolute inset-0 bg-gradient-to-r from-ink-950/94 via-ink-950/72 to-ink-950/18" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-transparent to-ink-950/10" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_24%,rgba(155,27,46,0.2),transparent_48%)]" />

            <div className="relative grid min-h-[42rem] items-center gap-12 px-7 py-9 sm:min-h-[48rem] sm:px-14 sm:py-14 lg:grid-cols-[1fr_0.82fr] lg:gap-16 lg:px-16">
              <div className="flex max-w-2xl flex-col justify-end self-stretch">
                <Reveal delay={80}>
                  <div className="mb-7 flex items-center gap-3">
                    <span className="h-px w-10 bg-blood-500" />
                    <span className="label text-[0.6rem] text-gold-400">
                      Who am I · California
                    </span>
                  </div>
                </Reveal>

                <Reveal delay={140}>
                  <h1 className="font-display text-[4rem] leading-[0.88] font-light tracking-tight text-bone-100 sm:text-[6.5rem] lg:text-[8rem]">
                    Brenda
                    <span className="block text-outline italic">Mills</span>
                  </h1>
                </Reveal>

                <Reveal delay={220}>
                  <div className="mt-8 flex items-center justify-between gap-5 border-b border-gold-500/25 pb-5">
                    <div>
                      <span className="label text-[0.58rem] text-blood-400">
                        Facebook subscription
                      </span>
                      <h2 className="mt-2 font-display text-3xl leading-tight text-bone-100 italic sm:text-4xl">
                        When you subscribe to my Facebook Page, you get:
                      </h2>
                    </div>
                    <span className="font-display text-2xl text-gold-400/80">03</span>
                  </div>
                </Reveal>

                <ul className="mt-7 space-y-5 text-sm leading-relaxed text-bone-200 sm:text-base">
                  <Reveal as="li" delay={300}>
                    <Benefit>
                      <strong className="font-medium text-bone-100">
                        Weekly posts with photos
                      </strong>{" "}
                      — with a little more edge than usual.
                    </Benefit>
                  </Reveal>
                  <Reveal as="li" delay={370}>
                    <Benefit>
                      <strong className="font-medium text-bone-100">
                        One subscriber-only video or Reel every week.
                      </strong>
                    </Benefit>
                  </Reveal>
                  <Reveal as="li" delay={440}>
                    <Benefit>
                      <strong className="font-medium text-bone-100">
                        Replies to comments on my posts
                      </strong>{" "}
                      — something I normally don't do.
                    </Benefit>
                  </Reveal>
                </ul>

                <Reveal delay={520}>
                  <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <PrimaryButton href={FACEBOOK_URL} target="_blank">
                      <FbIcon className="h-4 w-4" />
                      Subscribe to my Facebook page
                    </PrimaryButton>
                    <GhostButton
                      href="#my-weakness"
                      className="border-gold-400/70 bg-gold-500/10 text-gold-300 hover:border-gold-300 hover:bg-gold-500/20 hover:text-gold-200"
                    >
                      My weakness
                      <span aria-hidden>↓</span>
                    </GhostButton>
                  </div>
                </Reveal>
              </div>

              <Reveal delay={240}>
                <aside className="relative mx-auto w-full max-w-lg border border-gold-500/25 bg-ink-950/78 p-5 shadow-[0_30px_80px_-45px_rgba(0,0,0,0.95)] backdrop-blur-sm sm:p-6">
                  <div className="flex items-end justify-between gap-4 border-b border-gold-500/20 pb-4">
                    <div>
                      <span className="label text-[0.58rem] text-gold-400">
                        Limited release
                      </span>
                      <h2 className="mt-2 font-display text-3xl leading-none text-bone-100 sm:text-4xl">
                        A little something extra
                      </h2>
                    </div>
                    <span className="shrink-0 font-display text-2xl text-blood-400">
                      {FREE_GALLERY_IMAGES.length}
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-bone-300">
                    You found these while they are free. A small collection of
                    Brenda images, normally priced at <s>$20</s>, available to
                    save for free for now.
                  </p>

                  <div className="mt-5 grid grid-cols-3 gap-2">
                    {FREE_GALLERY_IMAGES.map((image, index) => (
                      <button
                        key={image.src}
                        type="button"
                        onClick={() => {
                          trackImageView(image.src);
                          setSelectedImage(image);
                        }}
                        className="group relative aspect-square overflow-hidden border border-gold-500/20 bg-ink-900 text-left transition-all duration-300 hover:border-gold-400/70 hover:brightness-110"
                        aria-label={`View ${image.alt}`}
                      >
                        <img
                          src={image.src}
                          alt=""
                          aria-hidden="true"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                          loading="lazy"
                        />
                        <span className="absolute right-1.5 bottom-1.5 flex h-5 w-5 items-center justify-center bg-ink-950/80 text-[0.6rem] text-gold-400">
                          {index + 1}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3 text-[0.62rem] text-bone-400">
                    <span>Tap any image to view full size</span>
                    <span className="text-gold-400">FREE · LIMITED</span>
                  </div>
                </aside>
              </Reveal>
            </div>

            <span className="absolute -top-3 -left-3 h-12 w-12 border-t border-l border-gold-400/60" />
            <span className="absolute -right-3 -bottom-3 h-12 w-12 border-r border-b border-blood-500/70" />
          </div>
        </Reveal>
      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-5 py-8 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSelectedImage(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={selectedImage.alt}
            className="relative max-h-full w-full max-w-3xl border border-gold-500/30 bg-ink-950/95 p-3 shadow-[0_30px_100px_-30px_rgba(0,0,0,0.95)] sm:p-5"
          >
            <button
              type="button"
              aria-label="Close image preview"
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center border border-gold-500/40 bg-ink-950/85 text-xl text-bone-200 transition-colors hover:border-blood-500 hover:text-white"
            >
              ×
            </button>
            <img
              src={selectedImage.src}
              alt={selectedImage.alt}
              className="max-h-[70vh] w-full object-contain"
            />
            <div className="flex flex-col gap-3 border-t border-gold-500/15 px-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-xl text-bone-100">{selectedImage.alt}</p>
                <p className="mt-1 text-xs text-bone-400">
                  On a phone: tap save, or press and hold the image to save it.
                </p>
              </div>
              <a
                href={selectedImage.src}
                download={selectedImage.fileName}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackImageDownload(selectedImage.src)}
                className="inline-flex shrink-0 items-center justify-center border border-gold-400/50 px-5 py-3 text-[0.68rem] font-medium tracking-[0.16em] text-gold-300 uppercase transition-colors hover:border-gold-300 hover:text-white"
              >
                Save image
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Benefit({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-blood-500" />
      <span>{children}</span>
    </div>
  );
}