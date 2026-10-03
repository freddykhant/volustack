import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import {
  stepWeek,
  weekPlanFromAdjustment,
  evaluateDeload,
  deloadWeekPlan,
  applyProgressionVerdicts,
  progressionQuestions,
  type AdaptationContext,
  type AthleteContext,
  type CheckInFeedback,
  type Verdict,
  type WeekAdjustment,
} from "~/engine";
import type { MuscleGroup } from "~/schema";
import { WeeklyCheckInInputSchema } from "~/schema";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { applyWeekPlanToDb } from "~/server/mesocycle/apply-week-plan";
import { derivePerformance, type WeekForPerformance } from "~/server/mesocycle/derive-performance";
import { mesocyclePlanFromDb } from "~/server/mesocycle/mesocycle-plan-from-db";
import { BLOCK_FOR_READINESS_SELECT, readinessSamplesFrom } from "~/server/mesocycle/readiness-samples";
import { recoveryByWeekFromBlock } from "~/server/mesocycle/recovery-by-week";
import {
  adaptationContextFrom,
  resolvedSpecFrom,
  weekPlanFromDb,
  CS_WITH_TARGETS_INCLUDE,
  WEEK_FOR_PLAN_INCLUDE,
} from "~/server/mesocycle/reschedule-adapters";
import { weekOutcomesFromBlock, type WeekForOutcome } from "~/server/mesocycle/week-outcomes";
import { executeJudgement, VerdictsSchema } from "~/server/judgement/execute";
import type { db as dbClient } from "~/server/db";
import { toDeloadProposalView } from "~/views/deload";
import { toProgressionProposalView } from "~/views/progression";
import type {
  DeloadProposalView,
  ProgressionProposalView,
  WeeklyCheckInStatus,
  WeeklyCheckInView,
} from "~/views/types";

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
          checkIns: {
            where: { scope: "WEEK" },
            include: { muscleFeedback: true },
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

/** The executor's db delegate, widened with the one `mesocycle` read
 * `progressionVerdicts` performs for readiness/recovery context. `ctx.db` satisfies
 * this structurally — no cast, no widening at call sites. */
type ProgressionDb = Parameters<typeof executeJudgement>[0]["db"] & {
  mesocycle: {
    findUniqueOrThrow(args: {
      where: { id: string };
      select: typeof BLOCK_FOR_READINESS_SELECT;
    }): Promise<Parameters<typeof readinessSamplesFrom>[0]>;
  };
};

/** Build the deterministic WeekAdjustment (+ the feedback that fed it) from a persisted
 * CheckIn's rows. Computed exactly ONCE per request and threaded by reference from there
 * — `progressionVerdicts` asks the model against this `base`, and `computeProposal` later
 * applies the answer back onto this SAME `base` object, never a second, independently
 * rebuilt one. That is what keeps the question and the answer from silently decoupling
 * if either caller's surrounding code changes later. */
function buildBaseAdjustment(
  ctxObjs: LoadedContext,
  feedbackMuscles: { muscle: MuscleGroup; recovery: number; joint: number }[],
): { ctx: AdaptationContext; feedback: CheckInFeedback; base: WeekAdjustment } {
  const { mesocycle, week, cs, athlete } = ctxObjs;
  const ctx = adaptationContextFrom(cs, athlete);
  const perf = derivePerformance(toWeekForPerformance(week), ctx.targets, EXERCISE_LIBRARY);
  const feedback: CheckInFeedback = {
    weekIndex: week.index,
    muscles: feedbackMuscles.map((m) => ({
      muscle: m.muscle, recovery: m.recovery, joint: m.joint, performance: perf.get(m.muscle),
    })),
  };
  const plan = mesocyclePlanFromDb(mesocycle.weeks, cs.splitType);
  const base = stepWeek(plan, week.index, feedback, ctx);
  return { ctx, feedback, base };
}

/** Ask the progression judgement for this week, ONLY from `submitWeeklyCheckIn` — the
 * verdicts this returns get persisted into the PROGRESS DecisionLog's payload in the same
 * transaction as the proposal, and `applyProgression` reads them back from there (see
 * `verdictsFromPayload`) rather than asking again. That persistence, not the Judgement
 * table's cache key, is what guarantees the athlete sees and accepts the exact verdicts
 * that get applied: the cache key is derived from a state projection (readiness trends)
 * that a later re-logged session can shift between submit and accept, which would
 * otherwise either ask fresh or — if the model is unavailable — silently drop the
 * judged upgrade the athlete already approved. */
async function progressionVerdicts(
  db: ProgressionDb,
  ctxObjs: LoadedContext,
  feedbackMuscles: { muscle: MuscleGroup; recovery: number; joint: number }[],
): Promise<{ verdicts: Verdict[]; base: WeekAdjustment }> {
  const { mesocycle } = ctxObjs;
  const { ctx, feedback, base } = buildBaseAdjustment(ctxObjs, feedbackMuscles);

  const block = await db.mesocycle.findUniqueOrThrow({
    where: { id: mesocycle.id },
    select: BLOCK_FOR_READINESS_SELECT,
  });
  const request = progressionQuestions(
    base, ctx, feedback, readinessSamplesFrom(block), recoveryByWeekFromBlock(block),
  );
  if (request.questions.length === 0) return { verdicts: [], base };

  const verdicts = await executeJudgement({
    db, mesocycleId: mesocycle.id, request,
    fallback: { causes: base.adjustments.map((a) => ({ muscle: a.muscle, cause: a.cause })) },
  });
  return { verdicts, base };
}

/** Defensive read of the verdicts persisted alongside a PROGRESS proposal's DecisionLog
 * payload. A payload with no `verdicts` key, or one that doesn't parse as `Verdict[]`,
 * degrades to `[]` — the engine's deterministic proposal — and never throws. Reuses the
 * executor's own `VerdictsSchema` rather than a second hand-written schema. */
function verdictsFromPayload(payload: unknown): Verdict[] {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return [];
  const raw = (payload as Record<string, unknown>).verdicts;
  if (raw === undefined) return [];
  const parsed = VerdictsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Apply judged verdicts onto an already-built `base` WeekAdjustment and shape the view.
 * `base` must be the exact object `progressionVerdicts` (submit) or `buildBaseAdjustment`
 * (apply) produced for this request — see the comment there for why that matters. */
function computeProposal(ctxObjs: LoadedContext, base: WeekAdjustment, verdicts: Verdict[]) {
  const { mesocycle, week, cs, athlete } = ctxObjs;
  const ctx = adaptationContextFrom(cs, athlete);
  const adj = applyProgressionVerdicts(base, ctx, verdicts);
  const upcoming = mesocycle.weeks.find((w) => w.index === week.index + 1);
  const view = toProgressionProposalView(adj, {
    hasUpcoming: upcoming !== undefined,
    upcomingIsDeload: upcoming?.isDeload ?? false,
  });
  return { adj, view, upcoming };
}

/** Run the reactive-deload check for the just-resolved week. Returns the recommended
 * deload proposal inputs, or null when no early deload is warranted (or N+1 is absent
 * / already a deload). Deterministic — recomputed from history + the current week's
 * feedback (injected, since submit loads before it persists). */
function computeDeload(
  ctxObjs: LoadedContext,
  feedbackMuscles: { muscle: MuscleGroup; recovery: number; joint: number }[],
) {
  const { mesocycle, week, cs, athlete } = ctxObjs;
  const upcoming = mesocycle.weeks.find((w) => w.index === week.index + 1);
  if (!upcoming || upcoming.isDeload) return null;

  const ctx = adaptationContextFrom(cs, athlete);
  const plan = mesocyclePlanFromDb(mesocycle.weeks, cs.splitType);

  // History up to and including the current week; inject the current week's fresh
  // feedback so evaluateDeload counts it in the consecutive-fatigue window.
  const currentFeedback: CheckInFeedback = {
    weekIndex: week.index,
    muscles: feedbackMuscles.map((m) => ({ muscle: m.muscle, recovery: m.recovery, joint: m.joint })),
  };
  const history = weekOutcomesFromBlock(mesocycle.weeks as unknown as WeekForOutcome[])
    .filter((o) => o.weekIndex <= week.index)
    .map((o) => (o.weekIndex === week.index ? { ...o, feedback: currentFeedback } : o));

  const decision = evaluateDeload(plan, history, ctx);
  if (decision.decision !== "recommend_early") return null;

  const fact = decision.facts.find((f) => f.kind === "deload_recommended");
  const fatiguedMuscles = fact && "muscles" in fact ? fact.muscles : [];
  return { upcoming, fatiguedMuscles, facts: decision.facts };
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
        where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: { in: ["PROGRESS", "DELOAD"] } },
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
    .mutation(async ({ ctx, input }): Promise<ProgressionProposalView | DeloadProposalView> => {
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

      // Reactive deload supersedes progression: if consecutive-fatigue is detected,
      // propose a deload for next week INSTEAD OF a progression.
      const deload = computeDeload(loaded, input.muscles);

      if (deload) {
        const spec = resolvedSpecFrom(loaded.cs, loaded.athlete);
        const deloaded = deloadWeekPlan(spec, EXERCISE_LIBRARY, weekPlanFromDb(deload.upcoming));
        // Atomic: clearing any prior PROPOSED of either type and writing the new
        // DELOAD proposal must commit together, or a concurrent submit (two tabs /
        // a retried request) could interleave a DELOAD and a PROGRESS PROPOSED row
        // coexisting — applyProgression/applyDeload each gate on their own type only,
        // so both could then apply and double-mutate week N+1.
        await ctx.db.$transaction(async (tx) => {
          await tx.decisionLog.deleteMany({
            where: {
              mesocycleId: loaded.mesocycle.id,
              weekIndex: input.weekIndex,
              type: { in: ["PROGRESS", "DELOAD"] },
              status: "PROPOSED",
            },
          });
          await tx.decisionLog.create({
            data: {
              mesocycleId: loaded.mesocycle.id,
              weekIndex: input.weekIndex,
              type: "DELOAD",
              status: "PROPOSED",
              summary: `Week ${input.weekIndex} check-in — early deload recommended`,
              reasoning: "consecutive_fatigue",
              payload: { fatiguedMuscles: deload.fatiguedMuscles, facts: deload.facts },
            },
          });
        }, { timeout: 15000 });
        return toDeloadProposalView(
          weekPlanFromDb(deload.upcoming),
          deloaded,
          deload.fatiguedMuscles,
          input.weekIndex,
        );
      }

      const { verdicts, base } = await progressionVerdicts(ctx.db, loaded, input.muscles);
      const { adj, view } = computeProposal(loaded, base, verdicts);
      // Same atomicity requirement as the deload branch above. `verdicts` is persisted
      // in the SAME transaction as the proposal it produced, so acceptance never has to
      // re-derive (or re-ask for) what the athlete is being shown right now — see
      // `applyProgression`, which reads this exact array back via `verdictsFromPayload`
      // instead of calling `progressionVerdicts` a second time.
      await ctx.db.$transaction(async (tx) => {
        await tx.decisionLog.deleteMany({
          where: {
            mesocycleId: loaded.mesocycle.id,
            weekIndex: input.weekIndex,
            type: { in: ["PROGRESS", "DELOAD"] },
            status: "PROPOSED",
          },
        });
        await tx.decisionLog.create({
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
              verdicts,
            },
          },
        });
      }, { timeout: 15000 });
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
        select: { id: true, payload: true },
      });
      if (!pending) throw new TRPCError({ code: "BAD_REQUEST", message: "No pending proposal to apply." });

      const checkIn = await ctx.db.checkIn.findFirst({
        where: { weekId: loaded.week.id, scope: "WEEK" },
        select: { muscleFeedback: { select: { muscle: true, recovery: true, jointStress: true } } },
      });
      if (!checkIn) throw new TRPCError({ code: "BAD_REQUEST", message: "Check in first." });

      const feedbackMuscles = checkIn.muscleFeedback.map((m) => ({ muscle: m.muscle, recovery: m.recovery ?? 0, joint: m.jointStress ?? 0 }));
      // No model call here: the verdicts the athlete accepted were persisted into this
      // proposal's payload at submit time, and are replayed structurally — not re-asked
      // via a cache-key hit — so a volatile state projection (e.g. a re-logged earlier
      // session shifting a readiness trend) can never desync what gets applied from what
      // was shown, and a model outage at accept time can never silently drop the upgrade.
      const { base } = buildBaseAdjustment(loaded, feedbackMuscles);
      const verdicts = verdictsFromPayload(pending.payload);
      const { adj, view, upcoming } = computeProposal(loaded, base, verdicts);
      if (view.kind !== "CHANGES" || upcoming === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to apply for next week." });
      }

      const spec = resolvedSpecFrom(loaded.cs, loaded.athlete);
      const upcomingPlan = weekPlanFromDb(upcoming);
      const newPlan = weekPlanFromAdjustment(spec, EXERCISE_LIBRARY, adj, upcomingPlan);

      await ctx.db.$transaction(async (tx) => {
        // Atomic concurrency gate: claim the PROPOSED row FIRST, inside the tx.
        // The outer `pending` check above is only a friendly sequential guard —
        // it can't stop two concurrent applyProgression calls (double-click, two
        // tabs) from both reading status=PROPOSED before either commits. Flipping
        // PROPOSED→APPLIED here and requiring exactly one row claimed means only
        // one concurrent caller can proceed past this point; the loser's update
        // matches 0 rows and the tx rolls back before any plan mutation. The same
        // race with rejectProgression is closed the same way: whichever of
        // apply/reject flips the row first wins, and the other's updateMany finds
        // nothing.
        const claimed = await tx.decisionLog.updateMany({
          where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "PROGRESS", status: "PROPOSED" },
          data: { status: "APPLIED", summary: `Week ${input.weekIndex} progression applied to week ${upcoming.index}` },
        });
        if (claimed.count !== 1) {
          throw new TRPCError({ code: "CONFLICT", message: "This proposal was already applied or withdrawn — please refresh." });
        }

        // Guard: week N+1's sessions must still be SCHEDULED (nothing logged into them).
        const scheduled = await tx.trainingSession.count({
          where: { id: { in: upcomingPlan.sessions.map((s) => s.slotId) }, status: "SCHEDULED" },
        });
        if (scheduled !== upcomingPlan.sessions.length) {
          throw new TRPCError({ code: "CONFLICT", message: "A session changed while you were reviewing — please try again." });
        }
        await applyWeekPlanToDb(tx, upcoming.id, newPlan);
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

  // Accept-gate commit: rebuild week N+1 as a deload. Recomputed deterministically.
  applyDeload: protectedProcedure
    .input(z.object({ weekIndex: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }): Promise<{ appliesToWeekIndex: number }> => {
      const userId = ctx.session.user.id;
      const loaded = await loadCheckInContext(ctx.db, userId, input.weekIndex);

      const pending = await ctx.db.decisionLog.findFirst({
        where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "DELOAD", status: "PROPOSED" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!pending) throw new TRPCError({ code: "BAD_REQUEST", message: "No pending deload to apply." });

      // Determinism: recompute from the persisted check-in. loadCheckInContext ran
      // AFTER submit persisted the check-in, so the current week's feedback is in
      // `loaded` — but read it explicitly and pass it, mirroring computeProposal's
      // contract (and so computeDeload's injection is a no-op that matches the DB).
      const checkIn = await ctx.db.checkIn.findFirst({
        where: { weekId: loaded.week.id, scope: "WEEK" },
        select: { muscleFeedback: { select: { muscle: true, recovery: true, jointStress: true } } },
      });
      if (!checkIn) throw new TRPCError({ code: "BAD_REQUEST", message: "Check in first." });
      const feedbackMuscles = checkIn.muscleFeedback.map((m) => ({ muscle: m.muscle, recovery: m.recovery ?? 0, joint: m.jointStress ?? 0 }));

      const deload = computeDeload(loaded, feedbackMuscles);
      if (!deload) throw new TRPCError({ code: "BAD_REQUEST", message: "A deload is no longer recommended." });

      const spec = resolvedSpecFrom(loaded.cs, loaded.athlete);
      const upcomingPlan = weekPlanFromDb(deload.upcoming);
      const newPlan = deloadWeekPlan(spec, EXERCISE_LIBRARY, upcomingPlan);

      await ctx.db.$transaction(async (tx) => {
        const claimed = await tx.decisionLog.updateMany({
          where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "DELOAD", status: "PROPOSED" },
          data: { status: "APPLIED", summary: `Week ${input.weekIndex} early deload applied to week ${deload.upcoming.index}` },
        });
        if (claimed.count !== 1) {
          throw new TRPCError({ code: "CONFLICT", message: "This deload was already applied or withdrawn — please refresh." });
        }
        const scheduled = await tx.trainingSession.count({
          where: { id: { in: upcomingPlan.sessions.map((s) => s.slotId) }, status: "SCHEDULED" },
        });
        if (scheduled !== upcomingPlan.sessions.length) {
          throw new TRPCError({ code: "CONFLICT", message: "A session changed while you were reviewing — please try again." });
        }
        await applyWeekPlanToDb(tx, deload.upcoming.id, newPlan);
        await tx.week.update({ where: { id: deload.upcoming.id }, data: { isDeload: true } });
      }, { timeout: 15000 });

      return { appliesToWeekIndex: deload.upcoming.index };
    }),

  // Decline the deload. Plan untouched.
  rejectDeload: protectedProcedure
    .input(z.object({ weekIndex: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const userId = ctx.session.user.id;
      const loaded = await loadCheckInContext(ctx.db, userId, input.weekIndex);
      const claimed = await ctx.db.decisionLog.updateMany({
        where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "DELOAD", status: "PROPOSED" },
        data: { status: "REJECTED" },
      });
      if (claimed.count !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "No pending deload to decline." });
      return { ok: true };
    }),
});
