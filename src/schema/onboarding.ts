import { z } from "zod";
import {
  ExperienceLevelEnum,
  MuscleGroupEnum,
  SexEnum,
  SplitTypeEnum,
} from "./enums";

/**
 * Everything the first-run wizard collects. Bio fields are stored on
 * AthleteProfile (not consumed by the engine yet — phase 2). Logistics, split,
 * proficiency, and priority muscles drive the engine via buildConstraintSetInput.
 * Numeric bounds mirror ConstraintSetInputSchema where they overlap.
 */
export const OnboardingInputSchema = z.object({
  sex: SexEnum,
  age: z.number().int().min(13).max(100),
  heightCm: z.number().min(120).max(250),
  weightKg: z.number().min(30).max(300),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionLengthCapMin: z.number().int().min(15).max(240),
  splitType: SplitTypeEnum,
  proficiency: ExperienceLevelEnum,
  priorityMuscles: z.array(MuscleGroupEnum).max(3).default([]),
});
export type OnboardingInput = z.infer<typeof OnboardingInputSchema>;
