import { ArrowRight } from "lucide-react";

import { Mark } from "~/components/ui-kit/app-shell-kit";
import { Container, Eyebrow, LandingSection } from "./primitives";

const TOOLS = ["Block_v7_FINAL.xlsx", "Notes: “legs?? thurs”", "Calendar, moved 3×", "“make me a PPL split”"];

export function Problem() {
  return (
    <LandingSection labelledBy="problem-title">
      <Container className="pt-10 pb-8 lg:pt-16">
        <div className="grid items-end gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <Eyebrow>The problem</Eyebrow>
            <h2 id="problem-title" className="mt-3 text-landing-h2 text-balance text-fg">
              A spreadsheet, a notes app, a calendar and a chatbot walk into your training block.
            </h2>
          </div>
          <p className="max-w-[46ch] text-body text-fg-muted sm:text-[17px] sm:leading-[26px] lg:mb-1.5">
            You already do the training. You shouldn&apos;t have to project-manage it too. Mesodapt keeps the plan,
            the volume and your recovery in one place, and re-plans the week when life gets in the way.
          </p>
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-2.5">
          {TOOLS.map((t) => (
            <s
              key={t}
              className="inline-flex h-[34px] items-center rounded-pill bg-sunken px-3.5 text-card-desc text-fg-subtle"
            >
              {t}
            </s>
          ))}
          <ArrowRight className="mx-1 size-5 text-fg-subtle" aria-hidden />
          <span className="inline-flex items-center gap-2.5 rounded-pill border border-border bg-surface py-1.5 pr-4 pl-1.5 text-list text-fg shadow-card">
            <span className="flex size-7 items-center justify-center rounded-tile bg-ink text-on-ink">
              <Mark className="size-[18px]" />
            </span>
            One plan that adapts
          </span>
        </div>
      </Container>
    </LandingSection>
  );
}
