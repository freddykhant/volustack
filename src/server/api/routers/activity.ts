import { TRPCError } from "@trpc/server";
import {
  ActivityAddInputSchema,
  ActivityListInputSchema,
  ActivityRemoveInputSchema,
  MAX_ACTIVITIES_PER_DAY,
} from "~/schema";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { loadWeekContext } from "~/server/schedule/week-context";
import { toActivityView, type ActivityView } from "~/views/activity";

const atMidnight = (iso: string) => new Date(`${iso}T00:00:00Z`);
const FINISHED = "This week is finished, so it can’t be changed.";

/** Outside activities: what the athlete does besides lifting. They feed coach cues only;
 * nothing in scheduling reads them, so writes here take no block lock. */
export const activityRouter = createTRPCRouter({
  list: protectedProcedure.input(ActivityListInputSchema).query(async ({ ctx, input }): Promise<ActivityView[]> => {
    const c = await loadWeekContext(ctx.db, ctx.session.user.id, input.weekIndex, new Date());
    const rows = await ctx.db.outsideActivity.findMany({
      where: { athleteProfileId: c.athleteProfileId, date: { gte: atMidnight(c.days[0]!.date), lte: atMidnight(c.days[6]!.date) } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toActivityView);
  }),

  add: protectedProcedure.input(ActivityAddInputSchema).mutation(async ({ ctx, input }): Promise<ActivityView> => {
    const c = await loadWeekContext(ctx.db, ctx.session.user.id, input.weekIndex, new Date());
    if (c.readOnly) throw new TRPCError({ code: "BAD_REQUEST", message: FINISHED });
    if (!c.days.some((d) => d.date === input.date)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That date isn’t in this week." });
    }
    // Count, then insert. Two racing adds can at worst leave one extra row: accepted.
    const row = await ctx.db.$transaction(async (tx) => {
      const already = await tx.outsideActivity.count({ where: { athleteProfileId: c.athleteProfileId, date: atMidnight(input.date) } });
      if (already >= MAX_ACTIVITIES_PER_DAY) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `A day can hold up to ${MAX_ACTIVITIES_PER_DAY} activities.` });
      }
      return tx.outsideActivity.create({
        data: {
          athleteProfileId: c.athleteProfileId,
          date: atMidnight(input.date),
          daypart: input.daypart,
          kind: input.kind,
          intensity: input.intensity,
          durationMin: input.durationMin,
        },
      });
    });
    return toActivityView(row);
  }),

  remove: protectedProcedure.input(ActivityRemoveInputSchema).mutation(async ({ ctx, input }): Promise<{ removed: true }> => {
    const c = await loadWeekContext(ctx.db, ctx.session.user.id, input.weekIndex, new Date());
    if (c.readOnly) throw new TRPCError({ code: "BAD_REQUEST", message: FINISHED });
    const row = await ctx.db.outsideActivity.findFirst({
      where: { id: input.id, athleteProfileId: c.athleteProfileId },
      select: { id: true, date: true },
    });
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    if (!c.days.some((d) => d.date === row.date.toISOString().slice(0, 10))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That activity isn’t in this week." });
    }
    await ctx.db.outsideActivity.delete({ where: { id: row.id } });
    return { removed: true };
  }),
});
