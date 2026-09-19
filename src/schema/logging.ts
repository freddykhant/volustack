import { z } from "zod";

/** One performed set the athlete logs against a prescription. */
export const LogSetInputSchema = z.object({
  prescriptionId: z.string(),
  setNumber: z.number().int().min(1),
  weightKg: z.number().nonnegative(), // 0 allowed for bodyweight
  reps: z.number().int().min(0),
  achievedRir: z.number().int().min(0).max(10).optional(),
});
export type LogSetInput = z.infer<typeof LogSetInputSchema>;

/** A whole session's log, saved in one shot. An empty `sets` array is valid
 * (the session is completed with some/all exercises skipped). */
export const LogSessionInputSchema = z.object({
  sessionId: z.string(),
  sets: z.array(LogSetInputSchema),
});
export type LogSessionInput = z.infer<typeof LogSessionInputSchema>;
