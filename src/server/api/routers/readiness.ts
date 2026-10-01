import { computeReadiness, blendRecovery } from "~/engine";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { readinessInputsFromBlock } from "~/server/mesocycle/readiness-inputs";
import { recoveryByWeekFromBlock } from "~/server/mesocycle/recovery-by-week";
import { currentWeekIndex } from "~/server/views/to-mesocycle-view";
import { toReadinessView } from "~/views/readiness";
import type { ReadinessView } from "~/views/types";

export const readinessRouter = createTRPCRouter({
  // Real Fitness/Fatigue/Form from logged load. Read-only; engine owns numbers.
  getReadiness: protectedProcedure.query(async ({ ctx }): Promise<ReadinessView> => {
    const userId = ctx.session.user.id;
    const block = await ctx.db.mesocycle.findFirst({
      where: { status: "ACTIVE", athleteProfile: { userId } },
      select: {
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
              where: { scope: "WEEK" },
              select: { scope: true, muscleFeedback: { select: { recovery: true } } },
            },
          },
        },
      },
    });

    const curIdx = block ? currentWeekIndex(block.startDate, block.lengthWeeks) : 1;
    if (!block) return { series: [], currentWeekIndex: curIdx };

    const inputs = readinessInputsFromBlock(block);
    if (!inputs) return { series: [], currentWeekIndex: curIdx };

    const samples = computeReadiness(inputs.events, inputs.weekEnds);
    const recovery = recoveryByWeekFromBlock(block);
    const blended = blendRecovery(samples, recovery);
    return toReadinessView(blended, curIdx);
  }),
});
