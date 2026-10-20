import { zoneFor } from "~/components/viz/zone";
import type { LandmarkBarDatum } from "~/views/types";

import { ZONE_FILL as FILL } from "~/components/viz/zone-legend";

function label(m: string): string {
  return m.replace(/_/g, " ").toLowerCase();
}

export function LandmarkBar({ datum, scaleMax }: { datum: LandmarkBarDatum; scaleMax: number }) {
  const zone = zoneFor(datum.planned, datum);
  const pct = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 text-right text-meta text-fg-muted capitalize">{label(datum.muscle)}</div>
      <div className="relative h-3 flex-1 overflow-hidden rounded-pill bg-sunken">
        {/* zone bands (track) */}
        <div className="absolute inset-y-0 left-0 bg-zone-rest-soft" style={{ width: pct(datum.mev) }} />
        <div className="absolute inset-y-0 bg-zone-building-soft" style={{ left: pct(datum.mev), width: pct(datum.mav - datum.mev) }} />
        <div className="absolute inset-y-0 bg-zone-optimal-soft" style={{ left: pct(datum.mav), width: pct(datum.mrv - datum.mav) }} />
        <div className="absolute inset-y-0 bg-zone-max-soft" style={{ left: pct(datum.mrv), right: 0 }} />
        {/* planned fill */}
        <div className={"absolute inset-y-0 left-0 rounded-pill " + FILL[zone]} style={{ width: pct(datum.planned) }} />
        {/* actual marker */}
        {datum.actual !== undefined ? (
          <div className="absolute inset-y-0 w-0.5 rounded-pill bg-fg" style={{ left: pct(datum.actual) }} />
        ) : null}
      </div>
      <div className="w-24 shrink-0 text-meta text-fg-soft tabular-nums">
        {datum.planned} → {zone}
      </div>
    </div>
  );
}
