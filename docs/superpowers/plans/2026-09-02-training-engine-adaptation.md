# Training Engine — Adaptation Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic adaptation path of the training engine — `stepWeek` (auto-regulation stepper), `evaluateDeload` (deload trigger), and `redistributeWeek` (redistribution solver) — that adjust an already-generated `MesocyclePlan` in response to athlete feedback and missed sessions, every decision carrying typed `DecisionFact`s.

**Architecture:** Three new pure functions in `src/engine/`, built on the existing generation types (`MesocyclePlan`, `WeekPlan`, `MuscleVolumeMap`, `ResolvedMuscleTarget`). Because the frozen spec signatures don't carry per-muscle landmarks/eligibility, all three take a new injected `AdaptationContext` (landmarks incl. MAV, split geometry, cap, block info, library). The stepper applies a top-down rule table per muscle and emits a `checkInValue` smart-prompt signal; the deload trigger fires scheduled or reactive-early; the redistribution solver returns 1–3 complete valid `WeekPlan` candidates (never auto-applies). No engine algorithm from the generation path is modified.

**Tech Stack:** TypeScript, Vitest (`pnpm test`), fast-check (property tests, dev-dep, test-only), ESLint boundary rule (already in place). Path alias `~/*` → `src/*`.

**Parent spec:** `docs/superpowers/specs/2026-07-25-training-engine-design.md` (§2 signatures, §6 Auto-Regulation Stepper, §7 Deload Trigger, §8 Redistribution Solver, §9 testing). This is the second of the engine's two plans; the generation path (`docs/superpowers/plans/2026-08-26-training-engine-generation.md`) is already implemented and merged.

## Global Constraints

- **Zero runtime deps in `src/engine/`.** New files import only from `~/schema` (type-only), `~/domain/exercise-library` (type `ExerciseDef`), and sibling engine modules. No `next`/`@prisma/client`/`~/generated/prisma`/`react`/`react-dom`/`~/server`. The existing ESLint boundary rule (scoped to `src/engine/**/*.ts`, ignoring `*.test.ts`/`_fixtures`) enforces this.
- **fast-check is test-only** (a `devDependency`); appears only in `*.test.ts`.
- **Determinism: no RNG.** Same input ⇒ deep-equal output. Stable tie-breaks everywhere: priority desc → target/headroom desc → name asc (or muscle name asc, slotId asc).
- **Every adaptation decision emits ≥1 `DecisionFact`.** Every rule-table row the stepper applies, every deload verdict, and every recovered/dropped set in redistribution records a fact.
- **Constants live in `src/engine/constants.ts`** — never inline. Reuse the existing time-model constants (`WARMUP_MIN`, `SETUP_MIN`, `PER_SET_MIN`); add the new adaptation constants defined in Task 1.
- **Public entry-point signatures (spec §2 + the AdaptationContext design decision):**
  - `stepWeek(plan: MesocyclePlan, weekIndex: number, feedback: CheckInFeedback | null, ctx: AdaptationContext) → WeekAdjustment`
  - `evaluateDeload(plan: MesocyclePlan, history: WeekOutcome[], ctx: AdaptationContext) → DeloadDecision`
  - `redistributeWeek(week: WeekPlan, missedSessionIds: string[], ctx: AdaptationContext) → RedistributionCandidate[]`
