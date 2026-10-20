"use client";

import { useState } from "react";
import { LandmarkBar } from "~/components/viz/landmark-bar";
import { BodyMap } from "~/components/viz/body-map";
import { ZoneLegend } from "~/components/viz/zone-legend";
import { zoneFor } from "~/components/viz/zone";
import { PageHeader, Panel } from "~/components/ui-kit/app-shell-kit";
import type { LandmarkBarDatum, MesocycleView } from "~/views/types";
import type { MuscleGroup } from "~/schema";

const ZONE_VAR: Record<string, string> = {
  rest: "var(--color-zone-rest-soft)",
  building: "var(--color-zone-building-soft)",
  optimal: "var(--color-zone-optimal-soft)",
  max: "var(--color-zone-max-soft)",
};

export function AnalysisView({ block }: { block: MesocycleView }) {
  const [weekIndex, setWeekIndex] = useState(block.currentWeekIndex);
  const [hover, setHover] = useState<MuscleGroup | null>(null);
  const week = block.weeks.find((w) => w.index === weekIndex)!;

  const bars: LandmarkBarDatum[] = week.cells
    .map((c) => ({ muscle: c.muscle, planned: c.plannedSets, mev: c.mev, mav: c.mav, mrv: c.mrv }))
    .sort((a, b) => b.planned / b.mrv - a.planned / a.mrv); // closeness to MRV, risk on top

  const scaleMax = Math.max(...week.cells.map((c) => c.mrv)) * 1.1;
  const fillFor = (m: MuscleGroup): string => {
    const cell = week.cells.find((c) => c.muscle === m);
    if (!cell) return "var(--color-sunken)";
    const base = ZONE_VAR[zoneFor(cell.plannedSets, cell)]!;
    return m === hover ? "var(--color-accent)" : base;
  };

  const perSession = week.sessions.map((s) => ({
    label: s.label,
    sets: s.prescriptions.reduce((n, p) => n + p.sets, 0),
  }));
  const maxSession = Math.max(...perSession.map((s) => s.sets));

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-6 pt-10 pb-20 md:px-10">
      <PageHeader
        eyebrow="Block"
        title="Analysis"
        description="Planned sets against your volume landmarks, muscle by muscle."
        actions={
          <label className="flex items-center gap-2 text-nav text-fg-muted">
            Week
            <select
              value={weekIndex}
              onChange={(e) => setWeekIndex(Number(e.target.value))}
              className="h-9 rounded-pill border border-border bg-surface-raised px-3 text-nav text-fg shadow-control outline-none transition-colors hover:border-border-strong focus-visible:border-border-strong"
            >
              {block.weeks.map((w) => (
                <option key={w.index} value={w.index}>
                  {w.isDeload ? "Deload" : `Week ${w.index}`}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <Panel padding="lg" className="animate-rise">
        <div className="mb-5">
          <ZoneLegend />
        </div>
        <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
          <div className="mx-auto w-full max-w-[320px] self-start lg:mx-0">
            <BodyMap fillFor={fillFor} onHover={setHover} />
          </div>
          <div className="flex flex-col gap-2.5">
            {bars.map((d) => (
              <LandmarkBar key={d.muscle} datum={d} scaleMax={scaleMax} />
            ))}
          </div>
        </div>
      </Panel>

      <Panel padding="lg" className="animate-rise">
        <div className="text-eyebrow font-medium text-fg-subtle">Volume distribution</div>
        <div className="mt-4 flex items-end gap-3">
          {perSession.map((s) => (
            <div key={s.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end">
                <div className="w-full rounded-t-control bg-border-strong" style={{ height: `${(s.sets / maxSession) * 100}%` }} />
              </div>
              <div className="text-meta text-fg-muted">{s.label}</div>
              <div className="text-meta text-fg tabular-nums">{s.sets}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
