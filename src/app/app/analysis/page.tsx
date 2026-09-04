"use client";

import { useState } from "react";
import { LandmarkBar } from "~/components/viz/landmark-bar";
import { BodyMap } from "~/components/viz/body-map";
import { zoneFor } from "~/components/viz/zone";
import { mockMesocycle } from "~/views/_fixtures/mock-block";
import type { LandmarkBarDatum } from "~/views/types";
import type { MuscleGroup } from "~/schema";

const ZONE_VAR: Record<string, string> = {
  rest: "var(--color-zone-rest-soft)",
  building: "var(--color-zone-building-soft)",
  optimal: "var(--color-zone-optimal-soft)",
  max: "var(--color-zone-max-soft)",
};

export default function AnalysisPage() {
  const block = mockMesocycle;
  const [weekIndex, setWeekIndex] = useState(block.currentWeekIndex);
  const [hover, setHover] = useState<MuscleGroup | null>(null);
  const week = block.weeks.find((w) => w.index === weekIndex)!;

  const bars: LandmarkBarDatum[] = week.cells
    .map((c) => ({ muscle: c.muscle, planned: c.plannedSets, mev: c.mev, mav: c.mav, mrv: c.mrv }))
    .sort((a, b) => b.planned / b.mrv - a.planned / a.mrv); // closeness to MRV, risk on top

  const scaleMax = Math.max(...week.cells.map((c) => c.mrv)) * 1.1;
  const fillFor = (m: MuscleGroup): string => {
    const cell = week.cells.find((c) => c.muscle === m);
    if (!cell) return "var(--color-surface)";
    const base = ZONE_VAR[zoneFor(cell.plannedSets, cell)]!;
    return m === hover ? "var(--color-accent)" : base;
  };

  const perSession = week.sessions.map((s) => ({
    label: s.label,
    sets: s.prescriptions.reduce((n, p) => n + p.sets, 0),
  }));
  const maxSession = Math.max(...perSession.map((s) => s.sets));

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-border-subtle px-6 py-5">
        <h1 className="text-section text-fg">Analysis</h1>
        <label className="flex items-center gap-2 text-nav text-fg-muted">
          Week
          <select
            value={weekIndex}
            onChange={(e) => setWeekIndex(Number(e.target.value))}
            className="rounded-control border border-border bg-surface px-2 py-1 text-fg"
          >
            {block.weeks.map((w) => (
              <option key={w.index} value={w.index}>
                {w.isDeload ? "Deload" : `Week ${w.index}`}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="grid gap-8 p-6 lg:grid-cols-[320px_1fr]">
        <div><BodyMap fillFor={fillFor} onHover={setHover} /></div>
        <div className="flex flex-col gap-2">
          {bars.map((d) => (
            <LandmarkBar key={d.muscle} datum={d} scaleMax={scaleMax} />
          ))}
        </div>
      </div>

      <div className="border-t border-border-subtle px-6 py-5">
        <div className="text-eyebrow font-semibold text-fg-muted">Volume distribution</div>
        <div className="mt-3 flex items-end gap-3">
          {perSession.map((s) => (
            <div key={s.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end">
                <div className="w-full rounded-t bg-accent/60" style={{ height: `${(s.sets / maxSession) * 100}%` }} />
              </div>
              <div className="text-[11px] text-fg-subtle">{s.label}</div>
              <div className="text-[11px] text-fg-muted">{s.sets}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
