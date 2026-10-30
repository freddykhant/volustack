import { Sparkles } from "lucide-react";

import { Container, LandingSection } from "./primitives";

const STEPS = [
  {
    n: "01",
    label: "You type",
    body: <span className="text-card-title text-on-ink">&ldquo;can&apos;t make Thursday, work trip&rdquo;</span>,
  },
  {
    n: "02",
    label: "A small model reads it",
    model: true,
    body: (
      <span className="block rounded-control bg-ink-well px-3 py-2.5 text-card-desc text-on-ink tabular-nums">
        <span className="text-on-ink-subtle">intent</span> block
        <br />
        <span className="text-on-ink-subtle">date</span> Thu 13
        <br />
        <span className="text-on-ink-subtle">half</span> all day
      </span>
    ),
  },
  {
    n: "03",
    label: "The engine does the maths",
    body: "It builds three versions of the week and ranks them, from least disruptive to best for recovery.",
  },
  {
    n: "04",
    label: "You accept",
    live: true,
    body: "Upper B moves to Friday, saved with the reason so you can look it up later.",
  },
];

/**
 * "Under the hood": the one dark sheet on the page. A slow prism turns behind heavy frosted glass. The prism edge
 * marks the one step where a language model works; hot pink (step 04) is the athlete's, as everywhere else.
 */
export function Engine() {
  return (
    <LandingSection
      id="engine"
      labelledBy="engine-title"
      className="isolate overflow-hidden rounded-t-sheet-xl bg-night text-on-ink"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-prism absolute -top-56 -right-48 size-[520px] opacity-55 sm:size-[760px]" />
        <div className="bg-prism absolute top-[38%] -left-40 size-[420px] opacity-35 [animation-direction:reverse] sm:size-[620px]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(60%_80%_at_70%_100%,color-mix(in_srgb,var(--color-pink)_30%,transparent),transparent_70%)]" />
        <div className="bg-grain absolute inset-0 opacity-[0.18]" />
      </div>
      <Container className="pt-24 pb-28 sm:pt-28 sm:pb-36">
        <p className="text-nav font-semibold text-accent-on-ink">Under the hood</p>
        <h2 id="engine-title" className="mt-3 max-w-[20ch] text-landing-h2 text-balance text-on-ink">
          A small model reads your message, and a plain old engine does the maths
        </h2>
        <p className="mt-6 max-w-[58ch] text-body text-on-ink-muted sm:text-[17px] sm:leading-[26px]">
          Language models are good at working out what &ldquo;can&apos;t make Thursday&rdquo; means and bad at
          arithmetic. So the model only turns your message into a short structured request. From there it&apos;s
          ordinary code choosing sets, reps and days, and the same inputs always give you the same plan.
        </p>

        <ol className="relative mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {/* The wire the request travels along, behind the cards. */}
          <span
            aria-hidden
            className="absolute top-[38px] right-[12%] left-[12%] hidden h-px bg-[linear-gradient(90deg,transparent,var(--color-ink-border)_12%,var(--color-prism-violet)_38%,var(--color-pink)_88%,transparent)] lg:block"
          />
          {STEPS.map((s) => (
            <li
              key={s.n}
              className={
                "glass-ink relative rounded-card border p-6 " +
                (s.model ? "border-prism" : s.live ? "border-pink/70" : "border-ink-border")
              }
            >
              <div className="flex items-center gap-2 text-meta tabular-nums">
                <span
                  className={
                    "flex size-[22px] items-center justify-center rounded-full text-[11px] font-semibold " +
                    (s.live
                      ? "bg-pink text-on-ink"
                      : s.model
                        ? "bg-on-ink text-night"
                        : "bg-ink-well text-on-ink-muted")
                  }
                >
                  {s.n.slice(1)}
                </span>
                <span className={s.live ? "text-accent-on-ink" : "text-on-ink"}>{s.label}</span>
                {s.model ? <Sparkles className="size-3.5 text-prism-amber" aria-hidden /> : null}
              </div>
              <div className="mt-3 text-body text-on-ink-muted">{s.body}</div>
            </li>
          ))}
        </ol>

        <p className="mt-14 max-w-[30ch] text-landing-h3 text-balance text-on-ink">
          Every number you see came from the engine.{" "}
          <span className="text-on-ink-subtle">The model has never made one up, because it isn&apos;t allowed to.</span>
        </p>
      </Container>
    </LandingSection>
  );
}
