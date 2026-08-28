// src/engine/constants.ts
import type { TrainingPhase } from "~/schema";

/** Time model (minutes). sessionMinutes = WARMUP_MIN + Σ(SETUP_MIN + sets·PER_SET_MIN). */
export const WARMUP_MIN = 8;
export const SETUP_MIN = 2;
export const PER_SET_MIN = 3;

/** A muscle's weekly volume is spread across ≥2 sessions once it reaches this many sets. */
export const FREQUENCY_THRESHOLD_SETS = 6;

/** Effective MRV = base MRV × phase factor. */
export const PHASE_FACTOR: Record<TrainingPhase, number> = {
  CUT: 0.85,
  MAINTAIN: 1.0,
  BULK: 1.05,
};

/** Ramp: week 1 = max(MEV, RAMP_START_FRACTION × peak); linear to peak at last accumulation week. */
export const RAMP_START_FRACTION = 0.75;
/** Deload volume ≈ DELOAD_FRACTION × week-1 volume. */
export const DELOAD_FRACTION = 0.5;

/** Rep ranges and RIR targets by movement class. */
export const COMPOUND_REPS = { low: 6, high: 10 } as const;
export const ISOLATION_REPS = { low: 10, high: 15 } as const;
export const COMPOUND_RIR = 2;
export const ISOLATION_RIR = 1;
export const DELOAD_RIR = 4;
