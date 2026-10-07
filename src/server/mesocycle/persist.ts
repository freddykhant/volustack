import type { Prisma } from "../../../generated/prisma";
import type { MesocyclePlan } from "~/engine";
import type { MuscleGroup } from "~/schema";
import { placePlanWeeks, type ScheduleSettings } from "./schedule-adapters";

export interface PersistMesocycleArgs {
  athleteProfileId: string;
  constraintSetId: string;
  plan: MesocyclePlan;
  startDate: Date;
  name: string;
  /** Athlete scheduling settings. Omitted = one-a-day, everything available, UTC. */
  schedule?: ScheduleSettings;
}

/**
 * Persists an engine-generated MesocyclePlan graph (Mesocycle → weeks →
 * sessions → prescriptions, plus WeekMuscleVolume and DecisionLog rows) using
 * the caller's transaction client. Shared by the seed and the onboarding
 * mutation. It does NOT create the ConstraintSet — the caller owns that, since
 * the two callers differ there (seed delete-first vs. mutation version-bump).
 *
 * Sessions are placed (day, and daypart in half-day mode) against the athlete's
 * schedule settings. A week that cannot be placed is persisted unplaced and a
 * SCHEDULE decision-log row records it; placement never changes a prescription.
 *
 * WeekMuscleVolume rows are written only for muscles with volume > 0.
 * Each prescription's exerciseName is resolved to an Exercise.id; an unknown
 * name throws so a malformed plan rolls the transaction back rather than
 * persisting a partial graph.
 */
export async function persistMesocyclePlan(
  tx: Prisma.TransactionClient,
  args: PersistMesocycleArgs,
): Promise<{ mesocycleId: string; weeks: number }> {
  const { athleteProfileId, constraintSetId, plan, startDate, name, schedule } = args;

  const exercises = await tx.exercise.findMany({ select: { id: true, name: true } });
  const idByName = new Map(exercises.map((e) => [e.name, e.id]));

  const meso = await tx.mesocycle.create({
    data: {
      athleteProfileId,
      constraintSetId,
      name,
      status: "ACTIVE",
      startDate,
      lengthWeeks: plan.blockLengthWeeks,
    },
  });

  const settings: ScheduleSettings = schedule ?? { mode: "DAY", availability: [], timezone: "UTC" };
  const sortedIndexes = [...plan.weeks].sort((a, b) => a.index - b.index).map((w) => w.index);
  const layouts = placePlanWeeks(plan, settings, startDate, startDate);
  const layoutFor = (weekIndex: number) => layouts[sortedIndexes.indexOf(weekIndex)] ?? null;

  for (const week of plan.weeks) {
    await tx.week.create({
      data: {
        mesocycleId: meso.id,
        index: week.index,
        isDeload: week.isDeload,
        muscleVolumes: {
          create: Object.entries(week.muscleVolume)
            .filter(([, sets]) => sets > 0)
            .map(([muscle, sets]) => ({ muscle: muscle as MuscleGroup, plannedSets: sets })),
        },
        sessions: {
          create: week.sessions.map((session, order) => ({
            order,
            splitSlot: session.label,
            dayOfWeek: layoutFor(week.index)?.[String(order)]?.day ?? null,
            daypart: layoutFor(week.index)?.[String(order)]?.daypart ?? null,
            targetDurationMin: session.estimatedMinutes,
            prescriptions: {
              create: session.prescriptions.map((rx, rxOrder) => {
                const exerciseId = idByName.get(rx.exerciseName);
                if (!exerciseId) {
                  throw new Error(
                    `persistMesocyclePlan: prescription references unknown exercise "${rx.exerciseName}". Run the exercise seed first / check the library.`,
                  );
                }
                return {
                  exerciseId,
                  order: rxOrder,
                  sets: rx.sets,
                  targetRepLow: rx.repRangeLow,
                  targetRepHigh: rx.repRangeHigh,
                  targetRir: rx.targetRir,
                };
              }),
            },
          })),
        },
      },
    });
  }

  if (plan.facts.length > 0) {
    await tx.decisionLog.createMany({
      data: plan.facts.map((fact) => ({
        mesocycleId: meso.id,
        type: "GENERATE" as const,
        status: "APPLIED" as const,
        summary: fact.kind,
        reasoning: fact.kind,
        payload: fact,
      })),
    });
  }

  const unplaced = sortedIndexes.filter((i) => layoutFor(i) === null);
  if (unplaced.length > 0) {
    await tx.decisionLog.createMany({
      data: unplaced.map((weekIndex) => ({
        mesocycleId: meso.id,
        weekIndex,
        type: "SCHEDULE" as const,
        status: "APPLIED" as const,
        summary: "Week left unplaced",
        reasoning: "infeasible",
        payload: { origin: "auto", facts: [{ kind: "infeasible", constraint: "schedule_cells", detail: {} }] },
      })),
    });
  }

  return { mesocycleId: meso.id, weeks: plan.weeks.length };
}
