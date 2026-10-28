"use client";

import { Chip } from "~/components/ui-kit/app-shell-kit";
import { READINESS_SERIES, formPercent } from "../demo-data";
import { useReveal } from "../use-reveal";

// Same geometry and encoding as the app's readiness-chart.tsx, so a visitor who signs in sees the same key.
// re-review: colour scheme (Form ink, Fitness zone-building, Fatigue dashed zone-max)
const W = 600;
const H = 200;
const PAD_Y = 14;

const values = READINESS_SERIES.flatMap((p) => [p.fitness, p.fatigue, p.form]);
const min = Math.min(...values);
const span = Math.max(...values) - min || 1;
const x = (i: number) => (i / (READINESS_SERIES.length - 1)) * W;
const y = (v: number) => PAD_Y + (1 - (v - min) / span) * (H - 2 * PAD_Y);
const line = (key: "fitness" | "fatigue" | "form") =>
  READINESS_SERIES.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");

const last = READINESS_SERIES.at(-1)!;
const pct = formPercent(last);

/** Fitness / Fatigue / Form across a block. Its one change: the Form line draws in. */
export function ReadinessVignette() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref}>
      <p className="sr-only">
        Example readiness: after five weeks, Form sits at {pct}%, which reads as Productive.
      </p>
      <div aria-hidden className="rounded-card border border-border bg-surface p-5 shadow-card sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-eyebrow font-medium text-fg-subtle">Form</div>
            <div className="mt-1 text-stat text-fg tabular-nums">
              {pct > 0 ? "+" : pct < 0 ? "−" : ""}
              {Math.abs(pct)}%
            </div>
          </div>
          <Chip tone="building">Productive</Chip>
        </div>

        <div className="relative mt-4 h-[150px] sm:h-[170px]">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
            <line
              x1={0}
              x2={W}
              y1={y(0)}
              y2={y(0)}
              className="stroke-border-strong"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={line("fitness")}
              fill="none"
              className="stroke-zone-building"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={line("fatigue")}
              fill="none"
              className="stroke-zone-max"
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className={
              "absolute inset-0 size-full transition-[clip-path] duration-300 ease-[var(--ease-out)] " +
              (revealed ? "[clip-path:inset(0_0_0_0)]" : "[clip-path:inset(0_100%_0_0)]")
            }
          >
            <polyline
              points={line("form")}
              fill="none"
              className="stroke-fg"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-fg-muted">
          <Legend label="Form" className="bg-fg" />
          <Legend label="Fitness" className="bg-zone-building" />
          <Legend label="Fatigue" className="bg-zone-max" dashed />
          <span className="ml-auto tabular-nums">Weeks 1–5</span>
        </div>
      </div>
    </div>
  );
}

function Legend({ label, className, dashed }: { label: string; className: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {dashed ? (
        <span className="flex w-4 gap-[3px]">
          <span className={"h-0.5 flex-1 rounded-pill " + className} />
          <span className={"h-0.5 flex-1 rounded-pill " + className} />
        </span>
      ) : (
        <span className={"h-0.5 w-4 rounded-pill " + className} />
      )}
      {label}
    </span>
  );
}
