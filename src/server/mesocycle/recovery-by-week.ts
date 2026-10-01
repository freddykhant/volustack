import { weeklyRecoverySignal } from "~/engine";

export interface BlockForRecovery {
  weeks: {
    index: number;
    checkIns: { scope: string; muscleFeedback: { recovery: number | null }[] }[];
  }[];
}

/** Map week.index → worst-biased weekly recovery signal, for weeks that have a
 * WEEK check-in. Weeks with no WEEK check-in are absent from the map (→ no nudge).
 * A WEEK check-in with no recovery values maps to null (also → no nudge). Pure. */
export function recoveryByWeekFromBlock(block: BlockForRecovery): Map<number, number | null> {
  const map = new Map<number, number | null>();
  for (const week of block.weeks) {
    const checkIn = week.checkIns.find((c) => c.scope === "WEEK");
    if (!checkIn) continue;
    map.set(week.index, weeklyRecoverySignal(checkIn.muscleFeedback.map((m) => m.recovery)));
  }
  return map;
}
