// src/engine/index.ts
export { resolveConstraints } from "./resolve-constraints";
export { generateMesocycle } from "./generate";
export { buildSessionSlots } from "./split";
export { sessionMinutes } from "./time";
export { stepWeek } from "./step-week";
export { evaluateDeload } from "./deload";
export { redistributeWeek } from "./redistribute";
export type { DecisionFact } from "./facts";
export type {
  AthleteContext,
  LandmarkMap,
  ResolvedSpec,
  ResolvedMuscleTarget,
  InfeasibilityReport,
  ResolveResult,
  SessionSlot,
  MuscleVolumeMap,
  MesocyclePlan,
  WeekPlan,
  SessionPlan,
  PrescriptionPlan,
  AdaptationContext,
  CheckInFeedback,
  MuscleFeedback,
  WeekAdjustment,
  MuscleAdjustment,
  StepCause,
  WeekOutcome,
  DeloadDecision,
  RedistributionKind,
  RedistributionCandidate,
  Tradeoff,
} from "./types";
