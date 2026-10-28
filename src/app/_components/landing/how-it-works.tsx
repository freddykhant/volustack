import { Container, FeatureRow, LandingSection, Tag } from "./primitives";
import { BlockGridVignette } from "./vignettes/block-grid";
import { CoachCueVignette } from "./vignettes/coach-cue";
import { ProgressionVignette } from "./vignettes/progression";
import { ReadinessVignette } from "./vignettes/readiness";
import { RescheduleVignette } from "./vignettes/reschedule";

export function HowItWorks() {
  return (
    <LandingSection id="how-it-works" labelledBy="how-title">
      <Container className="pb-10">
        <h2 id="how-title" className="sr-only">
          How it works
        </h2>

        <FeatureRow
          headingId="feature-reschedule"
          tag="Missed a session"
          title={["Miss a day.", "The week reflows."]}
          lede="Work ate Monday. The engine works out three ways to get that volume back, picks the one it would choose, and waits for you to decide."
          ticks={[
            "Make it up, do half of it, or let it go",
            "Volume gets moved, not just dropped",
            "Nothing moves until you tap",
          ]}
          visual={<RescheduleVignette />}
        />

        <FeatureRow
          flip
          headingId="feature-engine"
          tag="The engine"
          title={["Every set", "has a reason."]}
          lede="Your block is built from volume landmarks for each muscle. It adds sets week by week, keeps you in the range that grows muscle, and backs off for a deload before you burn out."
          ticks={[
            "Sets per muscle, per week, set by your experience",
            "Priority muscles get the extra volume",
            "Same inputs, same plan, every time",
          ]}
          visual={<BlockGridVignette />}
        />

        <FeatureRow
          headingId="feature-readiness"
          tag="Readiness"
          title={["Know when to push.", "Know when to back off."]}
          lede="Fitness, Fatigue and Form come from what you actually logged, set by set. Form is your readiness, and it moves when you do."
          ticks={[
            "Built from your logged sets and how hard they were (RIR)",
            "Your weekly check-in nudges it",
            "Calls an early deload when you need one",
          ]}
          visual={<ReadinessVignette />}
        />

        <div className="grid gap-5 pt-4 md:grid-cols-2">
          <article
            aria-labelledby="feature-progression"
            className="rounded-card border border-border bg-surface p-6 shadow-card sm:p-7"
          >
            <Tag>Progression</Tag>
            <h3 id="feature-progression" className="mt-4 text-section text-fg sm:text-[22px] sm:leading-7">
              Check in. Level up.
            </h3>
            <p className="mt-2 text-body text-fg-muted">
              At the end of the week, rate how each muscle recovered. The engine checks that against what you logged
              and suggests next week&apos;s volume.
            </p>
            <ProgressionVignette />
          </article>
          <article
            aria-labelledby="feature-cues"
            className="rounded-card border border-border bg-surface p-6 shadow-card sm:p-7"
          >
            <Tag>Coach cues</Tag>
            <h3 id="feature-cues" className="mt-4 text-section text-fg sm:text-[22px] sm:leading-7">
              Running Saturday? It noticed.
            </h3>
            <p className="mt-2 text-body text-fg-muted">
              Add the run, the game or the ride. Mesodapt looks at what&apos;s stacked on today and tomorrow and tells
              you how to fuel and recover around it.
            </p>
            <CoachCueVignette />
          </article>
        </div>
      </Container>
    </LandingSection>
  );
}
