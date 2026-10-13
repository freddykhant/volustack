import { dayIndex, type ScheduleInput } from "~/engine/schedule";

/** What a "Can't train" control should show for a day (daypart null) or a half-day. */
export type BlockState = "open" | "one_off" | "standing" | "past";

export function blockState(
  input: ScheduleInput,
  day: number,
  daypart: "AM" | "PM" | null,
): BlockState {
  if (dayIndex(day, input.weekStartDay) < input.firstOpenDay) return "past";
  const cells = (daypart === null ? (["AM", "PM"] as const) : [daypart]).map(
    (dp) => input.availability.find((c) => c.day === day && c.daypart === dp),
  );
  const blocked = cells.filter((c) => c?.state === "BLOCKED");
  if (blocked.length < cells.length) return "open";
  // Any one-off half keeps Undo on offer, so a day blocked in one-a-day mode can be cleared.
  return blocked.some((c) => c!.oneOff === true) ? "one_off" : "standing";
}
