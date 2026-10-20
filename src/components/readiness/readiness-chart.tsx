"use client";

import { useState, type PointerEvent } from "react";
import { LineChart } from "lucide-react";
import { Panel } from "~/components/ui-kit/app-shell-kit";
import { EmptyState } from "~/components/home/empty-state";
import type { ReadinessPoint, ReadinessView } from "~/views/types";

type Key = "form" | "fitness" | "fatigue";

/** Series styling. Form is the headline series (ink, heaviest); fitness and fatigue are
 * data hues from the zone family, and fatigue is also dashed so identity never rests on
 * colour alone. Presentation only: every value is the engine's, shown as given. */
const SERIES: { key: Key; label: string; stroke: string; dot: string; width: number; dash?: string }[] = [
  { key: "form", label: "Form", stroke: "stroke-fg", dot: "bg-fg", width: 2.5 },
  { key: "fitness", label: "Fitness", stroke: "stroke-zone-building", dot: "bg-zone-building", width: 2 },
  { key: "fatigue", label: "Fatigue", stroke: "stroke-zone-max", dot: "bg-zone-max", width: 2, dash: "5 4" },
];

/** Plot geometry in viewBox units; the SVG stretches to the container (non-scaling strokes). */
const W = 600;
const H = 200;
const PAD_Y = 14;

/** The engine already rounds to one decimal; this only pads whole numbers (3 → 3.0) so columns align. */
const fmt = (v: number) => v.toFixed(1);

function LegendSwatch({ dot, dash }: { dot: string; dash?: string }) {
  if (dash) {
    return (
      <span className="flex w-4 gap-[3px]" aria-hidden>
        <span className={`h-0.5 flex-1 rounded-pill ${dot}`} />
        <span className={`h-0.5 flex-1 rounded-pill ${dot}`} />
      </span>
    );
  }
  return <span className={`h-0.5 w-4 rounded-pill ${dot}`} aria-hidden />;
}

export function ReadinessChart({ readiness }: { readiness: ReadinessView }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = readiness.series;

  if (pts.length < 2) {
    return (
      <EmptyState icon={LineChart} title="Not enough data yet" label="Fitness, fatigue and form">
        Fitness, fatigue, and form chart here as your logged training builds up.
      </EmptyState>
    );
  }

  const values = pts.flatMap((p) => [p.fitness, p.fatigue, p.form]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xPct = (i: number) => (i / (pts.length - 1)) * 100;
  const x = (i: number) => (xPct(i) / 100) * W;
  const y = (v: number) => PAD_Y + (1 - (v - min) / span) * (H - 2 * PAD_Y);
  const yPct = (v: number) => (y(v) / H) * 100;
  const line = (key: Key) => pts.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
  const currentI = pts.findIndex((p) => p.weekIndex === readiness.currentWeekIndex);
  const active: number | null = hover ?? (currentI >= 0 ? currentI : null);
  const activePoint: ReadinessPoint | undefined = active !== null ? pts[active] : undefined;
  // Keep the tooltip inside the plot: anchor it left of the crosshair past the midpoint.
  const tipOnLeft = active !== null && xPct(active) > 55;
  const hasZero = min < 0 && max > 0;

  // Nearest week to the pointer, so every week is reachable however narrow the plot is.
  const track = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setHover(Math.round(f * (pts.length - 1)));
  };

  return (
    <Panel as="section" aria-label="Fitness, fatigue and form" padding="none" className="p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="text-card-title text-fg">Fitness, fatigue &amp; form</h2>
          <p className="mt-0.5 text-card-desc text-fg-muted">Across the block, week by week</p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-fg-muted">
          {SERIES.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-2">
              <LegendSwatch dot={s.dot} dash={s.dash} />
              {s.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative mt-8 h-52 md:h-60">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          role="img"
          aria-label="Fitness, fatigue, and form across the block"
        >
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1={0}
              x2={W}
              y1={PAD_Y + f * (H - 2 * PAD_Y)}
              y2={PAD_Y + f * (H - 2 * PAD_Y)}
              className="stroke-border-subtle"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {hasZero ? (
            <line
              x1={0}
              x2={W}
              y1={y(0)}
              y2={y(0)}
              className="stroke-border-strong"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {[...SERIES].reverse().map((s) => (
            <polyline
              key={s.key}
              points={line(s.key)}
              fill="none"
              className={s.stroke}
              strokeWidth={s.width}
              strokeDasharray={s.dash}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {hasZero ? (
          <span
            className="pointer-events-none absolute left-0 -translate-y-full pb-0.5 text-meta text-fg-subtle tabular-nums"
            style={{ top: `${yPct(0)}%` }}
            aria-hidden
          >
            0
          </span>
        ) : null}

        {active !== null && activePoint ? (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-border-strong transition-[left] duration-200 ease-soft"
              style={{ left: `${xPct(active)}%` }}
              aria-hidden
            />
            {SERIES.map((s) => (
              <span
                key={s.key}
                className={`pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface-raised transition-[left,top] duration-200 ease-soft ${s.dot}`}
                style={{ left: `${xPct(active)}%`, top: `${yPct(activePoint[s.key])}%` }}
                aria-hidden
              />
            ))}
            {hover !== null ? (
              <div
                className={
                  "pointer-events-none absolute top-0 z-10 w-36 animate-fade rounded-control border border-border bg-surface-raised px-3 py-2.5 shadow-pop transition-[left] duration-200 ease-soft " +
                  (tipOnLeft ? "-translate-x-[calc(100%+12px)]" : "translate-x-3")
                }
                style={{ left: `${xPct(active)}%` }}
                aria-hidden
              >
                <div className="text-meta font-medium text-fg tabular-nums">
                  Week {activePoint.weekIndex}
                  {active === currentI ? <span className="font-normal text-fg-subtle"> · now</span> : null}
                </div>
                <dl className="mt-1.5 flex flex-col gap-1">
                  {SERIES.map((s) => (
                    <div key={s.key} className="flex items-center justify-between gap-3 text-meta">
                      <dt className="inline-flex items-center gap-1.5 text-fg-muted">
                        <span className={`size-1.5 rounded-full ${s.dot}`} />
                        {s.label}
                      </dt>
                      <dd className="text-fg tabular-nums">{fmt(activePoint[s.key])}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </>
        ) : null}

        <div
          className="absolute inset-0 touch-pan-y"
          onPointerMove={track}
          onPointerDown={track}
          onPointerLeave={() => setHover(null)}
          aria-hidden
        />
      </div>

      <div className="relative mt-3 h-4 text-meta text-fg-subtle tabular-nums" aria-hidden>
        {pts.map((p, i) => {
          const edge = i === 0 ? "" : i === pts.length - 1 ? "-translate-x-full" : "-translate-x-1/2";
          return (
            <span
              key={p.weekIndex}
              className={
                `absolute top-0 whitespace-nowrap transition-colors duration-200 ${edge} ` +
                (i === currentI ? "font-medium text-fg" : i === hover ? "text-fg-soft" : "")
              }
              style={{ left: `${xPct(i)}%` }}
            >
              W{p.weekIndex}
            </span>
          );
        })}
      </div>

      <table className="sr-only">
        <caption>Fitness, fatigue, and form by week</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            {SERIES.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pts.map((p) => (
            <tr key={p.weekIndex}>
              <th scope="row">{p.weekIndex}</th>
              {SERIES.map((s) => (
                <td key={s.key}>{fmt(p[s.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
