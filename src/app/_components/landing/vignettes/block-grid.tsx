"use client";

import { Chip } from "~/components/ui-kit/app-shell-kit";
import { BLOCK_GRID, zoneFor, type Zone } from "../demo-data";
import { useReveal } from "../use-reveal";

// re-review: colour scheme (zone fills, data only)
const FILL: Record<Zone | "rest", string> = {
  building: "bg-zone-building-soft",
  optimal: "bg-zone-optimal-soft",
  max: "bg-zone-max-soft",
  rest: "bg-zone-rest-soft",
};

const COLS = ["W1", "W2", "W3", "W4", "W5", "Deload"];

/** Sets per muscle per week, coloured by zone. Its one change: the cells fill in, week by week. */
export function BlockGridVignette() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref}>
      <p className="sr-only">
        Example block: chest climbs from 10 to 18 sets a week over five weeks, then deloads to 8. Back, quads and
        side delts follow the same climb-and-deload shape.
      </p>
      <div aria-hidden className="rounded-card border border-border bg-surface p-4 shadow-card sm:p-5">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-list text-fg">Block 2 · sets per week</span>
          <span className="flex gap-1.5">
            <Chip tone="building">Building</Chip>
            <Chip tone="optimal">Optimal</Chip>
            <Chip tone="max" className="hidden sm:inline-flex">
              Max
            </Chip>
          </span>
        </div>
        <div className="grid grid-cols-[72px_repeat(6,minmax(0,1fr))] gap-1 text-meta tabular-nums sm:grid-cols-[88px_repeat(6,minmax(0,1fr))] sm:gap-1.5">
          <span />
          {COLS.map((c) => (
            <span key={c} className="truncate text-center text-[11px] text-fg-subtle sm:text-meta">
              {c === "Deload" ? (
                <>
                  <span className="sm:hidden">DL</span>
                  <span className="hidden sm:inline">Deload</span>
                </>
              ) : (
                c
              )}
            </span>
          ))}
          {BLOCK_GRID.map((row) => (
            <Row key={row.muscle} row={row} revealed={revealed} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ row, revealed }: { row: (typeof BLOCK_GRID)[number]; revealed: boolean }) {
  const cells: { sets: number; zone: Zone | "rest" }[] = [
    ...row.weeks.map((s) => ({ sets: s, zone: zoneFor(s, row.muscle) })),
    { sets: row.deload, zone: "rest" },
  ];
  return (
    <>
      <span className="self-center truncate font-medium text-fg">{row.muscle}</span>
      {cells.map((c, i) => (
        <span
          key={i}
          style={{ transitionDelay: revealed ? `${i * 60}ms` : "0ms" }}
          className={
            "rounded-[7px] py-2 text-center text-fg transition-[background-color,opacity] duration-300 " +
            (revealed ? FILL[c.zone] + " opacity-100" : "bg-sunken opacity-40")
          }
        >
          {c.sets}
        </span>
      ))}
    </>
  );
}
