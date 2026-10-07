// src/engine/_fixtures/schedule.ts
import type { Footprint, Placement, ScheduleInput, ScheduleSession } from "../schedule";

export const sess = (
  id: string,
  order: number,
  footprint: Footprint,
  placement: Placement | null = null,
  locked = false,
  inert = false,
): ScheduleSession => ({ id, order, footprint, locked, inert, placement });

export const makeInput = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
  mode: "DAY",
  weekStartDay: 0,
  sessions: [],
  availability: [],
  carryIn: [],
  firstOpenDay: 0,
  ...over,
});

/** The same input, with `layout` recorded as the saved placements. */
export function withSaved(input: ScheduleInput, layout: Record<string, Placement>): ScheduleInput {
  return { ...input, sessions: input.sessions.map((s) => ({ ...s, placement: layout[s.id] ?? null })) };
}
