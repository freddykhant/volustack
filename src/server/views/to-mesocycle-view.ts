import type { Prisma } from "../../../generated/prisma";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { MUSCLE_GROUPS, type MuscleGroup } from "~/schema";
import type {
  MesocycleView,
  MuscleChip,
  MuscleWeekCell,
  PrescriptionView,
  SessionView,
  WeekView,
} from "~/views/types";

/**
 * The deep include the read path needs: constraint set (+ targets), and each
 * week's muscle volumes and sessions down to each prescription's exercise and
 * its muscle attribution. Exported so the router and the mapper input type stay
 * in lockstep.
 */
export const MESOCYCLE_INCLUDE = {
  constraintSet: { include: { muscleTargets: true } },
  weeks: {
    include: {
      muscleVolumes: true,
      sessions: {
        include: {
          prescriptions: {
            include: { exercise: { include: { muscles: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.MesocycleInclude;

export type MesocycleWithRelations = Prisma.MesocycleGetPayload<{
  include: typeof MESOCYCLE_INCLUDE;
}>;

type WeekWithRelations = MesocycleWithRelations["weeks"][number];
type SessionWithRelations = WeekWithRelations["sessions"][number];
type PrescriptionWithRelations = SessionWithRelations["prescriptions"][number];

const SPLIT_LABEL: Record<MesocycleWithRelations["constraintSet"]["splitType"], string> = {
  FULL_BODY: "Full Body",
  UPPER_LOWER: "Upper/Lower",
  PUSH_PULL_LEGS: "Push/Pull/Legs",
  BRO_SPLIT: "Bro Split",
  CUSTOM: "Custom",
};

const DAY_TAGS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 1-based current week from the block's start date: full weeks elapsed + 1,
 * clamped to [1, lengthWeeks]. No start date → week 1.
 */
export function currentWeekIndex(
  startDate: Date | null,
  lengthWeeks: number,
  now: Date = new Date(),
): number {
  if (!startDate) return 1;
  const elapsed = Math.floor((now.getTime() - startDate.getTime()) / WEEK_MS) + 1;
  return Math.min(Math.max(elapsed, 1), lengthWeeks);
}

function toPrescriptionView(p: PrescriptionWithRelations): PrescriptionView {
  return {
    exerciseName: p.exercise.name,
    sets: p.sets,
    repRangeLow: p.targetRepLow ?? 0,
    repRangeHigh: p.targetRepHigh ?? 0,
    targetRir: p.targetRir ?? 0,
    muscles: p.exercise.muscles.map(
      (em): MuscleChip => ({
        muscle: em.muscle,
        role: em.role,
        fraction: em.fraction,
      }),
    ),
  };
}

function toSessionView(s: SessionWithRelations): SessionView {
  return {
    slotId: s.id,
    label: s.splitSlot,
    dayTag: s.dayOfWeek == null ? undefined : DAY_TAGS[s.dayOfWeek],
    estimatedMinutes: s.targetDurationMin ?? 0,
    prescriptions: [...s.prescriptions]
      .sort((a, b) => a.order - b.order)
      .map(toPrescriptionView),
    // swapOptions intentionally omitted — deferred to sub-project ③.
  };
}

function toWeekView(w: WeekWithRelations, curIdx: number): WeekView {
  const sessions = [...w.sessions].sort((a, b) => a.order - b.order).map(toSessionView);
  const cells: MuscleWeekCell[] = MUSCLE_GROUPS.flatMap((muscle): MuscleWeekCell[] => {
    const v = w.muscleVolumes.find((x) => x.muscle === muscle);
    if (!v) return [];
    const lm = DEFAULT_LANDMARKS[muscle];
    return [{ muscle, weekIndex: w.index, plannedSets: v.plannedSets, mev: lm.mev, mav: lm.mav, mrv: lm.mrv }];
  });
  const totalSets = sessions.reduce(
    (s, sess) => s + sess.prescriptions.reduce((n, p) => n + p.sets, 0),
    0,
  );
  return {
    index: w.index,
    isDeload: w.isDeload,
    isCurrent: w.index === curIdx,
    totalSets,
    sessions,
    cells,
  };
}

export function toMesocycleView(m: MesocycleWithRelations): MesocycleView {
  const cs = m.constraintSet;
  const lengthWeeks = m.lengthWeeks;
  const curIdx = currentWeekIndex(m.startDate, lengthWeeks);
  const deloadIdx = m.weeks.find((w) => w.isDeload)?.index ?? cs.deloadWeekIndex ?? lengthWeeks;

  const present = new Set<MuscleGroup>();
  for (const w of m.weeks) for (const v of w.muscleVolumes) present.add(v.muscle);

  const muscles = MUSCLE_GROUPS.filter((mm) => present.has(mm));
  const priorityMuscles = MUSCLE_GROUPS.filter((mm) =>
    cs.muscleTargets.some((t) => t.muscle === mm && t.priority > 0),
  );

  const weeks = [...m.weeks].sort((a, b) => a.index - b.index).map((w) => toWeekView(w, curIdx));

  return {
    id: m.id,
    name: m.name,
    status: m.status,
    splitLabel: SPLIT_LABEL[cs.splitType],
    daysPerWeek: cs.daysPerWeek,
    blockLengthWeeks: lengthWeeks,
    currentWeekIndex: curIdx,
    deloadWeekIndex: deloadIdx,
    muscles,
    priorityMuscles,
    weeks,
    coachNotes: [],
  };
}
