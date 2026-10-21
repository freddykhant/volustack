import { Chip } from "~/components/ui-kit/app-shell-kit";
import type { MesocycleView } from "~/views/types";

function statusLabel(s: MesocycleView["status"]): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export function BlockHeader({ block }: { block: MesocycleView }) {
  const pct = Math.round((block.currentWeekIndex / block.blockLengthWeeks) * 100);
  return (
    <header className="animate-rise">
      <div className="mb-1.5 text-eyebrow font-medium text-fg-subtle">Training block</div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-page-title text-fg">{block.name}</h1>
        <Chip tone="neutral">{statusLabel(block.status)}</Chip>
      </div>
      <div className="mt-1.5 text-body text-fg-muted">
        {block.splitLabel} · {block.daysPerWeek} days/week · Week {block.currentWeekIndex} of {block.blockLengthWeeks}
      </div>
      <div
        className="mt-5 h-1.5 w-full max-w-sm overflow-hidden rounded-pill bg-sunken"
        role="progressbar"
        aria-label="Block progress"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-pill bg-ink transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </header>
  );
}
