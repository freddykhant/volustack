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

// Per-muscle planned volume by week (index 0 = week 1 … index 5 = deload).
const RAMP: Record<string, number[]> = {
  CHEST: [12, 14, 14, 16, 16, 6],
  BACK: [14, 15, 16, 17, 18, 7],
  SIDE_DELTS: [12, 14, 14, 16, 16, 6],
  QUADS: [10, 11, 11, 12, 12, 4],
  HAMSTRINGS: [8, 9, 9, 10, 10, 4],
  BICEPS: [8, 9, 9, 10, 10, 4],
  TRICEPS: [8, 9, 9, 10, 10, 4],
};

const chip = (muscle: MuscleGroup, role: "PRIMARY" | "SECONDARY", fraction: number): MuscleChip => ({ muscle, role, fraction });

function sessionsForWeek(weekIndex: number, isDeload: boolean): SessionView[] {
  const rir = isDeload ? 4 : 2;
  const setsFor = (base: number) => (isDeload ? Math.max(2, Math.round(base * 0.4)) : base);
  const px = (
    exerciseName: string,
    sets: number,
    lo: number,
    hi: number,
    muscles: MuscleChip[],
  ): PrescriptionView => ({ exerciseName, sets: setsFor(sets), repRangeLow: lo, repRangeHigh: hi, targetRir: rir, muscles });

  return [
    {
      slotId: "upper-a", label: "Upper A", dayTag: "Mon",
      estimatedMinutes: isDeload ? 32 : 58,
      prescriptions: [
        px("Barbell Bench Press", 4, 6, 10, [chip("CHEST", "PRIMARY", 1), chip("TRICEPS", "SECONDARY", 0.5), chip("FRONT_DELTS", "SECONDARY", 0.5)]),
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
        px("Incline Dumbbell Press", 4, 6, 10, [chip("CHEST", "PRIMARY", 1), chip("FRONT_DELTS", "SECONDARY", 0.5), chip("TRICEPS", "SECONDARY", 0.5)]),
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

function week(weekIndex: number): WeekView {
  const isDeload = weekIndex === DELOAD_WEEK;
  const cells: MuscleWeekCell[] = MUSCLES.map((muscle) => {
    const lm = DEFAULT_LANDMARKS[muscle];
    return {
      muscle,
      weekIndex,
      plannedSets: RAMP[muscle]![weekIndex - 1]!,
      mev: lm.mev,
      mav: lm.mav,
      mrv: lm.mrv,
    };
  });
  const sessions = sessionsForWeek(weekIndex, isDeload);
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
