# Weekly Check-in → Progression Proposal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-built `stepWeek` progression engine into a real, accept-gated weekly loop: capture per-muscle recovery/joint after a week resolves, derive performance from logged sets, propose next week's volume, and apply it on the athlete's acceptance.

**Architecture:** A new `checkin` tRPC router orchestrates pure adapters. Submit writes `CheckIn`/`CheckInMuscle`, derives `performance` from `SetLog` vs targets, reconstructs the `MesocyclePlan` from the DB, runs `stepWeek`, and returns a proposal — mutating no plan. Accept re-runs the same computation deterministically and rebuilds week N+1 by re-distributing to the engine's adjusted per-muscle targets, then persists through ③'s `applyWeekPlanToDb`. Three client components (entry card, grid, proposal dialog) drive the flow, reusing the reschedule dialog's modal contract.

**Tech Stack:** Next.js 15 (App Router / RSC), tRPC 11, Prisma 6 (Neon), Zod, Tailwind v4 (app-shell-kit tokens), Vitest, pnpm. Engine is pure TypeScript in `src/engine`.

## Global Constraints

- **Law 1 (engine/data owns numbers; UI only reshapes):** `performance`, `plannedSets`, `actualSets`, and every proposed set count are computed by the engine/data layer — never asked of the athlete, never invented in the UI. The subjective inputs are only `recovery` and `joint`.
- **Law 2 (deterministic, no invented claims):** the same feedback must yield the same proposal on submit and on apply. `applyProgression` recomputes from the persisted `CheckIn`, never trusts a client-passed adjustment.
- **Accept-gate boundary:** `submitWeeklyCheckIn` records truth (no gate). `applyProgression` mutates the plan (accept-gated) and writes a `DecisionLog(PROGRESS, APPLIED)`; `rejectProgression` writes `DecisionLog(PROGRESS, REJECTED)` and mutates nothing.
- **Subagents cannot touch the live Neon DB.** No migrations are run by an implementer; the required models already exist in `prisma/schema.prisma`. DB-bound procedures are gated by `pnpm typecheck` + `pnpm lint` + documented user verification, not by DB-executing tests.
- **Branch:** all work on `freddy/feat/weekly-checkin-progression`; merges into `freddy/experimental` only after the user's visual "lgtm". Nothing is pushed to origin unless the user asks.
- **Muscle scope:** only muscles trained that week (PRIMARY role of ≥1 prescription's exercise) appear in the grid and drive derived performance.
- **UI tokens:** dark app-shell-kit theme; accent is scarce (CTA + recommended only); `zone-*` tokens for volume-delta semantics only, never chrome (Data-Only Zone rule). Motivational voice at the beats.
- **Test runner:** `pnpm test` (Vitest). Type/lint gate: `pnpm typecheck` and `pnpm lint`. Full suite must stay green (166 tests baseline + new).

---

### Task 1: Check-in input schemas

**Files:**
- Create: `src/schema/checkin.ts`
- Test: `src/schema/checkin.test.ts`
- Modify: `src/schema/index.ts:4` (add `export * from "./checkin";`)

**Interfaces:**
- Consumes: `MuscleGroupEnum` from `./enums`.
- Produces: `CheckInMuscleInputSchema`, `WeeklyCheckInInputSchema`, and inferred types `CheckInMuscleInput`, `WeeklyCheckInInput` — consumed by the `checkin` router (Task 6).

- [ ] **Step 1: Write the failing test**

```ts
// src/schema/checkin.test.ts
import { describe, expect, it } from "vitest";
import { CheckInMuscleInputSchema, WeeklyCheckInInputSchema } from "./checkin";

describe("CheckInMuscleInputSchema", () => {
  const base = { muscle: "CHEST", recovery: 2, joint: 0 };
  it("accepts in-range 0-3 scores", () => {
    expect(CheckInMuscleInputSchema.parse(base).recovery).toBe(2);
  });
  it("rejects out-of-range scores", () => {
    expect(() => CheckInMuscleInputSchema.parse({ ...base, recovery: 4 })).toThrow();
    expect(() => CheckInMuscleInputSchema.parse({ ...base, joint: -1 })).toThrow();
  });
  it("rejects non-integer scores", () => {
    expect(() => CheckInMuscleInputSchema.parse({ ...base, recovery: 1.5 })).toThrow();
  });
  it("rejects an unknown muscle", () => {
    expect(() => CheckInMuscleInputSchema.parse({ ...base, muscle: "NECK" })).toThrow();
  });
});

describe("WeeklyCheckInInputSchema", () => {
  it("accepts a week index + muscle list", () => {
    const parsed = WeeklyCheckInInputSchema.parse({
      weekIndex: 3,
      muscles: [{ muscle: "CHEST", recovery: 2, joint: 0 }],
    });
    expect(parsed.muscles).toHaveLength(1);
  });
  it("rejects weekIndex < 1", () => {
    expect(() => WeeklyCheckInInputSchema.parse({ weekIndex: 0, muscles: [] })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/schema/checkin.test.ts`
Expected: FAIL (module `./checkin` not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/schema/checkin.ts
import { z } from "zod";
import { MuscleGroupEnum } from "./enums";

const Score = z.number().int().min(0).max(3);

export const CheckInMuscleInputSchema = z.object({
  muscle: MuscleGroupEnum,
  recovery: Score,
  joint: Score,
});
export type CheckInMuscleInput = z.infer<typeof CheckInMuscleInputSchema>;

export const WeeklyCheckInInputSchema = z.object({
  weekIndex: z.number().int().min(1),
  muscles: z.array(CheckInMuscleInputSchema),
});
export type WeeklyCheckInInput = z.infer<typeof WeeklyCheckInInputSchema>;
```

Add to `src/schema/index.ts` after the `./logging` export:
```ts
export * from "./checkin";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/schema/checkin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/schema/checkin.ts src/schema/checkin.test.ts src/schema/index.ts
git commit -m "feat(schema): weekly check-in input schemas"
```

---

### Task 2: Engine — extract `prescribe`, add `weekPlanFromAdjustment`

**Files:**
- Create: `src/engine/prescribe.ts`
- Create: `src/engine/apply-adjustment.ts`
- Create: `src/engine/apply-adjustment.test.ts`
- Modify: `src/engine/generate.ts` (replace the private `prescribe` with the imported one)
- Modify: `src/engine/index.ts` (export `weekPlanFromAdjustment`)

**Interfaces:**
- Consumes: `distributeVolume` (`./distribute`), `buildSessionSlots` (`./split`), `computeVolume`/`roundVolumeMap` (`./util`), constants (`./constants`), `WeekAdjustment`/`WeekPlan`/`ResolvedSpec`/`SessionPlan`/`PrescriptionPlan`/`ExerciseAssignment` (`./types`), `ExerciseDef` (`~/domain/exercise-library`).
- Produces:
  - `prescribe(a: ExerciseAssignment, library: ExerciseDef[], isDeload: boolean): PrescriptionPlan`
  - `weekPlanFromAdjustment(spec: ResolvedSpec, library: ExerciseDef[], adj: WeekAdjustment, upcoming: WeekPlan): WeekPlan` — consumed by the `checkin` router (Task 6). `upcoming` is the stored week N+1 as a `WeekPlan` (from `weekPlanFromDb`), supplying real `TrainingSession.id`s for the slot remap.

**Context (why the remap matters):** `distributeVolume` assigns exercises to `buildSessionSlots` *synthetic* slot ids. `applyWeekPlanToDb` (③) matches sessions by `slotId = TrainingSession.id`. `buildSessionSlots` and `weekPlanFromDb` both order sessions by the canonical split order, so we remap distributed `sessions[i]` → `upcoming.sessions[i].slotId` by index, asserting equal length.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/apply-adjustment.test.ts
import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { generateMesocycle } from "./generate";
import { resolveConstraints } from "./resolve-constraints";
import { weekPlanFromAdjustment } from "./apply-adjustment";
import type { AthleteContext, ResolvedSpec, WeekAdjustment } from "./types";

const athlete: AthleteContext = {
  experienceLevel: "INTERMEDIATE",
  phase: "HYPERTROPHY",
  landmarks: DEFAULT_LANDMARKS,
};

function resolvedSpec(): ResolvedSpec {
  const spec = resolveConstraints(
    {
      daysPerWeek: 4,
      splitType: "UPPER_LOWER",
      sessionLengthCapMin: 90,
      blockLengthWeeks: 6,
      deloadWeekIndex: 6,
      checkInCadence: "WEEKLY",
      muscleTargets: [],
      excludedExerciseNames: [],
    },
    athlete,
  );
  if (spec.kind !== "resolved") throw new Error("fixture spec must resolve");
  return spec;
}

describe("weekPlanFromAdjustment", () => {
  it("re-distributes to the adjusted targets and remaps onto the stored week's session ids", () => {
    const spec = resolvedSpec();
    const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const upcoming = plan.weeks[2]!; // week 3 (real slotIds in this fixture are template slot ids)
    const chest = spec.targets.find((t) => t.muscle === "CHEST")!;

    const adj: WeekAdjustment = {
      fromWeekIndex: 2,
      appliesToWeekIndex: 3,
      adjustments: [
        {
          muscle: "CHEST",
          plannedSets: upcoming.muscleVolume.CHEST,
          adjustedSets: Math.min(chest.effectiveMrv, upcoming.muscleVolume.CHEST + 2),
          delta: 2,
          cause: "responding_well",
          swapCandidate: false,
        },
      ],
      checkInValue: "low",
      facts: [],
    };

    const result = weekPlanFromAdjustment(spec, EXERCISE_LIBRARY, adj, upcoming);

    // session ids preserved from `upcoming` (not synthetic distribute ids)
    expect(result.sessions.map((s) => s.slotId)).toEqual(upcoming.sessions.map((s) => s.slotId));
    expect(result.appliesToWeekIndex ?? result.index).toBe(3);
    // chest volume moved up toward the adjusted target
    expect(result.muscleVolume.CHEST).toBeGreaterThan(upcoming.muscleVolume.CHEST);
    // untouched muscle keeps a sane (non-negative) volume
    expect(result.muscleVolume.BICEPS).toBeGreaterThanOrEqual(0);
  });

  it("throws when the distributed session count disagrees with the stored week", () => {
    const spec = resolvedSpec();
    const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const upcoming = { ...plan.weeks[2]!, sessions: plan.weeks[2]!.sessions.slice(0, 1) };
    const adj: WeekAdjustment = {
      fromWeekIndex: 2,
      appliesToWeekIndex: 3,
      adjustments: [],
      checkInValue: "low",
      facts: [],
    };
    expect(() => weekPlanFromAdjustment(spec, EXERCISE_LIBRARY, adj, upcoming)).toThrow(/mismatch/i);
  });
});
```

> Note: `result.index` carries the applied week index (3). The test tolerates either `index` or an `appliesToWeekIndex` field; implement `index`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/engine/apply-adjustment.test.ts`
Expected: FAIL (module `./apply-adjustment` not found).

- [ ] **Step 3: Write the implementations**

```ts
// src/engine/prescribe.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import {
  COMPOUND_REPS,
  COMPOUND_RIR,
  DELOAD_RIR,
  ISOLATION_REPS,
  ISOLATION_RIR,
} from "./constants";
import type { ExerciseAssignment, PrescriptionPlan } from "./types";

/** Assign rep range + RIR to an exercise assignment. Extracted from the generator
 * so the progression path prescribes identically (single source of truth). */
export function prescribe(
  a: ExerciseAssignment,
  library: ExerciseDef[],
  isDeload: boolean,
): PrescriptionPlan {
  const iso = library.find((e) => e.name === a.exerciseName)?.movementPattern === "ISOLATION";
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
```

```ts
// src/engine/apply-adjustment.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import { distributeVolume } from "./distribute";
import { prescribe } from "./prescribe";
import { buildSessionSlots } from "./split";
import type { ResolvedSpec, SessionPlan, WeekAdjustment, WeekPlan } from "./types";

/**
 * Turn a `stepWeek` WeekAdjustment into a concrete WeekPlan for the upcoming week.
 * `adjustedSets` per muscle become the week's weekly targets; distributeVolume lays
 * them into the split's sessions; the distributed sessions are remapped onto the
 * stored week's real TrainingSession ids (by canonical order) so applyWeekPlanToDb
 * can match rows. Deterministic (Law 2). isDeload is always false here — the caller
 * short-circuits deload/last-week to informational proposals that never apply.
 */
export function weekPlanFromAdjustment(
  spec: ResolvedSpec,
  library: ExerciseDef[],
  adj: WeekAdjustment,
  upcoming: WeekPlan,
): WeekPlan {
  const adjMap = new Map(adj.adjustments.map((a) => [a.muscle, a.adjustedSets]));
  const overridden: ResolvedSpec = {
    ...spec,
    targets: spec.targets.map((t) => ({
      ...t,
      weeklySetTarget: adjMap.get(t.muscle) ?? t.weeklySetTarget,
    })),
  };

  const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
  const template = distributeVolume(overridden, library, slots);

  if (template.sessions.length !== upcoming.sessions.length) {
    throw new Error(
      "weekPlanFromAdjustment: session count mismatch between distributed and stored week.",
    );
  }

  const sessions: SessionPlan[] = template.sessions.map((s, i) => ({
    slotId: upcoming.sessions[i]!.slotId, // synthetic → real TrainingSession.id
    label: upcoming.sessions[i]!.label,
    prescriptions: s.exercises.map((a) => prescribe(a, library, false)),
    estimatedMinutes: s.estimatedMinutes,
  }));

  return {
    index: adj.appliesToWeekIndex,
    isDeload: false,
    sessions,
    muscleVolume: template.achievedVolume,
  };
}
```

In `src/engine/generate.ts`: delete the local `function prescribe(...)` and add `import { prescribe } from "./prescribe";` near the other imports. Its two call sites use `prescribe(a, isDeload)` — change both to `prescribe(a, library, isDeload)` (the `library` param is already in scope in `generateMesocycle`).

In `src/engine/index.ts` add:
```ts
export { weekPlanFromAdjustment } from "./apply-adjustment";
```

- [ ] **Step 4: Run the new test + the full engine suite (regression on the prescribe extraction)**

Run: `pnpm test src/engine`
Expected: PASS — the new `apply-adjustment.test.ts` passes and every existing generate/distribute/step-week test still passes (the extracted `prescribe` is behavior-identical).

- [ ] **Step 5: Commit**

```bash
git add src/engine/prescribe.ts src/engine/apply-adjustment.ts src/engine/apply-adjustment.test.ts src/engine/generate.ts src/engine/index.ts
git commit -m "feat(engine): weekPlanFromAdjustment + extract prescribe helper"
```

---

### Task 3: `mesocyclePlanFromDb` adapter

**Files:**
- Create: `src/server/mesocycle/mesocycle-plan-from-db.ts`
- Test: `src/server/mesocycle/mesocycle-plan-from-db.test.ts`

**Interfaces:**
- Consumes: `weekPlanFromDb`, `WeekForPlan` (`./reschedule-adapters`); `MesocyclePlan`, `WeekPlan` (`~/engine`); `SplitType` (`~/schema`).
- Produces: `mesocyclePlanFromDb(weeks: WeekForPlan[], splitType: SplitType): MesocyclePlan` — consumed by the `checkin` router (Task 6). `stepWeek` reads only `plan.weeks`; `blockLengthWeeks`/`deloadWeekIndex` are derived from the weeks for correctness, `facts` is `[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/mesocycle/mesocycle-plan-from-db.test.ts
import { describe, expect, it } from "vitest";
import type { WeekForPlan } from "./reschedule-adapters";
import { mesocyclePlanFromDb } from "./mesocycle-plan-from-db";

function week(index: number, isDeload: boolean): WeekForPlan {
  return {
    // only the fields weekPlanFromDb reads; cast keeps the test focused
    index,
    isDeload,
    muscleVolumes: [{ muscle: "CHEST", plannedSets: 10 }],
    sessions: [],
  } as unknown as WeekForPlan;
}

describe("mesocyclePlanFromDb", () => {
  it("composes weeks into a MesocyclePlan, deriving meta from the weeks", () => {
    const plan = mesocyclePlanFromDb([week(1, false), week(2, false), week(3, true)], "UPPER_LOWER");
    expect(plan.weeks).toHaveLength(3);
    expect(plan.blockLengthWeeks).toBe(3);
    expect(plan.deloadWeekIndex).toBe(3);
    expect(plan.splitType).toBe("UPPER_LOWER");
    expect(plan.weeks[0]!.muscleVolume.CHEST).toBe(10);
    expect(plan.facts).toEqual([]);
  });

  it("orders weeks by index and tolerates no deload week (0)", () => {
    const plan = mesocyclePlanFromDb([week(2, false), week(1, false)], "PUSH_PULL_LEGS");
    expect(plan.weeks.map((w) => w.index)).toEqual([1, 2]);
    expect(plan.deloadWeekIndex).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/mesocycle/mesocycle-plan-from-db.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/mesocycle/mesocycle-plan-from-db.ts
import type { MesocyclePlan } from "~/engine";
import type { SplitType } from "~/schema";
import { weekPlanFromDb, type WeekForPlan } from "./reschedule-adapters";

/**
 * Reconstruct the engine's MesocyclePlan from persisted weeks so `stepWeek` has
 * real input. `stepWeek` reads only `weeks`; block length + deload index are derived
 * from the weeks (correct + self-contained). `facts` is [] (unused by stepWeek).
 */
export function mesocyclePlanFromDb(weeks: WeekForPlan[], splitType: SplitType): MesocyclePlan {
  const ordered = [...weeks].sort((a, b) => a.index - b.index);
  return {
    splitType,
    blockLengthWeeks: ordered.length,
    deloadWeekIndex: ordered.find((w) => w.isDeload)?.index ?? 0,
    weeks: ordered.map(weekPlanFromDb),
    facts: [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/server/mesocycle/mesocycle-plan-from-db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/mesocycle/mesocycle-plan-from-db.ts src/server/mesocycle/mesocycle-plan-from-db.test.ts
git commit -m "feat(mesocycle): mesocyclePlanFromDb adapter"
```

---

### Task 4: `derivePerformance` — Law 1 performance from logged sets

**Files:**
- Create: `src/server/mesocycle/derive-performance.ts`
- Test: `src/server/mesocycle/derive-performance.test.ts`

**Interfaces:**
- Consumes: `ResolvedMuscleTarget` (`~/engine`); `ExerciseDef` (`~/domain/exercise-library`); `MuscleGroup` (`~/schema`).
- Produces:
  - Types `PrescriptionWithLogs = { exerciseName: string; targetRepLow: number | null; targetRepHigh: number | null; targetRir: number | null; setLogs: { reps: number; achievedRir: number | null }[] }` and `WeekForPerformance = { prescriptions: PrescriptionWithLogs[] }`.
  - `derivePerformance(week: WeekForPerformance, targets: ResolvedMuscleTarget[], library: ExerciseDef[]): Map<MuscleGroup, number | undefined>` — consumed by the `checkin` router (Task 6). Trained muscle = PRIMARY role of ≥1 prescription's exercise (looked up in `library` by name). Per prescription (with ≥1 logged set + non-null targets): band the median logged reps/RIR vs targets to 0–3; muscle score = mean across its prescriptions, floored; `undefined` if none judgeable.

**Banding (per prescription, from median logged reps & median achievedRir):**
- `3` — reps ≥ `targetRepHigh` AND (`targetRir` null OR medRir ≤ `targetRir`)
- `2` — reps within `[targetRepLow, targetRepHigh]` AND (`targetRir` null OR medRir ≤ `targetRir + 1`)
- `1` — reps within range but medRir > `targetRir + 1`, OR reps in `[targetRepLow - 2, targetRepLow)`
- `0` — reps < `targetRepLow - 2`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/mesocycle/derive-performance.test.ts
import { describe, expect, it } from "vitest";
import type { ExerciseDef } from "~/domain/exercise-library";
import type { ResolvedMuscleTarget } from "~/engine";
import { derivePerformance, type WeekForPerformance } from "./derive-performance";

const lib: ExerciseDef[] = [
  { name: "Bench Press", movementPattern: "COMPOUND", equipment: "BARBELL", muscles: [{ muscle: "CHEST", role: "PRIMARY", fraction: 1 }] },
  { name: "Leg Curl", movementPattern: "ISOLATION", equipment: "MACHINE", muscles: [{ muscle: "HAMSTRINGS", role: "PRIMARY", fraction: 1 }] },
] as unknown as ExerciseDef[];

const targets = [
  { muscle: "CHEST", weeklySetTarget: 12, priority: 1, mev: 8, mav: 14, effectiveMrv: 20 },
  { muscle: "HAMSTRINGS", weeklySetTarget: 10, priority: 1, mev: 6, mav: 12, effectiveMrv: 16 },
] as ResolvedMuscleTarget[];

function rx(exerciseName: string, t: { low: number | null; high: number | null; rir: number | null }, logs: { reps: number; achievedRir: number | null }[]) {
  return { exerciseName, targetRepLow: t.low, targetRepHigh: t.high, targetRir: t.rir, setLogs: logs };
}

describe("derivePerformance", () => {
  it("scores 3 when reps beat the top of range at/under target RIR", () => {
    const week: WeekForPerformance = { prescriptions: [rx("Bench Press", { low: 8, high: 12, rir: 2 }, [{ reps: 12, achievedRir: 1 }, { reps: 13, achievedRir: 2 }])] };
    expect(derivePerformance(week, targets, lib).get("CHEST")).toBe(3);
  });
  it("scores 0 when reps collapse well below the range", () => {
    const week: WeekForPerformance = { prescriptions: [rx("Bench Press", { low: 8, high: 12, rir: 2 }, [{ reps: 5, achievedRir: 0 }])] };
    expect(derivePerformance(week, targets, lib).get("CHEST")).toBe(0);
  });
  it("returns undefined for a trained muscle with no logged sets", () => {
    const week: WeekForPerformance = { prescriptions: [rx("Bench Press", { low: 8, high: 12, rir: 2 }, [])] };
    expect(derivePerformance(week, targets, lib).get("CHEST")).toBeUndefined();
  });
  it("skips prescriptions with null targets (unjudgeable)", () => {
    const week: WeekForPerformance = { prescriptions: [rx("Leg Curl", { low: null, high: null, rir: null }, [{ reps: 10, achievedRir: 1 }])] };
    expect(derivePerformance(week, targets, lib).get("HAMSTRINGS")).toBeUndefined();
  });
  it("only reports muscles trained as PRIMARY this week", () => {
    const week: WeekForPerformance = { prescriptions: [rx("Bench Press", { low: 8, high: 12, rir: 2 }, [{ reps: 10, achievedRir: 2 }])] };
    const out = derivePerformance(week, targets, lib);
    expect(out.has("HAMSTRINGS")).toBe(false);
    expect(out.get("CHEST")).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/mesocycle/derive-performance.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/mesocycle/derive-performance.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import type { ResolvedMuscleTarget } from "~/engine";
import type { MuscleGroup } from "~/schema";

export interface PrescriptionWithLogs {
  exerciseName: string;
  targetRepLow: number | null;
  targetRepHigh: number | null;
  targetRir: number | null;
  setLogs: { reps: number; achievedRir: number | null }[];
}
export interface WeekForPerformance {
  prescriptions: PrescriptionWithLogs[];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Band one prescription's logged performance vs its targets → 0-3, or null if unjudgeable. */
function scorePrescription(rx: PrescriptionWithLogs): number | null {
  if (rx.setLogs.length === 0) return null;
  if (rx.targetRepLow === null || rx.targetRepHigh === null) return null;
  const medReps = median(rx.setLogs.map((l) => l.reps));
  const rirs = rx.setLogs.map((l) => l.achievedRir).filter((r): r is number => r !== null);
  const medRir = rirs.length ? median(rirs) : null;
  const rirOk = (slack: number) => rx.targetRir === null || medRir === null || medRir <= rx.targetRir + slack;

  if (medReps >= rx.targetRepHigh && rirOk(0)) return 3;
  if (medReps >= rx.targetRepLow && medReps <= rx.targetRepHigh && rirOk(1)) return 2;
  if ((medReps >= rx.targetRepLow && medReps <= rx.targetRepHigh) || medReps >= rx.targetRepLow - 2) return 1;
  return 0;
}

/**
 * Law 1: derive per-muscle performance (0-3) from the week's SetLogs vs targets.
 * A muscle is "trained" when it is the PRIMARY of ≥1 prescription's exercise. Its
 * score is the floored mean of its judgeable prescriptions; undefined when none are.
 */
export function derivePerformance(
  week: WeekForPerformance,
  targets: ResolvedMuscleTarget[],
  library: ExerciseDef[],
): Map<MuscleGroup, number | undefined> {
  const byName = new Map(library.map((e) => [e.name, e]));
  const primaryMusclesOf = (name: string): MuscleGroup[] =>
    (byName.get(name)?.muscles ?? []).filter((m) => m.role === "PRIMARY").map((m) => m.muscle);

  const scores = new Map<MuscleGroup, number[]>();
  const trained = new Set<MuscleGroup>();

  for (const rx of week.prescriptions) {
    const muscles = primaryMusclesOf(rx.exerciseName);
    for (const m of muscles) trained.add(m);
    const score = scorePrescription(rx);
    if (score === null) continue;
    for (const m of muscles) {
      const list = scores.get(m) ?? [];
      list.push(score);
      scores.set(m, list);
    }
  }

  const targetMuscles = new Set(targets.map((t) => t.muscle));
  const out = new Map<MuscleGroup, number | undefined>();
  for (const m of trained) {
    if (!targetMuscles.has(m)) continue; // only muscles the engine tracks
    const list = scores.get(m);
    out.set(m, list && list.length ? Math.floor(list.reduce((a, b) => a + b, 0) / list.length) : undefined);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/server/mesocycle/derive-performance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/mesocycle/derive-performance.ts src/server/mesocycle/derive-performance.test.ts
git commit -m "feat(mesocycle): derivePerformance from logged sets (Law 1)"
```

---

### Task 5: Progression view types + `toProgressionProposalView`

**Files:**
- Modify: `src/views/types.ts` (add view types)
- Create: `src/views/progression.ts`
- Test: `src/views/progression.test.ts`

**Interfaces:**
- Consumes: `WeekAdjustment`, `StepCause` (`~/engine`); `MuscleGroup` (`~/schema` — already imported in `types.ts`).
- Produces (in `types.ts`): `WeeklyCheckInStatus`, `WeeklyCheckInView`, `ProgressionProposalKind`, `MuscleProposalView`, `ProgressionProposalView`. Produces (in `progression.ts`): `toProgressionProposalView(adj, opts) → ProgressionProposalView`.

- [ ] **Step 1: Add the view types to `src/views/types.ts`**

Append (verify `MuscleGroup` is already imported at the top of the file; add `import type { StepCause } from "~/engine";` if not present):

```ts
export type WeeklyCheckInStatus = "NOT_READY" | "READY" | "SUBMITTED" | "APPLIED" | "REJECTED";

export interface WeeklyCheckInView {
  weekIndex: number;
  eligible: boolean;
  trainedMuscles: MuscleGroup[];
  status: WeeklyCheckInStatus;
  existing?: { muscle: MuscleGroup; recovery: number; joint: number }[];
}

export type ProgressionProposalKind = "CHANGES" | "DELOAD_HOLD" | "BLOCK_END";

export interface MuscleProposalView {
  muscle: MuscleGroup;
  plannedSets: number;
  adjustedSets: number;
  delta: number;
  cause: StepCause;
  swapCandidate: boolean;
}

export interface ProgressionProposalView {
  fromWeekIndex: number;
  appliesToWeekIndex: number;
  kind: ProgressionProposalKind;
  advisory?: string;
  adjustments: MuscleProposalView[];
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/views/progression.test.ts
import { describe, expect, it } from "vitest";
import type { WeekAdjustment } from "~/engine";
import { toProgressionProposalView } from "./progression";

function adj(over: Partial<WeekAdjustment> = {}): WeekAdjustment {
  return {
    fromWeekIndex: 3,
    appliesToWeekIndex: 4,
    checkInValue: "low",
    facts: [],
    adjustments: [
      { muscle: "CHEST", plannedSets: 12, adjustedSets: 14, delta: 2, cause: "responding_well", swapCandidate: false },
      { muscle: "QUADS", plannedSets: 16, adjustedSets: 16, delta: 0, cause: "on_track", swapCandidate: false },
      { muscle: "GLUTES", plannedSets: 10, adjustedSets: 7, delta: -3, cause: "joint_stress", swapCandidate: true },
    ],
    ...over,
  };
}

describe("toProgressionProposalView", () => {
  it("kind CHANGES keeps only movers and swap-flagged rows", () => {
    const v = toProgressionProposalView(adj(), { hasUpcoming: true, upcomingIsDeload: false });
    expect(v.kind).toBe("CHANGES");
    expect(v.adjustments.map((a) => a.muscle)).toEqual(["CHEST", "GLUTES"]);
    expect(v.appliesToWeekIndex).toBe(4);
  });
  it("kind DELOAD_HOLD when next week is the deload", () => {
    expect(toProgressionProposalView(adj(), { hasUpcoming: true, upcomingIsDeload: true }).kind).toBe("DELOAD_HOLD");
  });
  it("kind BLOCK_END when there is no upcoming week", () => {
    expect(toProgressionProposalView(adj(), { hasUpcoming: false, upcomingIsDeload: false }).kind).toBe("BLOCK_END");
  });
  it("sets an advisory when checkInValue is high", () => {
    const v = toProgressionProposalView(adj({ checkInValue: "high" }), { hasUpcoming: true, upcomingIsDeload: false });
    expect(v.advisory).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/views/progression.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Write minimal implementation**

```ts
// src/views/progression.ts
import type { WeekAdjustment } from "~/engine";
import type { MuscleProposalView, ProgressionProposalKind, ProgressionProposalView } from "./types";

/** Map a stepWeek WeekAdjustment to the accept-gate view. Shows only movers and
 * swap-flagged muscles for scanability (holds are omitted; empty list ⇒ "no changes").
 * Invents no numbers — every field mirrors the engine's adjustment. */
export function toProgressionProposalView(
  adj: WeekAdjustment,
  opts: { hasUpcoming: boolean; upcomingIsDeload: boolean },
): ProgressionProposalView {
  const kind: ProgressionProposalKind = !opts.hasUpcoming
    ? "BLOCK_END"
    : opts.upcomingIsDeload
      ? "DELOAD_HOLD"
      : "CHANGES";

  const adjustments: MuscleProposalView[] =
    kind === "CHANGES"
      ? adj.adjustments
          .filter((a) => a.delta !== 0 || a.swapCandidate)
          .map((a) => ({
            muscle: a.muscle,
            plannedSets: a.plannedSets,
            adjustedSets: a.adjustedSets,
            delta: a.delta,
            cause: a.cause,
            swapCandidate: a.swapCandidate,
          }))
      : [];

  return {
    fromWeekIndex: adj.fromWeekIndex,
    appliesToWeekIndex: adj.appliesToWeekIndex,
    kind,
    advisory:
      adj.checkInValue === "high"
        ? "A few muscles are near the ceiling — hold your form tight this week."
        : undefined,
    adjustments,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/views/progression.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/types.ts src/views/progression.ts src/views/progression.test.ts
git commit -m "feat(views): progression proposal + weekly check-in view types"
```

---

### Task 6: `checkin` tRPC router

**Files:**
- Modify: `src/server/mesocycle/reschedule-adapters.ts` (add `resolvedSpecFrom` export)
- Create: `src/server/api/routers/checkin.ts`
- Modify: `src/server/api/root.ts` (register `checkin`)

**Interfaces:**
- Consumes: everything from Tasks 1–5, plus ③'s `WEEK_FOR_PLAN_INCLUDE`, `weekPlanFromDb`, `CS_WITH_TARGETS_INCLUDE`, `adaptationContextFrom`, `constraintSetInputFromRow`, `applyWeekPlanToDb`; `stepWeek`, `resolveConstraints` (`~/engine`); `DEFAULT_LANDMARKS` (`~/domain/landmarks`); `EXERCISE_LIBRARY` (`~/domain/exercise-library`).
- Produces: procedures `getWeeklyCheckIn`, `submitWeeklyCheckIn`, `applyProgression`, `rejectProgression` on `appRouter.checkin`, consumed by the UI (Tasks 7–9).

**Note (no runnable DB test):** subagents can't touch Neon, so this task has no Vitest step that executes the DB. It is gated by `pnpm typecheck` + `pnpm lint` and the documented user-verification checklist in Step 4. Keep all determinism in the pure adapters (already unit-tested).

- [ ] **Step 1: Add `resolvedSpecFrom` to `reschedule-adapters.ts`**

Add (reuses the existing `constraintSetInputFromRow`; mirror the throw in `adaptationContextFrom`):

```ts
import { resolveConstraints, type ResolvedSpec } from "~/engine"; // extend existing engine import

/** Re-resolve a stored constraint set to the engine's ResolvedSpec (needed by the
 * progression apply path, which re-distributes with overridden targets). */
export function resolvedSpecFrom(cs: ConstraintSetWithTargets, athlete: AthleteContext): ResolvedSpec {
  const spec = resolveConstraints(constraintSetInputFromRow(cs), athlete);
  if (spec.kind !== "resolved") {
    throw new Error("resolvedSpecFrom: stored constraint set re-resolved as infeasible.");
  }
  return spec;
}
```

- [ ] **Step 2: Write the router**

```ts
// src/server/api/routers/checkin.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { stepWeek, weekPlanFromAdjustment, type AthleteContext, type CheckInFeedback } from "~/engine";
import { WeeklyCheckInInputSchema } from "~/schema";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { applyWeekPlanToDb } from "~/server/mesocycle/apply-week-plan";
import { derivePerformance, type WeekForPerformance } from "~/server/mesocycle/derive-performance";
import { mesocyclePlanFromDb } from "~/server/mesocycle/mesocycle-plan-from-db";
import {
  adaptationContextFrom,
  resolvedSpecFrom,
  weekPlanFromDb,
  CS_WITH_TARGETS_INCLUDE,
  WEEK_FOR_PLAN_INCLUDE,
} from "~/server/mesocycle/reschedule-adapters";
import type { db as dbClient } from "~/server/db";
import { toProgressionProposalView } from "~/views/progression";
import type { ProgressionProposalView, WeeklyCheckInStatus, WeeklyCheckInView } from "~/views/types";

type Db = typeof dbClient;

/** Load everything the check-in path needs, scoped to the signed-in athlete's ACTIVE
 * block. Throws NOT_FOUND if the week isn't theirs. */
async function loadCheckInContext(db: Db, userId: string, weekIndex: number) {
  const mesocycle = await db.mesocycle.findFirst({
    where: { status: "ACTIVE", athleteProfile: { userId } },
    select: {
      id: true,
      constraintSetId: true,
      athleteProfile: { select: { experience: true, phase: true } },
      weeks: {
        select: {
          id: true,
          index: true,
          isDeload: true,
          sessions: { select: { id: true, status: true } },
          ...WEEK_FOR_PLAN_INCLUDE,
        },
      },
    },
  });
  if (!mesocycle) throw new TRPCError({ code: "NOT_FOUND" });
  const week = mesocycle.weeks.find((w) => w.index === weekIndex);
  if (!week) throw new TRPCError({ code: "NOT_FOUND" });

  const cs = await db.constraintSet.findUniqueOrThrow({
    where: { id: mesocycle.constraintSetId },
    include: CS_WITH_TARGETS_INCLUDE,
  });
  const athlete: AthleteContext = {
    experienceLevel: mesocycle.athleteProfile.experience,
    phase: mesocycle.athleteProfile.phase,
    landmarks: DEFAULT_LANDMARKS,
  };
  return { mesocycle, week, cs, athlete };
}

type LoadedWeek = Awaited<ReturnType<typeof loadCheckInContext>>["week"];

const isResolved = (w: { sessions: { status: string }[] }) =>
  w.sessions.length > 0 && w.sessions.every((s) => s.status === "COMPLETED" || s.status === "MISSED");

/** PRIMARY-role muscles trained in the week, from the exercise library by name. */
function trainedMuscles(week: LoadedWeek): string[] {
  const byName = new Map(EXERCISE_LIBRARY.map((e) => [e.name, e]));
  const set = new Set<string>();
  for (const s of week.sessions) {
    for (const p of (s as unknown as { prescriptions?: { exercise: { name: string } }[] }).prescriptions ?? []) {
      for (const m of byName.get(p.exercise.name)?.muscles ?? []) {
        if (m.role === "PRIMARY") set.add(m.muscle);
      }
    }
  }
  return [...set];
}

/** Rebuild CheckInFeedback + stepWeek proposal deterministically from a persisted CheckIn's rows. */
function computeProposal(
  ctxObjs: Awaited<ReturnType<typeof loadCheckInContext>>,
  feedbackMuscles: { muscle: string; recovery: number; joint: number }[],
) {
  const { mesocycle, week, cs, athlete } = ctxObjs;
  const perf = derivePerformance(week as unknown as WeekForPerformance, adaptationContextFrom(cs, athlete).targets, EXERCISE_LIBRARY);
  const feedback: CheckInFeedback = {
    weekIndex: week.index,
    muscles: feedbackMuscles.map((m) => ({
      muscle: m.muscle as CheckInFeedback["muscles"][number]["muscle"],
      recovery: m.recovery,
      joint: m.joint,
      performance: perf.get(m.muscle as never) ?? undefined,
    })),
  };
  const plan = mesocyclePlanFromDb(mesocycle.weeks, cs.splitType);
  const ctx = adaptationContextFrom(cs, athlete);
  const adj = stepWeek(plan, week.index, feedback, ctx);
  const upcoming = mesocycle.weeks.find((w) => w.index === week.index + 1);
  const view = toProgressionProposalView(adj, {
    hasUpcoming: upcoming !== undefined,
    upcomingIsDeload: upcoming?.isDeload ?? false,
  });
  return { adj, view, upcoming };
}

export const checkinRouter = createTRPCRouter({
  // Eligibility + form scaffold. Mutates nothing.
  getWeeklyCheckIn: protectedProcedure
    .input(z.object({ weekIndex: z.number().int().min(1) }))
    .query(async ({ ctx, input }): Promise<WeeklyCheckInView> => {
      const userId = ctx.session.user.id;
      const loaded = await loadCheckInContext(ctx.db, userId, input.weekIndex);
      const eligible = isResolved(loaded.week);

      const existing = await ctx.db.checkIn.findFirst({
        where: { weekId: loaded.week.id, scope: "WEEK" },
        select: { muscleFeedback: { select: { muscle: true, recovery: true, jointStress: true } } },
      });
      const decision = await ctx.db.decisionLog.findFirst({
        where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "PROGRESS" },
        orderBy: { createdAt: "desc" },
        select: { status: true },
      });

      let status: WeeklyCheckInStatus = eligible ? "READY" : "NOT_READY";
      if (decision?.status === "APPLIED") status = "APPLIED";
      else if (decision?.status === "REJECTED") status = "REJECTED";
      else if (existing) status = "SUBMITTED";

      return {
        weekIndex: input.weekIndex,
        eligible,
        trainedMuscles: trainedMuscles(loaded.week) as WeeklyCheckInView["trainedMuscles"],
        status,
        existing: existing
          ? existing.muscleFeedback.map((m) => ({ muscle: m.muscle, recovery: m.recovery ?? 0, joint: m.jointStress ?? 0 }))
          : undefined,
      };
    }),

  // Record truth + compute proposal. No plan mutation, no accept-gate.
  submitWeeklyCheckIn: protectedProcedure
    .input(WeeklyCheckInInputSchema)
    .mutation(async ({ ctx, input }): Promise<ProgressionProposalView> => {
      const userId = ctx.session.user.id;
      const loaded = await loadCheckInContext(ctx.db, userId, input.weekIndex);
      if (!isResolved(loaded.week)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Finish or reschedule every session in this week before checking in." });
      }
      const trained = new Set(trainedMuscles(loaded.week));
      for (const m of input.muscles) {
        if (!trained.has(m.muscle)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${m.muscle} wasn't trained this week.` });
        }
      }

      const perf = derivePerformance(loaded.week as unknown as WeekForPerformance, adaptationContextFrom(loaded.cs, loaded.athlete).targets, EXERCISE_LIBRARY);
      const plannedByMuscle = new Map(
        (loaded.week as unknown as { muscleVolumes: { muscle: string; plannedSets: number }[] }).muscleVolumes.map((v) => [v.muscle, v.plannedSets]),
      );

      await ctx.db.$transaction(async (tx) => {
        const athleteProfile = await tx.athleteProfile.findUniqueOrThrow({
          where: { userId },
          select: { id: true },
        });
        const existing = await tx.checkIn.findFirst({ where: { weekId: loaded.week.id, scope: "WEEK" }, select: { id: true } });
        const checkIn = existing
          ? (await tx.checkIn.update({ where: { id: existing.id }, data: {}, select: { id: true } }))
          : (await tx.checkIn.create({
              data: { athleteProfileId: athleteProfile.id, weekId: loaded.week.id, scope: "WEEK" },
              select: { id: true },
            }));
        await tx.checkInMuscle.deleteMany({ where: { checkInId: checkIn.id } });
        await tx.checkInMuscle.createMany({
          data: input.muscles.map((m) => ({
            checkInId: checkIn.id,
            muscle: m.muscle,
            recovery: m.recovery,
            jointStress: m.joint,
            performance: perf.get(m.muscle as never) ?? null,
            plannedSets: plannedByMuscle.get(m.muscle) ?? null,
            actualSets: null,
          })),
        });
      }, { timeout: 15000 });

      const { adj, view } = computeProposal(loaded, input.muscles);
      // Record/refresh the PROPOSED decision (delete any prior non-terminal proposal first).
      await ctx.db.decisionLog.deleteMany({
        where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "PROGRESS", status: "PROPOSED" },
      });
      await ctx.db.decisionLog.create({
        data: {
          mesocycleId: loaded.mesocycle.id,
          weekIndex: input.weekIndex,
          type: "PROGRESS",
          status: "PROPOSED",
          summary: `Week ${input.weekIndex} check-in — progression proposed`,
          reasoning: adj.checkInValue,
          payload: { adjustments: adj.adjustments, checkInValue: adj.checkInValue, facts: adj.facts },
        },
      });
      return view;
    }),

  // Accept-gate commit: rebuild week N+1 to the proposed targets. Recomputed deterministically.
  applyProgression: protectedProcedure
    .input(z.object({ weekIndex: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }): Promise<{ appliesToWeekIndex: number }> => {
      const userId = ctx.session.user.id;
      const loaded = await loadCheckInContext(ctx.db, userId, input.weekIndex);

      const checkIn = await ctx.db.checkIn.findFirst({
        where: { weekId: loaded.week.id, scope: "WEEK" },
        select: { muscleFeedback: { select: { muscle: true, recovery: true, jointStress: true } } },
      });
      if (!checkIn) throw new TRPCError({ code: "BAD_REQUEST", message: "Check in first." });

      const feedbackMuscles = checkIn.muscleFeedback.map((m) => ({ muscle: m.muscle, recovery: m.recovery ?? 0, joint: m.jointStress ?? 0 }));
      const { adj, view, upcoming } = computeProposal(loaded, feedbackMuscles);
      if (view.kind !== "CHANGES" || upcoming === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to apply for next week." });
      }

      const spec = resolvedSpecFrom(loaded.cs, loaded.athlete);
      const upcomingPlan = weekPlanFromDb(upcoming);
      const newPlan = weekPlanFromAdjustment(spec, EXERCISE_LIBRARY, adj, upcomingPlan);

      await ctx.db.$transaction(async (tx) => {
        // Guard: week N+1's sessions must still be SCHEDULED (nothing logged into them).
        const scheduled = await tx.trainingSession.count({
          where: { id: { in: upcomingPlan.sessions.map((s) => s.slotId) }, status: "SCHEDULED" },
        });
        if (scheduled !== upcomingPlan.sessions.length) {
          throw new TRPCError({ code: "CONFLICT", message: "A session changed while you were reviewing — please try again." });
        }
        await applyWeekPlanToDb(tx, upcoming.id, newPlan);
        await tx.decisionLog.updateMany({
          where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "PROGRESS", status: "PROPOSED" },
          data: { status: "APPLIED", summary: `Week ${input.weekIndex} progression applied to week ${upcoming.index}` },
        });
      }, { timeout: 15000 });

      return { appliesToWeekIndex: view.appliesToWeekIndex };
    }),

  // Decline. Plan untouched; the check-in stays recorded.
  rejectProgression: protectedProcedure
    .input(z.object({ weekIndex: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const userId = ctx.session.user.id;
      const loaded = await loadCheckInContext(ctx.db, userId, input.weekIndex);
      await ctx.db.decisionLog.updateMany({
        where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "PROGRESS", status: "PROPOSED" },
        data: { status: "REJECTED" },
      });
      return { ok: true };
    }),
});
```

> **Implementer note:** confirm exact Prisma field names against `prisma/schema.prisma` before running the gate (`DecisionLog.reasoning` + `payload` is `Json`; `CheckInMuscle.jointStress`, `plannedSets`, `actualSets`; `AthleteProfile.experience`, `phase`). Adjust `select`/`include` if a field name differs. The `computeProposal` helper resolves the adaptation context twice (once for `derivePerformance` targets, once for `stepWeek`); `resolveConstraints` is pure and cheap, so this is acceptable — collapse to one call if profiling ever flags it.

- [ ] **Step 3: Register the router + typecheck/lint gate**

In `src/server/api/root.ts` add the import and entry:
```ts
import { checkinRouter } from "~/server/api/routers/checkin";
// ...
export const appRouter = createTRPCRouter({
  health: healthRouter,
  mesocycle: mesocycleRouter,
  onboarding: onboardingRouter,
  session: sessionRouter,
  checkin: checkinRouter,
});
```

Run: `pnpm typecheck && pnpm lint`
Expected: exit 0 / exit 0 (fix the marker line + non-ASCII identifiers + any field-name drift until clean).

- [ ] **Step 4: Document DB verification for the user (no subagent DB access)**

Add nothing to code; the reviewer/controller surfaces this checklist to the user to run against Neon after merge-candidate build:
1. Resolve a week (log or mark-missed every session) → `getWeeklyCheckIn(weekIndex).status === "READY"`, `trainedMuscles` non-empty.
2. `submitWeeklyCheckIn` with recovery/joint for trained muscles → returns a `ProgressionProposalView`; a `CheckIn` + `CheckInMuscle` rows exist with derived `performance`; a `DecisionLog(PROGRESS, PROPOSED)` exists.
3. `applyProgression` → week N+1's `WeekMuscleVolume`/prescriptions change to match the proposal; `DecisionLog` flips to `APPLIED`; second call → BAD_REQUEST.
4. `rejectProgression` (fresh proposal) → `DecisionLog` `REJECTED`; plan unchanged.
5. `pnpm db:seed` still succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/checkin.ts src/server/api/root.ts src/server/mesocycle/reschedule-adapters.ts
git commit -m "feat(api): checkin router — weekly check-in → accept-gated progression"
```

---

### Task 7: `WeeklyCheckInEntry` + wire eligibility on Now-home & Week page

**Files:**
- Create: `src/components/checkin/weekly-checkin-entry.tsx`
- Modify: `src/app/app/block/week/[n]/page.tsx` (render the entry)
- Modify: `src/app/app/page.tsx` (render the entry for the current week)

**Interfaces:**
- Consumes: `api.checkin.getWeeklyCheckIn` (`~/trpc/react`); opens the grid/dialog from Tasks 8–9 (wired in Task 9 — for this task the button is present but its `onClick` is a no-op placeholder `() => {}` clearly marked, replaced in Task 9).
- Produces: `<WeeklyCheckInEntry weekIndex={n} />` client component.

**Note (no DB test):** client + tRPC-hook component. Gated by `pnpm typecheck` + `pnpm lint` + user visual check.

- [ ] **Step 1: Write the component**

```tsx
// src/components/checkin/weekly-checkin-entry.tsx
"use client";

import { api } from "~/trpc/react";

/** End-of-week entry point. Renders only when the week is resolved and no terminal
 * progression decision exists yet. Accent CTA (scarce). onOpen wired in Task 9. */
export function WeeklyCheckInEntry({ weekIndex, onOpen }: { weekIndex: number; onOpen?: () => void }) {
  const q = api.checkin.getWeeklyCheckIn.useQuery({ weekIndex });
  const view = q.data;
  if (!view) return null;

  if (view.status === "APPLIED") {
    return (
      <div className="rounded-card border border-border-subtle bg-surface px-5 py-4 text-nav text-fg-muted">
        Week {weekIndex} progression applied to Week {weekIndex + 1} ✓
      </div>
    );
  }
  if (view.status !== "READY" && view.status !== "SUBMITTED") return null;

  const submitted = view.status === "SUBMITTED";
  return (
    <div className="rounded-card border border-border bg-surface-raised p-6">
      <div className="text-card-title text-fg">Week {weekIndex} wrapped — how’d it land?</div>
      <p className="mt-1 text-card-desc text-fg-muted">
        {submitted
          ? "Your proposal for next week is ready."
          : "A quick read on recovery and joints sets up next week’s volume."}
      </p>
      <button
        type="button"
        onClick={onOpen ?? (() => {})}
        className="mt-4 inline-flex items-center gap-2 rounded-control bg-accent px-5 py-3 text-list font-medium text-white transition-colors hover:bg-accent-strong"
      >
        {submitted ? "See proposal" : "Check in"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Render it on the Week page**

In `src/app/app/block/week/[n]/page.tsx`, add the import and render the entry above the sessions grid (client component in an RSC page is fine):
```tsx
import { WeeklyCheckInEntry } from "~/components/checkin/weekly-checkin-entry";
// ...inside the returned JSX, between </header> and the sessions grid <div>:
      <div className="px-6 pt-6">
        <WeeklyCheckInEntry weekIndex={week.index} />
      </div>
```

- [ ] **Step 3: Render it on Now-home for the current week**

In `src/app/app/page.tsx`, add the import and render `<WeeklyCheckInEntry weekIndex={currentWeekIndex} />` near the top of the page body, where `currentWeekIndex` is the block's current week index already available in that file (reuse the same value the readiness/next-session logic uses; if not present, derive from the block's `currentWeekIndex`). Keep it above the fold but below the greeting.

- [ ] **Step 4: Typecheck/lint gate**

Run: `pnpm typecheck && pnpm lint`
Expected: exit 0 / exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/checkin/weekly-checkin-entry.tsx src/app/app/block/week/[n]/page.tsx src/app/app/page.tsx
git commit -m "feat(checkin): weekly check-in entry card on home + week"
```

---

### Task 8: `WeeklyCheckInGrid`

**Files:**
- Create: `src/components/checkin/weekly-checkin-grid.tsx`

**Interfaces:**
- Consumes: `MuscleGroup` list from `getWeeklyCheckIn().trainedMuscles`; calls `onSubmit(muscles)` (the parent runs the mutation in Task 9).
- Produces: `<WeeklyCheckInGrid trainedMuscles muscles onChange onSubmit isPending existing? />` — a controlled per-muscle grid with two 4-point selectors each (recovery, joint).

- [ ] **Step 1: Write the component**

```tsx
// src/components/checkin/weekly-checkin-grid.tsx
"use client";

import type { MuscleGroup } from "~/schema";

export interface MuscleScore {
  muscle: MuscleGroup;
  recovery: number;
  joint: number;
}

const RECOVERY_LABELS = ["Wrecked", "Sore", "Okay", "Fresh"];
const JOINT_LABELS = ["Fine", "Niggle", "Achy", "Painful"];

function humanMuscle(m: string): string {
  return m.charAt(0) + m.slice(1).toLowerCase().replace(/_/g, " ");
}

/** A 0-3 selector. dot fill communicates intensity; accent marks the choice. */
function Scale({
  value,
  onChange,
  labels,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  labels: string[];
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-1.5">
      {labels.map((label, i) => (
        <button
          key={i}
          type="button"
          aria-pressed={value === i}
          title={label}
          onClick={() => onChange(i)}
          className={
            "size-8 rounded-control border text-eyebrow transition-colors " +
            (value === i ? "border-accent bg-selection text-accent" : "border-border-subtle text-fg-subtle hover:border-border")
          }
        >
          {i}
        </button>
      ))}
    </div>
  );
}

export function WeeklyCheckInGrid({
  muscles,
  onChange,
  onSubmit,
  isPending,
}: {
  muscles: MuscleScore[];
  onChange: (next: MuscleScore[]) => void;
  onSubmit: () => void;
  isPending: boolean;
}) {
  function set(muscle: MuscleGroup, key: "recovery" | "joint", v: number) {
    onChange(muscles.map((m) => (m.muscle === muscle ? { ...m, [key]: v } : m)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {muscles.map((m) => (
          <div key={m.muscle} className="rounded-control border border-border-subtle bg-surface p-4">
            <div className="text-card-title text-fg">{humanMuscle(m.muscle)}</div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-eyebrow font-medium text-fg-soft">Recovery</span>
                <Scale value={m.recovery} onChange={(v) => set(m.muscle, "recovery", v)} labels={RECOVERY_LABELS} ariaLabel={`${humanMuscle(m.muscle)} recovery`} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-eyebrow font-medium text-fg-soft">Joints</span>
                <Scale value={m.joint} onChange={(v) => set(m.muscle, "joint", v)} labels={JOINT_LABELS} ariaLabel={`${humanMuscle(m.muscle)} joint stress`} />
              </label>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={onSubmit}
        className="inline-flex items-center justify-center gap-2 rounded-control bg-accent px-5 py-3 text-list font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {isPending ? "Reading your week…" : "See next week’s plan"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck/lint gate**

Run: `pnpm typecheck && pnpm lint`
Expected: exit 0 / exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/checkin/weekly-checkin-grid.tsx
git commit -m "feat(checkin): weekly per-muscle recovery/joint grid"
```

---

### Task 9: `ProgressionProposalDialog` + wire the full flow

**Files:**
- Create: `src/components/checkin/progression-proposal-dialog.tsx`
- Create: `src/components/checkin/weekly-checkin-flow.tsx` (client orchestrator: entry → grid → proposal)
- Modify: `src/components/checkin/weekly-checkin-entry.tsx` (call the flow's opener)
- Modify: `src/app/app/block/week/[n]/page.tsx` and `src/app/app/page.tsx` (render the flow instead of the bare entry)

**Interfaces:**
- Consumes: `api.checkin.getWeeklyCheckIn`, `submitWeeklyCheckIn`, `applyProgression`, `rejectProgression`; `ProgressionProposalView` (`~/views/types`); the grid (Task 8) and dialog.
- Produces: `<WeeklyCheckInFlow weekIndex />` — the single component the pages render.

**Reuse:** copy the modal keyboard contract (focus-on-open, Escape, Tab-trap, focus-restore, backdrop dismiss) from `src/components/block/reschedule-dialog.tsx` verbatim in structure; only the body differs.

- [ ] **Step 1: Write the proposal dialog**

```tsx
// src/components/checkin/progression-proposal-dialog.tsx
"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, TriangleAlert } from "lucide-react";
import type { ProgressionProposalView } from "~/views/types";

const CAUSE_COPY: Record<string, string> = {
  responding_well: "responding well",
  under_recovered: "under-recovered",
  joint_stress: "joint stress",
  approaching_mrv: "approaching your ceiling",
  on_track: "on track",
  default_progression: "steady progression",
};

function humanMuscle(m: string): string {
  return m.charAt(0) + m.slice(1).toLowerCase().replace(/_/g, " ");
}

export function ProgressionProposalDialog({
  proposal,
  onAccept,
  onReject,
  isPending,
}: {
  proposal: ProgressionProposalView;
  onAccept: () => void;
  onReject: () => void;
  isPending: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onReject();
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
        if (f.length === 0) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); restoreFocusTo.current?.focus(); };
  }, [onReject]);

  const informational = proposal.kind !== "CHANGES";
  const title =
    proposal.kind === "BLOCK_END" ? "Block’s final week" : proposal.kind === "DELOAD_HOLD" ? "Deload ahead" : `Week ${proposal.appliesToWeekIndex} — your next move`;
  const subtitle =
    proposal.kind === "BLOCK_END"
      ? "Nothing to progress into — nice work closing the block."
      : proposal.kind === "DELOAD_HOLD"
        ? "Next week is your planned deload — we’re holding volume so you recover."
        : "Here’s how next week adapts to what you just did — your call.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onReject(); }}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="prog-title" aria-describedby="prog-desc" className="w-full max-w-md rounded-card border border-border bg-canvas p-6 outline-none">
        <h2 id="prog-title" className="text-card-title text-fg">{title}</h2>
        <p id="prog-desc" className="mt-1 text-nav text-fg-muted">{subtitle}</p>

        {proposal.advisory ? (
          <div className="mt-3 flex items-start gap-2 rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
            <span>{proposal.advisory}</span>
          </div>
        ) : null}

        {!informational ? (
          <div className="mt-4 flex flex-col gap-2">
            {proposal.adjustments.length === 0 ? (
              <p className="rounded-control border border-border-subtle px-3 py-2 text-nav text-fg-muted">You’re right on plan — holding volume next week.</p>
            ) : (
              proposal.adjustments.map((a) => (
                <div key={a.muscle} className="flex items-center justify-between rounded-control border border-border-subtle px-3 py-2">
                  <div className="flex items-center gap-2 text-nav text-fg">
                    <span className="font-medium">{humanMuscle(a.muscle)}</span>
                    <span className="text-fg-subtle">{a.plannedSets} → {a.adjustedSets}</span>
                    <span className={a.delta > 0 ? "text-zone-optimal" : a.delta < 0 ? "text-zone-rest" : "text-fg-subtle"}>
                      {a.delta > 0 ? `+${a.delta}` : a.delta}
                    </span>
                  </div>
                  <span className="text-[12px] text-fg-muted">
                    {CAUSE_COPY[a.cause] ?? a.cause}{a.swapCandidate ? " · consider a swap" : ""}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          {informational ? (
            <button type="button" onClick={onReject} className="rounded-control bg-accent px-5 py-2.5 text-nav font-medium text-white hover:bg-accent-strong">Got it</button>
          ) : (
            <>
              <button type="button" disabled={isPending} onClick={onReject} className="rounded-control border border-border px-4 py-2.5 text-nav text-fg-soft hover:text-fg disabled:opacity-60">Keep as-is</button>
              <button type="button" disabled={isPending} onClick={onAccept} className="inline-flex items-center gap-2 rounded-control bg-accent px-5 py-2.5 text-nav font-medium text-white hover:bg-accent-strong disabled:opacity-60">
                Accept plan <ArrowRight className="size-4" aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the flow orchestrator**

```tsx
// src/components/checkin/weekly-checkin-flow.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import type { ProgressionProposalView } from "~/views/types";
import { WeeklyCheckInEntry } from "./weekly-checkin-entry";
import { WeeklyCheckInGrid, type MuscleScore } from "./weekly-checkin-grid";
import { ProgressionProposalDialog } from "./progression-proposal-dialog";

type Stage = "closed" | "grid" | "proposal";

export function WeeklyCheckInFlow({ weekIndex }: { weekIndex: number }) {
  const router = useRouter();
  const utils = api.useUtils();
  const q = api.checkin.getWeeklyCheckIn.useQuery({ weekIndex });
  const [stage, setStage] = useState<Stage>("closed");
  const [muscles, setMuscles] = useState<MuscleScore[]>([]);
  const [proposal, setProposal] = useState<ProgressionProposalView | null>(null);

  const submit = api.checkin.submitWeeklyCheckIn.useMutation({
    onSuccess: (view) => { setProposal(view); setStage("proposal"); },
  });
  const apply = api.checkin.applyProgression.useMutation({
    onSuccess: async () => { setStage("closed"); await utils.checkin.getWeeklyCheckIn.invalidate({ weekIndex }); router.refresh(); },
  });
  const reject = api.checkin.rejectProgression.useMutation({
    onSuccess: async () => { setStage("closed"); await utils.checkin.getWeeklyCheckIn.invalidate({ weekIndex }); },
  });

  function open() {
    const trained = q.data?.trainedMuscles ?? [];
    const existing = new Map((q.data?.existing ?? []).map((e) => [e.muscle, e]));
    setMuscles(trained.map((m) => ({ muscle: m, recovery: existing.get(m)?.recovery ?? 2, joint: existing.get(m)?.joint ?? 0 })));
    setStage("grid");
  }

  return (
    <>
      <WeeklyCheckInEntry weekIndex={weekIndex} onOpen={open} />

      {stage === "grid" ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="mt-12 w-full max-w-lg rounded-card border border-border bg-canvas p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-card-title text-fg">Week {weekIndex} check-in</h2>
              <button type="button" onClick={() => setStage("closed")} className="text-nav text-fg-subtle hover:text-fg">Close</button>
            </div>
            <p className="mt-1 text-nav text-fg-muted">How recovered does each muscle feel? Any joints complaining?</p>
            <div className="mt-4">
              <WeeklyCheckInGrid
                muscles={muscles}
                onChange={setMuscles}
                isPending={submit.isPending}
                onSubmit={() => submit.mutate({ weekIndex, muscles })}
              />
            </div>
            {submit.isError ? <p className="mt-3 rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">{submit.error.message}</p> : null}
          </div>
        </div>
      ) : null}

      {stage === "proposal" && proposal ? (
        <ProgressionProposalDialog
          proposal={proposal}
          isPending={apply.isPending || reject.isPending}
          onAccept={() => apply.mutate({ weekIndex })}
          onReject={() => (proposal.kind === "CHANGES" ? reject.mutate({ weekIndex }) : setStage("closed"))}
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 3: Swap the pages to render the flow**

In both `src/app/app/block/week/[n]/page.tsx` and `src/app/app/page.tsx`, replace `<WeeklyCheckInEntry .../>` with `<WeeklyCheckInFlow weekIndex={...} />` (import from `~/components/checkin/weekly-checkin-flow`). The entry component stays as the flow's internal trigger.

- [ ] **Step 4: Typecheck/lint + full test suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: exit 0 / exit 0 / all tests pass (166 baseline + the new pure tests from Tasks 1–5).

- [ ] **Step 5: Commit**

```bash
git add src/components/checkin/progression-proposal-dialog.tsx src/components/checkin/weekly-checkin-flow.tsx src/components/checkin/weekly-checkin-entry.tsx src/app/app/block/week/[n]/page.tsx src/app/app/page.tsx
git commit -m "feat(checkin): progression proposal dialog + wire weekly loop"
```

---

## Final verification (before offering merge)

- [ ] `pnpm typecheck` → exit 0
- [ ] `pnpm lint` → exit 0
- [ ] `pnpm test` → all pass (baseline 166 + new pure tests)
- [ ] Design detector hook clean on the new/edited UI files
- [ ] User visual + Neon verification (Task 6 Step 4 checklist + the three surfaces): entry appears only on a resolved week; grid lists trained muscles only; proposal shows honest per-muscle Δ + reasons; Accept rebuilds week N+1 and records `DecisionLog(APPLIED)`; Keep-as-is records `REJECTED` and leaves the plan; deload/last-week render informational.
- [ ] On visual "lgtm": merge `freddy/feat/weekly-checkin-progression` → `freddy/experimental` (`--no-ff`), delete the feature branch. Do not push to origin.

## Self-Review notes

- **Spec coverage:** capture (Task 8), performance-derivation Law 1 (Task 4), trigger/eligibility (Task 6 `isResolved` + Task 7), stepWeek wiring (Task 6 via Tasks 2–3), whole-proposal accept/reject (Tasks 6 + 9), edge cases DELOAD_HOLD/BLOCK_END/all-missed/idempotency/concurrency (Task 5 kinds + Task 6 guards), no-new-schema (Global Constraints + Task 6 note). All mapped.
- **Type consistency:** `weekPlanFromAdjustment(spec, library, adj, upcoming)`, `derivePerformance(week, targets, library)`, `mesocyclePlanFromDb(weeks, splitType)`, `toProgressionProposalView(adj, {hasUpcoming, upcomingIsDeload})`, and `WeeklyCheckInView`/`ProgressionProposalView` are used identically across the router and components.
- **Known implementer follow-ups (called out inline):** confirm Prisma field names against the schema (Task 6 note); confirm the `currentWeekIndex` source on Now-home (Task 7 Step 3).
- **Placeholder scan:** clean — no TBD/marker lines; every code step carries complete code. (An earlier draft's proposal-record marker line and a non-ASCII identifier were removed.)
