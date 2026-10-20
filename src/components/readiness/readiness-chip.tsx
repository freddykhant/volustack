import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { readinessState } from "~/components/viz/readiness-state";
import type { ReadinessLabel, ReadinessView } from "~/views/types";

/** Form state → zone-token dot. Presentation mapping only (Law 1: the state
 * itself comes from readinessState); mirrors TrainingStatusCard's status dot. */
export const READINESS_DOT: Record<ReadinessLabel, string> = {
  Fresh: "bg-zone-optimal",
  Productive: "bg-zone-building",
  Fatigued: "bg-zone-rest",
  Overreaching: "bg-zone-max",
  Building: "bg-fg-muted",
};

export function ReadinessChip({ readiness }: { readiness: ReadinessView }) {
  const current =
    readiness.series.find((p) => p.weekIndex === readiness.currentWeekIndex) ??
    readiness.series[readiness.series.length - 1];
  const state = current ? readinessState(current) : "Building";
  return (
    <Link
      href="/app/readiness"
      className="group inline-flex h-8 items-center gap-2 rounded-pill border border-border bg-surface-raised pr-2.5 pl-3 text-nav whitespace-nowrap text-fg-muted shadow-control transition-[border-color,color] duration-200 hover:border-border-strong hover:text-fg"
    >
      <span className={`size-2 rounded-full ${READINESS_DOT[state]}`} aria-hidden />
      <span>
        Form: <span className="text-fg">{state}</span>
      </span>
      <ArrowRight
        className="size-3.5 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
