import { Triangle } from "lucide-react";
import { Panel } from "~/components/ui-kit/app-shell-kit";
import { ZoneLegend } from "~/components/viz/zone-legend";
import { WeekColumnHeader } from "./week-column-header";
import { GridCell } from "./grid-cell";
import type { MesocycleView } from "~/views/types";

function muscleLabel(m: string): string {
  return m.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// The sticky label column sits over horizontally scrolled cells, so it needs an opaque fill.
const STICKY = "sticky left-0 z-10 bg-surface-raised";

export function BlockGrid({ block }: { block: MesocycleView }) {
  const priority = new Set(block.priorityMuscles);
  return (
    <section aria-label="Planned sets per muscle, per week" className="animate-rise">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-section text-fg">Weekly volume</h2>
        <ZoneLegend />
      </div>
      <Panel padding="none" className="overflow-hidden">
        <div className="overflow-x-auto p-3 sm:p-4">
          <div
            className="grid min-w-max gap-1"
            style={{ gridTemplateColumns: `minmax(132px, 168px) repeat(${block.weeks.length}, minmax(60px, 1fr))` }}
          >
            {/* header row */}
            <div className={STICKY} />
            {block.weeks.map((w) => (
              <WeekColumnHeader key={w.index} week={w} />
            ))}

            {/* muscle rows */}
            {block.muscles.map((muscle) => (
              <RowFragment key={muscle} block={block} muscle={muscle} isPriority={priority.has(muscle)} muscleLabel={muscleLabel(muscle)} />
            ))}

            {/* footer: per-week totals */}
            <div className={STICKY + " mt-1 flex items-center border-t border-border-subtle pt-2 pr-3 pl-1 text-meta text-fg-subtle"}>
              Total
            </div>
            {block.weeks.map((w) => (
              <div
                key={`t-${w.index}`}
                className={
                  "mt-1 border-t border-border-subtle pt-2 pb-0.5 text-center text-meta tabular-nums " +
                  (w.isCurrent ? "font-semibold text-fg" : "text-fg-muted")
                }
              >
                {w.totalSets}
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </section>
  );
}

function RowFragment({
  block,
  muscle,
  isPriority,
  muscleLabel,
}: {
  block: MesocycleView;
  muscle: MesocycleView["muscles"][number];
  isPriority: boolean;
  muscleLabel: string;
}) {
  return (
    <>
      <div className={STICKY + " flex items-center gap-1.5 pr-3 pl-1 text-nav text-fg-soft"}>
        <span className="truncate">{muscleLabel}</span>
        {isPriority ? (
          <span title="Prioritized" className="inline-flex text-fg-subtle">
            <Triangle className="size-2.5 fill-current" aria-hidden />
            <span className="sr-only">Prioritized</span>
          </span>
        ) : null}
      </div>
      {block.weeks.map((w) => {
        const cell = w.cells.find((c) => c.muscle === muscle)!;
        return <GridCell key={`${muscle}-${w.index}`} week={w} cell={cell} />;
      })}
    </>
  );
}
