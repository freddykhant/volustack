"use client";

import { buttonClass } from "~/components/ui-kit/app-shell-kit";
import { PROGRESSION } from "../demo-data";
import { useReveal } from "../use-reveal";

/** The weekly check-in's proposal. Its one change: the new set count appears. */
export function ProgressionVignette() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="mt-5">
      <p className="sr-only">Example proposal: chest goes from 16 to 18 sets next week; quads hold at 14 because recovery was low.</p>
      <div aria-hidden className="rounded-callout bg-sunken p-3.5">
        {PROGRESSION.map((p, i) => (
          <div
            key={p.muscle}
            className={"flex items-center justify-between gap-3 py-1.5 text-body tabular-nums " + (i > 0 ? "border-t border-border-subtle" : "")}
          >
            <span className="text-fg">{p.muscle}</span>
            {p.to === null ? (
              <span className="text-fg-muted">
                {p.from} · {p.note}
              </span>
            ) : (
              <span className="font-semibold text-fg">
                {p.from}
                <span
                  className={
                    "transition-opacity duration-300 " + (revealed ? "opacity-100" : "opacity-0")
                  }
                >
                  {" "}
                  → {p.to}
                </span>{" "}
                sets
              </span>
            )}
          </div>
        ))}
        <div className="mt-2.5 flex justify-end gap-1.5">
          <span className={buttonClass("ghost", "sm")}>Keep as is</span>
          <span className={buttonClass("accent", "sm")}>Accept week 4</span>
        </div>
      </div>
    </div>
  );
}
