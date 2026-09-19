import type { RedistributionCandidate, RedistributionKind, SessionPlan, WeekPlan } from "~/engine";

export interface RescheduleOptionView {
  kind: RedistributionKind;
  recommended: boolean;
  recoveredSets: number;
  droppedSets: number;
  summary: string;
  perSession: { slotId: string; label: string; addedSets: number }[];
}

function totalSets(s: SessionPlan): number {
  return s.prescriptions.reduce((n, p) => n + p.sets, 0);
}

function summarise(kind: RedistributionKind, recovered: number, dropped: number): string {
  if (kind === "MAKE_UP") return `Make up all ${recovered} sets across your remaining sessions.`;
  if (kind === "PARTIAL") return `Recover ${recovered} priority sets, drop ${dropped}.`;
  return `Skip it — drop ${dropped} sets this week.`;
}

/** Pure: engine redistribution candidates → athlete-facing option views. `addedSets`
 * per session is the candidate's set count minus the original week's. Numbers come
 * from the engine (tradeoff + candidate plan); this only reshapes. */
export function toRescheduleOptionViews(
  candidates: RedistributionCandidate[],
  originalWeek: WeekPlan,
): RescheduleOptionView[] {
  const origBySlot = new Map(originalWeek.sessions.map((s) => [s.slotId, totalSets(s)]));
  return candidates.map((c) => ({
    kind: c.kind,
    recommended: c.recommended,
    recoveredSets: c.tradeoff.recovered,
    droppedSets: c.tradeoff.dropped,
    summary: summarise(c.kind, c.tradeoff.recovered, c.tradeoff.dropped),
    perSession: c.week.sessions
      .map((s) => ({ slotId: s.slotId, label: s.label, addedSets: totalSets(s) - (origBySlot.get(s.slotId) ?? 0) }))
      .filter((p) => p.addedSets > 0),
  }));
}
