"use client";

import { Chip, buttonClass } from "~/components/ui-kit/app-shell-kit";
import { useReveal } from "../use-reveal";

const OPTIONS = [
  { title: "Make it up on Wednesday", detail: "All 18 sets kept · 48h before Upper B", recommended: true },
  { title: "Fold half into Upper B", detail: "+9 sets on Friday · no extra day" },
  { title: "Let it go", detail: "Week stays as it is · chest dips below its zone" },
];

/** Replica of the missed-session dialog. Its one change: the recommended option lights up. */
export function RescheduleVignette() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="lg:justify-self-end lg:max-w-[460px]">
      <p className="sr-only">
        Example: after a missed Upper A, Mesodapt offers to make it up on Wednesday (recommended), fold half into
        Upper B, or let it go.
      </p>
      <div aria-hidden className="rounded-sheet bg-surface-raised p-5 shadow-pop sm:p-6">
        <div className="text-card-title text-fg">You missed Upper A</div>
        <p className="mt-1 text-card-desc text-fg-muted">Pick how this week should absorb it.</p>
        <div className="mt-4 flex flex-col gap-2">
          {OPTIONS.map((o) => {
            const lit = o.recommended && revealed;
            return (
              <div
                key={o.title}
                className={
                  "rounded-callout border px-3.5 py-3 transition-colors duration-300 " +
                  // re-review: colour scheme (accent outline = the recommended, live option)
                  (lit ? "border-accent bg-callout" : "border-border")
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-list text-fg">{o.title}</span>
                  {o.recommended ? (
                    <span className={"transition-opacity duration-300 " + (lit ? "opacity-100" : "opacity-0")}>
                      <Chip tone="accent">Recommended</Chip>
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-meta text-fg-muted tabular-nums">{o.detail}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex justify-end gap-1.5">
          <span className={buttonClass("ghost", "sm")}>Decide later</span>
          <span className={buttonClass("accent", "sm")}>Accept</span>
        </div>
      </div>
    </div>
  );
}
