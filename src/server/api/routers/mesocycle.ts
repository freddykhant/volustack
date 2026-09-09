import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { MESOCYCLE_INCLUDE, toMesocycleView } from "~/server/views/to-mesocycle-view";
import type { MesocycleView } from "~/views/types";

/**
 * Read path for the athlete's current training block. User-scoped: only the
 * signed-in user's own ACTIVE mesocycle is ever returned. Returns null when the
 * user has no active block (the UI renders an empty state).
 */
export const mesocycleRouter = createTRPCRouter({
  getCurrentBlock: protectedProcedure.query(async ({ ctx }): Promise<MesocycleView | null> => {
    const meso = await ctx.db.mesocycle.findFirst({
      where: {
        status: "ACTIVE",
        athleteProfile: { userId: ctx.session.user.id },
      },
      orderBy: { createdAt: "desc" },
      include: MESOCYCLE_INCLUDE,
    });
    return meso ? toMesocycleView(meso) : null;
  }),
});
