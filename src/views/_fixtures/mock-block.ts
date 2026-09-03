import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import type { MuscleGroup } from "~/schema";
import type {
  MesocycleView,
  MuscleChip,
  MuscleWeekCell,
  PrescriptionView,
  SessionView,
  WeekView,
} from "~/views/types";

const MUSCLES: MuscleGroup[] = ["CHEST", "BACK", "SIDE_DELTS", "QUADS", "HAMSTRINGS", "BICEPS", "TRICEPS"];
const PRIORITY: MuscleGroup[] = ["SIDE_DELTS"];
const CURRENT_WEEK = 3;
const DELOAD_WEEK = 6;

const chip = (muscle: MuscleGroup, role: "PRIMARY" | "SECONDARY", fraction: number): MuscleChip => ({ muscle, role, fraction });

/**
 * Accumulation weeks 1..5 ramp linearly from 75% to 100% of each prescription's
 * peak (week-5) set count. Week 6 is a deload at ~50% of peak. This is what
 * makes the sessions themselves ramp, so per-muscle volume (derived from these
 * sessions below) ramps for a real reason instead of a hand-authored table.
 */
function rampSets(peakSets: number, weekIndex: number, isDeload: boolean): number {
  if (isDeload) return Math.max(2, Math.round(peakSets * 0.5));
  const factor = 0.75 + (0.25 * (weekIndex - 1)) / 4;
  return Math.max(1, Math.round(peakSets * factor));
}

function sessionsForWeek(weekIndex: number, isDeload: boolean): SessionView[] {
  const rir = isDeload ? 4 : 2;
  const px = (
    exerciseName: string,
    peakSets: number,
    lo: number,
    hi: number,
    muscles: MuscleChip[],
  ): PrescriptionView => ({
    exerciseName,
    sets: rampSets(peakSets, weekIndex, isDeload),
    repRangeLow: lo,
    repRangeHigh: hi,
    targetRir: rir,
    muscles,
  });

  return [
    {
      slotId: "upper-a", label: "Upper A", dayTag: "Mon",
      estimatedMinutes: isDeload ? 32 : 58,
      prescriptions: [
        px("Barbell Bench Press", 8, 6, 10, [chip("CHEST", "PRIMARY", 1), chip("TRICEPS", "SECONDARY", 0.5), chip("FRONT_DELTS", "SECONDARY", 0.5)]),
        px("Barbell Row", 4, 6, 10, [chip("BACK", "PRIMARY", 1), chip("BICEPS", "SECONDARY", 0.5), chip("REAR_DELTS", "SECONDARY", 0.5)]),
        px("Lateral Raise", 4, 10, 15, [chip("SIDE_DELTS", "PRIMARY", 1)]),
      ],
    },
    {
      slotId: "lower-a", label: "Lower A", dayTag: "Tue",
      estimatedMinutes: isDeload ? 24 : 46,
      prescriptions: [
        px("Leg Press", 4, 6, 10, [chip("QUADS", "PRIMARY", 1), chip("GLUTES", "SECONDARY", 0.5)]),
        px("Romanian Deadlift", 4, 6, 10, [chip("HAMSTRINGS", "PRIMARY", 1), chip("GLUTES", "SECONDARY", 0.5)]),
      ],
    },
    {
      slotId: "upper-b", label: "Upper B", dayTag: "Thu",
      estimatedMinutes: isDeload ? 32 : 56,
      prescriptions: [
        px("Incline Dumbbell Press", 8, 6, 10, [chip("CHEST", "PRIMARY", 1), chip("FRONT_DELTS", "SECONDARY", 0.5), chip("TRICEPS", "SECONDARY", 0.5)]),
        px("Lat Pulldown", 4, 6, 10, [chip("BACK", "PRIMARY", 1), chip("BICEPS", "SECONDARY", 0.5)]),
        px("Barbell Curl", 4, 10, 15, [chip("BICEPS", "PRIMARY", 1), chip("FOREARMS", "SECONDARY", 0.25)]),
      ],
    },
    {
      slotId: "lower-b", label: "Lower B", dayTag: "Fri",
      estimatedMinutes: isDeload ? 22 : 40,
      prescriptions: [
        px("Leg Press", 4, 6, 10, [chip("QUADS", "PRIMARY", 1), chip("GLUTES", "SECONDARY", 0.5)]),
        px("Cable Triceps Pushdown", 4, 10, 15, [chip("TRICEPS", "PRIMARY", 1)]),
      ],
    },
    {
      slotId: "upper-c", label: "Upper C", dayTag: "Sat",
      estimatedMinutes: isDeload ? 30 : 54,
      prescriptions: [
        px("Barbell Row", 4, 6, 10, [chip("BACK", "PRIMARY", 1), chip("BICEPS", "SECONDARY", 0.5), chip("REAR_DELTS", "SECONDARY", 0.5)]),
        px("Lateral Raise", 4, 10, 15, [chip("SIDE_DELTS", "PRIMARY", 1)]),
      ],
    },
  ];
}

/** Sum sets×fraction across every prescription's chips for `muscle`, rounded to the nearest 0.5. */
function muscleVolume(sessions: SessionView[], muscle: MuscleGroup): number {
  const raw = sessions.reduce(
    (sum, sess) =>
      sum +
      sess.prescriptions.reduce(
        (n, p) => n + p.muscles.reduce((m, c) => m + (c.muscle === muscle ? p.sets * c.fraction : 0), 0),
        0,
      ),
    0,
  );
  return Math.round(raw * 2) / 2;
}

function week(weekIndex: number): WeekView {
  const isDeload = weekIndex === DELOAD_WEEK;
  const sessions = sessionsForWeek(weekIndex, isDeload);
  const cells: MuscleWeekCell[] = MUSCLES.map((muscle) => {
    const lm = DEFAULT_LANDMARKS[muscle];
    return {
      muscle,
      weekIndex,
      plannedSets: muscleVolume(sessions, muscle),
      mev: lm.mev,
      mav: lm.mav,
      mrv: lm.mrv,
    };
  });
  const totalSets = sessions.reduce((s, sess) => s + sess.prescriptions.reduce((n, p) => n + p.sets, 0), 0);
  return {
    index: weekIndex,
    isDeload,
    isCurrent: weekIndex === CURRENT_WEEK,
    totalSets,
    sessions,
    cells,
  };
}

export const mockMesocycle: MesocycleView = {
  id: "mock-block-1",
  name: "Autumn Hypertrophy — Block 1",
  status: "ACTIVE",
  splitLabel: "Upper/Lower",
  daysPerWeek: 5,
  blockLengthWeeks: 6,
  currentWeekIndex: CURRENT_WEEK,
  deloadWeekIndex: DELOAD_WEEK,
  muscles: MUSCLES,
  priorityMuscles: PRIORITY,
  weeks: Array.from({ length: 6 }, (_, i) => week(i + 1)),
};
