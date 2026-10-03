import "server-only";
import { blendRecovery, computeReadiness, type ReadinessSample } from "~/engine";
import { readinessInputsFromBlock } from "./readiness-inputs";
import { recoveryByWeekFromBlock } from "./recovery-by-week";

/** The select the readiness pipeline needs. Exported so callers fetch exactly this. */
export const BLOCK_FOR_READINESS_SELECT = {
  startDate: true,
  lengthWeeks: true,
  weeks: {
    select: {
      index: true,
      sessions: {
        select: {
          status: true,
          completedAt: true,
          prescriptions: { select: { setLogs: { select: { achievedRir: true } } } },
        },
      },
      checkIns: {
        where: { scope: "WEEK" as const },
        select: { scope: true, muscleFeedback: { select: { recovery: true } } },
      },
    },
  },
} as const;

type BlockForReadiness = Parameters<typeof readinessInputsFromBlock>[0] &
  Parameters<typeof recoveryByWeekFromBlock>[0];

/** Blended Fitness/Fatigue/Form samples, or [] when there is not enough logged data.
 * Pure given the block; all I/O stays with the caller. */
export function readinessSamplesFrom(block: BlockForReadiness): ReadinessSample[] {
  const inputs = readinessInputsFromBlock(block);
  if (!inputs) return [];
  const samples = computeReadiness(inputs.events, inputs.weekEnds);
  return blendRecovery(samples, recoveryByWeekFromBlock(block));
}
