"use client";

import { cellState, type AvailabilityCellInput } from "~/engine/schedule";
import type { Daypart, ScheduleMode } from "~/schema";
import { DAY_NAMES } from "~/views/schedule";
import { cycleCell } from "./availability";

const STATE_LABEL = {
  AVAILABLE: "Available",
  PREFERRED: "Preferred",
  BLOCKED: "Blocked",
} as const;
const STATE_MARK = { AVAILABLE: "·", PREFERRED: "★", BLOCKED: "✕" } as const;

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
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <div className="grid min-w-[420px] grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] gap-1.5">
          <span />
          {DAY_NAMES.map((d) => (
            <span key={d} className="text-fg-subtle text-center text-[12px]">
              {d}
            </span>
          ))}
          {rows.map((daypart) => (
            <div key={daypart ?? "day"} className="contents">
              <span className="text-fg-subtle self-center text-[12px]">
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
                      "rounded-control text-nav h-10 border transition-colors disabled:opacity-60 " +
                      (state === "PREFERRED"
                        ? "border-accent bg-selection text-accent"
                        : state === "BLOCKED"
                          ? "border-border-subtle bg-canvas text-fg-subtle"
                          : "border-border-subtle text-fg-muted hover:border-border")
                    }
                  >
                    {STATE_MARK[state]}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="text-fg-subtle text-[12px]">
        ★ preferred · · available · ✕ blocked. Tap a cell to change it.
      </p>
    </div>
  );
}
