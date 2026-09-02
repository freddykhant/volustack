// src/engine/types.ts
import type { ExperienceLevel, MuscleGroup, SplitType, TrainingPhase } from "~/schema";
import type { Landmarks } from "~/domain/landmarks";
import type { ExerciseDef } from "~/domain/exercise-library";
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
  mav: number;
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

// ─── Adaptation path ───

/** Per-muscle check-in scores. All optional (0–3). recovery 0=wrecked→3=fresh;
 * performance 0=regressed→3=beat targets; joint 0=fine→3=painful. */
export interface MuscleFeedback {
  muscle: MuscleGroup;
  recovery?: number;
  performance?: number;
  joint?: number;
}

/** Feedback for one completed week. */
export interface CheckInFeedback {
  weekIndex: number;
  muscles: MuscleFeedback[];
}

/** Everything the adaptation functions need that the plan/week don't carry.
 * Assembled by the caller from the stored ConstraintSet + landmarks. */
export interface AdaptationContext {
  targets: ResolvedMuscleTarget[];
  splitType: SplitType;
  daysPerWeek: number;
  sessionLengthCapMin: number;
  blockLengthWeeks: number;
  deloadWeekIndex: number;
  isBeginner: boolean;
  library: ExerciseDef[];
}

export type StepCause =
  | "joint_stress"
  | "under_recovered"
  | "responding_well"
  | "approaching_mrv"
  | "on_track"
  | "default_progression";

export interface MuscleAdjustment {
  muscle: MuscleGroup;
  plannedSets: number; // the plan's planned volume for the upcoming week
  adjustedSets: number; // after rule table + clamps
  delta: number; // adjustedSets - plannedSets
  cause: StepCause;
  swapCandidate: boolean; // exercise-swap flagged (joint stress)
}

export interface WeekAdjustment {
  fromWeekIndex: number; // the completed week the feedback is about
  appliesToWeekIndex: number; // the upcoming week that was adjusted
  adjustments: MuscleAdjustment[];
  checkInValue: "high" | "low";
  facts: DecisionFact[];
}

/** One completed week's outcome, fed to the deload trigger. */
export interface WeekOutcome {
  weekIndex: number;
  muscleVolume: MuscleVolumeMap;
  feedback: CheckInFeedback | null;
}

export interface DeloadDecision {
  decision: "none" | "scheduled_next" | "recommend_early";
  facts: DecisionFact[];
}

export type RedistributionKind = "MAKE_UP" | "PARTIAL" | "LET_GO";

export interface Tradeoff {
  recovered: number; // sets recovered into remaining sessions
  dropped: number; // sets not recovered
}

export interface RedistributionCandidate {
  kind: RedistributionKind;
  week: WeekPlan; // a complete, valid week plan
  tradeoff: Tradeoff;
  recommended: boolean;
  facts: DecisionFact[];
}
