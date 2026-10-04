import { cellState, type AvailabilityCellInput } from "~/engine/schedule";
import type { Daypart, ScheduleMode } from "~/schema";

/** Tap a cell: Available → Preferred → Blocked → Available. In DAY mode (or when
 * `daypart` is null) both halves of the day are set together. */
export function cycleCell(
  value: AvailabilityCellInput[],
  mode: ScheduleMode,
  day: number,
  daypart: Daypart | null,
): AvailabilityCellInput[] {
  const current = cellState(value, mode, { day, daypart });
  const next: "PREFERRED" | "BLOCKED" | "AVAILABLE" =
    current === "AVAILABLE"
      ? "PREFERRED"
      : current === "PREFERRED"
        ? "BLOCKED"
        : "AVAILABLE";
  const halves: Daypart[] =
    mode === "DAY" || daypart === null ? ["AM", "PM"] : [daypart];
  const rest = value.filter(
    (c) => !(c.day === day && halves.includes(c.daypart)),
  );
  if (next === "AVAILABLE") return rest;
  return [
    ...rest,
    ...halves.map((dp) => ({ day, daypart: dp, state: next })),
  ].sort((a, b) => a.day - b.day || a.daypart.localeCompare(b.daypart));
}

/** Days of the week that still have at least one half not Blocked. */
export function openDayCount(value: AvailabilityCellInput[]): number {
  let open = 0;
  for (let day = 0; day < 7; day++) {
    if (cellState(value, "DAY", { day, daypart: null }) !== "BLOCKED") open++;
  }
  return open;
}
