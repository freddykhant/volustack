import { z } from "zod";
import { ActivityIntensityEnum, ActivityKindEnum, DaypartEnum } from "./enums";
import { IsoDateSchema } from "./schedule";

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
  durationMin: z.number().int().min(5).max(600).nullable(),
});
export type ActivityAddInput = z.infer<typeof ActivityAddInputSchema>;

export const ActivityRemoveInputSchema = z.object({ weekIndex: WeekIndexSchema, id: z.string().min(1).max(64) });
export type ActivityRemoveInput = z.infer<typeof ActivityRemoveInputSchema>;
