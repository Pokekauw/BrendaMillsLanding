import { CHAT_IMAGE_URL, CHAT_RULES_URL } from "@/content";
import { Reveal } from "@/components/ui";

export default function ChatWithMe() {
  return (
    <section
      id="chat-with-me"
      className="relative scroll-mt-24 overflow-hidden border-t border-gold-500/10 py-20 sm:py-28"
    >
      <div className="absolute inset-0">
        <img
          src={CHAT_IMAGE_URL}
          alt="Brenda Mills"
          className="h-full w-full object-cover object-center scale-[1.06]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-ink-950/52" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/92 via-ink-950/70 to-ink-950/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/88 via-transparent to-ink-950/15" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_24%,rgba(155,27,46,0.22),transparent_50%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <div className="relative min-h-[34rem] overflow-hidden border border-gold-500/20 sm:min-h-[40rem]">
            <div className="relative grid min-h-[34rem] items-end gap-10 px-7 py-9 sm:min-h-[40rem] sm:px-14 sm:py-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:px-16">
              <div className="relative z-10 flex max-w-2xl flex-col justify-end self-stretch">
              <span className="label text-[0.6rem] text-blood-400">Chat with me</span>
              <h2 className="mt-5 font-display text-5xl leading-[0.95] font-light text-bone-100 sm:text-7xl">
                I don't answer
                <span className="block italic text-gold-400">just anyone.</span>
              </h2>
              <p className="mt-7 max-w-xl text-base leading-relaxed text-bone-200 sm:text-lg">
                I do not normally reply to messages. I am looking for a very
                specific kind of man, and my time is not something I hand out
                by accident.
              </p>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-bone-300 sm:text-lg">
                If you want an audience with me, start by reading my rules for
                chatting. They are there for a reason. If you cannot follow
                them, you have already answered the question for both of us.
              </p>

              <Reveal delay={180}>
                <a
                  href={CHAT_RULES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sheen mt-9 inline-flex w-fit items-center justify-center gap-3 border border-gold-400/60 bg-ink-950/55 px-6 py-4 text-[0.7rem] font-medium tracking-[0.18em] text-gold-300 uppercase backdrop-blur-sm transition-all duration-300 hover:border-gold-300 hover:bg-gold-500/10 hover:text-gold-100"
                >
                  Read Brenda's chatting rules
                  <span aria-hidden>-&gt;</span>
                </a>
              </Reveal>

              <p className="mt-12 max-w-lg text-[0.68rem] leading-relaxed text-bone-300/65">
                Brenda Mills is an AI persona created for creative storytelling
                and entertainment. Please treat the character and conversations
                accordingly.
              </p>
              </div>

              <div
                className="relative mx-auto min-h-[17rem] w-full max-w-sm lg:min-h-[26rem] lg:max-w-none"
                aria-label="Chat with Brenda"
              >
                <span className="absolute top-1/2 left-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold-400/20" />
                <span className="absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blood-500/15" />
                <span className="absolute top-4 left-1/2 -translate-x-1/2 -rotate-12 text-7xl drop-shadow-[0_12px_20px_rgba(0,0,0,0.65)] transition-transform duration-500 hover:scale-110 sm:text-8xl">
                  😈
                </span>
                <span className="absolute top-1/2 left-3 -translate-y-1/2 rotate-12 text-6xl drop-shadow-[0_12px_20px_rgba(0,0,0,0.65)] transition-transform duration-500 hover:scale-110 sm:text-7xl">
                  💅
                </span>
                <span className="absolute right-2 bottom-4 -rotate-12 text-7xl drop-shadow-[0_12px_20px_rgba(0,0,0,0.65)] transition-transform duration-500 hover:scale-110 sm:text-8xl">
                  🖤
                </span>
                <span className="absolute right-1/4 bottom-1/3 rotate-12 text-6xl drop-shadow-[0_12px_20px_rgba(0,0,0,0.65)] transition-transform duration-500 hover:scale-110 sm:text-7xl">
                  💀
                </span>
                <p className="label absolute right-1/2 bottom-0 translate-x-1/2 text-[0.55rem] text-gold-300/80">
                  Enter the conversation carefully
                </p>
              </div>
            </div>

            <span className="absolute -top-3 -left-3 h-12 w-12 border-t border-l border-gold-400/60" />
            <span className="absolute -right-3 -bottom-3 h-12 w-12 border-r border-b border-blood-500/70" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}