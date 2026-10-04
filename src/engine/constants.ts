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

// ─── Adaptation path ───

/** Feedback thresholds (scores are 0–3). */
export const JOINT_PAIN = 2; // joint ≥ this → back off + flag swap
export const RECOVERY_LOW = 1; // recovery ≤ this → under-recovered
export const SCORE_GOOD = 2; // recovery/performance ≥ this → good

/** Auto-regulation step deltas (sets). */
export const STEP_UP = 1;
export const STEP_DOWN = 1;
export const STEP_DOWN_HARD = 2;

/** How close to effective MRV counts as "approaching" (sets). */
export const MRV_PROXIMITY_SETS = 2;

/** Reactive deload: ≥ FATIGUE_MUSCLE_THRESHOLD muscles at/over MRV with low
 * recovery, sustained CONSECUTIVE_FATIGUE_WEEKS weeks. */
export const CONSECUTIVE_FATIGUE_WEEKS = 2;
export const FATIGUE_MUSCLE_THRESHOLD = 2;

// ─── Readiness ↔ recovery blend (④-C-2) ───

/** Recovery scale is 0=Wrecked … 3=Fresh; "Okay" (2) is the zero-nudge anchor. */
export const RECOVERY_NEUTRAL = 2;
/** Max fraction of `fitness` the recovery nudge can move Form (at recovery 0). */
export const RECOVERY_NUDGE_MAX_FRAC = 0.15;
/** # of least-recovered muscles averaged into the weekly signal (mirrors FATIGUE_MUSCLE_THRESHOLD). */
export const RECOVERY_WORST_N = 2;

// ─── Jev judgement layer ───

/** Choice: minimum confidence for an ADVISORY verdict to override the engine's pick. */
export const JUDGEMENT_MIN_CONFIDENCE_ADVISORY = 0.6;
/** Choice: top-two probability gap below which the pick is reported as a close call. */
export const CLOSE_CALL_MARGIN = 0.15;
/** Noul: minimum probability for a PROPOSAL verdict to stand. */
export const JUDGEMENT_MIN_NOUL_PROPOSAL = 0.75;
/** Noul: distance from 0.5 below which a yes/no is reported as a close call. */
export const CLOSE_CALL_NOUL_MARGIN = 0.12;
/** Trend labels: |Δ| strictly below this reads as "flat". */
export const TREND_FLAT_BAND = 0.5;

// ─── Schedule scoring ───

/** Rest, in half-days, that two sessions sharing a muscle should have between them. 4 = 48h. */
export const REST_TARGET_HALF_DAYS = 4;
/** Shared stimulus sets below this don't count as "the same muscles". */
export const OVERLAP_MIN_SETS = 2;
/** Cost per shared set, per half-day short of the rest target. */
export const W_SHORT_REST = 1;
/** Consecutive training days allowed before a streak is a problem. */
export const MAX_STREAK_DAYS = 3;
/** Cost per day beyond the streak limit. */
export const W_LOAD_STREAK = 4;
/** Cost of two sessions on one day; multiplied by (1 + shared sets). */
export const W_SAME_DAY_STACK = 3;
/** Cost of a session sitting off a Preferred cell while one is open. */
export const W_OFF_PREFERENCE = 2;
/** Cost per day that the gaps between training days deviate from an even spread. */
export const W_UNEVEN_SPREAD = 1;
/** Longest gap minus shortest gap (days) at which bunching is worth telling the athlete. */
export const SPREAD_FACT_MIN_DAYS = 3;
/** Cost of a session standing on a Blocked cell. Must dominate everything else. */
export const W_ON_BLOCKED_CELL = 1000;
/** A move must lower the cost by more than this to be suggested. */
export const SUGGESTION_MIN_GAIN = 2;
/** Suggestions returned at most. */
export const MAX_SUGGESTIONS = 3;
/** Cost differences smaller than this are treated as equal. Not a tuning value. */
export const SCHEDULE_EPS = 1e-6;
