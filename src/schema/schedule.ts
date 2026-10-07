import { z } from "zod";
import { isValidTimeZone } from "~/domain/local-day";
import { AvailabilityStateEnum, DaypartEnum, ScheduleModeEnum } from "./enums";

const DaySchema = z.number().int().min(0).max(6); // 0 = Mon … 6 = Sun

/** Where a session sits. `daypart` is null in DAY mode. */
export const PlacementSchema = z.object({ day: DaySchema, daypart: DaypartEnum.nullable() });

export const AvailabilityCellSchema = z.object({
  day: DaySchema,
  daypart: DaypartEnum,
  state: AvailabilityStateEnum,
});

/** Sparse grid: a cell that is absent is Available. At most one entry per cell. */
export const AvailabilityInputSchema = z
  .array(AvailabilityCellSchema)
  .max(14)
  .refine((cells) => new Set(cells.map((c) => `${c.day}:${c.daypart}`)).size === cells.length, {
    message: "Each availability cell may appear only once.",
  });

export const TimezoneSchema = z.string().max(64).refine(isValidTimeZone, { message: "Unknown timezone." });

export const SchedulePrefsInputSchema = z.object({
  scheduleMode: ScheduleModeEnum,
  availability: AvailabilityInputSchema.default([]),
});
export type SchedulePrefsInput = z.infer<typeof SchedulePrefsInputSchema>;

export const ApplyLayoutInputSchema = z.object({
  weekIndex: z.number().int().min(1),
  /** The placements the athlete wants. Sessions left out keep their saved placement. */
  placements: z.array(z.object({ sessionId: z.string(), day: DaySchema, daypart: DaypartEnum.nullable() })).max(14),
  /** The saved placements the client started from, one entry per session in the week. */
  expected: z.array(z.object({ sessionId: z.string(), placement: PlacementSchema.nullable() })).max(14),
  carryForward: z.boolean().default(false),
  origin: z.enum(["athlete", "suggestion"]),
});
export type ApplyLayoutInput = z.infer<typeof ApplyLayoutInputSchema>;