- **MesocyclePlan is NOT modified** and the golden snapshot must not change. All new context is carried by `AdaptationContext`, assembled by the caller (tRPC layer) from the stored `ConstraintSet` + landmarks. `stepWeek`/`evaluateDeload`/`redistributeWeek` are pure over `(plan/week, …, ctx)`.
- **Existing types reused as-is** (from `src/engine/types.ts`): `MesocyclePlan`, `WeekPlan`, `SessionPlan`, `PrescriptionPlan`, `MuscleVolumeMap`, `ResolvedMuscleTarget` (extended with `mav` in Task 1). Existing helpers reused: `buildSessionSlots` (`./split`), `sessionMinutes` (`./time`), `computeVolume`/`roundVolumeMap`/`round1` (`./util`).
- **Out of scope (deferred, tracked separately):** the resolver "auto-fill all untargeted muscles to MEV as hard budget" question (finding #9). Do not touch `resolve-constraints.ts` beyond adding the `mav` field in Task 1.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/engine/types.ts` (modify) | Add `mav` to `ResolvedMuscleTarget`; add adaptation types (`AdaptationContext`, `CheckInFeedback`, `MuscleFeedback`, `WeekAdjustment`, `MuscleAdjustment`, `StepCause`, `WeekOutcome`, `DeloadDecision`, `RedistributionKind`, `Tradeoff`, `RedistributionCandidate`). |
| `src/engine/facts.ts` (modify) | Add adaptation `DecisionFact` members (`stepped`, `swap_suggested`, `deload_scheduled`, `deload_recommended`, `redistributed`, `dropped_volume`). |
| `src/engine/constants.ts` (modify) | Add stepper/deload thresholds + step deltas. |
| `src/engine/resolve-constraints.ts` (modify) | Populate the new `mav` field on each resolved target (one-line addition). |
| `src/engine/step-week.ts` (create) | `stepWeek` — auto-regulation rule table + clamps + `checkInValue`. |
| `src/engine/deload.ts` (create) | `evaluateDeload` — scheduled + reactive-early. |
| `src/engine/redistribute.ts` (create) | `redistributeWeek` — MAKE_UP / PARTIAL / LET_GO candidate plans. |
| `src/engine/index.ts` (modify) | Export the three functions + new public types. |
| `src/engine/*.test.ts` (create) | Colocated unit + property tests. |

---

## Task 1: Adaptation types, facts, constants, and `mav`

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/facts.ts`, `src/engine/constants.ts`, `src/engine/resolve-constraints.ts`, `src/engine/resolve-constraints.test.ts`
- Test: `src/engine/resolve-constraints.test.ts` (extend)

**Interfaces:**
- Consumes: existing `MuscleGroup`/`SplitType` from `~/schema`, `ExerciseDef` from `~/domain/exercise-library`, existing engine types.
- Produces (used by Tasks 2–5):
  - `ResolvedMuscleTarget` gains `mav: number`.
  - `StepCause = "joint_stress" | "under_recovered" | "responding_well" | "approaching_mrv" | "on_track" | "default_progression"`.
  - `MuscleFeedback`, `CheckInFeedback`, `AdaptationContext`, `MuscleAdjustment`, `WeekAdjustment`, `WeekOutcome`, `DeloadDecision`, `RedistributionKind`, `Tradeoff`, `RedistributionCandidate`.
  - `DecisionFact` gains: `stepped`, `swap_suggested`, `deload_scheduled`, `deload_recommended`, `redistributed`, `dropped_volume`.
  - constants: `JOINT_PAIN=2`, `RECOVERY_LOW=1`, `SCORE_GOOD=2`, `STEP_UP=1`, `STEP_DOWN=1`, `STEP_DOWN_HARD=2`, `MRV_PROXIMITY_SETS=2`, `CONSECUTIVE_FATIGUE_WEEKS=2`, `FATIGUE_MUSCLE_THRESHOLD=2`.

- [ ] **Step 1: Add the `mav` field + adaptation types to `types.ts`**

In `src/engine/types.ts`, add `mav` to `ResolvedMuscleTarget`:

```ts
export interface ResolvedMuscleTarget {
  muscle: MuscleGroup;
  weeklySetTarget: number;
  priority: number;
  mev: number;
  mav: number;
  effectiveMrv: number;
}
```

Then append the adaptation types at the end of the file (after `MesocyclePlan`):

```ts
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
```

Also add the `ExerciseDef` import at the top of `types.ts`:

```ts
import type { ExerciseDef } from "~/domain/exercise-library";
```

- [ ] **Step 2: Add adaptation fact members to `facts.ts`**

In `src/engine/facts.ts`, add these members to the `DecisionFact` union (before the closing `;` of the union — append after the existing `infeasible` member):

```ts
  | { kind: "stepped"; muscle: MuscleGroup; from: number; to: number; cause: "joint_stress" | "under_recovered" | "responding_well" | "approaching_mrv" | "on_track" | "default_progression" }
  | { kind: "swap_suggested"; muscle: MuscleGroup; cause: "joint_stress" }
  | { kind: "deload_scheduled"; atWeek: number }
  | { kind: "deload_recommended"; muscles: MuscleGroup[]; cause: "consecutive_fatigue" }
  | { kind: "redistributed"; muscle: MuscleGroup; sets: number; from: string; to: string }
  | { kind: "dropped_volume"; muscle: MuscleGroup; sets: number; belowMev: boolean; cause: "missed_session" };
```

(The `stepped.cause` union is intentionally the literal `StepCause` values — keep it inline here so `facts.ts` stays dependency-free of `types.ts`.)

- [ ] **Step 3: Add constants to `constants.ts`**

Append to `src/engine/constants.ts`:

```ts
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
```

- [ ] **Step 4: Populate `mav` in the resolver**

In `src/engine/resolve-constraints.ts`, every place a `ResolvedMuscleTarget` object literal is returned includes `mev`/`effectiveMrv`. Add `mav: lm.mav,` alongside `mev: lm.mev,` in each of the three return paths (beginner branch, provided-target branch, untargeted branch). Each branch already has `const lm = athlete.landmarks[muscle];` in scope, so `lm.mav` is available. Do not change any other logic.

- [ ] **Step 5: Extend the resolver test to assert `mav`**

In `src/engine/resolve-constraints.test.ts`, add one assertion to the first test ("keeps a specified target and fills untargeted muscles at MEV"):

```ts
    expect(chest.mav).toBe(DEFAULT_LANDMARKS.CHEST.mav);
```

(Place it next to the existing `chest.weeklySetTarget` assertion. `DEFAULT_LANDMARKS` is already imported in that file.)

- [ ] **Step 6: Run the resolver test + typecheck**

Run: `pnpm vitest run src/engine/resolve-constraints.test.ts`
Expected: all pass (the existing 7 + the new `mav` assertion).

Run: `pnpm typecheck`
Expected: 0 errors. (New types compile; `index.ts` doesn't export the new functions yet — that's Task 5 — but the new files don't exist yet either, so nothing references them. This should be clean.)

- [ ] **Step 7: Commit**

```bash
git add src/engine/types.ts src/engine/facts.ts src/engine/constants.ts src/engine/resolve-constraints.ts src/engine/resolve-constraints.test.ts
git commit -m "feat(engine): adaptation types, facts, constants, and mav on ResolvedMuscleTarget"
```

---

## Task 2: Auto-regulation stepper (`step-week.ts`)

**Files:**
- Create: `src/engine/step-week.ts`
- Test: `src/engine/step-week.test.ts`

**Interfaces:**
- Consumes: `JOINT_PAIN`, `RECOVERY_LOW`, `SCORE_GOOD`, `STEP_UP`, `STEP_DOWN`, `STEP_DOWN_HARD`, `MRV_PROXIMITY_SETS` from `./constants`; `DecisionFact` from `./facts`; types `AdaptationContext`, `CheckInFeedback`, `MesocyclePlan`, `MuscleAdjustment`, `StepCause`, `WeekAdjustment`.
- Produces: `stepWeek(plan, weekIndex, feedback, ctx): WeekAdjustment`. Adjusts the upcoming week (`weekIndex + 1`). Rule table is top-down, first match wins; every muscle emits one `stepped` fact; joint stress additionally emits `swap_suggested`. Hard clamps to `[mev, effectiveMrv]` (MEV floor skipped when the upcoming week is the deload week). `checkInValue: "high"` iff, for any muscle, the planned ramp crosses MAV, comes within `MRV_PROXIMITY_SETS` of effective MRV, or this week's feedback flagged joint ≥ `JOINT_PAIN` or recovery ≤ `RECOVERY_LOW`.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/step-week.test.ts
import { describe, expect, it } from "vitest";
import { stepWeek } from "./step-week";
import type { AdaptationContext, MesocyclePlan, ResolvedMuscleTarget } from "./types";

function target(muscle: string, over: Partial<ResolvedMuscleTarget> = {}): ResolvedMuscleTarget {
  return { muscle: muscle as ResolvedMuscleTarget["muscle"], weeklySetTarget: 16, priority: 1, mev: 8, mav: 14, effectiveMrv: 22, ...over };
}

function ctxWith(targets: ResolvedMuscleTarget[], over: Partial<AdaptationContext> = {}): AdaptationContext {
  return { targets, splitType: "UPPER_LOWER", daysPerWeek: 4, sessionLengthCapMin: 60, blockLengthWeeks: 6, deloadWeekIndex: 6, isBeginner: false, library: [], ...over };
}

// A minimal plan: week 1 = 12 chest, week 2 (upcoming) planned = 14.
function planWith(vols: Record<number, number>, muscle = "CHEST"): MesocyclePlan {
  const weeks = Object.entries(vols).map(([idx, v]) => ({
    index: Number(idx),
    isDeload: Number(idx) === 6,
    sessions: [],
    muscleVolume: { [muscle]: v } as MesocyclePlan["weeks"][number]["muscleVolume"],
  }));
  return { splitType: "UPPER_LOWER", blockLengthWeeks: 6, deloadWeekIndex: 6, weeks, facts: [] };
}

describe("stepWeek rule table", () => {
  const ctx = ctxWith([target("CHEST")]);

  it("joint ≥ 2 backs off 2 sets and flags a swap", () => {
    const plan = planWith({ 1: 12, 2: 14 });
    const r = stepWeek(plan, 1, { weekIndex: 1, muscles: [{ muscle: "CHEST", joint: 3 }] }, ctx);
    const a = r.adjustments.find((x) => x.muscle === "CHEST")!;
    expect(a.adjustedSets).toBe(12); // 14 - 2
    expect(a.cause).toBe("joint_stress");
    expect(a.swapCandidate).toBe(true);
    expect(r.facts.some((f) => f.kind === "swap_suggested" && f.muscle === "CHEST")).toBe(true);
    expect(r.facts.some((f) => f.kind === "stepped" && f.muscle === "CHEST" && f.cause === "joint_stress")).toBe(true);
  });

  it("recovery ≤ 1 drops 1 set, or 2 when at/over MAV", () => {
    const below = stepWeek(planWith({ 1: 12, 2: 13 }), 1, { weekIndex: 1, muscles: [{ muscle: "CHEST", recovery: 0 }] }, ctx);
    expect(below.adjustments[0]!.adjustedSets).toBe(12); // 13 - 1
    const atMav = stepWeek(planWith({ 1: 14, 2: 15 }), 1, { weekIndex: 1, muscles: [{ muscle: "CHEST", recovery: 1 }] }, ctx);
    expect(atMav.adjustments[0]!.adjustedSets).toBe(13); // 15 - 2 (planned 15 ≥ MAV 14)
    expect(atMav.adjustments[0]!.cause).toBe("under_recovered");
  });

  it("responding well (rec≥2, perf≥2, below MRV-1) adds 1 set", () => {
    const r = stepWeek(planWith({ 1: 12, 2: 14 }), 1, { weekIndex: 1, muscles: [{ muscle: "CHEST", recovery: 3, performance: 3 }] }, ctx);
    expect(r.adjustments[0]!.adjustedSets).toBe(15); // 14 + 1
    expect(r.adjustments[0]!.cause).toBe("responding_well");
  });

  it("responding well near MRV holds at planned", () => {
    const r = stepWeek(planWith({ 1: 20, 2: 21 }), 1, { weekIndex: 1, muscles: [{ muscle: "CHEST", recovery: 3, performance: 3 }] }, ctx);
    expect(r.adjustments[0]!.adjustedSets).toBe(21); // planned 21 > MRV(22)-2 → hold
    expect(r.adjustments[0]!.cause).toBe("approaching_mrv");
  });

  it("no feedback → default progression, no change", () => {
    const r = stepWeek(planWith({ 1: 12, 2: 14 }), 1, null, ctx);
    expect(r.adjustments[0]!.adjustedSets).toBe(14);
    expect(r.adjustments[0]!.cause).toBe("default_progression");
  });

  it("clamps never exceed effective MRV nor drop below MEV", () => {
    const r = stepWeek(planWith({ 1: 21, 2: 22 }), 1, { weekIndex: 1, muscles: [{ muscle: "CHEST", recovery: 3, performance: 3 }] }, ctx);
    expect(r.adjustments[0]!.adjustedSets).toBeLessThanOrEqual(22); // effMRV
    const low = stepWeek(planWith({ 1: 9, 2: 9 }), 1, { weekIndex: 1, muscles: [{ muscle: "CHEST", joint: 3 }] }, ctx);
    expect(low.adjustments[0]!.adjustedSets).toBeGreaterThanOrEqual(8); // MEV floor
  });

  it("checkInValue is high when the ramp approaches MRV", () => {
    const high = stepWeek(planWith({ 1: 19, 2: 21 }), 1, null, ctx);
    expect(high.checkInValue).toBe("high"); // 21 ≥ 22 - 2
    const low = stepWeek(planWith({ 1: 10, 2: 11 }), 1, null, ctx);
    expect(low.checkInValue).toBe("low");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/engine/step-week.test.ts`
Expected: FAIL with "Cannot find module './step-week'".

- [ ] **Step 3: Write `step-week.ts`**

```ts
// src/engine/step-week.ts
import {
  JOINT_PAIN,
  MRV_PROXIMITY_SETS,
  RECOVERY_LOW,
  SCORE_GOOD,
  STEP_DOWN,
  STEP_DOWN_HARD,
  STEP_UP,
} from "./constants";
import type { DecisionFact } from "./facts";
import type {
  AdaptationContext,
  CheckInFeedback,
  MesocyclePlan,
  MuscleAdjustment,
  StepCause,
  WeekAdjustment,
} from "./types";

export function stepWeek(
  plan: MesocyclePlan,
  weekIndex: number,
  feedback: CheckInFeedback | null,
  ctx: AdaptationContext,
): WeekAdjustment {
  const facts: DecisionFact[] = [];
  const appliesTo = weekIndex + 1;
  const upcoming = plan.weeks.find((w) => w.index === appliesTo);
  const current = plan.weeks.find((w) => w.index === weekIndex);
  const upcomingIsDeload = upcoming?.isDeload ?? false;
  const fbByMuscle = new Map(
    (feedback?.muscles ?? []).map((m) => [m.muscle, m]),
  );

  const adjustments: MuscleAdjustment[] = [];
  let anyHigh = false;

  for (const t of ctx.targets) {
    const plannedNext =
      upcoming?.muscleVolume[t.muscle] ?? current?.muscleVolume[t.muscle] ?? 0;
    const currentVol = current?.muscleVolume[t.muscle] ?? 0;
    const fb = fbByMuscle.get(t.muscle);
    const rec = fb?.recovery;
    const perf = fb?.performance;
    const joint = fb?.joint;

    let delta = 0;
    let cause: StepCause = "default_progression";
    let swap = false;

    if (!upcoming || upcomingIsDeload || fb === undefined) {
      cause = "default_progression";
    } else if (joint !== undefined && joint >= JOINT_PAIN) {
      delta = -STEP_DOWN_HARD;
      swap = true;
      cause = "joint_stress";
    } else if (rec !== undefined && rec <= RECOVERY_LOW) {
      delta = plannedNext >= t.mav ? -STEP_DOWN_HARD : -STEP_DOWN;
      cause = "under_recovered";
    } else if (
      rec !== undefined && perf !== undefined &&
      rec >= SCORE_GOOD && perf >= SCORE_GOOD &&
      plannedNext < t.effectiveMrv - 1
    ) {
      delta = STEP_UP;
      cause = "responding_well";
    } else if (
      rec !== undefined && perf !== undefined &&
      rec >= SCORE_GOOD && perf >= SCORE_GOOD &&
      plannedNext > t.effectiveMrv - MRV_PROXIMITY_SETS
    ) {
      cause = "approaching_mrv";
    } else {
      cause = "on_track";
    }

    let adjusted = plannedNext + delta;
    if (adjusted > t.effectiveMrv) adjusted = t.effectiveMrv;
    if (!upcomingIsDeload && adjusted < t.mev) adjusted = t.mev;

    facts.push({ kind: "stepped", muscle: t.muscle, from: plannedNext, to: adjusted, cause });
    if (swap) facts.push({ kind: "swap_suggested", muscle: t.muscle, cause: "joint_stress" });

    adjustments.push({
      muscle: t.muscle,
      plannedSets: plannedNext,
      adjustedSets: adjusted,
      delta: adjusted - plannedNext,
      cause,
      swapCandidate: swap,
    });

    if (upcoming && !upcomingIsDeload) {
      const crossesMav = currentVol < t.mav && plannedNext >= t.mav;
      const nearMrv = plannedNext >= t.effectiveMrv - MRV_PROXIMITY_SETS;
      const flaggedNow =
        (joint !== undefined && joint >= JOINT_PAIN) ||
        (rec !== undefined && rec <= RECOVERY_LOW);
      if (crossesMav || nearMrv || flaggedNow) anyHigh = true;
    }
  }

  return {
    fromWeekIndex: weekIndex,
    appliesToWeekIndex: appliesTo,
    adjustments,
    checkInValue: anyHigh ? "high" : "low",
    facts,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/engine/step-week.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/step-week.ts src/engine/step-week.test.ts
git commit -m "feat(engine): add auto-regulation stepper (rule table, clamps, check-in signal)"
```

---

## Task 3: Deload trigger (`deload.ts`)

**Files:**
- Create: `src/engine/deload.ts`
- Test: `src/engine/deload.test.ts`

**Interfaces:**
- Consumes: `CONSECUTIVE_FATIGUE_WEEKS`, `FATIGUE_MUSCLE_THRESHOLD`, `RECOVERY_LOW` from `./constants`; `MuscleGroup` from `~/schema`; `DecisionFact` from `./facts`; types `AdaptationContext`, `DeloadDecision`, `MesocyclePlan`, `WeekOutcome`.
- Produces: `evaluateDeload(plan, history, ctx): DeloadDecision`. `scheduled_next` when the next week (last outcome's index + 1) equals `plan.deloadWeekIndex`; beginners get scheduled-only; otherwise `recommend_early` when each of the last `CONSECUTIVE_FATIGUE_WEEKS` weeks had ≥ `FATIGUE_MUSCLE_THRESHOLD` muscles at/over effective MRV with recovery ≤ `RECOVERY_LOW`; else `none`.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/deload.test.ts
import { describe, expect, it } from "vitest";
import { evaluateDeload } from "./deload";
import type { AdaptationContext, MesocyclePlan, ResolvedMuscleTarget, WeekOutcome } from "./types";

const targets: ResolvedMuscleTarget[] = [
  { muscle: "CHEST", weeklySetTarget: 20, priority: 1, mev: 8, mav: 14, effectiveMrv: 20 },
  { muscle: "BACK", weeklySetTarget: 22, priority: 1, mev: 10, mav: 16, effectiveMrv: 22 },
  { muscle: "QUADS", weeklySetTarget: 18, priority: 0, mev: 8, mav: 14, effectiveMrv: 18 },
];

function ctx(over: Partial<AdaptationContext> = {}): AdaptationContext {
  return { targets, splitType: "UPPER_LOWER", daysPerWeek: 4, sessionLengthCapMin: 60, blockLengthWeeks: 6, deloadWeekIndex: 6, isBeginner: false, library: [], ...over };
}
const plan: MesocyclePlan = { splitType: "UPPER_LOWER", blockLengthWeeks: 6, deloadWeekIndex: 6, weeks: [], facts: [] };

function outcome(weekIndex: number, atMrv: string[], recovery: number): WeekOutcome {
  const muscleVolume = { CHEST: 10, BACK: 10, QUADS: 10 } as WeekOutcome["muscleVolume"];
  const eff: Record<string, number> = { CHEST: 20, BACK: 22, QUADS: 18 };
  for (const m of atMrv) muscleVolume[m as keyof typeof muscleVolume] = eff[m]!;
  return { weekIndex, muscleVolume, feedback: { weekIndex, muscles: atMrv.map((m) => ({ muscle: m as "CHEST", recovery })) } };
}

describe("evaluateDeload", () => {
  it("returns scheduled_next when the next week is the deload week", () => {
    const r = evaluateDeload(plan, [outcome(5, [], 3)], ctx());
    expect(r.decision).toBe("scheduled_next");
    expect(r.facts.some((f) => f.kind === "deload_scheduled" && f.atWeek === 6)).toBe(true);
  });

  it("recommends early deload after 2 consecutive fatigued weeks", () => {
    const r = evaluateDeload(plan, [outcome(2, ["CHEST", "BACK"], 1), outcome(3, ["CHEST", "BACK"], 0)], ctx());
    expect(r.decision).toBe("recommend_early");
    expect(r.facts.some((f) => f.kind === "deload_recommended")).toBe(true);
  });

  it("does not recommend early when only one week is fatigued", () => {
    const r = evaluateDeload(plan, [outcome(2, [], 3), outcome(3, ["CHEST", "BACK"], 0)], ctx());
    expect(r.decision).toBe("none");
  });

  it("beginners get scheduled-only (no reactive deload)", () => {
    const r = evaluateDeload(plan, [outcome(2, ["CHEST", "BACK"], 1), outcome(3, ["CHEST", "BACK"], 0)], ctx({ isBeginner: true }));
    expect(r.decision).toBe("none");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/engine/deload.test.ts`
Expected: FAIL with "Cannot find module './deload'".

- [ ] **Step 3: Write `deload.ts`**

```ts
// src/engine/deload.ts
import type { MuscleGroup } from "~/schema";
import {
  CONSECUTIVE_FATIGUE_WEEKS,
  FATIGUE_MUSCLE_THRESHOLD,
  RECOVERY_LOW,
} from "./constants";
import type { DecisionFact } from "./facts";
import type {
  AdaptationContext,
  DeloadDecision,
  MesocyclePlan,
  WeekOutcome,
} from "./types";

export function evaluateDeload(
  plan: MesocyclePlan,
  history: WeekOutcome[],
  ctx: AdaptationContext,
): DeloadDecision {
  const facts: DecisionFact[] = [];
  const lastWeek =
    history.length > 0 ? Math.max(...history.map((h) => h.weekIndex)) : 0;
  const nextWeek = lastWeek + 1;

  if (nextWeek === plan.deloadWeekIndex) {
    facts.push({ kind: "deload_scheduled", atWeek: nextWeek });
    return { decision: "scheduled_next", facts };
  }

  if (ctx.isBeginner) {
    return { decision: "none", facts };
  }

  const recent = [...history]
    .sort((a, b) => a.weekIndex - b.weekIndex)
    .slice(-CONSECUTIVE_FATIGUE_WEEKS);

  if (recent.length === CONSECUTIVE_FATIGUE_WEEKS) {
    const fatigued = (o: WeekOutcome): MuscleGroup[] => {
      const fb = new Map((o.feedback?.muscles ?? []).map((m) => [m.muscle, m]));
      const out: MuscleGroup[] = [];
      for (const t of ctx.targets) {
        const vol = o.muscleVolume[t.muscle] ?? 0;
        const rec = fb.get(t.muscle)?.recovery;
        if (vol >= t.effectiveMrv && rec !== undefined && rec <= RECOVERY_LOW) {
          out.push(t.muscle);
        }
      }
      return out;
    };
    const w1 = fatigued(recent[0]!);
    const w2 = fatigued(recent[1]!);
    if (
      w1.length >= FATIGUE_MUSCLE_THRESHOLD &&
      w2.length >= FATIGUE_MUSCLE_THRESHOLD
    ) {
      facts.push({
        kind: "deload_recommended",
        muscles: [...w2].sort(),
        cause: "consecutive_fatigue",
      });
      return { decision: "recommend_early", facts };
    }
  }

  return { decision: "none", facts };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/engine/deload.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/deload.ts src/engine/deload.test.ts
git commit -m "feat(engine): add deload trigger (scheduled + reactive-early)"
```

---

## Task 4: Redistribution solver (`redistribute.ts`)

**Files:**
- Create: `src/engine/redistribute.ts`
- Test: `src/engine/redistribute.test.ts`

**Interfaces:**
- Consumes: `PER_SET_MIN`, `SETUP_MIN` from `./constants`; `MuscleGroup` from `~/schema`; `buildSessionSlots` from `./split`; `sessionMinutes` from `./time`; `computeVolume`/`roundVolumeMap` from `./util`; `DecisionFact` from `./facts`; types `AdaptationContext`, `PrescriptionPlan`, `RedistributionCandidate`, `RedistributionKind`, `SessionPlan`, `WeekPlan`.
- Produces: `redistributeWeek(week, missedSessionIds, ctx): RedistributionCandidate[]` — 1–3 complete, valid `WeekPlan` candidates. MAKE_UP recovers all missed sets that fit remaining eligible sessions within the cap; PARTIAL recovers only muscles with `priority > 0`; LET_GO drops everything. Each carries a `tradeoff {recovered, dropped}` and facts (`redistributed` per recovered set, `dropped_volume` for the rest and for any target left below MEV). Redundant candidates (MAKE_UP that recovered nothing, PARTIAL identical to MAKE_UP) are not emitted. One candidate is marked `recommended` by policy: late block (past halfway) with any muscle near MRV → LET_GO, else MAKE_UP.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/redistribute.test.ts
import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { redistributeWeek } from "./redistribute";
import { sessionMinutes } from "./time";
import type { AdaptationContext, ResolvedMuscleTarget, WeekPlan } from "./types";

const targets: ResolvedMuscleTarget[] = [
  { muscle: "CHEST", weeklySetTarget: 12, priority: 1, mev: 8, mav: 14, effectiveMrv: 22 },
  { muscle: "BACK", weeklySetTarget: 12, priority: 0, mev: 10, mav: 16, effectiveMrv: 25 },
];

function ctx(over: Partial<AdaptationContext> = {}): AdaptationContext {
  return { targets, splitType: "UPPER_LOWER", daysPerWeek: 4, sessionLengthCapMin: 60, blockLengthWeeks: 6, deloadWeekIndex: 6, isBeginner: false, library: EXERCISE_LIBRARY, ...over };
}

// Week with two upper sessions; upper-b is missed (6 chest sets to redistribute).
function week(): WeekPlan {
  const px = (exerciseName: string, sets: number) => ({ exerciseName, sets, repRangeLow: 6, repRangeHigh: 10, targetRir: 2 });
  return {
    index: 2,
    isDeload: false,
    sessions: [
      { slotId: "upper-a", label: "Upper A", prescriptions: [px("Barbell Bench Press", 6), px("Barbell Row", 6)], estimatedMinutes: sessionMinutes([{ sets: 6 }, { sets: 6 }]) },
      { slotId: "upper-b", label: "Upper B", prescriptions: [px("Barbell Bench Press", 6)], estimatedMinutes: sessionMinutes([{ sets: 6 }]) },
    ],
    muscleVolume: { CHEST: 12, BACK: 6 } as WeekPlan["muscleVolume"],
  };
}

describe("redistributeWeek", () => {
  it("returns candidates that are all complete valid plans within the cap", () => {
    const cands = redistributeWeek(week(), ["upper-b"], ctx());
    expect(cands.length).toBeGreaterThanOrEqual(1);
    for (const c of cands) {
      for (const s of c.week.sessions) {
        expect(sessionMinutes(s.prescriptions)).toBeLessThanOrEqual(60);
      }
      // the missed session is gone from every candidate
      expect(c.week.sessions.some((s) => s.slotId === "upper-b")).toBe(false);
    }
  });

  it("MAKE_UP recovers ≥ LET_GO recovered volume", () => {
    const cands = redistributeWeek(week(), ["upper-b"], ctx());
    const makeUp = cands.find((c) => c.kind === "MAKE_UP");
    const letGo = cands.find((c) => c.kind === "LET_GO");
    expect(letGo).toBeDefined();
    expect(letGo!.tradeoff.recovered).toBe(0);
    if (makeUp) expect(makeUp.tradeoff.recovered).toBeGreaterThanOrEqual(letGo!.tradeoff.recovered);
  });

  it("every recovered set emits a redistributed fact; dropped sets emit dropped_volume", () => {
    const cands = redistributeWeek(week(), ["upper-b"], ctx());
    const makeUp = cands.find((c) => c.kind === "MAKE_UP");
    if (makeUp && makeUp.tradeoff.recovered > 0) {
      expect(makeUp.facts.some((f) => f.kind === "redistributed")).toBe(true);
    }
    const letGo = cands.find((c) => c.kind === "LET_GO")!;
    expect(letGo.facts.some((f) => f.kind === "dropped_volume")).toBe(true);
  });

  it("returns nothing when no session was missed", () => {
    expect(redistributeWeek(week(), [], ctx())).toEqual([]);
  });

  it("marks exactly one candidate recommended", () => {
    const cands = redistributeWeek(week(), ["upper-b"], ctx());
    expect(cands.filter((c) => c.recommended).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/engine/redistribute.test.ts`
Expected: FAIL with "Cannot find module './redistribute'".

- [ ] **Step 3: Write `redistribute.ts`**

```ts
// src/engine/redistribute.ts
import type { MuscleGroup } from "~/schema";
import { PER_SET_MIN, SETUP_MIN } from "./constants";
import type { DecisionFact } from "./facts";
import { buildSessionSlots } from "./split";
import { sessionMinutes } from "./time";
import type {
  AdaptationContext,
  PrescriptionPlan,
  RedistributionCandidate,
  RedistributionKind,
  SessionPlan,
  WeekPlan,
} from "./types";
import { computeVolume, roundVolumeMap } from "./util";

interface MissedPx extends PrescriptionPlan {
  fromSlot: string;
}

export function redistributeWeek(
  week: WeekPlan,
  missedSessionIds: string[],
  ctx: AdaptationContext,
): RedistributionCandidate[] {
  const missed = new Set(missedSessionIds);
  const missedSessions = week.sessions.filter((s) => missed.has(s.slotId));
  const remainingSessions = week.sessions.filter((s) => !missed.has(s.slotId));
  if (missedSessions.length === 0) return [];

  const slots = buildSessionSlots(ctx.splitType, ctx.daysPerWeek);
  const eligibleBySlot = new Map(
    slots.map((s) => [s.id, new Set<MuscleGroup>(s.eligibleMuscles)]),
  );
  const byName = new Map(ctx.library.map((e) => [e.name, e]));
  const targetByMuscle = new Map(ctx.targets.map((t) => [t.muscle, t]));
  const primaryMuscle = (name: string): MuscleGroup | undefined =>
    byName.get(name)?.muscles.find((m) => m.role === "PRIMARY")?.muscle;

  const missedPx: MissedPx[] = missedSessions.flatMap((s) =>
    s.prescriptions.map((p) => ({ ...p, fromSlot: s.slotId })),
  );

  function build(
    kind: RedistributionKind,
    shouldRecover: (px: MissedPx) => boolean,
  ): RedistributionCandidate {
    const sessions: SessionPlan[] = remainingSessions.map((s) => ({
      slotId: s.slotId,
      label: s.label,
      prescriptions: s.prescriptions.map((p) => ({ ...p })),
      estimatedMinutes: s.estimatedMinutes,
    }));
    const facts: DecisionFact[] = [];
    let recovered = 0;
    let dropped = 0;

    for (const px of missedPx) {
      const pm = primaryMuscle(px.exerciseName);
      if (pm === undefined || !shouldRecover(px)) {
        dropped += px.sets;
        if (pm !== undefined) {
          facts.push({ kind: "dropped_volume", muscle: pm, sets: px.sets, belowMev: false, cause: "missed_session" });
        }
        continue;
      }
      let remainingSets = px.sets;
      while (remainingSets > 0) {
        const dest = sessions
          .filter((s) => eligibleBySlot.get(s.slotId)?.has(pm))
          .filter((s) => sessionMinutes(s.prescriptions) + SETUP_MIN + PER_SET_MIN <= ctx.sessionLengthCapMin)
          .sort((a, b) => sessionMinutes(a.prescriptions) - sessionMinutes(b.prescriptions) || a.slotId.localeCompare(b.slotId))[0];
        if (!dest) break;
        const existing = dest.prescriptions.find((p) => p.exerciseName === px.exerciseName);
        if (existing) existing.sets += 1;
        else dest.prescriptions.push({ ...px, sets: 1 });
        dest.estimatedMinutes = sessionMinutes(dest.prescriptions);
        recovered += 1;
        remainingSets -= 1;
        facts.push({ kind: "redistributed", muscle: pm, sets: 1, from: px.fromSlot, to: dest.slotId });
      }
      if (remainingSets > 0) {
        dropped += remainingSets;
        facts.push({ kind: "dropped_volume", muscle: pm, sets: remainingSets, belowMev: false, cause: "missed_session" });
      }
    }

    const allPx = sessions.flatMap((s) => s.prescriptions).map((p) => ({ exerciseName: p.exerciseName, sets: p.sets }));
    const muscleVolume = roundVolumeMap(computeVolume(allPx, ctx.library));

    for (const t of ctx.targets) {
      if (muscleVolume[t.muscle] < t.mev) {
        facts.push({ kind: "dropped_volume", muscle: t.muscle, sets: 0, belowMev: true, cause: "missed_session" });
      }
    }

    return {
      kind,
      week: { index: week.index, isDeload: week.isDeload, sessions, muscleVolume },
      tradeoff: { recovered, dropped },
      recommended: false,
      facts,
    };
  }

  const makeUp = build("MAKE_UP", () => true);
  const partial = build("PARTIAL", (px) => {
    const pm = primaryMuscle(px.exerciseName);
    return pm !== undefined && (targetByMuscle.get(pm)?.priority ?? 0) > 0;
  });
  const letGo = build("LET_GO", () => false);

  // Emit 1–3 distinct candidates.
  const out: RedistributionCandidate[] = [];
  if (makeUp.tradeoff.recovered > 0) out.push(makeUp);
  if (
    partial.tradeoff.recovered > 0 &&
    partial.tradeoff.recovered < makeUp.tradeoff.recovered
  ) {
    out.push(partial);
  }
  out.push(letGo);

  // Recommendation policy: late block + near MRV → LET_GO, else MAKE_UP.
  const nearMrv = ctx.targets.some(
    (t) => (week.muscleVolume[t.muscle] ?? 0) >= t.effectiveMrv - 2,
  );
  const lateBlock = week.index > Math.ceil(ctx.blockLengthWeeks / 2);
  const preferred: RedistributionKind = lateBlock && nearMrv ? "LET_GO" : "MAKE_UP";
  const pick = out.find((c) => c.kind === preferred) ?? out[0]!;
  pick.recommended = true;

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/engine/redistribute.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/redistribute.ts src/engine/redistribute.test.ts
git commit -m "feat(engine): add redistribution solver (MAKE_UP / PARTIAL / LET_GO candidates)"
```

---

## Task 5: Property tests + public exports

**Files:**
- Create: `src/engine/adaptation.properties.test.ts`
- Modify: `src/engine/index.ts`
- Modify: `src/engine/_fixtures/arbitraries.ts` (add an adaptation-context arbitrary)

**Interfaces:**
- Consumes: `fc` from `fast-check`; `stepWeek`/`evaluateDeload`/`redistributeWeek` from the engine; `resolveConstraints`/`generateMesocycle` (to build real plans); `DEFAULT_LANDMARKS`; `EXERCISE_LIBRARY`; `sessionMinutes`.
- Produces: `index.ts` re-exports `stepWeek`, `evaluateDeload`, `redistributeWeek` and the public adaptation types; an `arbCheckInFeedback(targets)` arbitrary.

- [ ] **Step 1: Export the new functions + types from `index.ts`**

Add to `src/engine/index.ts`:

```ts
export { stepWeek } from "./step-week";
export { evaluateDeload } from "./deload";
export { redistributeWeek } from "./redistribute";
export type {
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
```

- [ ] **Step 2: Add an adaptation-context builder to the arbitraries fixture**

Append to `src/engine/_fixtures/arbitraries.ts`:

```ts
import { DEFAULT_LANDMARKS as _LM } from "~/domain/landmarks";
import { EXERCISE_LIBRARY as _LIB } from "~/domain/exercise-library";
import type { AdaptationContext, ResolvedSpec } from "../types";

/** Build an AdaptationContext from a resolved spec (adds MAV from default landmarks). */
export function ctxFromSpec(spec: ResolvedSpec): AdaptationContext {
  return {
    targets: spec.targets,
    splitType: spec.splitType,
    daysPerWeek: spec.daysPerWeek,
    sessionLengthCapMin: spec.sessionLengthCapMin,
    blockLengthWeeks: spec.blockLengthWeeks,
    deloadWeekIndex: spec.deloadWeekIndex,
    isBeginner: spec.isBeginner,
    library: _LIB,
  };
}
```

(`ResolvedMuscleTarget.mav` is populated by the resolver as of Task 1, so `spec.targets` already carries MAV; `_LM` is imported for parity with the other fixtures even though not directly used here — remove if the linter flags it.)

- [ ] **Step 3: Write the property test**

```ts
// src/engine/adaptation.properties.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { generateMesocycle, resolveConstraints, stepWeek, redistributeWeek } from "./index";
import { sessionMinutes } from "./time";
import { arbAthlete, arbConstraintSet, ctxFromSpec } from "./_fixtures/arbitraries";
import type { CheckInFeedback } from "./types";

describe("adaptation invariants", () => {
  it("stepper monotonicity: better recovery never yields fewer sets, all else equal", () => {
    fc.assert(
      fc.property(arbConstraintSet(), arbAthlete(), (input, athlete) => {
        const spec = resolveConstraints(input, athlete);
        if (spec.kind !== "resolved") return;
        const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        const ctx = ctxFromSpec(spec);
        const worse: CheckInFeedback = { weekIndex: 1, muscles: spec.targets.map((t) => ({ muscle: t.muscle, recovery: 1, performance: 2 })) };
        const better: CheckInFeedback = { weekIndex: 1, muscles: spec.targets.map((t) => ({ muscle: t.muscle, recovery: 3, performance: 2 })) };
        const lo = stepWeek(plan, 1, worse, ctx);
        const hi = stepWeek(plan, 1, better, ctx);
        for (const t of spec.targets) {
          const a = lo.adjustments.find((x) => x.muscle === t.muscle)!;
          const b = hi.adjustments.find((x) => x.muscle === t.muscle)!;
          expect(b.adjustedSets).toBeGreaterThanOrEqual(a.adjustedSets);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("stepper stays within [mev, effectiveMrv] and emits a fact per muscle", () => {
    fc.assert(
      fc.property(arbConstraintSet(), arbAthlete(), (input, athlete) => {
        const spec = resolveConstraints(input, athlete);
        if (spec.kind !== "resolved") return;
        const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        const ctx = ctxFromSpec(spec);
        const r = stepWeek(plan, 1, { weekIndex: 1, muscles: spec.targets.map((t) => ({ muscle: t.muscle, recovery: 3, performance: 3 })) }, ctx);
        for (const t of spec.targets) {
          const a = r.adjustments.find((x) => x.muscle === t.muscle)!;
          expect(a.adjustedSets).toBeLessThanOrEqual(t.effectiveMrv);
          expect(a.adjustedSets).toBeGreaterThanOrEqual(t.mev);
          expect(r.facts.some((f) => f.kind === "stepped" && "muscle" in f && f.muscle === t.muscle)).toBe(true);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("redistribution: every candidate is a valid within-cap plan; recovered MAKE_UP ≥ LET_GO", () => {
    fc.assert(
      fc.property(arbConstraintSet(), arbAthlete(), (input, athlete) => {
        const spec = resolveConstraints(input, athlete);
        if (spec.kind !== "resolved") return;
        const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        const ctx = ctxFromSpec(spec);
        const wk = plan.weeks.find((w) => !w.isDeload);
        if (!wk || wk.sessions.length < 2) return;
        const missedId = wk.sessions[wk.sessions.length - 1]!.slotId;
        const cands = redistributeWeek(wk, [missedId], ctx);
        const letGo = cands.find((c) => c.kind === "LET_GO");
        const makeUp = cands.find((c) => c.kind === "MAKE_UP");
        for (const c of cands) {
          for (const s of c.week.sessions) {
            expect(sessionMinutes(s.prescriptions)).toBeLessThanOrEqual(ctx.sessionLengthCapMin);
          }
        }
        if (letGo && makeUp) expect(makeUp.tradeoff.recovered).toBeGreaterThanOrEqual(letGo.tradeoff.recovered);
        if (cands.length > 0) expect(cands.filter((c) => c.recommended).length).toBe(1);
      }),
      { numRuns: 150 },
    );
  });
});
```

- [ ] **Step 4: Run the property test**

Run: `pnpm vitest run src/engine/adaptation.properties.test.ts`
Expected: all 3 properties PASS. If any fails, fast-check prints a minimal counterexample — treat it as a real engine bug and fix the offending module (do not weaken the property or add `fc.pre` filters to dodge inputs).

- [ ] **Step 5: Full verification**

Run: `pnpm test` → all engine tests pass (generation + adaptation).
Run: `pnpm typecheck` → 0 errors.
Run: `pnpm lint` → clean on the new files.

- [ ] **Step 6: Commit**

```bash
git add src/engine/index.ts src/engine/_fixtures/arbitraries.ts src/engine/adaptation.properties.test.ts
git commit -m "test(engine): adaptation property invariants + public exports"
```

---

## Self-Review

**Spec coverage (§ by §):**
- §2 signatures — all three entry points implemented with the `AdaptationContext` param (the documented design decision reconciling the frozen 3-arg signatures with the real landmark/eligibility dependency). `checkInValue` returned by `stepWeek` (Task 2).
- §6 Auto-Regulation Stepper — full 6-row rule table, top-down first-match, per-muscle `stepped` fact + `swap_suggested` on joint stress, hard clamps to `[mev, effectiveMrv]` (MEV floor skipped on a deload upcoming week), `checkInValue` from MAV-crossing / MRV-proximity / this-week fatigue (Task 2).
- §7 Deload Trigger — scheduled_next, reactive recommend_early (2 consecutive fatigued weeks, ≥2 muscles), beginner scheduled-only (Task 3).
- §8 Redistribution Solver — MAKE_UP / PARTIAL / LET_GO complete valid `WeekPlan` candidates, `tradeoff`, `recommended` policy, redundant-candidate suppression, no auto-apply (Task 4).
- §9 testing — rule-table units (Task 2), deload cases (Task 3), redistribution validity (Task 4), property invariants incl. stepper monotonicity and MAKE_UP ≥ LET_GO recovered volume (Task 5).

**Deliberate decisions (documented, not placeholders):**
- `AdaptationContext` param carries `targets` (with `mav`), split geometry, cap, block info, and the library; `MesocyclePlan` and the golden snapshot are untouched (per the approved decision).
- Reactive deload reads "≥2 muscles fatigued in each of the last two weeks" (not the same muscles both weeks) — the simplest faithful reading of the spec's "for two consecutive weeks."
- Redistribution recovers by adding sets to existing exercise lines in eligible remaining sessions within the cap; unfittable remainder is dropped and quantified. `redistributed.from` carries the missed slot id.
- Finding #9 (resolver auto-fill) is explicitly OUT of scope, tracked separately.

**Type consistency:** `ResolvedMuscleTarget` gains `mav` in Task 1 and is used by every downstream module and both `AdaptationContext.targets` and the resolver. `stepped.cause` literal union in `facts.ts` matches `StepCause` in `types.ts` exactly. `sessionMinutes` accepts `{sets}[]`, so both `PrescriptionPlan[]` and raw assignment lists pass. All three functions take `ctx: AdaptationContext` as the final argument.

## Execution Handoff

Plan complete. Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, spec+quality review between tasks, final whole-branch review. (Same flow that built the generation path.)
2. **Inline Execution** — execute in this session with checkpoints.
