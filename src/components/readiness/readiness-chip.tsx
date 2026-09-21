import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { readinessState } from "~/components/viz/readiness-state";
import type { ReadinessLabel, ReadinessView } from "~/views/types";

/** Form state → zone-token dot. Presentation mapping only (Law 1: the state
 * itself comes from readinessState); mirrors TrainingStatusCard's status dot. */
const DOT: Record<ReadinessLabel, string> = {
  Fresh: "bg-zone-optimal",
  Productive: "bg-zone-building",
  Fatigued: "bg-zone-rest",
  Overreaching: "bg-zone-max",
};

export function ReadinessChip({ readiness }: { readiness: ReadinessView }) {
  const current =
    readiness.series.find((p) => p.weekIndex === readiness.currentWeekIndex) ??
    readiness.series[readiness.series.length - 1];
  if (!current) return null;
  const state = readinessState(current.form);
  return (
    <Link
      href="/app/readiness"
      className="inline-flex items-center gap-1.5 rounded-pill border border-border px-3 py-1 text-nav text-fg-muted transition-colors hover:text-fg"
    >
      <span className={`size-2 rounded-full ${DOT[state]}`} aria-hidden />
      Form: {state}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}
