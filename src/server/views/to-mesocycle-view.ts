import type { Prisma } from "../../../generated/prisma";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { localDayNumber } from "~/domain/local-day";
import { placementPosition } from "~/engine";
import { weekDays } from "~/server/mesocycle/schedule-adapters";
import { MUSCLE_GROUPS, type MuscleGroup } from "~/schema";
import type {
  LoggedSetView,
  MesocycleView,
  MuscleChip,
  MuscleWeekCell,
  PrescriptionView,
  SessionView,
  WeekDayView,
  WeekView,
} from "~/views/types";

/**
 * The deep include the read path needs: constraint set (+ targets), and each
 * week's muscle volumes and sessions down to each prescription's exercise and
 * its muscle attribution. Exported so the router and the mapper input type stay
 * in lockstep.
 */
export const MESOCYCLE_INCLUDE = {
  athleteProfile: { select: { timezone: true } },
  constraintSet: { include: { muscleTargets: true } },
  weeks: {
    include: {
      muscleVolumes: true,
      sessions: {
        include: {
          prescriptions: {
            include: { exercise: { include: { muscles: true } }, setLogs: true },
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
 * 1-based current week from the block's start date, clamped to [1, lengthWeeks]. No start
 * date → week 1.
 *
 * Without `tz` it counts whole 7x24h periods since the start instant. With `tz` it counts
 * whole weeks of calendar days in the athlete's timezone, the same clock that dates a
 * week's columns, so the week turns over at their local midnight, not at the time of day
 * the block started.
 */
export function currentWeekIndex(
  startDate: Date | null,
  lengthWeeks: number,
  now: Date = new Date(),
  tz?: string,
): number {
  if (!startDate) return 1;
  const elapsed =
    tz === undefined
      ? Math.floor((now.getTime() - startDate.getTime()) / WEEK_MS) + 1
      : Math.floor((localDayNumber(now, tz) - localDayNumber(startDate, tz)) / 7) + 1;
  return Math.min(Math.max(elapsed, 1), lengthWeeks);
}

function toPrescriptionView(p: PrescriptionWithRelations): PrescriptionView {
  return {
    id: p.id,
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
    loggedSets:
      p.setLogs.length > 0
        ? [...p.setLogs]
            .sort((a, b) => a.setNumber - b.setNumber)
            .map(
              (l): LoggedSetView => ({
                setNumber: l.setNumber,
                weightKg: l.weightKg,
                reps: l.reps,
                achievedRir: l.achievedRir, // Int? → number | null; do NOT coalesce to 0
              }),
            )
        : undefined,
  };
}

function toSessionView(s: SessionWithRelations): SessionView {
  return {
    slotId: s.id,
    label: s.splitSlot,
    dayTag: s.dayOfWeek == null ? undefined : DAY_TAGS[s.dayOfWeek],
    placement: s.dayOfWeek == null ? undefined : { day: s.dayOfWeek, daypart: s.daypart },
    estimatedMinutes: s.targetDurationMin ?? 0,
    status: s.status,
    prescriptions: [...s.prescriptions]
      .sort((a, b) => a.order - b.order)
      .map(toPrescriptionView),
    // swapOptions intentionally omitted — deferred to sub-project ③.
  };
}

function toWeekView(
  w: WeekWithRelations,
  curIdx: number,
  muscles: readonly MuscleGroup[],
  days: WeekDayView[],
): WeekView {
  // Placement order within the rolling week; unplaced sessions keep plan order at the end.
  const startDay = days[0]?.weekday ?? 0;
  const position = (s: SessionWithRelations) =>
    s.dayOfWeek == null
      ? Number.POSITIVE_INFINITY
      : placementPosition({ day: s.dayOfWeek, daypart: s.daypart }, startDay);
  const sessions = [...w.sessions]
    .sort((a, b) => {
      const pa = position(a);
      const pb = position(b);
      return pa === pb ? a.order - b.order : pa - pb;
    })
    .map(toSessionView);
  // A cell for every block-trained muscle every week, reconciled with
  // block.muscles by construction — a week that omits a muscle yields a
  // factual plannedSets:0 cell (BlockGrid force-unwraps these; it must never miss).
  const cells: MuscleWeekCell[] = muscles.map((muscle): MuscleWeekCell => {
    const v = w.muscleVolumes.find((x) => x.muscle === muscle);
    const lm = DEFAULT_LANDMARKS[muscle];
    return {
      muscle,
      weekIndex: w.index,
      plannedSets: v?.plannedSets ?? 0,
      mev: lm.mev,
      mav: lm.mav,
      mrv: lm.mrv,
    };
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
    days,
  };
}

export function toMesocycleView(m: MesocycleWithRelations): MesocycleView {
  const cs = m.constraintSet;
  const lengthWeeks = m.lengthWeeks;
  const tz = m.athleteProfile.timezone;
  const curIdx = currentWeekIndex(m.startDate, lengthWeeks, new Date(), tz);
  const deloadIdx = m.weeks.find((w) => w.isDeload)?.index ?? cs.deloadWeekIndex ?? lengthWeeks;

  const present = new Set<MuscleGroup>();
  for (const w of m.weeks) for (const v of w.muscleVolumes) present.add(v.muscle);

  const muscles = MUSCLE_GROUPS.filter((mm) => present.has(mm));
  const priorityMuscles = MUSCLE_GROUPS.filter((mm) =>
    cs.muscleTargets.some((t) => t.muscle === mm && t.priority > 0),
  );

  const weeks = [...m.weeks]
    .sort((a, b) => a.index - b.index)
    .map((w) => toWeekView(w, curIdx, muscles, m.startDate ? weekDays(m.startDate, w.index, tz) : []));

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
