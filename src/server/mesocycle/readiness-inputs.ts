import { sessionStimulus, type LoadEvent, type WeekEnd } from "~/engine";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BlockForReadiness {
  startDate: Date | null;
  lengthWeeks: number;
  weeks: {
    sessions: {
      status: string;
      completedAt: Date | null;
      prescriptions: { setLogs: { achievedRir: number | null }[] }[];
    }[];
  }[];
}

/** Turn a persisted ACTIVE block into readiness model inputs: one LoadEvent per
 * COMPLETED session (stimulus at its completedAt day offset) + a week-end offset
 * per week. Null when the block has no timeline (no startDate). Pure. */
export function readinessInputsFromBlock(
  block: BlockForReadiness,
): { events: LoadEvent[]; weekEnds: WeekEnd[] } | null {
  if (!block.startDate) return null;
  const start = block.startDate.getTime();

  const events: LoadEvent[] = [];
  for (const week of block.weeks) {
    for (const s of week.sessions) {
      if (s.status !== "COMPLETED" || !s.completedAt) continue;
      const dayOffset = Math.floor((s.completedAt.getTime() - start) / DAY_MS);
      const load = sessionStimulus(s.prescriptions.flatMap((p) => p.setLogs));
      events.push({ dayOffset, load });
    }
  }

  const weekEnds: WeekEnd[] = Array.from({ length: block.lengthWeeks }, (_, i) => ({
    weekIndex: i + 1,
    dayOffset: (i + 1) * 7 - 1,
  }));

  return { events, weekEnds };
}
