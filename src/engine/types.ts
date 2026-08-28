// src/engine/types.ts
import type { ExperienceLevel, MuscleGroup, SplitType, TrainingPhase } from "~/schema";
import type { Landmarks } from "~/domain/landmarks";
import type { DecisionFact } from "./facts";

export type LandmarkMap = Record<MuscleGroup, Landmarks>;

/** Everything the engine needs to know about the athlete. Landmarks are injected
 * (personalized or the domain defaults) so the engine imports no runtime landmark table. */
export interface AthleteContext {
  experienceLevel: ExperienceLevel;
  phase: TrainingPhase;
  landmarks: LandmarkMap;
}

/** Per-muscle target after defaults + phase modulation. `weeklySetTarget` is the PEAK-week target. */
export interface ResolvedMuscleTarget {
  muscle: MuscleGroup;
  weeklySetTarget: number;
  priority: number;
  mev: number;
  effectiveMrv: number;
}

export interface ResolvedSpec {
  kind: "resolved";
  daysPerWeek: number;
  splitType: SplitType;
  sessionLengthCapMin: number;
  blockLengthWeeks: number;
  deloadWeekIndex: number;
  isBeginner: boolean;
  targets: ResolvedMuscleTarget[]; // sorted: priority desc, target desc, name asc
  excludedExerciseNames: string[];
  facts: DecisionFact[];
}

export interface InfeasibilityReport {
  kind: "infeasible";
  facts: DecisionFact[]; // includes ≥1 { kind: "infeasible", ... }
}

export type ResolveResult = ResolvedSpec | InfeasibilityReport;

/** A session in the week template + which muscles it may train. */
export interface SessionSlot {
  id: string;
  label: string;
  eligibleMuscles: MuscleGroup[];
}

export interface ExerciseAssignment {
  exerciseName: string;
  sets: number;
}

export interface SessionTemplate {
  slotId: string;
  label: string;
  exercises: ExerciseAssignment[];
  estimatedMinutes: number;
}

export type MuscleVolumeMap = Record<MuscleGroup, number>;

/** The peak-week template the distributor produces. */
export interface WeekTemplate {
  sessions: SessionTemplate[];
  achievedVolume: MuscleVolumeMap;
  facts: DecisionFact[];
}

export interface PrescriptionPlan {
  exerciseName: string;
  sets: number;
  repRangeLow: number;
  repRangeHigh: number;
  targetRir: number;
}

export interface SessionPlan {
  slotId: string;
  label: string;
  prescriptions: PrescriptionPlan[];
  estimatedMinutes: number;
}

export interface WeekPlan {
  index: number; // 1-based
  isDeload: boolean;
  sessions: SessionPlan[];
  muscleVolume: MuscleVolumeMap;
}

export interface MesocyclePlan {
  splitType: SplitType;
  blockLengthWeeks: number;
  deloadWeekIndex: number;
  weeks: WeekPlan[];
  facts: DecisionFact[];
}
