import type { MesocycleView } from "~/views/types";

export function BlockHeader({ block }: { block: MesocycleView }) {
  const pct = Math.round((block.currentWeekIndex / block.blockLengthWeeks) * 100);
  return (
    <header className="border-b border-border-subtle px-6 py-5">
      <div className="flex items-center gap-3">
        <h1 className="text-section text-fg">{block.name}</h1>
        <span className="rounded-pill bg-selection px-2 py-0.5 text-[12px] font-semibold text-accent">
          {block.status}
        </span>
      </div>
      <div className="mt-1 text-nav text-fg-muted">
        {block.splitLabel} · {block.daysPerWeek} days/week · Week {block.currentWeekIndex} of {block.blockLengthWeeks}
      </div>
      <div className="mt-3 h-1.5 w-full max-w-md overflow-hidden rounded-pill bg-surface">
        <div className="h-full rounded-pill bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </header>
  );
}
