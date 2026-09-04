import { WeekColumnHeader } from "./week-column-header";
import { GridCell } from "./grid-cell";
import type { MesocycleView } from "~/views/types";

function muscleLabel(m: string): string {
  return m.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function BlockGrid({ block }: { block: MesocycleView }) {
  const priority = new Set(block.priorityMuscles);
  return (
    <div className="overflow-x-auto p-6">
      <div
        className="grid min-w-max gap-px"
        style={{ gridTemplateColumns: `160px repeat(${block.weeks.length}, minmax(56px, 1fr))` }}
      >
        {/* header row */}
        <div className="sticky left-0 z-10 bg-canvas" />
        {block.weeks.map((w) => (
          <div key={w.index} className={w.isCurrent ? "bg-selection" : undefined}>
            <WeekColumnHeader block={block} week={w} />
          </div>
        ))}

        {/* muscle rows */}
        {block.muscles.map((muscle) => (
          <RowFragment key={muscle} block={block} muscle={muscle} isPriority={priority.has(muscle)} muscleLabel={muscleLabel(muscle)} />
        ))}

        {/* footer: per-week totals */}
        <div className="sticky left-0 z-10 bg-canvas px-2 py-1.5 text-right text-[12px] text-fg-subtle">Total</div>
        {block.weeks.map((w) => (
          <div key={`t-${w.index}`} className={"px-2 py-1.5 text-center text-[12px] text-fg-subtle " + (w.isCurrent ? "bg-selection" : "")}>
            {w.totalSets}
          </div>
        ))}
      </div>
    </div>
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
      <div className="sticky left-0 z-10 flex items-center gap-1 bg-canvas pr-3 text-nav text-fg-soft">
        {isPriority ? <span className="text-fg-soft" title="Prioritized">▲</span> : null}
        {muscleLabel}
      </div>
      {block.weeks.map((w) => {
        const cell = w.cells.find((c) => c.muscle === muscle)!;
        return <GridCell key={`${muscle}-${w.index}`} block={block} week={w} cell={cell} />;
      })}
    </>
  );
}
