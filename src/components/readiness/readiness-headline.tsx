import { readinessState, FITNESS_FLOOR } from "~/components/viz/readiness-state";
import type { ReadinessView } from "~/views/types";

export function ReadinessHeadline({ readiness }: { readiness: ReadinessView }) {
  const current =
    readiness.series.find((p) => p.weekIndex === readiness.currentWeekIndex) ??
    readiness.series[readiness.series.length - 1];
  if (!current) {
    return (
      <div className="rounded-card border border-border bg-surface p-6">
        <div className="text-eyebrow font-medium text-fg-soft">Readiness</div>
        <div className="mt-2 flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-fg-muted" aria-hidden />
          <span className="text-card-title text-fg">Building</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div>
            <div className="text-eyebrow font-medium text-fg-soft">Fitness</div>
            <div className="mt-1 text-section text-fg tabular-nums">—</div>
          </div>
          <div>
            <div className="text-eyebrow font-medium text-fg-soft">Fatigue</div>
            <div className="mt-1 text-section text-fg tabular-nums">—</div>
          </div>
          <div>
            <div className="text-eyebrow font-medium text-fg-soft">Form</div>
            <div className="mt-1 text-section text-fg tabular-nums">—</div>
          </div>
        </div>
      </div>
    );
  }
  const state = readinessState(current);
  const pct =
    current.fitness >= FITNESS_FLOOR ? Math.round((current.form / current.fitness) * 100) : null;
  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="text-eyebrow font-medium text-fg-soft">Readiness</div>
      <div className="mt-2 flex items-center gap-2">
        <span className="size-2.5 rounded-full bg-fg-muted" aria-hidden />
        <span className="text-card-title text-fg">{state}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div>
          <div className="text-eyebrow font-medium text-fg-soft">Fitness</div>
          <div className="mt-1 text-section text-fg tabular-nums">{current.fitness}</div>
        </div>
        <div>
          <div className="text-eyebrow font-medium text-fg-soft">Fatigue</div>
          <div className="mt-1 text-section text-fg tabular-nums">{current.fatigue}</div>
        </div>
        <div>
          <div className="text-eyebrow font-medium text-fg-soft">Form</div>
          <div className="mt-1 text-section text-fg tabular-nums">
            {pct === null ? "—" : pct > 0 ? `+${pct}%` : `${pct}%`}
          </div>
        </div>
      </div>
    </div>
  );
}
