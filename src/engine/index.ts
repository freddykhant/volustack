// src/engine/index.ts
export { resolveConstraints } from "./resolve-constraints";
export { generateMesocycle } from "./generate";
export { buildSessionSlots } from "./split";
export { sessionMinutes } from "./time";
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
} from "./types";
