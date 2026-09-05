import type { ReadinessView } from "~/views/types";

const W = 320;
const H = 140;
const PAD = 8;

export function ReadinessChart({ readiness }: { readiness: ReadinessView }) {
  const pts = readiness.series;
  if (pts.length < 2) {
    return (
      <div className="rounded-card border border-border bg-surface p-6 text-card-desc text-fg-muted">
        Not enough data yet
      </div>
    );
  }
  const values = pts.flatMap((p) => [p.fitness, p.fatigue, p.form]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);
  const line = (key: "fitness" | "fatigue" | "form") =>
    pts.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
  const currentI = pts.findIndex((p) => p.weekIndex === readiness.currentWeekIndex);

  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="text-eyebrow font-medium text-fg-soft">Fitness · Fatigue · Form</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-4 w-full"
        role="img"
        aria-label="Fitness, fatigue, and form across the block"
      >
        {min < 0 && max > 0 ? (
          <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} className="stroke-border" strokeWidth={1} />
        ) : null}
        {currentI >= 0 ? (
          <line
            x1={x(currentI)}
            x2={x(currentI)}
            y1={PAD}
            y2={H - PAD}
            className="stroke-border-subtle"
            strokeWidth={1}
          />
        ) : null}
        <polyline points={line("fitness")} fill="none" className="stroke-fg-soft" strokeWidth={1.5} />
        <polyline
          points={line("fatigue")}
          fill="none"
          className="stroke-fg-subtle"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <polyline points={line("form")} fill="none" className="stroke-fg" strokeWidth={2} />
      </svg>
      <div className="mt-3 flex gap-4 text-[12px]">
        <span className="text-fg">■ Form</span>
        <span className="text-fg-soft">■ Fitness</span>
        <span className="text-fg-subtle">▨ Fatigue</span>
      </div>
    </div>
  );
}
