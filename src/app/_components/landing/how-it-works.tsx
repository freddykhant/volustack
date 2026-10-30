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
          title={["Missed a session?", "Your week sorts itself out"]}
          lede="When work eats your Monday, the engine finds a few ways to fit that volume back in, suggests the one it likes best and leaves the final call to you"
          ticks={[
            "Make it up, do half of it or let it go",
            "Missed sets get carried into the rest of your week",
            "Nothing moves until you say so",
          ]}
          visual={<RescheduleVignette />}
        />

        <FeatureRow
          flip
          headingId="feature-engine"
          tag="The engine"
          title={["Every set is there", "for a reason"]}
          lede="Your block is built from volume landmarks for each muscle, adding sets week by week so you stay in the range that actually grows muscle, then backing off for a deload before fatigue catches up with you"
          ticks={[
            "Weekly sets for each muscle, tuned to your experience",
            "Priority muscles get the extra volume",
            "The same inputs always give you the same plan",
          ]}
          visual={<BlockGridVignette />}
        />

        <FeatureRow
          headingId="feature-readiness"
          tag="Readiness"
          title={["Know when to push", "and when to ease off"]}
          lede="Fitness, Fatigue and Form are worked out from the sets you actually log, so Form gives you an honest read on how ready you are for the next session"
          ticks={[
            "Built from your logged sets and how hard they felt (RIR)",
            "Your weekly check-in fine-tunes it",
            "Suggests an early deload when you need one",
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
              Check in and level up
            </h3>
            <p className="mt-2 text-body text-fg-muted">
              At the end of each week you rate how every muscle recovered, and the engine weighs that against what you
              logged to suggest next week&apos;s volume
            </p>
            <ProgressionVignette />
          </article>
          <article
            aria-labelledby="feature-cues"
            className="rounded-card border border-border bg-surface p-6 shadow-card sm:p-7"
          >
            <Tag>Coach cues</Tag>
            <h3 id="feature-cues" className="mt-4 text-section text-fg sm:text-[22px] sm:leading-7">
              Got a run on Saturday? It&apos;s on it
            </h3>
            <p className="mt-2 text-body text-fg-muted">
              Add your runs, rides and games to the week and Mesodapt looks at what&apos;s coming up today and
              tomorrow, then tells you how to fuel and recover around them
            </p>
            <CoachCueVignette />
          </article>
        </div>
      </Container>
    </LandingSection>
  );
}
