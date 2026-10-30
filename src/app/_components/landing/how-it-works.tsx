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
          title={["Missed Monday?", "Your week gets rearranged"]}
          lede="Say work ran late and you skipped Upper A. The engine looks at what's left of the week and gives you a few ways to fit that volume back in, with the one it would pick marked."
          ticks={[
            "Make it up on another day, fold part of it into a later session or let it go",
            "Your plan stays exactly as it was until you pick one",
          ]}
          visual={<RescheduleVignette />}
        />

        <FeatureRow
          flip
          headingId="feature-engine"
          tag="The engine"
          title={["Volume that climbs", "week by week"]}
          lede="Each muscle gets a weekly set count based on where its volume landmarks sit for someone at your level. It goes up a little each week, then drops right down for the deload."
          ticks={[
            "Pick up to three priority muscles and they get the extra sets",
            "Give it the same answers twice and you'll get the same block back",
          ]}
          visual={<BlockGridVignette />}
        />

        <FeatureRow
          headingId="feature-readiness"
          tag="Readiness"
          title={["See how fresh you are", "before you train"]}
          lede="Fitness, Fatigue and Form are calculated from the sets you log and how close to failure you took them. If your recovery ratings stay low two weeks running while volume is near its limit, Mesodapt suggests deloading early."
          ticks={[
            "Uses the RIR from every set you log",
            "Your weekly recovery ratings nudge it up or down",
            "Charted across the whole block so you can see the trend",
          ]}
          visual={<ReadinessVignette />}
        />

        <div className="grid gap-5 pt-4 md:grid-cols-2">
          <article
            aria-labelledby="feature-progression"
            className="rounded-card border border-border bg-surface p-6 shadow-card sm:p-7"
          >
            <Tag>Weekly check-in</Tag>
            <h3 id="feature-progression" className="mt-4 text-section text-fg sm:text-[22px] sm:leading-7">
              Rate your recovery, get next week&apos;s numbers
            </h3>
            <p className="mt-2 text-body text-fg-muted">
              Once every session in the week is logged or rescheduled, you rate how each muscle held up. The engine
              compares that with what you lifted and proposes next week&apos;s sets for you to accept.
            </p>
            <ProgressionVignette />
          </article>
          <article
            aria-labelledby="feature-cues"
            className="rounded-card border border-border bg-surface p-6 shadow-card sm:p-7"
          >
            <Tag>Coach cues</Tag>
            <h3 id="feature-cues" className="mt-4 text-section text-fg sm:text-[22px] sm:leading-7">
              Fuel tips for the run on Saturday
            </h3>
            <p className="mt-2 text-body text-fg-muted">
              Put a run or a game on the board and Mesodapt checks what else is on that day and the next. Lifting
              legs and then running? It tells you roughly how many grams of carbs to get in between.
            </p>
            <CoachCueVignette />
          </article>
        </div>
      </Container>
    </LandingSection>
  );
}
