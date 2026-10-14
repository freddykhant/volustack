import { z } from "zod";
import { DaypartEnum } from "./enums";
import { ExceptionInputSchema, IsoDateSchema } from "./schedule";

/** Messages one athlete may send the coach in any 24 hours. */
export const COACH_DAILY_LIMIT = 50;
export const COACH_MAX_DATES = 14;
export const COACH_MAX_TEXT = 500;

/** Everything the coach box can be asked to do or answer. */
export const CoachIntentEnum = z.enum([
  "block_time",
  "unblock_time",
  "skip_session",
  "rearrange_week",
  "ask_week_issues",
  "ask_why_placement",
  "ask_next_session",
  "ask_recovery",
  "unclear",
  "out_of_scope",
]);
export type CoachIntent = z.infer<typeof CoachIntentEnum>;

/**
 * The only thing the language model may return. It is parsed here and then checked
 * field by field against the real week; nothing in it is trusted as it arrives.
 */
export const CoachIntentFormSchema = z.object({
  intent: CoachIntentEnum,
  /** Dates the message refers to. Empty when it names none. */
  dates: z.array(z.object({ date: IsoDateSchema, daypart: DaypartEnum.nullable() })).max(COACH_MAX_DATES),
  /** A session key from the context ("S1"), or null. */
  sessionKey: z
    .string()
    .regex(/^S\d{1,2}$/)
    .nullable(),
});
export type CoachIntentForm = z.infer<typeof CoachIntentFormSchema>;

export const CoachMessageInputSchema = z.object({
  weekIndex: z.number().int().min(1),
  text: z.string().trim().min(1).max(COACH_MAX_TEXT),
});
export type CoachMessageInput = z.infer<typeof CoachMessageInputSchema>;

/** Several one-off cells to block or unblock in one transaction. */
export const ExceptionCellsInputSchema = z.object({
  cells: z.array(ExceptionInputSchema).min(1).max(COACH_MAX_DATES),
});
export type ExceptionCellsInput = z.infer<typeof ExceptionCellsInputSchema>;
