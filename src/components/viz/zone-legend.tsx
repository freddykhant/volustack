import type { Zone } from "~/views/types";

/** Full-strength zone fills for small marks (dots, bars). Data only — never chrome. */
export const ZONE_FILL: Record<Zone, string> = {
  rest: "bg-zone-rest",
  building: "bg-zone-building",
  optimal: "bg-zone-optimal",
  max: "bg-zone-max",
};

/** Large-area zone washes (grid cells, track bands). */
export const ZONE_SOFT: Record<Zone, string> = {
  rest: "bg-zone-rest-soft",
  building: "bg-zone-building-soft",
  optimal: "bg-zone-optimal-soft",
  max: "bg-zone-max-soft",
};

const KEY: { zone: Zone; label: string; range: string }[] = [
  { zone: "rest", label: "Rest", range: "below MEV" },
  { zone: "building", label: "Building", range: "MEV–MAV" },
  { zone: "optimal", label: "Optimal", range: "MAV–MRV" },
  { zone: "max", label: "Max", range: "MRV+" },
];

/** Quiet key for the landmark zones: a dot, the zone name, its landmark range. */
export function ZoneLegend({ className }: { className?: string }) {
  return (
    <ul
      aria-label="Volume zones"
      className={"flex flex-wrap items-center gap-x-4 gap-y-1.5 text-meta text-fg-muted" + (className ? " " + className : "")}
    >
      {KEY.map((k) => (
        <li key={k.zone} className="flex items-center gap-1.5">
          <span aria-hidden className={"size-2 rounded-full " + ZONE_FILL[k.zone]} />
          <span className="text-fg-soft">{k.label}</span>
          <span className="text-fg-subtle">{k.range}</span>
        </li>
      ))}
    </ul>
  );
}
