// src/engine/index.ts
export { resolveConstraints } from "./resolve-constraints";
export { generateMesocycle } from "./generate";
export { buildSessionSlots } from "./split";
export { sessionMinutes } from "./time";
export { stepWeek, progressionQuestions, applyProgressionVerdicts, progressionNoulId } from "./step-week";
export { evaluateDeload } from "./deload";
export { redistributeWeek, rescheduleQuestions, applyRescheduleVerdicts, RESCHEDULE_PICK_ID } from "./redistribute";
export { weekPlanFromAdjustment } from "./apply-adjustment";
export { sessionStimulus, computeReadiness, weeklyRecoverySignal, blendRecovery } from "./readiness";
export { deloadWeekPlan } from "./deload-week";
export type { DecisionFact } from "./facts";
export {
  verdictById,
  isUsableChoice,
  isUsableNoulProposal,
  choiceCloseCall,
  noulCloseCall,
  trendOf,
} from "./judgement";
export type {
  JudgementAuthority,
  JudgementSubject,
  JudgementQuestion,
  JudgementRequest,
  Verdict,
  JudgementBasis,
  JudgementFailure,
  JudgementFailureDetail,
  JudgementOutcome,
  JudgementUsage,
} from "./judgement";
export type { LoadEvent, WeekEnd, ReadinessSample, ReadinessOpts } from "./readiness";
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
