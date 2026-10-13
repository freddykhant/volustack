// src/engine/schedule-judgement.ts
import type { DecisionFact } from "./facts";
import { isUsableChoice, verdictById, type JudgementRequest, type Verdict } from "./judgement";
import type { LayoutOption, ScheduleInput } from "./schedule";

export const REPLACEMENT_PICK_ID = "replacement_pick";

const LENS_DESCRIPTION = {
  BALANCED: "Re-arrange the week for the best recovery between sessions.",
  FEWEST_CHANGES: "Move as few sessions as possible.",
  KEEPS_PREFERENCES: "Keep sessions in the athlete's preferred times where possible.",
} as const;

function describeOption(o: LayoutOption, label: (id: string) => string): string {
  if (o.overflow?.kind === "double_up") return "Keep every session by training twice on one day.";
  if (o.skipped.length > 0) return `Skip ${o.skipped.map(label).join(" and ")} this week and re-arrange the rest.`;
  return LENS_DESCRIPTION[o.lens];
}

/** How many of each kind of warning a layout leaves the athlete with. */
function issueCounts(facts: DecisionFact[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of facts) out[f.kind] = (out[f.kind] ?? 0) + 1;
  return out;
}

/**
 * One advisory question: which of the engine's options should the athlete see first?
 * The state carries labels and small counts only. Layouts, costs and weights stay in the
 * engine, so the model has nothing to recompute and nothing numeric to get wrong.
 */
export function replacementQuestions(
  options: LayoutOption[],
  input: ScheduleInput,
  label: (id: string) => string,
): JudgementRequest {
  const offered: Record<string, string | null> = {};
  for (const o of options) offered[o.id] = describeOption(o, label);

  return {
    subject: "replacement",
    state: {
      scheduleMode: input.mode === "HALF_DAY" ? "morning or afternoon sessions" : "one session a day",
      sessionsLeftThisWeek: input.sessions.filter((s) => !s.locked && !s.inert).length,
      options: options.map((o) => ({
        option: o.id,
        sessionsMoved: o.moves.length,
        sessionsSkipped: o.skipped.map(label),
        trainsTwiceInOneDay: o.overflow?.kind === "double_up",
        warningsLeft: issueCounts(o.score.facts),
      })),
    },
    questions: [
      {
        id: REPLACEMENT_PICK_ID,
        kind: "choice",
        authority: "ADVISORY",
        instructions:
          "A strength athlete has said they cannot train at a time they were scheduled to this week. Each entry in `options` is a complete, already-checked way to arrange the rest of the week: how many sessions it moves, which sessions it skips, whether it has them train twice in one day, and in `warningsLeft` how many recovery or preference warnings remain afterwards (`short_rest` is two sessions for the same muscles too close together, `same_day_stack` is two sessions in one day, `load_streak` is too many training days in a row, `off_preference` is a session outside the athlete's preferred times, `uneven_spread` is sessions bunched together). Which option serves this athlete best?",
        options: offered,
      },
    ],
  };
}

/**
 * Put Jev's pick first. Only a confident verdict for an option that was actually offered
 * counts; anything else returns the engine's order untouched. Can never add, drop or
 * alter an option.
 */
export function applyReplacementVerdict(
  options: LayoutOption[],
  verdicts: Verdict[],
): { options: LayoutOption[]; judged: boolean } {
  const v = verdictById(verdicts, REPLACEMENT_PICK_ID);
  if (!isUsableChoice(v, options.map((o) => o.id))) return { options, judged: false };
  const lead = options.find((o) => o.id === v.choice)!;
  return { options: [lead, ...options.filter((o) => o !== lead)], judged: true };
}
