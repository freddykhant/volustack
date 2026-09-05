import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { readinessState } from "~/components/viz/readiness-state";
import type { ReadinessView } from "~/views/types";

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
      <span className="size-2 rounded-full bg-fg-muted" aria-hidden />
      Form: {state}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}
