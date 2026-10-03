import type { WeekAdjustment } from "~/engine";
import type { MuscleProposalView, ProgressionProposalKind, ProgressionProposalView } from "./types";

/** Map a stepWeek WeekAdjustment to the accept-gate view. Shows only movers and
 * swap-flagged muscles for scanability (holds are omitted; empty list ⇒ "no changes").
 * Invents no numbers — every field mirrors the engine's adjustment. */
export function toProgressionProposalView(
  adj: WeekAdjustment,
  opts: { hasUpcoming: boolean; upcomingIsDeload: boolean },
): ProgressionProposalView {
  const kind: ProgressionProposalKind = !opts.hasUpcoming
    ? "BLOCK_END"
    : opts.upcomingIsDeload
      ? "DELOAD_HOLD"
      : "CHANGES";

  const adjustments: MuscleProposalView[] =
    kind === "CHANGES"
      ? adj.adjustments
          .filter((a) => a.delta !== 0 || a.swapCandidate)
          .map((a) => ({
            muscle: a.muscle,
            plannedSets: a.plannedSets,
            adjustedSets: a.adjustedSets,
            delta: a.delta,
            cause: a.cause,
            swapCandidate: a.swapCandidate,
          }))
      : [];

  return {
    fromWeekIndex: adj.fromWeekIndex,
    appliesToWeekIndex: adj.appliesToWeekIndex,
    kind,
    advisory:
      adj.checkInValue === "high"
        ? "A few muscles are near the ceiling — hold your form tight this week."
        : undefined,
    adjustments,
    closeCall: adj.facts.some((f) => f.kind === "close_call") ? true : undefined,
  };
}
