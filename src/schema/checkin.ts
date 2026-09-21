import { z } from "zod";
import { MuscleGroupEnum } from "./enums";

const Score = z.number().int().min(0).max(3);

export const CheckInMuscleInputSchema = z.object({
  muscle: MuscleGroupEnum,
  recovery: Score,
  joint: Score,
});
export type CheckInMuscleInput = z.infer<typeof CheckInMuscleInputSchema>;

export const WeeklyCheckInInputSchema = z.object({
  weekIndex: z.number().int().min(1),
  muscles: z.array(CheckInMuscleInputSchema),
});
export type WeeklyCheckInInput = z.infer<typeof WeeklyCheckInInputSchema>;
