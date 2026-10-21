"use client";

import { Ban, Star } from "lucide-react";
import { cellState, type AvailabilityCellInput } from "~/engine/schedule";
import type { Daypart, ScheduleMode } from "~/schema";
import { DAY_NAMES } from "~/views/schedule";
import { cycleCell } from "./availability";

const STATE_LABEL = {
  AVAILABLE: "Available",
  PREFERRED: "Preferred",
  BLOCKED: "Blocked",
} as const;

type CellState = keyof typeof STATE_LABEL;

// Three tiers by depth, not colour: preferred is raised, available sits flat in a well,
// blocked is an empty dashed outline. Keeps the One Signal accent free for real live state.
const CELL: Record<CellState, string> = {
  PREFERRED: "bg-surface-raised text-fg ring-1 ring-inset ring-border-strong shadow-control",
  AVAILABLE: "bg-sunken text-fg-muted hover:bg-press",
  BLOCKED: "border border-dashed border-border-strong text-fg-subtle hover:bg-hover",
};

/** One slot: a pill that names its own state, so the grid never needs a legend. */
function Slot({
  state,
  daypart,
  label,
  disabled,
  onClick,
}: {
  state: CellState;
  daypart: Daypart | null;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      className={
        "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-pill px-3.5 text-meta font-medium transition-[background-color,color,box-shadow] active:scale-[0.98] disabled:opacity-60 " +
        CELL[state]
      }
    >
      {daypart ? <span className="w-6 shrink-0 text-left text-fg-subtle tabular-nums">{daypart}</span> : null}
      {state === "PREFERRED" ? (
        <Star className="size-3.5 shrink-0 fill-current" aria-hidden />
      ) : state === "BLOCKED" ? (
        <Ban className="size-3.5 shrink-0" aria-hidden />
      ) : null}
      <span className="truncate">{STATE_LABEL[state]}</span>
    </button>
  );
}

/** The athlete's standing week, one row per day. Tap a slot to cycle Available → Preferred → Blocked.
 * Each slot names its state in words (plus a mark), so state is never carried by colour alone. */
export function AvailabilityGrid({
  mode,
  value,
  onChange,
  disabled = false,
}: {
  mode: ScheduleMode;
  value: AvailabilityCellInput[];
  onChange: (next: AvailabilityCellInput[]) => void;
  disabled?: boolean;
}) {
  const dayparts: (Daypart | null)[] = mode === "HALF_DAY" ? ["AM", "PM"] : [null];
  return (
    <ul role="list" aria-label="Weekly availability" className="flex flex-col divide-y divide-border-subtle">
      {DAY_NAMES.map((name, day) => (
        <li key={name} className="flex items-center gap-4 py-2 first:pt-0 last:pb-0">
          <span className="w-10 shrink-0 text-list text-fg">{name}</span>
          <div className="flex min-w-0 flex-1 gap-2">
            {dayparts.map((daypart) => {
              const state = cellState(value, mode, { day, daypart });
              return (
                <Slot
                  key={daypart ?? "day"}
                  state={state}
                  daypart={daypart}
                  label={`${name}${daypart ? ` ${daypart}` : ""}: ${STATE_LABEL[state]}`}
                  disabled={disabled}
                  onClick={() => onChange(cycleCell(value, mode, day, daypart))}
                />
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}
