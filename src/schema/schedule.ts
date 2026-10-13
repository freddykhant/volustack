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

/** A calendar date with no time or zone: "YYYY-MM-DD". */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Use YYYY-MM-DD." })
  .refine(
    (s) => {
      const t = Date.parse(`${s}T00:00:00Z`);
      return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
    },
    { message: "Not a calendar date." },
  );

/** One-off blocked time. `daypart` null means the whole day. */
export const ExceptionInputSchema = z.object({ date: IsoDateSchema, daypart: DaypartEnum.nullable() });
export type ExceptionInput = z.infer<typeof ExceptionInputSchema>;

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
  origin: z.enum(["athlete", "suggestion", "replacement"]),
  /** The re-placement option the athlete accepted, recorded with the decision. */
  optionId: z.string().max(32).optional(),
});
export type ApplyLayoutInput = z.infer<typeof ApplyLayoutInputSchema>;
