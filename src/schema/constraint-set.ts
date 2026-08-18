import { z } from "zod";
import { CheckInCadenceEnum, MuscleGroupEnum, SplitTypeEnum } from "./enums";

export const MuscleTargetInputSchema = z.object({
  muscle: MuscleGroupEnum,
  weeklySetTarget: z.number().int().min(0).optional(),
  priority: z.number().int().min(0).max(5).default(0),
});
export type MuscleTargetInput = z.infer<typeof MuscleTargetInputSchema>;

/**
 * The user's training intent, validated. This is the engine's primary input
 * contract and the object the LLM boundary must produce.
 */
export const ConstraintSetInputSchema = z.object({
  daysPerWeek: z.number().int().min(1).max(7),
  splitType: SplitTypeEnum,
  sessionLengthCapMin: z.number().int().min(15).max(240),
  blockLengthWeeks: z.number().int().min(2).max(16),
  deloadWeekIndex: z.number().int().min(1).optional(),
  checkInCadence: CheckInCadenceEnum.default("WEEKLY"),
  muscleTargets: z.array(MuscleTargetInputSchema).default([]),
  excludedExerciseNames: z.array(z.string()).default([]),
});
export type ConstraintSetInput = z.infer<typeof ConstraintSetInputSchema>;
