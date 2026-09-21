import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { stepWeek, weekPlanFromAdjustment, type AthleteContext, type CheckInFeedback } from "~/engine";
import type { MuscleGroup } from "~/schema";
import { WeeklyCheckInInputSchema } from "~/schema";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { applyWeekPlanToDb } from "~/server/mesocycle/apply-week-plan";
import { derivePerformance, type WeekForPerformance } from "~/server/mesocycle/derive-performance";
import { mesocyclePlanFromDb } from "~/server/mesocycle/mesocycle-plan-from-db";
import {
  adaptationContextFrom,
  resolvedSpecFrom,
  weekPlanFromDb,
  CS_WITH_TARGETS_INCLUDE,
  WEEK_FOR_PLAN_INCLUDE,
} from "~/server/mesocycle/reschedule-adapters";
import type { db as dbClient } from "~/server/db";
import { toProgressionProposalView } from "~/views/progression";
import type { ProgressionProposalView, WeeklyCheckInStatus, WeeklyCheckInView } from "~/views/types";

type Db = typeof dbClient;

/** Load everything the check-in path needs, scoped to the signed-in athlete's ACTIVE
 * block. Throws NOT_FOUND if the week isn't theirs.
 *
 * Every week is loaded with the full plan shape (WEEK_FOR_PLAN_INCLUDE) PLUS each
 * session's status and each prescription's setLogs — `mesocyclePlanFromDb`/`weekPlanFromDb`
 * only read the WEEK_FOR_PLAN_INCLUDE-shaped fields (extra fields are harmless), while
 * `isResolved`/`trainedMuscles`/`derivePerformance` need the extras for the current week. */
