import { z } from "zod";
import { ActivityIntensityEnum, ActivityKindEnum, DaypartEnum } from "./enums";
import { IsoDateSchema } from "./schedule";

/** Bounds on a stated duration, in minutes. */
export const ACTIVITY_MIN_MINUTES = 5;
export const ACTIVITY_MAX_MINUTES = 600;

/** Outside activities a single date may hold. */
export const MAX_ACTIVITIES_PER_DAY = 3;

const WeekIndexSchema = z.number().int().min(1);

export const ActivityListInputSchema = z.object({ weekIndex: WeekIndexSchema });

/** `date` must fall in the viewed week; the router checks that against the block. */
export const ActivityAddInputSchema = z.object({
  weekIndex: WeekIndexSchema,
  date: IsoDateSchema,
  daypart: DaypartEnum.nullable(),
  kind: ActivityKindEnum,
  intensity: ActivityIntensityEnum,
  durationMin: z.number().int().min(ACTIVITY_MIN_MINUTES).max(ACTIVITY_MAX_MINUTES).nullable(),
});
export type ActivityAddInput = z.infer<typeof ActivityAddInputSchema>;

export const ActivityRemoveInputSchema = z.object({ weekIndex: WeekIndexSchema, id: z.string().min(1).max(64) });
export type ActivityRemoveInput = z.infer<typeof ActivityRemoveInputSchema>;
