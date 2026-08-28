# Training Engine — Generation Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic generation path of the training engine — `resolveConstraints` and `generateMesocycle` (with an internal volume distributor) — that turns a validated `ConstraintSetInput` + athlete context into a complete, explainable `MesocyclePlan`.

**Architecture:** A pure, zero-runtime-dependency TypeScript package under `src/engine/`. `resolveConstraints` normalizes user intent against per-muscle landmarks (defaults, phase modulation, beginner locking, feasibility). A greedy-plus-repair volume distributor stamps a single peak-week template (exercises fixed for the block). `generateMesocycle` ramps that template across weeks and emits prescriptions. Every decision ships as a typed `DecisionFact` so the LLM layer can phrase but never invent reasons.

**Tech Stack:** TypeScript, Vitest (`pnpm test`), fast-check (property tests, dev-dep, test-only), ESLint flat config (boundary enforcement). Path alias `~/*` → `src/*`.

**Parent spec:** `docs/superpowers/specs/2026-07-25-training-engine-design.md` (this plan covers §2–§5 and the §9 testing strategy for the generation path only; the adaptation path — `stepWeek`, `evaluateDeload`, `redistributeWeek` — is a separate plan).

## Global Constraints

- **Zero runtime deps in `src/engine/`.** Non-test engine files import only from `~/schema` (type-only) and `~/domain` (types + the pure `DEFAULT_LANDMARKS` / `EXERCISE_LIBRARY` values). No imports from `next`, `@prisma/client`, `~/generated/prisma`, `react`, `react-dom`, or `~/server`. Enforced by an ESLint boundary rule (Task 1).
- **fast-check is test-only** (a `devDependency`); it appears only in `*.test.ts` files.
- **Determinism: no RNG anywhere.** Same input ⇒ deep-equal output. Stable tie-break ordering everywhere: **priority desc → target/headroom desc → name asc**.
- **Every engine decision emits ≥1 `DecisionFact`.** Any mutation the distributor or resolver makes (moved sets, trimmed overshoot, filled default, phase modulation, infeasibility) records a fact.
- **Constants live in `src/engine/constants.ts`** — never inline magic numbers. Time model: `sessionMinutes = WARMUP_MIN(8) + Σ per exercise (SETUP_MIN(2) + sets × PER_SET_MIN(3))`.
- **Public entry-point signatures (frozen by the spec §2):**
  - `resolveConstraints(input: ConstraintSetInput, athlete: AthleteContext) → ResolvedSpec | InfeasibilityReport`
  - `generateMesocycle(spec: ResolvedSpec, library: ExerciseDef[], landmarks: LandmarkMap) → MesocyclePlan`
- **Existing contracts (do not redefine):** `ConstraintSetInput`, `MuscleGroup`, `SplitType`, `TrainingPhase`, `ExperienceLevel` from `~/schema`; `Landmarks`, `DEFAULT_LANDMARKS` from `~/domain/landmarks`; `ExerciseDef`, `ExerciseMuscleDef`, `EXERCISE_LIBRARY` from `~/domain/exercise-library`.

---

## File Structure

All new files live under `src/engine/`:

