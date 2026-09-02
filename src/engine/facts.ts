// src/engine/facts.ts
import type { MuscleGroup } from "~/schema";

/**
 * Structured reasons attached to every engine output (Law 2's teeth). The LLM
 * layer phrases these; it never invents a reason, because every decision ships
 * with its reasons as data.
 */
export type DecisionFact =
  | { kind: "filled_default"; muscle: MuscleGroup; setTarget: number; cause: "unspecified_target" }
  | { kind: "phase_modulated"; muscle: MuscleGroup; baseMrv: number; effectiveMrv: number; phaseFactor: number }
  | { kind: "clamped_to_mrv"; muscle: MuscleGroup; requested: number; effectiveMrv: number }
  | { kind: "raised_to_mev"; muscle: MuscleGroup; from: number; to: number; cause: "mev_floor" }
  | { kind: "beginner_locked"; detail: string }
  | { kind: "split_volume"; muscle: MuscleGroup; sessions: string[]; cause: "frequency_floor" }
  | { kind: "moved_sets"; muscle: MuscleGroup; from: string; to: string; count: number; cause: "session_time_cap" }
  | { kind: "trimmed_overshoot"; muscle: MuscleGroup; from: number; to: number; cause: "secondary_credit_overshoot" }
  | { kind: "ramp_flattened"; muscle: MuscleGroup; atWeek: number; cappedAt: number; cause: "mrv_ceiling" }
  | { kind: "deviation"; muscle: MuscleGroup; target: number; achieved: number; cause: "no_eligible_exercise" | "session_time_cap" | "insufficient_capacity" | "secondary_credit_overshoot" }
  | { kind: "infeasible"; constraint: "session_time" | "weekly_volume"; detail: Record<string, number | string> }
  | { kind: "stepped"; muscle: MuscleGroup; from: number; to: number; cause: "joint_stress" | "under_recovered" | "responding_well" | "approaching_mrv" | "on_track" | "default_progression" }
  | { kind: "swap_suggested"; muscle: MuscleGroup; cause: "joint_stress" }
  | { kind: "deload_scheduled"; atWeek: number }
  | { kind: "deload_recommended"; muscles: MuscleGroup[]; cause: "consecutive_fatigue" }
  | { kind: "redistributed"; muscle: MuscleGroup; sets: number; from: string; to: string }
  | { kind: "dropped_volume"; muscle: MuscleGroup; sets: number; belowMev: boolean; cause: "missed_session" };
