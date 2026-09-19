import type { Prisma } from "../../../generated/prisma";
import type { WeekPlan } from "~/engine";
import type { MuscleGroup } from "~/schema";

/**
 * Applies a redistributed WeekPlan to the DB inside the caller's transaction:
 * rewrites each plan session's prescriptions (matched by slotId = TrainingSession.id)
 * and recomputes the week's WeekMuscleVolume from the plan. Only the sessions present
 * in `plan.sessions` are touched — the caller filters COMPLETED sessions out before
 * building the plan, so logged sessions (and their SetLogs) are never clobbered.
 * Throws on an unknown exercise name so a bad plan rolls the transaction back.
 */
export async function applyWeekPlanToDb(
  tx: Prisma.TransactionClient,
  weekId: string,
  plan: WeekPlan,
): Promise<void> {
  const exercises = await tx.exercise.findMany({ select: { id: true, name: true } });
  const idByName = new Map(exercises.map((e) => [e.name, e.id]));

  for (const session of plan.sessions) {
    await tx.exercisePrescription.deleteMany({ where: { trainingSessionId: session.slotId } });
    await tx.exercisePrescription.createMany({
      data: session.prescriptions.map((rx, order) => {
        const exerciseId = idByName.get(rx.exerciseName);
        if (!exerciseId) {
          throw new Error(`applyWeekPlanToDb: prescription references unknown exercise "${rx.exerciseName}".`);
        }
        return {
          trainingSessionId: session.slotId,
          exerciseId,
          order,
          sets: rx.sets,
          targetRepLow: rx.repRangeLow,
          targetRepHigh: rx.repRangeHigh,
          targetRir: rx.targetRir,
        };
      }),
    });
    await tx.trainingSession.update({
      where: { id: session.slotId },
      data: { targetDurationMin: session.estimatedMinutes },
    });
  }

  await tx.weekMuscleVolume.deleteMany({ where: { weekId } });
  await tx.weekMuscleVolume.createMany({
    data: Object.entries(plan.muscleVolume)
      .filter(([, sets]) => sets > 0)
      .map(([muscle, sets]) => ({ weekId, muscle: muscle as MuscleGroup, plannedSets: sets })),
  });
}