| File | Responsibility |
|---|---|
| `constants.ts` | All tunable numbers (time model, phase factors, ramp/deload fractions, rep/RIR defaults, thresholds). |
| `facts.ts` | The `DecisionFact` discriminated union (Law 2's teeth). |
| `types.ts` | Engine-internal + public types: `AthleteContext`, `LandmarkMap`, `ResolvedSpec`, `InfeasibilityReport`, `MesocyclePlan`, week/session/prescription shapes. |
| `util.ts` | Pure helpers: `ALL_MUSCLES`, `emptyVolumeMap`, `round1`, `roundVolumeMap`, `computeVolume`. |
| `time.ts` | `sessionMinutes` — the feasibility currency. |
| `split.ts` | `buildSessionSlots` — split type → session slots + per-session muscle eligibility. |
| `resolve-constraints.ts` | `resolveConstraints` — defaults, phase modulation, beginner lock, feasibility precheck. |
| `distribute.ts` | `distributeVolume` — greedy + repair; produces the peak-week template. |
| `generate.ts` | `generateMesocycle` — ramp stamping, prescriptions, deload. |
| `index.ts` | Public barrel: entry points + public types. |
| `_fixtures/arbitraries.ts` | fast-check arbitraries for property tests (test support). |
| `_fixtures/canonical.ts` | The vision's canonical input for the golden fixture (test support). |
| `*.test.ts` | Colocated unit + property + golden tests. |

---

### Task 1: Engine scaffold — constants, facts, types, util, barrel, boundary rule

**Files:**
- Create: `src/engine/constants.ts`, `src/engine/facts.ts`, `src/engine/types.ts`, `src/engine/util.ts`, `src/engine/index.ts`
- Create: `src/engine/util.test.ts`
- Modify: `eslint.config.js` (add boundary rule)
- Modify: `package.json` (add `fast-check` dev-dep via pnpm)

**Interfaces:**
- Consumes: `MuscleGroup`, `SplitType`, `TrainingPhase`, `ExperienceLevel`, `ConstraintSetInput` (type-only) from `~/schema`; `Landmarks` from `~/domain/landmarks`; `ExerciseDef` from `~/domain/exercise-library`.
- Produces (used by every later task):
  - `constants.ts`: `WARMUP_MIN`, `SETUP_MIN`, `PER_SET_MIN`, `FREQUENCY_THRESHOLD_SETS`, `PHASE_FACTOR`, `RAMP_START_FRACTION`, `DELOAD_FRACTION`, `COMPOUND_REPS`, `ISOLATION_REPS`, `COMPOUND_RIR`, `ISOLATION_RIR`, `DELOAD_RIR`.
  - `facts.ts`: `DecisionFact` union.
  - `types.ts`: `AthleteContext`, `LandmarkMap`, `ResolvedMuscleTarget`, `ResolvedSpec`, `InfeasibilityReport`, `ResolveResult`, `SessionSlot`, `ExerciseAssignment`, `SessionTemplate`, `MuscleVolumeMap`, `WeekTemplate`, `PrescriptionPlan`, `SessionPlan`, `WeekPlan`, `MesocyclePlan`.
  - `util.ts`: `ALL_MUSCLES: MuscleGroup[]`, `emptyVolumeMap(): MuscleVolumeMap`, `round1(n: number): number`, `roundVolumeMap(m: MuscleVolumeMap): MuscleVolumeMap`, `computeVolume(assignments: ExerciseAssignment[], library: ExerciseDef[]): MuscleVolumeMap`.

- [ ] **Step 1: Install fast-check as a dev dependency**

Run:
```bash
pnpm add -D fast-check
```
Expected: `package.json` gains `"fast-check"` under `devDependencies`; lockfile updates.

- [ ] **Step 2: Write `constants.ts`**

```ts
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
```

- [ ] **Step 3: Write `facts.ts`**

```ts
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
  | { kind: "beginner_locked"; detail: string }
  | { kind: "split_volume"; muscle: MuscleGroup; sessions: string[]; cause: "frequency_floor" }
  | { kind: "moved_sets"; muscle: MuscleGroup; from: string; to: string; count: number; cause: "session_time_cap" }
  | { kind: "trimmed_overshoot"; muscle: MuscleGroup; from: number; to: number; cause: "secondary_credit_overshoot" }
  | { kind: "ramp_flattened"; muscle: MuscleGroup; atWeek: number; cappedAt: number; cause: "mrv_ceiling" }
  | { kind: "deviation"; muscle: MuscleGroup; target: number; achieved: number; cause: "no_eligible_exercise" | "session_time_cap" | "insufficient_capacity" | "secondary_credit_overshoot" }
  | { kind: "infeasible"; constraint: "session_time" | "weekly_volume"; detail: Record<string, number | string> };
```

- [ ] **Step 4: Write `types.ts`**

```ts
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
```

- [ ] **Step 5: Write `util.ts`**

```ts
// src/engine/util.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import type { MuscleGroup } from "~/schema";
import type { ExerciseAssignment, MuscleVolumeMap } from "./types";

/** All muscle groups, in enum order. A test guarantees parity with the Zod enum. */
export const ALL_MUSCLES: MuscleGroup[] = [
  "CHEST", "BACK", "TRAPS", "FRONT_DELTS", "SIDE_DELTS", "REAR_DELTS",
  "BICEPS", "TRICEPS", "FOREARMS", "ABS", "QUADS", "HAMSTRINGS", "GLUTES", "CALVES",
];

export function emptyVolumeMap(): MuscleVolumeMap {
  const m = {} as MuscleVolumeMap;
  for (const muscle of ALL_MUSCLES) m[muscle] = 0;
  return m;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function roundVolumeMap(m: MuscleVolumeMap): MuscleVolumeMap {
  const out = {} as MuscleVolumeMap;
  for (const muscle of ALL_MUSCLES) out[muscle] = round1(m[muscle]);
  return out;
}

/** Fractional achieved weekly volume from a flat list of assignments. */
export function computeVolume(
  assignments: ExerciseAssignment[],
  library: ExerciseDef[],
): MuscleVolumeMap {
  const byName = new Map(library.map((e) => [e.name, e]));
  const vol = emptyVolumeMap();
  for (const a of assignments) {
    const ex = byName.get(a.exerciseName);
    if (!ex) continue;
    for (const mm of ex.muscles) vol[mm.muscle] += a.sets * mm.fraction;
  }
  return vol;
}
```

- [ ] **Step 6: Write `index.ts` barrel**

```ts
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
```

Note: `index.ts` references modules created in later tasks. It will not typecheck until Tasks 2, 4, 6 land — that is expected; do not run a full typecheck at the end of this task. The `util.test.ts` below imports `util.ts` directly, not the barrel.

- [ ] **Step 7: Write the failing `util.test.ts`**

```ts
// src/engine/util.test.ts
import { describe, expect, it } from "vitest";
import { MUSCLE_GROUPS } from "~/schema";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { ALL_MUSCLES, computeVolume, emptyVolumeMap, round1 } from "./util";

describe("engine util", () => {
  it("ALL_MUSCLES matches the Zod muscle enum exactly", () => {
    expect([...ALL_MUSCLES].sort()).toEqual([...MUSCLE_GROUPS].sort());
  });

  it("emptyVolumeMap zeroes every muscle", () => {
    const m = emptyVolumeMap();
    for (const muscle of ALL_MUSCLES) expect(m[muscle]).toBe(0);
  });

  it("round1 rounds to one decimal", () => {
    expect(round1(1.049)).toBe(1);
    expect(round1(1.05)).toBe(1.1);
  });

  it("computeVolume credits primary fully and secondary fractionally", () => {
    // Barbell Row: BACK 1.0 primary, BICEPS 0.5, REAR_DELTS 0.5 secondary
    const vol = computeVolume([{ exerciseName: "Barbell Row", sets: 4 }], EXERCISE_LIBRARY);
    expect(vol.BACK).toBe(4);
    expect(vol.BICEPS).toBe(2);
    expect(vol.REAR_DELTS).toBe(2);
    expect(vol.CHEST).toBe(0);
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `pnpm vitest run src/engine/util.test.ts`
Expected: FAIL — `Cannot find module './util'` (or similar) before `util.ts` exists; if you wrote `util.ts` in Step 5 first, it should PASS. Order Steps 5 and 7 so you see the test drive the file — write the test first if starting fresh.

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm vitest run src/engine/util.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 10: Add the ESLint boundary rule**

In `eslint.config.js`, add a new config object (append it to the `tseslint.config(...)` argument list, after the main `files: ["**/*.ts", "**/*.tsx"]` block):

```js
  {
    files: ["src/engine/**/*.ts"],
    ignores: ["src/engine/**/*.test.ts", "src/engine/_fixtures/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["next", "next/*"], message: "Engine is pure: no Next.js imports." },
            { group: ["react", "react-dom"], message: "Engine is pure: no React imports." },
            { group: ["@prisma/*", "~/generated/*", "~/server/*"], message: "Engine is pure: no DB/server imports." },
          ],
        },
      ],
    },
  },
```

- [ ] **Step 11: Verify the boundary rule is active**

Run: `pnpm lint`
Expected: PASS (no engine file imports a forbidden module yet). To confirm the rule bites, temporarily add `import "react";` to `src/engine/util.ts`, run `pnpm lint`, expect an error mentioning "Engine is pure", then remove the line and re-run to PASS.

- [ ] **Step 12: Commit**

```bash
git add package.json pnpm-lock.yaml eslint.config.js src/engine/
git commit -m "feat(engine): scaffold pure engine package (constants, facts, types, util, boundary rule)"
```

---

### Task 2: Time model

**Files:**
- Create: `src/engine/time.ts`
- Test: `src/engine/time.test.ts`

**Interfaces:**
- Consumes: `WARMUP_MIN`, `SETUP_MIN`, `PER_SET_MIN` from `./constants`; `ExerciseAssignment` from `./types`.
- Produces: `sessionMinutes(exercises: Pick<ExerciseAssignment, "sets">[]): number`.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/time.test.ts
import { describe, expect, it } from "vitest";
import { sessionMinutes } from "./time";

describe("sessionMinutes", () => {
  it("is just warmup for an empty session", () => {
    expect(sessionMinutes([])).toBe(8); // WARMUP_MIN
  });

  it("adds setup + per-set time per exercise", () => {
    // 8 warmup + (2 setup + 4·3) + (2 setup + 3·3) = 8 + 14 + 11 = 33
    expect(sessionMinutes([{ sets: 4 }, { sets: 3 }])).toBe(33);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/engine/time.test.ts`
Expected: FAIL with "Cannot find module './time'".

- [ ] **Step 3: Write `time.ts`**

```ts
// src/engine/time.ts
import { PER_SET_MIN, SETUP_MIN, WARMUP_MIN } from "./constants";
import type { ExerciseAssignment } from "./types";

/** Estimated minutes for a session. The engine's feasibility currency. */
export function sessionMinutes(exercises: Pick<ExerciseAssignment, "sets">[]): number {
  return exercises.reduce((sum, e) => sum + SETUP_MIN + e.sets * PER_SET_MIN, WARMUP_MIN);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/engine/time.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/time.ts src/engine/time.test.ts
git commit -m "feat(engine): add session time model"
```

---

### Task 3: Split / eligibility map

**Files:**
- Create: `src/engine/split.ts`
- Test: `src/engine/split.test.ts`

**Interfaces:**
- Consumes: `SplitType`, `MuscleGroup` (type-only) from `~/schema`; `ALL_MUSCLES` from `./util`; `SessionSlot` from `./types`.
- Produces: `buildSessionSlots(splitType: SplitType, daysPerWeek: number): SessionSlot[]`. Slot `id`s are stable, kebab-case, unique (e.g. `upper-a`, `lower-b`, `push-a`).

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/split.test.ts
import { describe, expect, it } from "vitest";
import { ALL_MUSCLES } from "./util";
import { buildSessionSlots } from "./split";

describe("buildSessionSlots", () => {
  it("upper/lower over 5 days alternates U,L,U,L,U", () => {
    const slots = buildSessionSlots("UPPER_LOWER", 5);
    expect(slots.map((s) => s.label)).toEqual([
      "Upper A", "Lower A", "Upper B", "Lower B", "Upper C",
    ]);
    expect(slots.map((s) => s.id)).toEqual([
      "upper-a", "lower-a", "upper-b", "lower-b", "upper-c",
    ]);
  });

  it("upper days are eligible for chest, lower days for quads — never crossed", () => {
    const slots = buildSessionSlots("UPPER_LOWER", 4);
    const upper = slots.filter((s) => s.label.startsWith("Upper"));
    const lower = slots.filter((s) => s.label.startsWith("Lower"));
    for (const s of upper) {
      expect(s.eligibleMuscles).toContain("CHEST");
      expect(s.eligibleMuscles).not.toContain("QUADS");
    }
    for (const s of lower) {
      expect(s.eligibleMuscles).toContain("QUADS");
      expect(s.eligibleMuscles).not.toContain("CHEST");
    }
  });

  it("full body makes every session eligible for every muscle", () => {
    const slots = buildSessionSlots("FULL_BODY", 3);
    expect(slots).toHaveLength(3);
    for (const s of slots) {
      expect([...s.eligibleMuscles].sort()).toEqual([...ALL_MUSCLES].sort());
    }
  });

  it("PPL over 6 days cycles push, pull, legs twice", () => {
    const slots = buildSessionSlots("PUSH_PULL_LEGS", 6);
    expect(slots.map((s) => s.label)).toEqual([
      "Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B",
    ]);
  });

  it("produces exactly daysPerWeek slots with unique ids", () => {
    const slots = buildSessionSlots("PUSH_PULL_LEGS", 5);
    expect(slots).toHaveLength(5);
    expect(new Set(slots.map((s) => s.id)).size).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/engine/split.test.ts`
Expected: FAIL with "Cannot find module './split'".

- [ ] **Step 3: Write `split.ts`**

```ts
// src/engine/split.ts
import type { MuscleGroup, SplitType } from "~/schema";
import type { SessionSlot } from "./types";
import { ALL_MUSCLES } from "./util";

const UPPER: MuscleGroup[] = [
  "CHEST", "BACK", "TRAPS", "FRONT_DELTS", "SIDE_DELTS", "REAR_DELTS",
  "BICEPS", "TRICEPS", "FOREARMS", "ABS",
];
const LOWER: MuscleGroup[] = ["QUADS", "HAMSTRINGS", "GLUTES", "CALVES", "ABS"];
const PUSH: MuscleGroup[] = ["CHEST", "FRONT_DELTS", "SIDE_DELTS", "TRICEPS", "ABS"];
const PULL: MuscleGroup[] = ["BACK", "TRAPS", "REAR_DELTS", "BICEPS", "FOREARMS"];
const LEGS: MuscleGroup[] = ["QUADS", "HAMSTRINGS", "GLUTES", "CALVES", "ABS"];

const LETTERS = "ABCDEFG";

/** Build `daysPerWeek` sessions from a repeating group cycle. Each group base name
 * gets an incrementing letter suffix (Upper A, Upper B, ...). */
function cycle(
  groups: { base: string; muscles: MuscleGroup[] }[],
  daysPerWeek: number,
): SessionSlot[] {
  const counts = new Map<string, number>();
  const slots: SessionSlot[] = [];
  for (let i = 0; i < daysPerWeek; i++) {
    const g = groups[i % groups.length]!;
    const n = counts.get(g.base) ?? 0;
    counts.set(g.base, n + 1);
    const letter = LETTERS[n] ?? String(n + 1);
    slots.push({
      id: `${g.base.toLowerCase().replace(/\s+/g, "-")}-${letter.toLowerCase()}`,
      label: `${g.base} ${letter}`,
      eligibleMuscles: g.muscles,
    });
  }
  return slots;
}

/** Split type + day count → session slots with per-session muscle eligibility.
 * BRO_SPLIT and CUSTOM fall back to full-body eligibility for MVP generation. */
export function buildSessionSlots(splitType: SplitType, daysPerWeek: number): SessionSlot[] {
  switch (splitType) {
    case "UPPER_LOWER":
      return cycle(
        [{ base: "Upper", muscles: UPPER }, { base: "Lower", muscles: LOWER }],
        daysPerWeek,
      );
    case "PUSH_PULL_LEGS":
      return cycle(
        [
          { base: "Push", muscles: PUSH },
          { base: "Pull", muscles: PULL },
          { base: "Legs", muscles: LEGS },
        ],
        daysPerWeek,
      );
    case "FULL_BODY":
    case "BRO_SPLIT":
    case "CUSTOM":
      return cycle([{ base: "Full Body", muscles: ALL_MUSCLES }], daysPerWeek);
  }
}
```

Note: BRO_SPLIT and CUSTOM intentionally map to full-body eligibility for this generation MVP (the beachhead athlete uses UPPER_LOWER / PUSH_PULL_LEGS). Dedicated bro-split geometry is a follow-up, not a placeholder — the fallback produces a valid plan.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/engine/split.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/split.ts src/engine/split.test.ts
git commit -m "feat(engine): add split-type eligibility map"
```

---

### Task 4: Constraint resolver

**Files:**
- Create: `src/engine/resolve-constraints.ts`
- Test: `src/engine/resolve-constraints.test.ts`

**Interfaces:**
- Consumes: `ConstraintSetInput` (type) from `~/schema`; `PHASE_FACTOR`, `WARMUP_MIN`, `PER_SET_MIN` from `./constants`; `ALL_MUSCLES` from `./util`; `buildSessionSlots` from `./split`; types `AthleteContext`, `ResolveResult`, `ResolvedSpec`, `ResolvedMuscleTarget`; `DecisionFact` from `./facts`.
- Produces: `resolveConstraints(input: ConstraintSetInput, athlete: AthleteContext): ResolveResult`. On success returns `{ kind: "resolved", ... }` with `targets` sorted priority desc → target desc → muscle name asc; on failure `{ kind: "infeasible", facts }` with ≥1 `infeasible` fact.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/resolve-constraints.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import type { ConstraintSetInput } from "~/schema";
import { resolveConstraints } from "./resolve-constraints";
import type { AthleteContext } from "./types";

const intermediate: AthleteContext = {
  experienceLevel: "INTERMEDIATE",
  phase: "MAINTAIN",
  landmarks: DEFAULT_LANDMARKS,
};

const baseInput: ConstraintSetInput = {
  daysPerWeek: 5,
  splitType: "UPPER_LOWER",
  sessionLengthCapMin: 60,
  blockLengthWeeks: 6,
  checkInCadence: "WEEKLY",
  muscleTargets: [{ muscle: "CHEST", weeklySetTarget: 16, priority: 1 }],
  excludedExerciseNames: [],
};

describe("resolveConstraints", () => {
  it("keeps a specified target and fills untargeted muscles at MEV", () => {
    const r = resolveConstraints(baseInput, intermediate);
    expect(r.kind).toBe("resolved");
    if (r.kind !== "resolved") return;
    const chest = r.targets.find((t) => t.muscle === "CHEST")!;
    expect(chest.weeklySetTarget).toBe(16);
    const biceps = r.targets.find((t) => t.muscle === "BICEPS")!;
    expect(biceps.weeklySetTarget).toBe(DEFAULT_LANDMARKS.BICEPS.mev);
    expect(r.facts.some((f) => f.kind === "filled_default" && f.muscle === "BICEPS")).toBe(true);
  });

  it("defaults deloadWeekIndex to the last week", () => {
    const r = resolveConstraints(baseInput, intermediate);
    if (r.kind !== "resolved") return;
    expect(r.deloadWeekIndex).toBe(6);
  });

  it("clamps a target above effective MRV and records a fact", () => {
    const r = resolveConstraints(
      { ...baseInput, muscleTargets: [{ muscle: "CHEST", weeklySetTarget: 99, priority: 1 }] },
      intermediate,
    );
    if (r.kind !== "resolved") return;
    const chest = r.targets.find((t) => t.muscle === "CHEST")!;
    expect(chest.weeklySetTarget).toBe(DEFAULT_LANDMARKS.CHEST.mrv); // MAINTAIN → factor 1
    expect(r.facts.some((f) => f.kind === "clamped_to_mrv" && f.muscle === "CHEST")).toBe(true);
  });

  it("modulates effective MRV on a cut", () => {
    const r = resolveConstraints(baseInput, { ...intermediate, phase: "CUT" });
    if (r.kind !== "resolved") return;
    const chest = r.targets.find((t) => t.muscle === "CHEST")!;
    expect(chest.effectiveMrv).toBe(Math.round(DEFAULT_LANDMARKS.CHEST.mrv * 0.85));
    expect(r.facts.some((f) => f.kind === "phase_modulated" && f.muscle === "CHEST")).toBe(true);
  });

  it("locks beginners to flat MEV–MAV midpoint volume with a fact", () => {
    const r = resolveConstraints(baseInput, { ...intermediate, experienceLevel: "BEGINNER" });
    if (r.kind !== "resolved") return;
    expect(r.isBeginner).toBe(true);
    const chest = r.targets.find((t) => t.muscle === "CHEST")!;
    const { mev, mav } = DEFAULT_LANDMARKS.CHEST;
    expect(chest.weeklySetTarget).toBe(Math.round((mev + mav) / 2)); // user target ignored
    expect(r.facts.some((f) => f.kind === "beginner_locked")).toBe(true);
  });

  it("sorts targets by priority desc, then target desc, then name asc", () => {
    const r = resolveConstraints(baseInput, intermediate);
    if (r.kind !== "resolved") return;
    for (let i = 1; i < r.targets.length; i++) {
      const a = r.targets[i - 1]!;
      const b = r.targets[i]!;
      const rank =
        b.priority - a.priority ||
        b.weeklySetTarget - a.weeklySetTarget ||
        a.muscle.localeCompare(b.muscle);
      expect(rank).toBeLessThanOrEqual(0);
    }
  });

  it("reports infeasibility when required volume cannot fit the weekly time budget", () => {
    const r = resolveConstraints(
      {
        ...baseInput,
        daysPerWeek: 2,
        sessionLengthCapMin: 20,
        muscleTargets: [
          { muscle: "CHEST", weeklySetTarget: 22, priority: 5 },
          { muscle: "BACK", weeklySetTarget: 25, priority: 5 },
          { muscle: "QUADS", weeklySetTarget: 20, priority: 5 },
        ],
      },
      intermediate,
    );
    expect(r.kind).toBe("infeasible");
    if (r.kind !== "infeasible") return;
    expect(r.facts.some((f) => f.kind === "infeasible" && f.constraint === "session_time")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/engine/resolve-constraints.test.ts`
Expected: FAIL with "Cannot find module './resolve-constraints'".

- [ ] **Step 3: Write `resolve-constraints.ts`**

```ts
// src/engine/resolve-constraints.ts
import type { ConstraintSetInput, MuscleTargetInput } from "~/schema";
import { PER_SET_MIN, PHASE_FACTOR, WARMUP_MIN } from "./constants";
import type { DecisionFact } from "./facts";
import { buildSessionSlots } from "./split";
import type {
  AthleteContext,
  ResolvedMuscleTarget,
  ResolveResult,
} from "./types";
import { ALL_MUSCLES } from "./util";

export function resolveConstraints(
  input: ConstraintSetInput,
  athlete: AthleteContext,
): ResolveResult {
  const facts: DecisionFact[] = [];
  const isBeginner = athlete.experienceLevel === "BEGINNER";
  const phaseFactor = PHASE_FACTOR[athlete.phase];
  const provided = new Map<string, MuscleTargetInput>(
    input.muscleTargets.map((t) => [t.muscle, t]),
  );

  const targets: ResolvedMuscleTarget[] = ALL_MUSCLES.map((muscle) => {
    const lm = athlete.landmarks[muscle];
    const effectiveMrv = Math.round(lm.mrv * phaseFactor);
    if (effectiveMrv !== lm.mrv) {
      facts.push({ kind: "phase_modulated", muscle, baseMrv: lm.mrv, effectiveMrv, phaseFactor });
    }

    if (isBeginner) {
      return {
        muscle,
        weeklySetTarget: Math.round((lm.mev + lm.mav) / 2),
        priority: 0,
        mev: lm.mev,
        effectiveMrv,
      };
    }

    const p = provided.get(muscle);
    if (p?.weeklySetTarget != null) {
      let weeklySetTarget = p.weeklySetTarget;
      if (weeklySetTarget > effectiveMrv) {
        facts.push({ kind: "clamped_to_mrv", muscle, requested: weeklySetTarget, effectiveMrv });
        weeklySetTarget = effectiveMrv;
      }
      return { muscle, weeklySetTarget, priority: p.priority, mev: lm.mev, effectiveMrv };
    }

    // Untargeted → maintenance at MEV.
    facts.push({ kind: "filled_default", muscle, setTarget: lm.mev, cause: "unspecified_target" });
    return { muscle, weeklySetTarget: lm.mev, priority: p?.priority ?? 0, mev: lm.mev, effectiveMrv };
  });

  if (isBeginner) {
    facts.push({ kind: "beginner_locked", detail: "flat volume at MEV–MAV midpoint; progression via load/reps, not set counts" });
  }

  targets.sort(
    (a, b) =>
      b.priority - a.priority ||
      b.weeklySetTarget - a.weeklySetTarget ||
      a.muscle.localeCompare(b.muscle),
  );

  // Feasibility precheck: conservative lower bound on weekly minutes.
  // Even ignoring per-exercise setup time, warmups + all sets must fit the budget.
  const totalSets = targets.reduce((s, t) => s + t.weeklySetTarget, 0);
  const requiredMin = WARMUP_MIN * input.daysPerWeek + totalSets * PER_SET_MIN;
  const capMin = input.daysPerWeek * input.sessionLengthCapMin;
  if (requiredMin > capMin) {
    facts.push({
      kind: "infeasible",
      constraint: "session_time",
      detail: { requiredMin, capMin, totalSets, daysPerWeek: input.daysPerWeek },
    });
    return { kind: "infeasible", facts };
  }

  // Sanity check that the split geometry builds (throws would be a bug, not infeasibility).
  buildSessionSlots(input.splitType, input.daysPerWeek);

  return {
    kind: "resolved",
    daysPerWeek: input.daysPerWeek,
    splitType: input.splitType,
    sessionLengthCapMin: input.sessionLengthCapMin,
    blockLengthWeeks: input.blockLengthWeeks,
    deloadWeekIndex: input.deloadWeekIndex ?? input.blockLengthWeeks,
    isBeginner,
    targets,
    excludedExerciseNames: input.excludedExerciseNames,
    facts,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/engine/resolve-constraints.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/resolve-constraints.ts src/engine/resolve-constraints.test.ts
git commit -m "feat(engine): add constraint resolver (defaults, phase modulation, beginner lock, feasibility)"
```

---

### Task 5: Volume distributor (greedy + repair)

**Files:**
- Create: `src/engine/distribute.ts`
- Test: `src/engine/distribute.test.ts`

**Interfaces:**
- Consumes: `ExerciseDef` from `~/domain/exercise-library`; `MuscleGroup` (type) from `~/schema`; `FREQUENCY_THRESHOLD_SETS`, `PER_SET_MIN`, `SETUP_MIN` from `./constants`; `sessionMinutes` from `./time`; `DecisionFact` from `./facts`; types `ResolvedSpec`, `SessionSlot`, `ExerciseAssignment`, `WeekTemplate`, `MuscleVolumeMap`; `computeVolume`, `emptyVolumeMap`, `round1`, `roundVolumeMap` from `./util`.
- Produces: `distributeVolume(spec: ResolvedSpec, library: ExerciseDef[], slots: SessionSlot[]): WeekTemplate`. The template is the **peak week**: per-session exercise assignments (whole sets), achieved fractional volume per muscle, and facts for every mutation.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/distribute.test.ts
import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { distributeVolume } from "./distribute";
import { buildSessionSlots } from "./split";
import { sessionMinutes } from "./time";
import type { ResolvedSpec } from "./types";

function specWith(overrides: Partial<ResolvedSpec>): ResolvedSpec {
  return {
    kind: "resolved",
    daysPerWeek: 4,
    splitType: "UPPER_LOWER",
    sessionLengthCapMin: 60,
    blockLengthWeeks: 6,
    deloadWeekIndex: 6,
    isBeginner: false,
    excludedExerciseNames: [],
    facts: [],
    targets: [
      { muscle: "CHEST", weeklySetTarget: 12, priority: 1, mev: 8, effectiveMrv: 22 },
      { muscle: "BACK", weeklySetTarget: 12, priority: 1, mev: 10, effectiveMrv: 25 },
      { muscle: "QUADS", weeklySetTarget: 10, priority: 0, mev: 8, effectiveMrv: 20 },
    ],
    ...overrides,
  };
}

describe("distributeVolume", () => {
  it("hits chest target within ±0.5 sets", () => {
    const spec = specWith({});
    const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
    const t = distributeVolume(spec, EXERCISE_LIBRARY, slots);
    expect(Math.abs(t.achievedVolume.CHEST - 12)).toBeLessThanOrEqual(0.5);
  });

  it("never exceeds the session time cap", () => {
    const spec = specWith({});
    const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
    const t = distributeVolume(spec, EXERCISE_LIBRARY, slots);
    for (const s of t.sessions) {
      expect(sessionMinutes(s.exercises)).toBeLessThanOrEqual(spec.sessionLengthCapMin);
    }
  });

  it("never assigns an excluded exercise", () => {
    const spec = specWith({ excludedExerciseNames: ["Barbell Back Squat"] });
    const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
    const t = distributeVolume(spec, EXERCISE_LIBRARY, slots);
    const names = t.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseName));
    expect(names).not.toContain("Barbell Back Squat");
  });

  it("spreads a high-volume muscle across ≥2 sessions and records a fact", () => {
    const spec = specWith({
      targets: [{ muscle: "BACK", weeklySetTarget: 12, priority: 2, mev: 10, effectiveMrv: 25 }],
    });
    const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
    const t = distributeVolume(spec, EXERCISE_LIBRARY, slots);
    const sessionsTrainingBack = t.sessions.filter((s) =>
      s.exercises.some((e) => EXERCISE_LIBRARY.find((x) => x.name === e.exerciseName)!.muscles.some((m) => m.muscle === "BACK" && m.role === "PRIMARY")),
    );
    expect(sessionsTrainingBack.length).toBeGreaterThanOrEqual(2);
    expect(t.facts.some((f) => f.kind === "split_volume" && f.muscle === "BACK")).toBe(true);
  });

  it("is deterministic — same input, deep-equal output", () => {
    const spec = specWith({});
    const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
    const a = distributeVolume(spec, EXERCISE_LIBRARY, slots);
    const b = distributeVolume(spec, EXERCISE_LIBRARY, slots);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/engine/distribute.test.ts`
Expected: FAIL with "Cannot find module './distribute'".

- [ ] **Step 3: Write `distribute.ts`**

```ts
// src/engine/distribute.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import type { MuscleGroup } from "~/schema";
import { FREQUENCY_THRESHOLD_SETS, PER_SET_MIN, SETUP_MIN } from "./constants";
import type { DecisionFact } from "./facts";
import { sessionMinutes } from "./time";
import type {
  ExerciseAssignment,
  ResolvedSpec,
  SessionSlot,
  SessionTemplate,
  WeekTemplate,
} from "./types";
import { computeVolume, emptyVolumeMap, round1, roundVolumeMap } from "./util";

export function distributeVolume(
  spec: ResolvedSpec,
  library: ExerciseDef[],
  slots: SessionSlot[],
): WeekTemplate {
  const facts: DecisionFact[] = [];
  const excluded = new Set(spec.excludedExerciseNames);
  const pool = library.filter((e) => !excluded.has(e.name));
  const byName = new Map(pool.map((e) => [e.name, e]));
  const bySlot = new Map<string, ExerciseAssignment[]>(slots.map((s) => [s.id, []]));
  const achieved = emptyVolumeMap();

  const targetOf = (m: MuscleGroup): number =>
    spec.targets.find((t) => t.muscle === m)?.weeklySetTarget ?? 0;
  const remainingNeed = (m: MuscleGroup): number => targetOf(m) - achieved[m];
  const slotsForMuscle = (m: MuscleGroup): SessionSlot[] =>
    slots.filter((s) => s.eligibleMuscles.includes(m));
  const slotMinutes = (slotId: string): number => sessionMinutes(bySlot.get(slotId)!);

  function creditSets(ex: ExerciseDef, sets: number): void {
    for (const mm of ex.muscles) achieved[mm.muscle] += sets * mm.fraction;
  }

  function addAssignment(slotId: string, name: string, sets: number): void {
    const list = bySlot.get(slotId)!;
    const existing = list.find((a) => a.exerciseName === name);
    if (existing) existing.sets += sets;
    else list.push({ exerciseName: name, sets });
  }

  /** Best PRIMARY exercise for a muscle: compounds first, then those whose
   *  secondary credit pays still-unmet targets, then name asc. */
  function pickExercise(m: MuscleGroup): ExerciseDef | null {
    if (slotsForMuscle(m).length === 0) return null;
    const cands = pool.filter((e) =>
      e.muscles.some((mm) => mm.muscle === m && mm.role === "PRIMARY"),
    );
    if (cands.length === 0) return null;
    const unmetCredit = (e: ExerciseDef): number =>
      e.muscles
        .filter((mm) => mm.role === "SECONDARY" && remainingNeed(mm.muscle) > 0)
        .reduce((s, mm) => s + mm.fraction, 0);
    return [...cands].sort((a, b) => {
      const ca = a.movementPattern === "ISOLATION" ? 0 : 1;
      const cb = b.movementPattern === "ISOLATION" ? 0 : 1;
      return cb - ca || unmetCredit(b) - unmetCredit(a) || a.name.localeCompare(b.name);
    })[0]!;
  }

  /** Distribute `total` whole sets across the least-loaded eligible slots,
   *  using at least `minSessions` distinct sessions where possible. */
  function distributeAcross(
    total: number,
    eligible: SessionSlot[],
    minSessions: number,
  ): { slotId: string; sets: number }[] {
    const ordered = [...eligible].sort(
      (a, b) => slotMinutes(a.id) - slotMinutes(b.id) || a.id.localeCompare(b.id),
    );
    const n = Math.min(Math.max(minSessions, 1), ordered.length);
    const chosen = ordered.slice(0, Math.max(n, 1));
    const out = new Map<string, number>(chosen.map((s) => [s.id, 0]));
    for (let placed = 0; placed < total; placed++) {
      const slot = chosen[placed % chosen.length]!;
      out.set(slot.id, out.get(slot.id)! + 1);
    }
    return [...out.entries()].map(([slotId, sets]) => ({ slotId, sets }));
  }

  // ---- greedy allocation (spec.targets is pre-sorted priority/target/name) ----
  for (const t of spec.targets) {
    const need = remainingNeed(t.muscle);
    if (need < 1) continue; // secondary credit may already satisfy it
    const ex = pickExercise(t.muscle);
    if (!ex) {
      facts.push({
        kind: "deviation",
        muscle: t.muscle,
        target: targetOf(t.muscle),
        achieved: round1(achieved[t.muscle]),
        cause: "no_eligible_exercise",
      });
      continue;
    }
    const eligible = slotsForMuscle(t.muscle);
    const setsToPlace = Math.round(need);
    const minSessions =
      setsToPlace >= FREQUENCY_THRESHOLD_SETS && eligible.length >= 2 ? 2 : 1;
    const spread = distributeAcross(setsToPlace, eligible, minSessions);
    for (const { slotId, sets } of spread) {
      if (sets <= 0) continue;
      addAssignment(slotId, ex.name, sets);
      creditSets(ex, sets);
    }
    const usedSessions = spread.filter((x) => x.sets > 0).map((x) => x.slotId);
    if (minSessions === 2 && usedSessions.length >= 2) {
      facts.push({ kind: "split_volume", muscle: t.muscle, sessions: usedSessions, cause: "frequency_floor" });
    }
  }

  // ---- repair: time-cap ----
  let guard = 0;
  while (guard++ < 200) {
    const over = slots
      .map((s) => s.id)
      .filter((id) => slotMinutes(id) > spec.sessionLengthCapMin)
      .sort((a, b) => slotMinutes(b) - slotMinutes(a) || a.localeCompare(b));
    if (over.length === 0) break;
    const fromId = over[0]!;
    const list = bySlot.get(fromId)!;
    if (list.length === 0) break;
    const movable = [...list].sort(
      (a, b) => b.sets - a.sets || a.exerciseName.localeCompare(b.exerciseName),
    )[0]!;
    const ex = byName.get(movable.exerciseName)!;
    const primary = ex.muscles.find((mm) => mm.role === "PRIMARY")!.muscle;
    const dest = slotsForMuscle(primary)
      .filter((s) => s.id !== fromId)
      .sort((a, b) => slotMinutes(a.id) - slotMinutes(b.id) || a.id.localeCompare(b.id))[0];

    movable.sets -= 1;
    if (movable.sets === 0) list.splice(list.indexOf(movable), 1);

    if (dest && slotMinutes(dest.id) + SETUP_MIN + PER_SET_MIN <= spec.sessionLengthCapMin) {
      addAssignment(dest.id, ex.name, 1);
      facts.push({ kind: "moved_sets", muscle: primary, from: fromId, to: dest.id, count: 1, cause: "session_time_cap" });
    } else {
      creditSets(ex, -1); // dropped — no room anywhere
      facts.push({
        kind: "deviation",
        muscle: primary,
        target: targetOf(primary),
        achieved: round1(achieved[primary]),
        cause: "session_time_cap",
      });
    }
  }

  // ---- repair: overshoot trim (fractional credit pushed a muscle past target + 0.5) ----
  for (const t of spec.targets) {
    if (achieved[t.muscle] - t.weeklySetTarget <= 0.5) continue;
    const before = round1(achieved[t.muscle]);
    for (const [, list] of bySlot) {
      for (const a of list) {
        const ex = byName.get(a.exerciseName)!;
        const prim = ex.muscles.find((mm) => mm.role === "PRIMARY");
        if (prim?.muscle !== t.muscle || ex.movementPattern !== "ISOLATION") continue;
        while (achieved[t.muscle] - t.weeklySetTarget > 0.5 && a.sets > 0) {
          a.sets -= 1;
          creditSets(ex, -1);
        }
      }
    }
    // remove any emptied assignments
    for (const [, list] of bySlot) {
      for (let i = list.length - 1; i >= 0; i--) if (list[i]!.sets === 0) list.splice(i, 1);
    }
    if (round1(achieved[t.muscle]) < before) {
      facts.push({ kind: "trimmed_overshoot", muscle: t.muscle, from: before, to: round1(achieved[t.muscle]), cause: "secondary_credit_overshoot" });
    }
  }

  // ---- residual deviations (targeted muscles still off by > 0.5) ----
  for (const t of spec.targets) {
    const dev = achieved[t.muscle] - t.weeklySetTarget;
    if (Math.abs(dev) <= 0.5) continue;
    facts.push({
      kind: "deviation",
      muscle: t.muscle,
      target: t.weeklySetTarget,
      achieved: round1(achieved[t.muscle]),
      cause: dev > 0 ? "secondary_credit_overshoot" : "insufficient_capacity",
    });
  }

  const sessions: SessionTemplate[] = slots.map((s) => {
    const exercises = bySlot.get(s.id)!;
    return {
      slotId: s.id,
      label: s.label,
      exercises,
      estimatedMinutes: sessionMinutes(exercises),
    };
  });

  // Recompute from assignments so achievedVolume always matches what's on the page.
  const allAssignments = sessions.flatMap((s) => s.exercises);
  return {
    sessions,
    achievedVolume: roundVolumeMap(computeVolume(allAssignments, pool)),
    facts,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/engine/distribute.test.ts`
Expected: PASS (5 tests). If the chest-target test fails by more than 0.5, inspect which secondary-credit exercise overshot and confirm the overshoot-trim pass ran — do not loosen the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/engine/distribute.ts src/engine/distribute.test.ts
git commit -m "feat(engine): add volume distributor (greedy allocation + time/frequency/overshoot repair)"
```

---

### Task 6: Mesocycle generator

**Files:**
- Create: `src/engine/generate.ts`
- Test: `src/engine/generate.test.ts`

**Interfaces:**
- Consumes: `ExerciseDef` from `~/domain/exercise-library`; `COMPOUND_REPS`, `COMPOUND_RIR`, `DELOAD_FRACTION`, `DELOAD_RIR`, `ISOLATION_REPS`, `ISOLATION_RIR`, `RAMP_START_FRACTION` from `./constants`; `distributeVolume` from `./distribute`; `buildSessionSlots` from `./split`; `sessionMinutes` from `./time`; `DecisionFact` from `./facts`; types `ResolvedSpec`, `LandmarkMap`, `MesocyclePlan`, `WeekPlan`, `SessionPlan`, `PrescriptionPlan`, `ExerciseAssignment`; `computeVolume`, `roundVolumeMap` from `./util`.
- Produces: `generateMesocycle(spec: ResolvedSpec, library: ExerciseDef[], landmarks: LandmarkMap): MesocyclePlan`. Weeks are 1-based; the deload week sits at `spec.deloadWeekIndex`; accumulation weeks ramp from `RAMP_START_FRACTION`×peak up to peak at the last accumulation week (flat at peak for beginners); every week's `muscleVolume` is recomputed from its prescriptions.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/generate.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { generateMesocycle } from "./generate";
import type { ResolvedSpec } from "./types";

function spec(overrides: Partial<ResolvedSpec> = {}): ResolvedSpec {
  return {
    kind: "resolved",
    daysPerWeek: 4,
    splitType: "UPPER_LOWER",
    sessionLengthCapMin: 60,
    blockLengthWeeks: 6,
    deloadWeekIndex: 6,
    isBeginner: false,
    excludedExerciseNames: [],
    facts: [],
    targets: [
      { muscle: "CHEST", weeklySetTarget: 16, priority: 1, mev: 8, effectiveMrv: 22 },
      { muscle: "BACK", weeklySetTarget: 16, priority: 1, mev: 10, effectiveMrv: 25 },
      { muscle: "QUADS", weeklySetTarget: 12, priority: 0, mev: 8, effectiveMrv: 20 },
    ],
    ...overrides,
  };
}

describe("generateMesocycle", () => {
  it("produces one week per block week", () => {
    const plan = generateMesocycle(spec(), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    expect(plan.weeks.map((w) => w.index)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("marks only the deload week as deload", () => {
    const plan = generateMesocycle(spec(), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    expect(plan.weeks.filter((w) => w.isDeload).map((w) => w.index)).toEqual([6]);
  });

  it("ramps chest volume up to peak at the last accumulation week", () => {
    const plan = generateMesocycle(spec(), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const wk1 = plan.weeks[0]!.muscleVolume.CHEST;
    const wk5 = plan.weeks[4]!.muscleVolume.CHEST; // last accumulation week
    expect(wk5).toBeGreaterThanOrEqual(wk1);
    expect(wk1).toBeGreaterThan(0);
  });

  it("deload volume is roughly half of week 1", () => {
    const plan = generateMesocycle(spec(), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const wk1 = plan.weeks[0]!.muscleVolume.CHEST;
    const deload = plan.weeks[5]!.muscleVolume.CHEST;
    expect(deload).toBeLessThan(wk1);
    expect(deload).toBeGreaterThan(0);
  });

  it("no week's muscle volume exceeds the effective MRV", () => {
    const plan = generateMesocycle(spec(), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    for (const w of plan.weeks) {
      for (const t of spec().targets) {
        expect(w.muscleVolume[t.muscle]).toBeLessThanOrEqual(t.effectiveMrv + 0.5);
      }
    }
  });

  it("uses higher RIR on the deload week", () => {
    const plan = generateMesocycle(spec(), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const deloadRir = plan.weeks[5]!.sessions.flatMap((s) => s.prescriptions).map((p) => p.targetRir);
    const accumRir = plan.weeks[0]!.sessions.flatMap((s) => s.prescriptions).map((p) => p.targetRir);
    expect(Math.min(...deloadRir)).toBeGreaterThan(Math.max(...accumRir));
  });

  it("keeps volume flat across accumulation weeks for beginners", () => {
    const plan = generateMesocycle(spec({ isBeginner: true }), EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const chestByWeek = plan.weeks.slice(0, 5).map((w) => w.muscleVolume.CHEST);
    for (const v of chestByWeek) expect(v).toBe(chestByWeek[0]);
  });

  it("carries forward resolver and distributor facts", () => {
    const s = spec({ facts: [{ kind: "beginner_locked", detail: "x" }] });
    const plan = generateMesocycle(s, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    expect(plan.facts.some((f) => f.kind === "beginner_locked")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/engine/generate.test.ts`
Expected: FAIL with "Cannot find module './generate'".

- [ ] **Step 3: Write `generate.ts`**

```ts
// src/engine/generate.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import {
  COMPOUND_REPS,
  COMPOUND_RIR,
  DELOAD_FRACTION,
  DELOAD_RIR,
  ISOLATION_REPS,
  ISOLATION_RIR,
  RAMP_START_FRACTION,
} from "./constants";
import { distributeVolume } from "./distribute";
import type { DecisionFact } from "./facts";
import { buildSessionSlots } from "./split";
import { sessionMinutes } from "./time";
import type {
  ExerciseAssignment,
  LandmarkMap,
  MesocyclePlan,
  PrescriptionPlan,
  ResolvedSpec,
  SessionPlan,
  WeekPlan,
} from "./types";
import { computeVolume, roundVolumeMap } from "./util";

export function generateMesocycle(
  spec: ResolvedSpec,
  library: ExerciseDef[],
  landmarks: LandmarkMap,
): MesocyclePlan {
  const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
  const template = distributeVolume(spec, library, slots); // peak week
  const byName = new Map(library.map((e) => [e.name, e]));
  const facts: DecisionFact[] = [...spec.facts, ...template.facts];

  const allWeeks = Array.from({ length: spec.blockLengthWeeks }, (_, i) => i + 1);
  const accumWeeks = allWeeks.filter((i) => i !== spec.deloadWeekIndex);
  const lastAccum = Math.max(...accumWeeks);

  const week1Fraction = spec.isBeginner ? 1 : RAMP_START_FRACTION;

  function fractionForWeek(index: number): number {
    if (index === spec.deloadWeekIndex) return DELOAD_FRACTION * week1Fraction;
    if (spec.isBeginner || accumWeeks.length === 1) return 1;
    const rank = accumWeeks.indexOf(index); // 0-based among accumulation weeks
    return RAMP_START_FRACTION + (1 - RAMP_START_FRACTION) * (rank / (accumWeeks.length - 1));
  }

  function scaleAssignment(a: ExerciseAssignment, fraction: number): ExerciseAssignment {
    return { exerciseName: a.exerciseName, sets: Math.max(1, Math.round(a.sets * fraction)) };
  }

  /** Bring any muscle below its MEV back up by adding sets to its largest primary
   * assignment (honors week 1 = max(MEV, 75%·peak)). Accumulation weeks only. */
  function applyMevFloor(assignments: ExerciseAssignment[]): void {
    for (const t of spec.targets) {
      let vol = computeVolume(assignments, library)[t.muscle];
      if (vol >= t.mev) continue;
      const primaries = assignments
        .filter((a) => byName.get(a.exerciseName)?.muscles.some((m) => m.muscle === t.muscle && m.role === "PRIMARY"))
        .sort((a, b) => b.sets - a.sets || a.exerciseName.localeCompare(b.exerciseName));
      const target = primaries[0];
      if (!target) continue;
      let guard = 0;
      while (vol < t.mev && guard++ < 50) {
        target.sets += 1;
        vol = computeVolume(assignments, library)[t.muscle];
      }
    }
  }

  function prescribe(a: ExerciseAssignment, isDeload: boolean): PrescriptionPlan {
    const iso = byName.get(a.exerciseName)?.movementPattern === "ISOLATION";
    const reps = iso ? ISOLATION_REPS : COMPOUND_REPS;
    const rir = isDeload ? DELOAD_RIR : iso ? ISOLATION_RIR : COMPOUND_RIR;
    return {
      exerciseName: a.exerciseName,
      sets: a.sets,
      repRangeLow: reps.low,
      repRangeHigh: reps.high,
      targetRir: rir,
    };
  }

  const weeks: WeekPlan[] = allWeeks.map((index) => {
    const isDeload = index === spec.deloadWeekIndex;
    const fraction = fractionForWeek(index);

    const sessions: SessionPlan[] = template.sessions.map((s) => {
      const scaled = s.exercises.map((a) => scaleAssignment(a, fraction));
      if (!isDeload) applyMevFloor(scaled);
      // clamp to effective MRV: if scaling/flooring pushed a muscle over, drop isolation sets
      clampToMrv(scaled, index, isDeload);
      return {
        slotId: s.slotId,
        label: s.label,
        prescriptions: scaled.map((a) => prescribe(a, isDeload)),
        estimatedMinutes: sessionMinutes(scaled),
      };
    });

    const weekAssignments = sessions.flatMap((s) =>
      s.prescriptions.map((p) => ({ exerciseName: p.exerciseName, sets: p.sets })),
    );
    return {
      index,
      isDeload,
      sessions,
      muscleVolume: roundVolumeMap(computeVolume(weekAssignments, library)),
    };
  });

  function clampToMrv(assignments: ExerciseAssignment[], weekIndex: number, isDeload: boolean): void {
    if (isDeload) return;
    for (const t of spec.targets) {
      let vol = computeVolume(assignments, library)[t.muscle];
      if (vol <= t.effectiveMrv) continue;
      const isos = assignments
        .filter((a) => byName.get(a.exerciseName)?.movementPattern === "ISOLATION" && byName.get(a.exerciseName)?.muscles.some((m) => m.muscle === t.muscle && m.role === "PRIMARY"))
        .sort((a, b) => b.sets - a.sets || a.exerciseName.localeCompare(b.exerciseName));
      let guard = 0;
      for (const iso of isos) {
        while (vol > t.effectiveMrv && iso.sets > 1 && guard++ < 50) {
          iso.sets -= 1;
          vol = computeVolume(assignments, library)[t.muscle];
        }
      }
      if (vol > t.effectiveMrv) {
        facts.push({ kind: "ramp_flattened", muscle: t.muscle, atWeek: weekIndex, cappedAt: t.effectiveMrv, cause: "mrv_ceiling" });
      }
    }
  }

  return {
    splitType: spec.splitType,
    blockLengthWeeks: spec.blockLengthWeeks,
    deloadWeekIndex: spec.deloadWeekIndex,
    weeks,
    facts,
  };
}
```

Note: `clampToMrv` is declared after its use inside the `.map` callback. This is safe — `function` declarations are hoisted within `generateMesocycle`'s scope, and the callback runs synchronously during `.map`, by which point the declaration is initialized. If your linter objects to use-before-define, move the `clampToMrv` and `applyMevFloor` declarations above the `weeks` assignment.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/engine/generate.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Verify the whole engine typechecks and lints**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. The `index.ts` barrel now resolves all its exports.

- [ ] **Step 6: Commit**

```bash
git add src/engine/generate.ts src/engine/generate.test.ts
git commit -m "feat(engine): add mesocycle generator (ramp, MEV floor, MRV clamp, prescriptions, deload)"
```

---

### Task 7: Property tests (fast-check invariants)

**Files:**
- Create: `src/engine/_fixtures/arbitraries.ts`
- Test: `src/engine/properties.test.ts`

**Interfaces:**
- Consumes: `fc` from `fast-check`; `resolveConstraints`, `generateMesocycle` from the engine; `EXERCISE_LIBRARY` from `~/domain/exercise-library`; `DEFAULT_LANDMARKS` from `~/domain/landmarks`; `sessionMinutes` from `./time`.
- Produces: `arbConstraintSet(): fc.Arbitrary<ConstraintSetInput>` and `arbAthlete(): fc.Arbitrary<AthleteContext>` (both generating only *valid* inputs per the Zod schema bounds).

- [ ] **Step 1: Write `_fixtures/arbitraries.ts`**

```ts
// src/engine/_fixtures/arbitraries.ts
import fc from "fast-check";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import type { ConstraintSetInput } from "~/schema";
import type { AthleteContext } from "../types";
import { ALL_MUSCLES } from "../util";

export function arbAthlete(): fc.Arbitrary<AthleteContext> {
  return fc.record({
    experienceLevel: fc.constantFrom("BEGINNER", "INTERMEDIATE", "ADVANCED"),
    phase: fc.constantFrom("CUT", "MAINTAIN", "BULK"),
    landmarks: fc.constant(DEFAULT_LANDMARKS),
  });
}

export function arbConstraintSet(): fc.Arbitrary<ConstraintSetInput> {
  return fc
    .record({
      daysPerWeek: fc.integer({ min: 3, max: 6 }),
      splitType: fc.constantFrom("UPPER_LOWER", "PUSH_PULL_LEGS", "FULL_BODY"),
      sessionLengthCapMin: fc.integer({ min: 45, max: 120 }),
      blockLengthWeeks: fc.integer({ min: 3, max: 8 }),
      muscleTargets: fc.uniqueArray(
        fc.record({
          muscle: fc.constantFrom(...ALL_MUSCLES),
          weeklySetTarget: fc.integer({ min: 6, max: 18 }),
          priority: fc.integer({ min: 0, max: 5 }),
        }),
        { selector: (t) => t.muscle, maxLength: 6 },
      ),
    })
    .map((r) => ({
      ...r,
      checkInCadence: "WEEKLY" as const,
      excludedExerciseNames: [],
    }));
}
```

- [ ] **Step 2: Write the failing property test**

```ts
// src/engine/properties.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { generateMesocycle, resolveConstraints } from "./index";
import { sessionMinutes } from "./time";
import { arbAthlete, arbConstraintSet } from "./_fixtures/arbitraries";

describe("engine invariants", () => {
  it("every session fits the time cap", () => {
    fc.assert(
      fc.property(arbConstraintSet(), arbAthlete(), (input, athlete) => {
        const spec = resolveConstraints(input, athlete);
        if (spec.kind !== "resolved") return; // infeasible inputs are vacuously fine
        const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        for (const w of plan.weeks) {
          for (const s of w.sessions) {
            const est = sessionMinutes(s.prescriptions);
            expect(est).toBeLessThanOrEqual(input.sessionLengthCapMin);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("no excluded exercise ever appears", () => {
    fc.assert(
      fc.property(
        arbConstraintSet(),
        arbAthlete(),
        fc.constantFrom("Barbell Back Squat", "Barbell Bench Press"),
        (input, athlete, banned) => {
          const spec = resolveConstraints({ ...input, excludedExerciseNames: [banned] }, athlete);
          if (spec.kind !== "resolved") return;
          const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
          const names = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.prescriptions.map((p) => p.exerciseName)));
          expect(names).not.toContain(banned);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("no week exceeds effective MRV (+0.5 rounding tolerance)", () => {
    fc.assert(
      fc.property(arbConstraintSet(), arbAthlete(), (input, athlete) => {
        const spec = resolveConstraints(input, athlete);
        if (spec.kind !== "resolved") return;
        const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        for (const w of plan.weeks) {
          for (const t of spec.targets) {
            expect(w.muscleVolume[t.muscle]).toBeLessThanOrEqual(t.effectiveMrv + 0.5);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("is deterministic — deep-equal across two runs", () => {
    fc.assert(
      fc.property(arbConstraintSet(), arbAthlete(), (input, athlete) => {
        const a = resolveConstraints(input, athlete);
        const b = resolveConstraints(input, athlete);
        expect(a).toEqual(b);
        if (a.kind !== "resolved" || b.kind !== "resolved") return;
        const pa = generateMesocycle(a, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        const pb = generateMesocycle(b, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        expect(pa).toEqual(pb);
      }),
      { numRuns: 100 },
    );
  });

  it("every resolved deviation carries an explaining fact", () => {
    fc.assert(
      fc.property(arbConstraintSet(), arbAthlete(), (input, athlete) => {
        const spec = resolveConstraints(input, athlete);
        if (spec.kind !== "resolved") return;
        const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
        // Peak week volume off-target > 0.5 for a targeted muscle ⇒ a deviation/trim/moved/split fact mentions it.
        const peak = plan.weeks.find((w) => !w.isDeload)!;
        for (const t of spec.targets) {
          const off = Math.abs(peak.muscleVolume[t.muscle] - t.weeklySetTarget) > 0.5;
          if (!off) continue;
          const explained = plan.facts.some(
            (f) => "muscle" in f && f.muscle === t.muscle,
          );
          expect(explained).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
```

- [ ] **Step 3: Run to verify (write arbitraries first so imports resolve)**

Run: `pnpm vitest run src/engine/properties.test.ts`
Expected: If any invariant is genuinely violated, fast-check prints a **minimal counterexample** (the seed input). Treat that as a real engine bug: fix the offending module (Task 4/5/6), not the test. Iterate until all 5 properties PASS.

- [ ] **Step 4: Commit**

```bash
git add src/engine/_fixtures/arbitraries.ts src/engine/properties.test.ts
git commit -m "test(engine): property-based invariants for generation path"
```

---

### Task 8: Golden fixture (the vision's canonical plan)

**Files:**
- Create: `src/engine/_fixtures/canonical.ts`
- Test: `src/engine/generate.golden.test.ts`

**Interfaces:**
- Consumes: `ConstraintSetInput` from `~/schema`; `AthleteContext` from `../types`; `DEFAULT_LANDMARKS` from `~/domain/landmarks`.
- Produces: `CANONICAL_INPUT: ConstraintSetInput`, `CANONICAL_ATHLETE: AthleteContext` — the spec §9 canonical scenario (U/L · 5 days · chest 16 / back 18 / quads 12 · 60-min cap · no squats · shoulders priority · 6 weeks).

- [ ] **Step 1: Write `_fixtures/canonical.ts`**

```ts
// src/engine/_fixtures/canonical.ts
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import type { ConstraintSetInput } from "~/schema";
import type { AthleteContext } from "../types";

/** The vision's canonical scenario — the frozen regression anchor. */
export const CANONICAL_INPUT: ConstraintSetInput = {
  daysPerWeek: 5,
  splitType: "UPPER_LOWER",
  sessionLengthCapMin: 60,
  blockLengthWeeks: 6,
  deloadWeekIndex: 6,
  checkInCadence: "WEEKLY",
  muscleTargets: [
    { muscle: "CHEST", weeklySetTarget: 16, priority: 1 },
    { muscle: "BACK", weeklySetTarget: 18, priority: 1 },
    { muscle: "QUADS", weeklySetTarget: 12, priority: 0 },
    { muscle: "SIDE_DELTS", weeklySetTarget: 16, priority: 3 },
  ],
  excludedExerciseNames: ["Barbell Back Squat"],
};

export const CANONICAL_ATHLETE: AthleteContext = {
  experienceLevel: "INTERMEDIATE",
  phase: "MAINTAIN",
  landmarks: DEFAULT_LANDMARKS,
};
```

- [ ] **Step 2: Write the golden test**

```ts
// src/engine/generate.golden.test.ts
import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { generateMesocycle, resolveConstraints } from "./index";
import { sessionMinutes } from "./time";
import { CANONICAL_ATHLETE, CANONICAL_INPUT } from "./_fixtures/canonical";

describe("golden: canonical mesocycle", () => {
  it("resolves feasibly", () => {
    const spec = resolveConstraints(CANONICAL_INPUT, CANONICAL_ATHLETE);
    expect(spec.kind).toBe("resolved");
  });

  it("matches the frozen snapshot", () => {
    const spec = resolveConstraints(CANONICAL_INPUT, CANONICAL_ATHLETE);
    if (spec.kind !== "resolved") throw new Error("expected resolved");
    const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    expect(plan).toMatchSnapshot();
  });

  it("honors the headline constraints (domain sanity check)", () => {
    const spec = resolveConstraints(CANONICAL_INPUT, CANONICAL_ATHLETE);
    if (spec.kind !== "resolved") throw new Error("expected resolved");
    const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);

    // no squats
    const names = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.prescriptions.map((p) => p.exerciseName)));
    expect(names).not.toContain("Barbell Back Squat");

    // every session inside the 60-min cap
    for (const w of plan.weeks) {
      for (const s of w.sessions) expect(sessionMinutes(s.prescriptions)).toBeLessThanOrEqual(60);
    }

    // peak-week chest/back land near target (±2 sets)
    const peak = plan.weeks[4]!; // week 5, last accumulation week
    expect(Math.abs(peak.muscleVolume.CHEST - 16)).toBeLessThanOrEqual(2);
    expect(Math.abs(peak.muscleVolume.BACK - 18)).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 3: Generate and review the snapshot**

Run: `pnpm vitest run src/engine/generate.golden.test.ts`
Expected: the snapshot file `src/engine/__snapshots__/generate.golden.test.ts.snap` is created and all 3 tests PASS. **Open the `.snap` file and read the generated plan for domain sanity** — sensible exercise choices per session, believable ramp, deload ≈ half of week 1, side-delt volume elevated (priority 3). This is the one human review the spec calls for. If something looks wrong, fix the engine and regenerate with `pnpm vitest run -u src/engine/generate.golden.test.ts`; do not hand-edit the snapshot.

- [ ] **Step 4: Run the full engine suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all engine tests PASS, no type errors, no lint errors (boundary rule included).

- [ ] **Step 5: Commit**

```bash
git add src/engine/_fixtures/canonical.ts src/engine/generate.golden.test.ts src/engine/__snapshots__/
git commit -m "test(engine): golden fixture for the canonical mesocycle"
```

---

## Self-Review

**Spec coverage (§ by §):**
- §2 Engine shape — `resolveConstraints` (Task 4) + `generateMesocycle` (Task 6) with frozen signatures; `DecisionFact` union (Task 1); determinism enforced (property test, Task 7); time model in `constants.ts` + `time.ts` (Tasks 1–2); boundary rule (Task 1). `stepWeek`/`evaluateDeload`/`redistributeWeek` are explicitly the adaptation plan — out of scope, noted.
- §3 Constraint resolver — defaults, phase modulation, beginner lock, first-class infeasibility (Task 4).
- §4 Volume distributor — eligibility map (Task 3), compounds-first + secondary-credit-aware greedy, frequency spread, time-cap/overshoot repair (Task 5).
- §5 Mesocycle generator — stable block template (distribute once, Task 6), ramp semantics (peak = last accumulation week, week 1 = max(MEV, 75%)), deload ≈ 50% week 1, rep/RIR by class, MRV clamp (Task 6).
- §9 Testing — property tests (Task 7), golden fixture (Task 8), rule-table/boundary units distributed across Tasks 4–6.

**Known, deliberate simplifications (not placeholders):**
- BRO_SPLIT / CUSTOM map to full-body eligibility (Task 3) — the beachhead uses U/L and PPL; dedicated geometry is a follow-up.
- Contraindication-based exercise filtering is omitted: the current `ConstraintSetInput` / `AthleteContext` carry no injury tags, only `excludedExerciseNames`, which *are* honored. Injury-driven exclusion is a data-model addendum + future engine task.
- `moved_sets` / `split_volume` facts reference slot **ids**, not labels; the AI/experience layer maps id → label. Consistent across the engine.

**Type consistency:** `ExerciseAssignment` is `{ exerciseName, sets }` everywhere (distributor, generator, util). `sessionMinutes` accepts `Pick<ExerciseAssignment,"sets">[]`, so both `SessionTemplate.exercises` and `SessionPlan.prescriptions` (which have `.sets`) pass. `spec.targets` is sorted once in the resolver and consumed pre-sorted by the distributor's greedy loop. `resolveConstraints` returns `ResolveResult`; both callers narrow on `.kind`.

**Adaptation-path forward hooks:** `ResolvedMuscleTarget` already carries `effectiveMrv` and `mev`; `WeekPlan.muscleVolume` is recomputed per week — both are what `stepWeek`/`evaluateDeload` will consume next plan.
