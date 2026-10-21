import { deriveCues, rankCues } from "~/engine";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { upcomingCueInputs } from "~/server/cues/day-input";
import { toCueView, type CueView, type CueWhen } from "~/views/cues";

export const cueRouter = createTRPCRouter({
  // Today's and tomorrow's cues. Reads only; nothing here changes the plan.
  upcoming: protectedProcedure.query(async ({ ctx }): Promise<{ date: string; when: CueWhen; cues: CueView[] }[]> => {
    const days = await upcomingCueInputs(ctx.db, ctx.session.user.id, new Date());
    return days.map(({ when, input }) => ({
      date: input.date,
      when,
      cues: rankCues(deriveCues(input)).map((f) => toCueView(f, when)),
    }));
  }),
});
