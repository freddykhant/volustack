import type { ReactNode } from "react";
import { readinessState, FITNESS_FLOOR } from "~/components/viz/readiness-state";
import { Chip, Panel } from "~/components/ui-kit/app-shell-kit";
import { READINESS_DOT } from "~/components/readiness/readiness-chip";
import type { ReadinessLabel, ReadinessView } from "~/views/types";

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-l border-border-subtle pl-4 first:border-l-0 first:pl-0 sm:pl-6">
      <dt className="text-eyebrow font-medium text-fg-subtle">{label}</dt>
      <dd className="mt-1.5 text-stat text-fg tabular-nums">{children}</dd>
    </div>
  );
}

function Shell({
  state,
  weekIndex,
  children,
}: {
  state: ReadinessLabel;
  weekIndex?: number;
  children: ReactNode;
}) {
  return (
    <Panel as="section" aria-label="Readiness" padding="none" className="p-6 md:p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="text-eyebrow font-medium text-fg-subtle">Current form</div>
        {weekIndex !== undefined ? <Chip className="tabular-nums">Week {weekIndex}</Chip> : null}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className={`size-3 rounded-full ${READINESS_DOT[state]}`} aria-hidden />
        <span className="text-page-title text-fg">{state}</span>
      </div>
      <dl className="mt-7 grid grid-cols-3 gap-4 border-t border-border-subtle pt-6">{children}</dl>
    </Panel>
  );
}

export function ReadinessHeadline({ readiness }: { readiness: ReadinessView }) {
  const current =
    readiness.series.find((p) => p.weekIndex === readiness.currentWeekIndex) ??
    readiness.series[readiness.series.length - 1];
  if (!current) {
    return (
      <Shell state="Building">
        <Stat label="Fitness">—</Stat>
        <Stat label="Fatigue">—</Stat>
        <Stat label="Form">—</Stat>
      </Shell>
    );
  }
  const state = readinessState(current);
  const pct =
    current.fitness >= FITNESS_FLOOR ? Math.round((current.form / current.fitness) * 100) : null;
  return (
    <Shell state={state} weekIndex={current.weekIndex}>
      <Stat label="Fitness">{current.fitness.toFixed(1)}</Stat>
      <Stat label="Fatigue">{current.fatigue.toFixed(1)}</Stat>
      <Stat label="Form">{pct === null ? "—" : pct > 0 ? `+${pct}%` : `${pct}%`}</Stat>
    </Shell>
  );
}
