import { ArrowRight } from "lucide-react";

import { Mark } from "~/components/ui-kit/app-shell-kit";
import { SignInButton } from "~/app/_components/auth-buttons";
import { Container, LandingSection } from "./primitives";

const TOOLS = ["Block_v7_FINAL.xlsx", "Notes: “legs?? thurs”", "Calendar, moved 3×", "“make me a PPL split”"];

/** Why it exists, in the first person, and the one way in. The page's close. */
export function Letter() {
  return (
    <LandingSection labelledBy="letter-title" className="bg-atmosphere -mt-10 rounded-t-sheet-xl bg-canvas">
      <Container className="pt-24 pb-28 sm:pt-32 sm:pb-32">
        <div className="max-w-[640px]">
          <h2 id="letter-title" className="text-landing-h2 text-balance text-fg">
            I built this because my training lived in four apps
          </h2>
          <div className="mt-8 flex flex-col gap-5 text-body text-fg-soft sm:text-[17px] sm:leading-[28px]">
            <p>
              A spreadsheet for the block, my notes app for what I&apos;d lifted, my calendar for when, and ChatGPT
              for the bits I couldn&apos;t be bothered working out. Every missed session meant rewriting the
              spreadsheet by hand and guessing how much volume to move where.
            </p>
            <p>
              Mesodapt is the one place I wanted instead. It does hypertrophy blocks today, and running, cycling,
              Garmin and Strava are what I&apos;m working on next.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            {TOOLS.map((t) => (
              <s
                key={t}
                className="inline-flex h-[32px] items-center rounded-pill bg-sunken px-3 text-card-desc text-fg-subtle"
              >
                {t}
              </s>
            ))}
            <ArrowRight className="mx-1 size-4 text-fg-subtle" aria-hidden />
            <span className="inline-flex items-center gap-2 rounded-pill border border-border bg-surface-raised py-1 pr-3.5 pl-1 text-list text-fg shadow-card">
              <span className="flex size-7 items-center justify-center rounded-full bg-ink text-on-ink">
                <Mark className="size-4" />
              </span>
              Mesodapt
            </span>
          </div>

          <p className="mt-10 text-list text-fg">Freddy</p>
          <p className="text-meta text-fg-muted">
            Questions come straight to me at{" "}
            <a href="mailto:freddyhmk@gmail.com" className="text-fg underline decoration-border-strong underline-offset-2 hover:decoration-fg">
              freddyhmk@gmail.com
            </a>
          </p>
        </div>

        <div className="mt-20 flex flex-col gap-6 border-t border-border pt-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-landing-h3 text-balance text-fg">Set up your first block in a few minutes</h3>
            <p className="mt-3 max-w-[48ch] text-body text-fg-muted">
              Tell it your schedule, your split and how long you&apos;ve been training. You can start the block this
              week.
            </p>
          </div>
          <SignInButton />
        </div>
      </Container>
    </LandingSection>
  );
}
