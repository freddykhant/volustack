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

function Mark({ state }: { state: keyof typeof STATE_LABEL }) {
  if (state === "PREFERRED") return <Star className="size-4" aria-hidden />;
  if (state === "BLOCKED") return <Ban className="size-4" aria-hidden />;
  return <span aria-hidden className="size-1 rounded-full bg-current" />;
}

/** The athlete's standing week. Tap a cell to cycle Available → Preferred → Blocked.
 * State is carried by the mark and the label, not by colour alone. */
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
  const rows: (Daypart | null)[] = mode === "HALF_DAY" ? ["AM", "PM"] : [null];
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <div className="grid min-w-[420px] grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] gap-1.5">
          <span />
          {DAY_NAMES.map((d) => (
            <span
              key={d}
              className="text-eyebrow text-center font-medium text-fg-subtle"
            >
              {d}
            </span>
          ))}
          {rows.map((daypart) => (
            <div key={daypart ?? "day"} className="contents">
              <span className="text-eyebrow self-center font-medium text-fg-subtle">
                {daypart ?? ""}
              </span>
              {DAY_NAMES.map((name, day) => {
                const state = cellState(value, mode, { day, daypart });
                return (
                  <button
                    key={name}
                    type="button"
                    disabled={disabled}
                    aria-label={`${name}${daypart ? ` ${daypart}` : ""}: ${STATE_LABEL[state]}`}
                    onClick={() =>
                      onChange(cycleCell(value, mode, day, daypart))
                    }
                    className={
                      "flex h-11 items-center justify-center rounded-control border transition-colors disabled:opacity-60 " +
                      (state === "PREFERRED"
                        ? "border-accent/25 bg-selection text-accent"
                        : state === "BLOCKED"
                          ? "border-dashed border-border-strong text-fg-subtle hover:bg-hover"
                          : "border-transparent bg-sunken text-fg-muted hover:bg-press")
                    }
                  >
                    <Mark state={state} />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-meta text-fg-muted">
        <Star className="size-3.5" aria-hidden /> preferred
        <span aria-hidden>·</span> available
        <span aria-hidden>·</span>
        <Ban className="size-3.5" aria-hidden /> blocked
        <span aria-hidden>·</span> tap a cell to change it
      </p>
    </div>
  );
}
