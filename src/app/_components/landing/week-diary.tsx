import type { ReactNode } from "react";

import { Container, LandingSection } from "./primitives";
import { CoachCueVignette } from "./vignettes/coach-cue";
import { ProgressionVignette } from "./vignettes/progression";
import { ReadinessVignette } from "./vignettes/readiness";
import { RescheduleVignette } from "./vignettes/reschedule";

const DAYS: { day: string; id: string; title: string; body: string; visual: ReactNode }[] = [
  {
    day: "Mon",
    id: "diary-mon",
    title: "Work runs late and Upper A doesn't happen",
    body: "Next time you open the app it asks how the week should absorb it, with the option it would pick marked. Your plan stays exactly as it was until you choose.",
    visual: <RescheduleVignette />,
  },
  {
    day: "Wed",
    id: "diary-wed",
    title: "You check how fresh you are before training",
    body: "Fitness, fatigue and form come from the sets you log and how close to failure you took them. If your recovery ratings stay low two weeks running while volume is near its limit, it suggests deloading early.",
    visual: <ReadinessVignette />,
  },
  {
    day: "Sat",
    id: "diary-sat",
    title: "Lower B in the morning, a run after work",
    body: "Put a run or a game on the board and Mesodapt looks at what else is on that day and the next. Here it works out roughly how many grams of carbs to get in between.",
    visual: <Shell><CoachCueVignette /></Shell>,
  },
  {
    day: "Sun",
    id: "diary-sun",
    title: "You rate the week and get next week's numbers",
    body: "Once every session is logged or moved, you say how each muscle held up. It compares that with what you lifted and proposes next week's sets. Quads hold at 14 here because you said they were still sore.",
    visual: <Shell><ProgressionVignette /></Shell>,
  },
];

/** The rest of the app, told as one ordinary week. Each day's words pin while its mock scrolls past. */
export function WeekDiary() {
  return (
    <LandingSection id="week" labelledBy="week-title" className="pt-24 pb-28 sm:pt-32">
      <Container>
        <h2 id="week-title" className="max-w-[18ch] text-landing-h2 text-balance text-fg">
          Most weeks are less dramatic than that
        </h2>
        <p className="mt-5 max-w-[50ch] text-body text-fg-muted sm:text-[17px] sm:leading-[26px]">
          Here&apos;s what the rest of a normal one looks like, from the missed session on Monday to the check-in on
          Sunday night.
        </p>

        <ol className="relative mt-16 lg:mt-20">
          {/* The week's spine. */}
          <span aria-hidden className="absolute top-2 bottom-2 left-[5px] w-px bg-border-strong lg:left-[7px]" />
          {DAYS.map((d) => (
            <li
              key={d.day}
              aria-labelledby={d.id}
              className="relative grid gap-6 pb-20 pl-8 last:pb-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:pb-28 lg:pl-10"
            >
              <span
                aria-hidden
                className="absolute top-[7px] left-0 size-[11px] rounded-full border-2 border-sky bg-canvas lg:top-[12px] lg:size-[15px]"
              />
              <div className="lg:sticky lg:top-24 lg:self-start">
                <div className="text-landing-h3 text-sky">{d.day}</div>
                <h3 id={d.id} className="mt-3 text-section text-balance text-fg sm:text-[22px] sm:leading-7">
                  {d.title}
                </h3>
                <p className="mt-3 max-w-[46ch] text-body text-fg-muted">{d.body}</p>
              </div>
              <div className="min-w-0">{d.visual}</div>
            </li>
          ))}
        </ol>
      </Container>
    </LandingSection>
  );
}

/** A card for the vignettes that were drawn to sit inside one. */
function Shell({ children }: { children: ReactNode }) {
  return <div className="rounded-card border border-border bg-surface p-4 shadow-card sm:p-5">{children}</div>;
}
