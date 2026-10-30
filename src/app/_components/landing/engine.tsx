import { Sparkles } from "lucide-react";

import { Container, Eyebrow, LandingSection } from "./primitives";

const STEPS = [
  { n: "01", label: "You say", body: <span className="text-card-title text-on-ink">“can&apos;t make Thursday, work trip”</span> },
  {
    n: "02",
    label: "A small model parses",
    model: true,
    body: (
      <span className="block rounded-control bg-ink-well px-3 py-2.5 text-card-desc text-on-ink tabular-nums">
        intent: block
        <br />
        date: Thu 13
        <br />
        half: all day
      </span>
    ),
  },
  {
    n: "03",
    label: "The engine works it out",
    body: "It lays out three ways to rearrange the week, from best recovery to fewest changes to keeping your preferred times",
  },
  { n: "04", label: "You accept", body: "Upper B moves to Friday and the reason gets logged right alongside it", live: true },
];

const LAWS = [
  {
    n: "Law 1",
    title: "The engine owns every number",
    body: "Sets, reps, effort, volume and readiness all come from real calculations, and the same inputs always give you the same plan",
  },
  {
    n: "Law 2",
    title: "Nothing gets made up",
    body: "The model only interprets what you say, so every weight, set count and readiness score you see comes straight from the engine",
  },
];

/**
 * "Under the hood": the one ink sheet on the page. A slow prism of colour turns behind frosted-glass cards,
 * and the rainbow edge marks the one step where a language model works; blue (step 04) stays the athlete's.
 * re-review: colour scheme (ink ground, prism, on-ink text, step 04 accent)
 */
export function Engine() {
  return (
    <LandingSection
      id="engine"
      labelledBy="engine-title"
      className="isolate mt-10 overflow-hidden rounded-t-sheet-xl bg-ink text-on-ink sm:mt-14"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-prism absolute -top-48 -right-40 size-[460px] opacity-40 sm:size-[680px]" />
        <div className="bg-prism absolute top-[46%] left-[8%] size-[380px] opacity-25 [animation-direction:reverse] sm:size-[560px]" />
        <div className="bg-grain absolute inset-0 opacity-[0.16]" />
      </div>
      <Container className="pt-20 pb-28 sm:pt-24 sm:pb-32">
        <Eyebrow onInk>Under the hood</Eyebrow>
        <h2 id="engine-title" className="mt-3 max-w-[18ch] text-landing-h2 text-balance text-on-ink">
          The model listens, the engine decides and you get the final say
        </h2>
        <p className="mt-5 max-w-[56ch] text-body text-on-ink-muted sm:text-[17px] sm:leading-[26px]">
          A small language model turns whatever you type into a structured request, then a deterministic engine does
          all the maths behind your sets and reps, so you get the flexibility of AI with numbers you can actually trust
        </p>

        <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className={
                "glass-ink rounded-card border p-6 " +
                (s.model ? "border-prism" : s.live ? "border-accent/60" : "border-ink-border")
              }
            >
              <div
                className={
                  "flex items-center gap-1.5 text-meta tabular-nums " +
                  (s.live ? "text-accent-on-ink" : s.model ? "text-on-ink" : "text-on-ink-subtle")
                }
              >
                {s.n} · {s.label}
                {s.model ? <Sparkles className="size-3.5 text-prism-violet" aria-hidden /> : null}
              </div>
              <div className="mt-2.5 text-body text-on-ink-muted">{s.body}</div>
            </li>
          ))}
        </ol>

        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:mt-4 lg:gap-4">
          {LAWS.map((l) => (
            <div key={l.n} className="glass-ink rounded-card border border-ink-border p-7">
              <Eyebrow onInk>{l.n}</Eyebrow>
              <h3 className="mt-2 text-section text-on-ink sm:text-[22px] sm:leading-7">{l.title}</h3>
              <p className="mt-2 text-body text-on-ink-muted">{l.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </LandingSection>
  );
}
