import { zoneFor } from "~/components/viz/zone";
import type { LandmarkBarDatum } from "~/views/types";

const FILL: Record<string, string> = {
  rest: "bg-zone-rest",
  building: "bg-zone-building",
  optimal: "bg-zone-optimal",
  max: "bg-zone-max",
};

function label(m: string): string {
  return m.replace(/_/g, " ").toLowerCase();
}

export function LandmarkBar({ datum, scaleMax }: { datum: LandmarkBarDatum; scaleMax: number }) {
  const zone = zoneFor(datum.planned, datum);
  const pct = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 text-right text-[12px] text-fg-muted">{label(datum.muscle)}</div>
      <div className="relative h-4 flex-1 overflow-hidden rounded-pill bg-surface">
        {/* zone bands (track) */}
        <div className="absolute inset-y-0 left-0 bg-zone-rest-soft" style={{ width: pct(datum.mev) }} />
        <div className="absolute inset-y-0 bg-zone-building-soft" style={{ left: pct(datum.mev), width: pct(datum.mav - datum.mev) }} />
        <div className="absolute inset-y-0 bg-zone-optimal-soft" style={{ left: pct(datum.mav), width: pct(datum.mrv - datum.mav) }} />
        <div className="absolute inset-y-0 bg-zone-max-soft" style={{ left: pct(datum.mrv), right: 0 }} />
        {/* planned fill */}
        <div className={"absolute inset-y-0 left-0 opacity-90 " + FILL[zone]} style={{ width: pct(datum.planned) }} />
        {/* actual marker */}
        {datum.actual !== undefined ? (
          <div className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: pct(datum.actual) }} />
        ) : null}
      </div>
      <div className="w-24 shrink-0 text-[12px] text-fg-soft">
        {datum.planned} → {zone}
      </div>
    </div>
  );
}
