import { Container, Eyebrow, LandingSection } from "./primitives";

const STEPS = [
  { n: "01", label: "You say", body: <span className="text-card-title text-on-ink">“can&apos;t make Thursday, work trip”</span> },
  {
    n: "02",
    label: "A small model parses",
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
    body: "Three ways to re-arrange the week: best recovery, fewest changes, or keeping your preferred times.",
  },
  { n: "04", label: "You accept", body: "Upper B moves to Friday. The change is logged with the reason.", live: true },
];

const LAWS = [
  {
    n: "Law 1",
    title: "The engine owns every number.",
    body: "Sets, reps, effort, volume and readiness are all calculated, never generated. Same inputs, same plan.",
  },
  {
    n: "Law 2",
    title: "Nothing is made up.",
    body: "The model never writes a weight, a set count or a readiness score. Everything you read comes from the engine.",
  },
];

/** "Under the hood": the one ink sheet on the page. re-review: colour scheme (ink ground, on-ink text, step 04 accent) */
export function Engine() {
  return (
    <LandingSection
      id="engine"
      labelledBy="engine-title"
      className="mt-10 rounded-t-sheet-xl bg-ink text-on-ink sm:mt-14"
    >
      <Container className="pt-20 pb-28 sm:pt-24 sm:pb-32">
        <Eyebrow onInk>Under the hood</Eyebrow>
        <h2 id="engine-title" className="mt-3 max-w-[18ch] text-landing-h2 text-balance text-on-ink">
          The model listens. The engine decides. You approve.
        </h2>
        <p className="mt-5 max-w-[56ch] text-body text-on-ink-muted sm:text-[17px] sm:leading-[26px]">
          A lot of AI coaches let a language model make up your sets. Mesodapt doesn&apos;t. A small model turns what
          you say into a structured request, an engine does the maths, and you make the call.
        </p>

        <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className={
                "rounded-card border bg-ink-raised p-6 " + (s.live ? "border-accent/60" : "border-ink-border")
              }
            >
              <div className={"text-meta tabular-nums " + (s.live ? "text-accent-on-ink" : "text-on-ink-subtle")}>
                {s.n} · {s.label}
              </div>
              <div className="mt-2.5 text-body text-on-ink-muted">{s.body}</div>
            </li>
          ))}
        </ol>

        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:mt-4 lg:gap-4">
          {LAWS.map((l) => (
            <div key={l.n} className="rounded-card border border-ink-border bg-ink-raised p-7">
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
