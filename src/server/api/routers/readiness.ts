import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { BLOCK_FOR_READINESS_SELECT, readinessSamplesFrom } from "~/server/mesocycle/readiness-samples";
import { currentWeekIndex } from "~/server/views/to-mesocycle-view";
import { toReadinessView } from "~/views/readiness";
import type { ReadinessView } from "~/views/types";

export const readinessRouter = createTRPCRouter({
  // Real Fitness/Fatigue/Form from logged load. Read-only; engine owns numbers.
  getReadiness: protectedProcedure.query(async ({ ctx }): Promise<ReadinessView> => {
    const userId = ctx.session.user.id;
    const block = await ctx.db.mesocycle.findFirst({
      where: { status: "ACTIVE", athleteProfile: { userId } },
      select: BLOCK_FOR_READINESS_SELECT,
    });

    const curIdx = block ? currentWeekIndex(block.startDate, block.lengthWeeks) : 1;
    if (!block) return { series: [], currentWeekIndex: curIdx };

    const blended = readinessSamplesFrom(block);
    if (blended.length === 0) return { series: [], currentWeekIndex: curIdx };
    return toReadinessView(blended, curIdx);
  }),
});
