import type { MuscleGroup } from "~/schema";

export type Zone = "rest" | "building" | "optimal" | "max";

export type MuscleRole = "PRIMARY" | "SECONDARY";

export interface MuscleChip {
  muscle: MuscleGroup;
  role: MuscleRole;
  fraction: number; // 1.0 primary, <1 secondary — fractional credit
}

export interface PrescriptionView {
  exerciseName: string;
  sets: number;
  repRangeLow: number;
  repRangeHigh: number;
  targetRir: number;
  muscles: MuscleChip[];
}

export interface SessionView {
  slotId: string;
  label: string; // "Upper A"
  dayTag?: string; // optional day-of-week tag
  estimatedMinutes: number;
  prescriptions: PrescriptionView[];
}

/** One muscle's planned volume in one week, with that muscle's landmarks for zone/tooltip. */
export interface MuscleWeekCell {
  muscle: MuscleGroup;
  weekIndex: number;
  plannedSets: number;
  mev: number;
  mav: number;
  mrv: number;
}

export interface WeekView {
  index: number; // 1-based
  isDeload: boolean;
  isCurrent: boolean;
  totalSets: number;
  sessions: SessionView[];
  cells: MuscleWeekCell[]; // one per trained muscle, this week
}

export interface LandmarkBarDatum {
  muscle: MuscleGroup;
  planned: number;
  actual?: number; // known only after a completed week
  mev: number;
  mav: number;
  mrv: number;
}

export type BlockStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

export interface MesocycleView {
  id: string;
  name: string;
  status: BlockStatus;
  splitLabel: string; // "Upper/Lower"
  daysPerWeek: number;
  blockLengthWeeks: number;
  currentWeekIndex: number;
  deloadWeekIndex: number;
  muscles: MuscleGroup[]; // grid rows, in display order
  priorityMuscles: MuscleGroup[]; // show a ▲ marker
  weeks: WeekView[];
}