async function loadCheckInContext(db: Db, userId: string, weekIndex: number) {
  const mesocycle = await db.mesocycle.findFirst({
    where: { status: "ACTIVE", athleteProfile: { userId } },
    select: {
      id: true,
      constraintSetId: true,
      athleteProfile: { select: { experience: true, phase: true } },
      weeks: {
        include: {
          ...WEEK_FOR_PLAN_INCLUDE,
          sessions: {
            include: {
              prescriptions: {
                include: {
                  exercise: true,
                  setLogs: { select: { reps: true, achievedRir: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!mesocycle) throw new TRPCError({ code: "NOT_FOUND" });
  const week = mesocycle.weeks.find((w) => w.index === weekIndex);
  if (!week) throw new TRPCError({ code: "NOT_FOUND" });

  const cs = await db.constraintSet.findUniqueOrThrow({
    where: { id: mesocycle.constraintSetId },
    include: CS_WITH_TARGETS_INCLUDE,
  });
  const athlete: AthleteContext = {
    experienceLevel: mesocycle.athleteProfile.experience,
    phase: mesocycle.athleteProfile.phase,
    landmarks: DEFAULT_LANDMARKS,
  };
  return { mesocycle, week, cs, athlete };
}

type LoadedContext = Awaited<ReturnType<typeof loadCheckInContext>>;
type LoadedWeek = LoadedContext["week"];

const isResolved = (w: LoadedWeek) =>
  w.sessions.length > 0 && w.sessions.every((s) => s.status === "COMPLETED" || s.status === "MISSED");

/** PRIMARY-role muscles trained in the week, from the exercise library by name. */
function trainedMuscles(week: LoadedWeek): MuscleGroup[] {
  const byName = new Map(EXERCISE_LIBRARY.map((e) => [e.name, e]));
  const set = new Set<MuscleGroup>();
  for (const s of week.sessions) {
    for (const p of s.prescriptions) {
      for (const m of byName.get(p.exercise.name)?.muscles ?? []) {
        if (m.role === "PRIMARY") set.add(m.muscle);
      }
    }
  }
  return [...set];
}

/** Flatten the week's sessions into the shape `derivePerformance` reads. */
function toWeekForPerformance(week: LoadedWeek): WeekForPerformance {
  return {
    prescriptions: week.sessions.flatMap((s) =>
      s.prescriptions.map((p) => ({
        exerciseName: p.exercise.name,
        targetRepLow: p.targetRepLow,
        targetRepHigh: p.targetRepHigh,
        targetRir: p.targetRir,
        setLogs: p.setLogs.map((l) => ({ reps: l.reps, achievedRir: l.achievedRir })),
      })),
    ),
  };
}

/** Rebuild CheckInFeedback + stepWeek proposal deterministically from a persisted CheckIn's rows. */
function computeProposal(
  ctxObjs: LoadedContext,
  feedbackMuscles: { muscle: MuscleGroup; recovery: number; joint: number }[],
) {
  const { mesocycle, week, cs, athlete } = ctxObjs;
  const ctx = adaptationContextFrom(cs, athlete);
  const perf = derivePerformance(toWeekForPerformance(week), ctx.targets, EXERCISE_LIBRARY);
  const feedback: CheckInFeedback = {
    weekIndex: week.index,
    muscles: feedbackMuscles.map((m) => ({
      muscle: m.muscle,
      recovery: m.recovery,
      joint: m.joint,
      performance: perf.get(m.muscle),
    })),
  };
  const plan = mesocyclePlanFromDb(mesocycle.weeks, cs.splitType);
  const adj = stepWeek(plan, week.index, feedback, ctx);
  const upcoming = mesocycle.weeks.find((w) => w.index === week.index + 1);
  const view = toProgressionProposalView(adj, {
    hasUpcoming: upcoming !== undefined,
    upcomingIsDeload: upcoming?.isDeload ?? false,
  });
  return { adj, view, upcoming };
}

export const checkinRouter = createTRPCRouter({
  // Eligibility + form scaffold. Mutates nothing.
  getWeeklyCheckIn: protectedProcedure
    .input(z.object({ weekIndex: z.number().int().min(1) }))
    .query(async ({ ctx, input }): Promise<WeeklyCheckInView> => {
      const userId = ctx.session.user.id;
      const loaded = await loadCheckInContext(ctx.db, userId, input.weekIndex);
      const eligible = isResolved(loaded.week);

      const existing = await ctx.db.checkIn.findFirst({
        where: { weekId: loaded.week.id, scope: "WEEK" },
        select: { muscleFeedback: { select: { muscle: true, recovery: true, jointStress: true } } },
      });
      const decision = await ctx.db.decisionLog.findFirst({
        where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "PROGRESS" },
        orderBy: { createdAt: "desc" },
        select: { status: true },
      });

      let status: WeeklyCheckInStatus = eligible ? "READY" : "NOT_READY";
      if (decision?.status === "APPLIED") status = "APPLIED";
      else if (decision?.status === "REJECTED") status = "REJECTED";
      else if (existing) status = "SUBMITTED";

      return {
        weekIndex: input.weekIndex,
        eligible,
        trainedMuscles: trainedMuscles(loaded.week),
        status,
        existing: existing
          ? existing.muscleFeedback.map((m) => ({ muscle: m.muscle, recovery: m.recovery ?? 0, joint: m.jointStress ?? 0 }))
          : undefined,
      };
    }),

  // Record truth + compute proposal. No plan mutation, no accept-gate.
  submitWeeklyCheckIn: protectedProcedure
    .input(WeeklyCheckInInputSchema)
    .mutation(async ({ ctx, input }): Promise<ProgressionProposalView> => {
      const userId = ctx.session.user.id;
      const loaded = await loadCheckInContext(ctx.db, userId, input.weekIndex);
      if (!isResolved(loaded.week)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Finish or reschedule every session in this week before checking in." });
      }
      const trained = new Set(trainedMuscles(loaded.week));
      for (const m of input.muscles) {
        if (!trained.has(m.muscle)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${m.muscle} wasn't trained this week.` });
        }
      }

      const adaptCtx = adaptationContextFrom(loaded.cs, loaded.athlete);
      const perf = derivePerformance(toWeekForPerformance(loaded.week), adaptCtx.targets, EXERCISE_LIBRARY);
      const plannedByMuscle = new Map(loaded.week.muscleVolumes.map((v) => [v.muscle, v.plannedSets]));

      await ctx.db.$transaction(async (tx) => {
        const athleteProfile = await tx.athleteProfile.findUniqueOrThrow({
          where: { userId },
          select: { id: true },
        });
        const existing = await tx.checkIn.findFirst({ where: { weekId: loaded.week.id, scope: "WEEK" }, select: { id: true } });
        const checkIn = existing
          ? await tx.checkIn.update({ where: { id: existing.id }, data: {}, select: { id: true } })
          : await tx.checkIn.create({
              data: { athleteProfileId: athleteProfile.id, weekId: loaded.week.id, scope: "WEEK" },
              select: { id: true },
            });
        await tx.checkInMuscle.deleteMany({ where: { checkInId: checkIn.id } });
        await tx.checkInMuscle.createMany({
          data: input.muscles.map((m) => ({
            checkInId: checkIn.id,
            muscle: m.muscle,
            recovery: m.recovery,
            jointStress: m.joint,
            performance: perf.get(m.muscle) ?? null,
            plannedSets: plannedByMuscle.get(m.muscle) ?? null,
            actualSets: null,
          })),
        });
      }, { timeout: 15000 });

      const { adj, view } = computeProposal(loaded, input.muscles);
      // Record/refresh the PROPOSED decision (delete any prior non-terminal proposal first).
      await ctx.db.decisionLog.deleteMany({
        where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "PROGRESS", status: "PROPOSED" },
      });
      await ctx.db.decisionLog.create({
        data: {
          mesocycleId: loaded.mesocycle.id,
          weekIndex: input.weekIndex,
          type: "PROGRESS",
          status: "PROPOSED",
          summary: `Week ${input.weekIndex} check-in — progression proposed`,
          reasoning: adj.checkInValue,
          payload: {
            adjustments: adj.adjustments.map((a) => ({ ...a })),
            checkInValue: adj.checkInValue,
            facts: adj.facts,
          },
        },
      });
      return view;
    }),

  // Accept-gate commit: rebuild week N+1 to the proposed targets. Recomputed deterministically.
  applyProgression: protectedProcedure
    .input(z.object({ weekIndex: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }): Promise<{ appliesToWeekIndex: number }> => {
      const userId = ctx.session.user.id;
      const loaded = await loadCheckInContext(ctx.db, userId, input.weekIndex);

      // Accept-gate precondition: a proposal must still be PROPOSED (not already
      // applied, rejected, or superseded) before we recompute + mutate week N+1.
      // Without this, a second applyProgression call (or a call after reject)
      // would still pass the SCHEDULED guard below — applyWeekPlanToDb never
      // touches TrainingSession.status — and would silently re-mutate the plan.
      const pending = await ctx.db.decisionLog.findFirst({
        where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "PROGRESS", status: "PROPOSED" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!pending) throw new TRPCError({ code: "BAD_REQUEST", message: "No pending proposal to apply." });

      const checkIn = await ctx.db.checkIn.findFirst({
        where: { weekId: loaded.week.id, scope: "WEEK" },
        select: { muscleFeedback: { select: { muscle: true, recovery: true, jointStress: true } } },
      });
      if (!checkIn) throw new TRPCError({ code: "BAD_REQUEST", message: "Check in first." });

      const feedbackMuscles = checkIn.muscleFeedback.map((m) => ({ muscle: m.muscle, recovery: m.recovery ?? 0, joint: m.jointStress ?? 0 }));
      const { adj, view, upcoming } = computeProposal(loaded, feedbackMuscles);
      if (view.kind !== "CHANGES" || upcoming === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to apply for next week." });
      }

      const spec = resolvedSpecFrom(loaded.cs, loaded.athlete);
      const upcomingPlan = weekPlanFromDb(upcoming);
      const newPlan = weekPlanFromAdjustment(spec, EXERCISE_LIBRARY, adj, upcomingPlan);

      await ctx.db.$transaction(async (tx) => {
        // Guard: week N+1's sessions must still be SCHEDULED (nothing logged into them).
        const scheduled = await tx.trainingSession.count({
          where: { id: { in: upcomingPlan.sessions.map((s) => s.slotId) }, status: "SCHEDULED" },
        });
        if (scheduled !== upcomingPlan.sessions.length) {
          throw new TRPCError({ code: "CONFLICT", message: "A session changed while you were reviewing — please try again." });
        }
        await applyWeekPlanToDb(tx, upcoming.id, newPlan);
        await tx.decisionLog.updateMany({
          where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "PROGRESS", status: "PROPOSED" },
          data: { status: "APPLIED", summary: `Week ${input.weekIndex} progression applied to week ${upcoming.index}` },
        });
      }, { timeout: 15000 });

      return { appliesToWeekIndex: view.appliesToWeekIndex };
    }),

  // Decline. Plan untouched; the check-in stays recorded.
  rejectProgression: protectedProcedure
    .input(z.object({ weekIndex: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const userId = ctx.session.user.id;
      const loaded = await loadCheckInContext(ctx.db, userId, input.weekIndex);

      // Same accept-gate precondition as applyProgression: nothing to decline if
      // there's no PROPOSED decision (already applied, already rejected, or none).
      const pending = await ctx.db.decisionLog.findFirst({
        where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "PROGRESS", status: "PROPOSED" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!pending) throw new TRPCError({ code: "BAD_REQUEST", message: "No pending proposal to decline." });

      await ctx.db.decisionLog.updateMany({
        where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "PROGRESS", status: "PROPOSED" },
        data: { status: "REJECTED" },
      });
      return { ok: true };
    }),
});
