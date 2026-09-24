# Readiness-Driven Deload Proposal (④-C-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the orphaned `evaluateDeload` engine function into an accept-gated "take a deload now?" proposal at the weekly check-in, triggered by consecutive-week fatigue.

**Architecture:** Two pure adapters (`deloadWeekPlan` builds a half-volume/RIR-4 deload week; `weekOutcomesFromBlock` reconstructs `WeekOutcome[]` history) plus a view mapper feed a deload branch added to the existing `checkin` router. At `submitWeeklyCheckIn`, if `evaluateDeload` returns `recommend_early`, the submit returns a DELOAD proposal (instead of progression); new `applyDeload`/`rejectDeload` procedures mirror ④-A's atomic accept-gate. The proposal dialog + flow gain a DELOAD variant.

**Tech Stack:** Next.js 15 (App Router / RSC), tRPC 11, Prisma 6 (Neon), Vitest, pnpm. Engine is pure TypeScript in `src/engine`.

**Spec:** `docs/superpowers/specs/2026-09-24-readiness-deload-design.md`

## Global Constraints

- **Law 1 (engine/data owns numbers):** the deload trigger (`evaluateDeload`) and volumes (`deloadWeekPlan`) are engine-computed; UI/mappers only reshape. Deltas shown come from comparing two engine plans.
- **Law 2 (deterministic):** `applyDeload` recomputes `evaluateDeload` from the persisted check-in history — never trusts client state; identical history → identical decision.
- **Deload supersedes progression:** at `submitWeeklyCheckIn`, if `evaluateDeload` → `recommend_early` (and week N+1 exists and is not already a deload), return a DELOAD proposal and write `DecisionLog(DELOAD, PROPOSED)` INSTEAD OF running stepWeek / writing PROGRESS. Never both in the same week.
- **Reject applies no progression:** `rejectDeload` writes `DecisionLog(DELOAD, REJECTED)` and leaves the plan untouched (no step-up/step-down).
- **Accept-gate is atomic (mirror ④-A `applyProgression`):** claim `DecisionLog(DELOAD, PROPOSED) → APPLIED` with an in-tx `updateMany` requiring `count === 1` (else CONFLICT) BEFORE mutating; plus the SCHEDULED re-assert on week N+1's sessions.
- **Engine constants (already defined, do not change):** `DELOAD_FRACTION = 0.5`, `DELOAD_RIR = 4`, `RECOVERY_LOW = 1`, `CONSECUTIVE_FATIGUE_WEEKS = 2`, `FATIGUE_MUSCLE_THRESHOLD = 2`.
- **Subagents must NOT run any DB command** (`db:push`/`db:seed`/`prisma migrate`) — Neon is off-limits; DB verification is the user's. DB-bound work gates on `pnpm typecheck` + `pnpm lint` only.
- **Branch:** all work on `freddy/feat/readiness-deload`; merges into `freddy/experimental` only after the user's visual "lgtm". Nothing pushed to origin unless asked.
- **UI tokens:** dark app-shell-kit; accent scarce; reuse the existing modal keyboard contract; `zone-*` for data semantics only.
- **Test runner:** `pnpm test <path>` (Vitest). Gate: `pnpm typecheck` (0 errors) + `pnpm lint` (clean; the 3 pre-existing warnings in `logging.test.ts`/`onboarding.test.ts`/`mock-block.ts` are acceptable). Full suite `pnpm test` stays green.

---

### Task 1: Engine — `deloadWeekPlan`

**Files:**
- Create: `src/engine/deload-week.ts`
- Test: `src/engine/deload-week.test.ts`
- Modify: `src/engine/index.ts` (export `deloadWeekPlan`)

**Interfaces:**
- Consumes: `distributeVolume` (`./distribute`), `prescribe` (`./prescribe`), `buildSessionSlots` (`./split`), `round1` (`./util`), `DELOAD_FRACTION`/`DELOAD_RIR` (`./constants`); types `ResolvedSpec`, `SessionPlan`, `WeekPlan` (`./types`); `ExerciseDef` (`~/domain/exercise-library`).
- Produces: `deloadWeekPlan(spec: ResolvedSpec, library: ExerciseDef[], upcoming: WeekPlan): WeekPlan` — consumed by Task 4. Sibling of `weekPlanFromAdjustment` (`src/engine/apply-adjustment.ts`); read that file first — this mirrors it, but scales targets to the deload fraction and prescribes with `isDeload: true`.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/deload-week.test.ts
import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { generateMesocycle } from "./generate";
import { resolveConstraints } from "./resolve-constraints";
import { deloadWeekPlan } from "./deload-week";
import { DELOAD_RIR } from "./constants";
import type { AthleteContext, ResolvedSpec } from "./types";

const athlete: AthleteContext = {
  experienceLevel: "INTERMEDIATE",
  phase: "MAINTAIN",
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

describe("deloadWeekPlan", () => {
  it("cuts volume toward half of peak, sets deload RIR + isDeload, keeps stored session ids", () => {
    const spec = resolvedSpec();
    const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const upcoming = plan.weeks[2]!; // an accumulation week
    const result = deloadWeekPlan(spec, EXERCISE_LIBRARY, upcoming);

    expect(result.isDeload).toBe(true);
    expect(result.sessions.map((s) => s.slotId)).toEqual(upcoming.sessions.map((s) => s.slotId));
    // every prescription carries the deload RIR
    expect(result.sessions.flatMap((s) => s.prescriptions).every((p) => p.targetRir === DELOAD_RIR)).toBe(true);
    // chest volume is roughly halved vs the peak target (allow distribution rounding)
    const chestTarget = spec.targets.find((t) => t.muscle === "CHEST")!.weeklySetTarget;
    expect(result.muscleVolume.CHEST).toBeGreaterThan(0);
    expect(result.muscleVolume.CHEST).toBeLessThan(chestTarget);
  });

  it("throws when the distributed session count disagrees with the stored week", () => {
    const spec = resolvedSpec();
    const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);
    const upcoming = { ...plan.weeks[2]!, sessions: plan.weeks[2]!.sessions.slice(0, 1) };
    expect(() => deloadWeekPlan(spec, EXERCISE_LIBRARY, upcoming)).toThrow(/mismatch/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/engine/deload-week.test.ts`
Expected: FAIL (module `./deload-week` not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/deload-week.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import { DELOAD_FRACTION } from "./constants";
import { distributeVolume } from "./distribute";
import { prescribe } from "./prescribe";
import { buildSessionSlots } from "./split";
import type { ResolvedSpec, SessionPlan, WeekPlan } from "./types";
import { round1 } from "./util";

/**
 * Build a deload WeekPlan for the upcoming week: every muscle's target scaled to
 * DELOAD_FRACTION of its peak, distributed into the split, prescribed at deload RIR,
 * remapped onto the stored week's real TrainingSession ids. Mirrors
 * weekPlanFromAdjustment; deterministic (Law 2).
 */
export function deloadWeekPlan(
  spec: ResolvedSpec,
  library: ExerciseDef[],
  upcoming: WeekPlan,
): WeekPlan {
  const overridden: ResolvedSpec = {
    ...spec,
    targets: spec.targets.map((t) => ({
      ...t,
      weeklySetTarget: round1(t.weeklySetTarget * DELOAD_FRACTION),
    })),
  };

  const slots = buildSessionSlots(spec.splitType, spec.daysPerWeek);
  const template = distributeVolume(overridden, library, slots);

  if (template.sessions.length !== upcoming.sessions.length) {
    throw new Error(
      "deloadWeekPlan: session count mismatch between distributed and stored week.",
    );
  }

  const sessions: SessionPlan[] = template.sessions.map((s, i) => ({
    slotId: upcoming.sessions[i]!.slotId,
    label: upcoming.sessions[i]!.label,
    prescriptions: s.exercises.map((a) => prescribe(a, library, true)), // isDeload → DELOAD_RIR
    estimatedMinutes: s.estimatedMinutes,
  }));

  return {
    index: upcoming.index,
    isDeload: true,
    sessions,
    muscleVolume: template.achievedVolume,
  };
}
```

Add to `src/engine/index.ts`:
```ts
export { deloadWeekPlan } from "./deload-week";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/engine/deload-week.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/deload-week.ts src/engine/deload-week.test.ts src/engine/index.ts
git commit -m "feat(engine): deloadWeekPlan — half-volume/RIR-4 deload week"
```

---

### Task 2: `weekOutcomesFromBlock` adapter

**Files:**
- Create: `src/server/mesocycle/week-outcomes.ts`
- Test: `src/server/mesocycle/week-outcomes.test.ts`

**Interfaces:**
- Consumes: types `WeekOutcome`, `CheckInFeedback` (`~/engine`); `MUSCLE_GROUPS`, `MuscleGroup` (`~/schema`); `MuscleVolumeMap` (`~/engine`).
- Produces: type `WeekForOutcome` and `weekOutcomesFromBlock(weeks: WeekForOutcome[]): WeekOutcome[]` — consumed by Task 4. Builds each week's `{ weekIndex, muscleVolume (full map, 0 default), feedback (from its WEEK check-in, or null) }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/mesocycle/week-outcomes.test.ts
import { describe, expect, it } from "vitest";
import { weekOutcomesFromBlock, type WeekForOutcome } from "./week-outcomes";

function week(index: number, over: Partial<WeekForOutcome> = {}): WeekForOutcome {
  return {
    index,
    muscleVolumes: [{ muscle: "CHEST", plannedSets: 12 }],
    checkIns: [],
    ...over,
  };
}

describe("weekOutcomesFromBlock", () => {
  it("builds a full muscleVolume map (0 for muscles with no row)", () => {
    const [out] = weekOutcomesFromBlock([week(1)]);
    expect(out!.muscleVolume.CHEST).toBe(12);
    expect(out!.muscleVolume.BICEPS).toBe(0);
  });

  it("maps the WEEK check-in's feedback, nulls → undefined", () => {
    const w = week(1, {
      checkIns: [
        {
          scope: "WEEK",
          muscleFeedback: [{ muscle: "CHEST", recovery: 1, performance: null, jointStress: 0 }],
        },
      ],
    });
    const [out] = weekOutcomesFromBlock([w]);
    expect(out!.feedback).not.toBeNull();
    expect(out!.feedback!.muscles).toEqual([
      { muscle: "CHEST", recovery: 1, performance: undefined, joint: 0 },
    ]);
  });

  it("feedback is null when the week has no check-in", () => {
    const [out] = weekOutcomesFromBlock([week(1)]);
    expect(out!.feedback).toBeNull();
  });

  it("orders outcomes by week index", () => {
    const out = weekOutcomesFromBlock([week(2), week(1)]);
    expect(out.map((o) => o.weekIndex)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/mesocycle/week-outcomes.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/server/mesocycle/week-outcomes.ts
import type { CheckInFeedback, MuscleVolumeMap, WeekOutcome } from "~/engine";
import { MUSCLE_GROUPS, type MuscleGroup } from "~/schema";

export interface WeekForOutcome {
  index: number;
  muscleVolumes: { muscle: MuscleGroup; plannedSets: number }[];
  checkIns: {
    scope: string;
    muscleFeedback: {
      muscle: MuscleGroup;
      recovery: number | null;
      performance: number | null;
      jointStress: number | null;
    }[];
  }[];
}

/** Reconstruct the engine's WeekOutcome[] history (per-week volume + check-in
 * feedback) so `evaluateDeload` has real input. feedback is null when a week has
 * no WEEK check-in. Pure. */
export function weekOutcomesFromBlock(weeks: WeekForOutcome[]): WeekOutcome[] {
  return [...weeks]
    .sort((a, b) => a.index - b.index)
    .map((w) => {
      const muscleVolume = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0])) as MuscleVolumeMap;
      for (const v of w.muscleVolumes) muscleVolume[v.muscle] = v.plannedSets;

      const checkIn = w.checkIns.find((c) => c.scope === "WEEK");
      const feedback: CheckInFeedback | null = checkIn
        ? {
            weekIndex: w.index,
            muscles: checkIn.muscleFeedback.map((m) => ({
              muscle: m.muscle,
              recovery: m.recovery ?? undefined,
              performance: m.performance ?? undefined,
              joint: m.jointStress ?? undefined,
            })),
          }
        : null;

      return { weekIndex: w.index, muscleVolume, feedback };
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/server/mesocycle/week-outcomes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/mesocycle/week-outcomes.ts src/server/mesocycle/week-outcomes.test.ts
git commit -m "feat(mesocycle): weekOutcomesFromBlock adapter"
```

---

### Task 3: Deload view type + `toDeloadProposalView` mapper

**Files:**
- Modify: `src/views/types.ts` (add `DeloadMuscleRow`, `DeloadProposalView`)
- Create: `src/views/deload.ts`
- Test: `src/views/deload.test.ts`

**Interfaces:**
- Consumes: `WeekPlan` (`~/engine`); `MuscleGroup` (`~/schema` — already imported in `types.ts`).
- Produces (in `types.ts`): `DeloadMuscleRow`, `DeloadProposalView`. Produces (in `deload.ts`): `toDeloadProposalView(upcoming, deloaded, fatiguedMuscles, fromWeekIndex) → DeloadProposalView` — consumed by Task 4.

**Note:** the spec mentioned reusing `MuscleProposalView`; a dedicated `DeloadMuscleRow` (no `cause`/`swapCandidate`) is cleaner since a deload row has no `StepCause`. This is the plan's refinement.

- [ ] **Step 1: Add the view types to `src/views/types.ts`**

Append (after the progression view types; `MuscleGroup` is already imported):
```ts
export interface DeloadMuscleRow {
  muscle: MuscleGroup;
  plannedSets: number;
  deloadedSets: number;
  delta: number; // deloadedSets − plannedSets (≤ 0)
}

export interface DeloadProposalView {
  kind: "DELOAD";
  fromWeekIndex: number;
  appliesToWeekIndex: number;
  fatiguedMuscles: MuscleGroup[];
  rows: DeloadMuscleRow[];
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/views/deload.test.ts
import { describe, expect, it } from "vitest";
import type { WeekPlan } from "~/engine";
import { toDeloadProposalView } from "./deload";

function wk(index: number, vol: Record<string, number>): WeekPlan {
  return {
    index,
    isDeload: false,
    sessions: [],
    muscleVolume: { ...emptyVol(), ...vol } as WeekPlan["muscleVolume"],
  };
}
function emptyVol() {
  // minimal: the mapper only reads muscles present with planned > 0
  return {} as Record<string, number>;
}

describe("toDeloadProposalView", () => {
  it("builds planned→deloaded rows for trained muscles with negative deltas", () => {
    const upcoming = wk(4, { CHEST: 12, BACK: 10 });
    const deloaded = wk(4, { CHEST: 6, BACK: 5 });
    const view = toDeloadProposalView(upcoming, deloaded, ["CHEST"], 3);
    expect(view.kind).toBe("DELOAD");
    expect(view.fromWeekIndex).toBe(3);
    expect(view.appliesToWeekIndex).toBe(4);
    expect(view.fatiguedMuscles).toEqual(["CHEST"]);
    const chest = view.rows.find((r) => r.muscle === "CHEST")!;
    expect(chest).toEqual({ muscle: "CHEST", plannedSets: 12, deloadedSets: 6, delta: -6 });
  });

  it("omits muscles the upcoming week doesn't train (planned 0)", () => {
    const upcoming = wk(4, { CHEST: 12 });
    const deloaded = wk(4, { CHEST: 6 });
    const view = toDeloadProposalView(upcoming, deloaded, [], 3);
    expect(view.rows.map((r) => r.muscle)).toEqual(["CHEST"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/views/deload.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Write the implementation**

```ts
// src/views/deload.ts
import type { WeekPlan } from "~/engine";
import type { MuscleGroup } from "~/schema";
import type { DeloadMuscleRow, DeloadProposalView } from "./types";

/** Map the upcoming week vs its deloaded rebuild into the accept-gate view. Rows
 * cover muscles the upcoming week trains (planned > 0); deltas come from the two
 * engine plans — no numbers invented (Law 1). */
export function toDeloadProposalView(
  upcoming: WeekPlan,
  deloaded: WeekPlan,
  fatiguedMuscles: MuscleGroup[],
  fromWeekIndex: number,
): DeloadProposalView {
  const rows: DeloadMuscleRow[] = (Object.keys(upcoming.muscleVolume) as MuscleGroup[])
    .filter((m) => upcoming.muscleVolume[m] > 0)
    .map((m) => {
      const plannedSets = upcoming.muscleVolume[m];
      const deloadedSets = deloaded.muscleVolume[m] ?? 0;
      return { muscle: m, plannedSets, deloadedSets, delta: deloadedSets - plannedSets };
    })
    .sort((a, b) => a.delta - b.delta); // biggest cut first

  return {
    kind: "DELOAD",
    fromWeekIndex,
    appliesToWeekIndex: upcoming.index,
    fatiguedMuscles,
    rows,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/views/deload.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/types.ts src/views/deload.ts src/views/deload.test.ts
git commit -m "feat(views): deload proposal view + mapper"
```

---

### Task 4: Wire the deload proposal end-to-end (router + dialog + flow)

**Files:**
- Modify: `src/server/api/routers/checkin.ts` (loadCheckInContext include; deload branch in `submitWeeklyCheckIn`; `applyDeload`, `rejectDeload`; `getWeeklyCheckIn` status; return-type union)
- Modify: `src/components/checkin/progression-proposal-dialog.tsx` (accept the union; DELOAD branch)
- Modify: `src/components/checkin/weekly-checkin-flow.tsx` (union state; applyDeload/rejectDeload wiring)

**Interfaces:**
- Consumes: `evaluateDeload`, `deloadWeekPlan` (`~/engine`); `weekOutcomesFromBlock` (`~/server/mesocycle/week-outcomes`); `toDeloadProposalView` (`~/views/deload`); `DeloadProposalView` (`~/views/types`); everything ④-A already imports in `checkin.ts`.
- Produces: `checkin.applyDeload`, `checkin.rejectDeload`; `submitWeeklyCheckIn` now returns `ProgressionProposalView | DeloadProposalView`.

**Why router + UI are one task:** changing `submitWeeklyCheckIn`'s return to the union breaks the flow's `proposal` state type and the dialog's prop type; they must change together to keep typecheck green. Read the current `checkin.ts`, `weekly-checkin-flow.tsx`, and `progression-proposal-dialog.tsx` before editing — the deload paths mirror the existing progression paths exactly.

**Gate:** DB-bound, so `pnpm typecheck` + `pnpm lint` + `pnpm test` (the pure tests from Tasks 1–3 must stay green; there is no runnable test for the router). No DB commands.

- [ ] **Step 1: Extend `loadCheckInContext` to load each week's WEEK check-in**

In `src/server/api/routers/checkin.ts`, inside `loadCheckInContext`'s `weeks: { include: { … } }`, add a `checkIns` include alongside the existing `sessions` include:
```ts
      weeks: {
        include: {
          ...WEEK_FOR_PLAN_INCLUDE,
          sessions: {
            include: {
              prescriptions: {
                include: {
                  exercise: true,
                  setLogs: { select: { reps: true, achievedRir: true } },
                },
              },
            },
          },
          checkIns: {
            where: { scope: "WEEK" },
            include: { muscleFeedback: true },
          },
        },
      },
```
This gives every loaded week its WEEK check-in + muscle feedback, which `weekOutcomesFromBlock` reads. (`mesocyclePlanFromDb`/`weekPlanFromDb` ignore the extra field; harmless.)

- [ ] **Step 2: Add a deload evaluator helper + imports**

Add imports at the top of `checkin.ts`:
```ts
import { evaluateDeload, deloadWeekPlan } from "~/engine";
import { weekOutcomesFromBlock, type WeekForOutcome } from "~/server/mesocycle/week-outcomes";
import { toDeloadProposalView } from "~/views/deload";
import type { DeloadProposalView } from "~/views/types";
```
(merge `evaluateDeload, deloadWeekPlan` into the existing `~/engine` import; merge `DeloadProposalView` into the existing `~/views/types` import.)

Add a helper near `computeProposal` that evaluates the deload decision. It takes the current week's feedback explicitly (like `computeProposal`) because two call sites differ: at `submitWeeklyCheckIn` the current week's check-in is NOT yet in the loaded rows (loaded before the write), so its feedback must be injected from `input.muscles`; at `applyDeload` it comes from the persisted check-in. It also slices history to weeks `≤` the current week — `evaluateDeload` infers the upcoming week from `max(history.weekIndex)`, so future weeks (which `weekOutcomesFromBlock` also returns) must be excluded or the fatigue window lands on the wrong weeks:
```ts
/** Run the reactive-deload check for the just-resolved week. Returns the recommended
 * deload proposal inputs, or null when no early deload is warranted (or N+1 is absent
 * / already a deload). Deterministic — recomputed from history + the current week's
 * feedback (injected, since submit loads before it persists). */
function computeDeload(
  ctxObjs: LoadedContext,
  feedbackMuscles: { muscle: MuscleGroup; recovery: number; joint: number }[],
) {
  const { mesocycle, week, cs, athlete } = ctxObjs;
  const upcoming = mesocycle.weeks.find((w) => w.index === week.index + 1);
  if (!upcoming || upcoming.isDeload) return null;

  const ctx = adaptationContextFrom(cs, athlete);
  const plan = mesocyclePlanFromDb(mesocycle.weeks, cs.splitType);

  // History up to and including the current week; inject the current week's fresh
  // feedback so evaluateDeload counts it in the consecutive-fatigue window.
  const currentFeedback: CheckInFeedback = {
    weekIndex: week.index,
    muscles: feedbackMuscles.map((m) => ({ muscle: m.muscle, recovery: m.recovery, joint: m.joint })),
  };
  const history = weekOutcomesFromBlock(mesocycle.weeks as unknown as WeekForOutcome[])
    .filter((o) => o.weekIndex <= week.index)
    .map((o) => (o.weekIndex === week.index ? { ...o, feedback: currentFeedback } : o));

  const decision = evaluateDeload(plan, history, ctx);
  if (decision.decision !== "recommend_early") return null;

  const fact = decision.facts.find((f) => f.kind === "deload_recommended");
  const fatiguedMuscles = fact && "muscles" in fact ? fact.muscles : [];
  return { upcoming, fatiguedMuscles, facts: decision.facts };
}
```

> The `as unknown as WeekForOutcome[]` cast bridges the Prisma row type to the adapter's structural type. Confirm at implementation time that the loaded `mesocycle.weeks` actually satisfies `WeekForOutcome` field-for-field (`index`, `muscleVolumes[{muscle,plannedSets}]`, `checkIns[{scope, muscleFeedback[{muscle,recovery,performance,jointStress}]}]`); if TypeScript accepts a direct assignment, drop the cast. Do NOT change `WeekForOutcome` to match Prisma — adjust the include if a field is missing.

- [ ] **Step 3: Add the deload branch to `submitWeeklyCheckIn`**

Change the procedure's return type to the union:
```ts
    .mutation(async ({ ctx, input }): Promise<ProgressionProposalView | DeloadProposalView> => {
```
After the `$transaction` that persists the check-in (and before the existing `computeProposal` + PROGRESS decision block), insert the deload branch. Replace the existing tail (`const { adj, view } = computeProposal(...)` through `return view;`) with:
```ts
      // Reactive deload supersedes progression: if consecutive-fatigue is detected,
      // propose a deload for next week INSTEAD OF a progression.
      const deload = computeDeload(loaded, input.muscles);
      // Clear any prior non-terminal proposal of EITHER type for this week.
      await ctx.db.decisionLog.deleteMany({
        where: {
          mesocycleId: loaded.mesocycle.id,
          weekIndex: input.weekIndex,
          type: { in: ["PROGRESS", "DELOAD"] },
          status: "PROPOSED",
        },
      });

      if (deload) {
        const spec = resolvedSpecFrom(loaded.cs, loaded.athlete);
        const deloaded = deloadWeekPlan(spec, EXERCISE_LIBRARY, weekPlanFromDb(deload.upcoming));
        await ctx.db.decisionLog.create({
          data: {
            mesocycleId: loaded.mesocycle.id,
            weekIndex: input.weekIndex,
            type: "DELOAD",
            status: "PROPOSED",
            summary: `Week ${input.weekIndex} check-in — early deload recommended`,
            reasoning: "consecutive_fatigue",
            payload: { fatiguedMuscles: deload.fatiguedMuscles, facts: deload.facts },
          },
        });
        return toDeloadProposalView(
          weekPlanFromDb(deload.upcoming),
          deloaded,
          deload.fatiguedMuscles,
          input.weekIndex,
        );
      }

      const { adj, view } = computeProposal(loaded, input.muscles);
      await ctx.db.decisionLog.create({
        data: {
          mesocycleId: loaded.mesocycle.id,
          weekIndex: input.weekIndex,
          type: "PROGRESS",
          status: "PROPOSED",
          summary: `Week ${input.weekIndex} check-in — progression proposed`,
          reasoning: adj.checkInValue,
          payload: {
            adjustments: adj.adjustments.map((a) => ({ ...a })),
            checkInValue: adj.checkInValue,
            facts: adj.facts,
          },
        },
      });
      return view;
```
(This replaces the old `deleteMany` + single PROGRESS `create` + `return view` — the new `deleteMany` covers both types, and each branch writes its own decision.)

- [ ] **Step 4: Add `applyDeload` + `rejectDeload` procedures**

After `applyProgression`/`rejectProgression`, add (mirroring their atomic accept-gate exactly):
```ts
  // Accept-gate commit: rebuild week N+1 as a deload. Recomputed deterministically.
  applyDeload: protectedProcedure
    .input(z.object({ weekIndex: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }): Promise<{ appliesToWeekIndex: number }> => {
      const userId = ctx.session.user.id;
      const loaded = await loadCheckInContext(ctx.db, userId, input.weekIndex);

      const pending = await ctx.db.decisionLog.findFirst({
        where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "DELOAD", status: "PROPOSED" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!pending) throw new TRPCError({ code: "BAD_REQUEST", message: "No pending deload to apply." });

      // Determinism: recompute from the persisted check-in. loadCheckInContext ran
      // AFTER submit persisted the check-in, so the current week's feedback is in
      // `loaded` — but read it explicitly and pass it, mirroring computeProposal's
      // contract (and so computeDeload's injection is a no-op that matches the DB).
      const checkIn = await ctx.db.checkIn.findFirst({
        where: { weekId: loaded.week.id, scope: "WEEK" },
        select: { muscleFeedback: { select: { muscle: true, recovery: true, jointStress: true } } },
      });
      if (!checkIn) throw new TRPCError({ code: "BAD_REQUEST", message: "Check in first." });
      const feedbackMuscles = checkIn.muscleFeedback.map((m) => ({ muscle: m.muscle, recovery: m.recovery ?? 0, joint: m.jointStress ?? 0 }));

      const deload = computeDeload(loaded, feedbackMuscles);
      if (!deload) throw new TRPCError({ code: "BAD_REQUEST", message: "A deload is no longer recommended." });

      const spec = resolvedSpecFrom(loaded.cs, loaded.athlete);
      const upcomingPlan = weekPlanFromDb(deload.upcoming);
      const newPlan = deloadWeekPlan(spec, EXERCISE_LIBRARY, upcomingPlan);

      await ctx.db.$transaction(async (tx) => {
        const claimed = await tx.decisionLog.updateMany({
          where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "DELOAD", status: "PROPOSED" },
          data: { status: "APPLIED", summary: `Week ${input.weekIndex} early deload applied to week ${deload.upcoming.index}` },
        });
        if (claimed.count !== 1) {
          throw new TRPCError({ code: "CONFLICT", message: "This deload was already applied or withdrawn — please refresh." });
        }
        const scheduled = await tx.trainingSession.count({
          where: { id: { in: upcomingPlan.sessions.map((s) => s.slotId) }, status: "SCHEDULED" },
        });
        if (scheduled !== upcomingPlan.sessions.length) {
          throw new TRPCError({ code: "CONFLICT", message: "A session changed while you were reviewing — please try again." });
        }
        await applyWeekPlanToDb(tx, deload.upcoming.id, newPlan);
        await tx.week.update({ where: { id: deload.upcoming.id }, data: { isDeload: true } });
      }, { timeout: 15000 });

      return { appliesToWeekIndex: deload.upcoming.index };
    }),

  // Decline the deload. Plan untouched.
  rejectDeload: protectedProcedure
    .input(z.object({ weekIndex: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const userId = ctx.session.user.id;
      const loaded = await loadCheckInContext(ctx.db, userId, input.weekIndex);
      const claimed = await ctx.db.decisionLog.updateMany({
        where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: "DELOAD", status: "PROPOSED" },
        data: { status: "REJECTED" },
      });
      if (claimed.count !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "No pending deload to decline." });
      return { ok: true };
    }),
```

> `deload.upcoming.id`: `computeDeload` returns the upcoming week loaded row, which includes `id` (it comes from `mesocycle.weeks`). Confirm `id` is present on the loaded week type; it is, since `loadCheckInContext` uses `include` (not a narrowed `select`) on `weeks`.

- [ ] **Step 5: Extend `getWeeklyCheckIn` status to recognize DELOAD decisions**

In `getWeeklyCheckIn`, broaden the decision query to either type:
```ts
      const decision = await ctx.db.decisionLog.findFirst({
        where: { mesocycleId: loaded.mesocycle.id, weekIndex: input.weekIndex, type: { in: ["PROGRESS", "DELOAD"] } },
        orderBy: { createdAt: "desc" },
        select: { status: true },
      });
```
(The `status` mapping below it is unchanged — APPLIED/REJECTED/SUBMITTED still derive the same way.)

- [ ] **Step 6: Add the DELOAD branch to `ProgressionProposalDialog`**

In `src/components/checkin/progression-proposal-dialog.tsx`, widen the prop and render a DELOAD variant. Change the prop type to the union and branch at the top of the render:
```tsx
import type { DeloadProposalView, ProgressionProposalView } from "~/views/types";

export function ProgressionProposalDialog({
  proposal,
  onAccept,
  onReject,
  isPending,
  errorMessage,
}: {
  proposal: ProgressionProposalView | DeloadProposalView;
  onAccept: () => void;
  onReject: () => void;
  isPending: boolean;
  errorMessage?: string;
}) {
```
Keep the existing modal keyboard-contract `useEffect` (it references `onReject` only — unchanged). Then, right after the effect and before the existing progression rendering, add the deload branch. Since the dialog body differs, wrap the existing progression markup in an `if (proposal.kind !== "DELOAD")` path and add a DELOAD path. The simplest structure that preserves the existing contract: compute the panel contents by branch. Add this near the top of the returned JSX body (inside the same panel wrapper the progression path uses — reuse the wrapper by extracting the header/rows/actions per branch). Concretely, render:
```tsx
  if (proposal.kind === "DELOAD") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onReject(); }}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="deload-title"
          className="w-full max-w-md rounded-card border border-border bg-canvas p-6 outline-none"
        >
          <h2 id="deload-title" className="text-card-title text-fg">Time to back off?</h2>
          <p className="mt-1 text-nav text-fg-muted">
            You&apos;ve been deep in fatigue two weeks running — a deload next week protects your progress.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {proposal.rows.map((r) => (
              <div key={r.muscle} className="flex items-center justify-between rounded-control border border-border-subtle px-3 py-2 text-nav">
                <span className="font-medium text-fg">{humanMuscle(r.muscle)}</span>
                <span className="text-fg-subtle">
                  {r.plannedSets} → {r.deloadedSets}{" "}
                  <span className="text-zone-rest">{r.delta}</span>
                </span>
              </div>
            ))}
          </div>
          {errorMessage ? (
            <p className="mt-3 rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">{errorMessage}</p>
          ) : null}
          <div className="mt-5 flex items-center justify-end gap-2">
            <button type="button" disabled={isPending} onClick={onReject} className="rounded-control border border-border px-4 py-2.5 text-nav text-fg-soft hover:text-fg disabled:opacity-60">Keep pushing</button>
            <button type="button" disabled={isPending} onClick={onAccept} className="rounded-control bg-accent px-5 py-2.5 text-nav font-medium text-white hover:bg-accent-strong disabled:opacity-60">Accept deload</button>
          </div>
        </div>
      </div>
    );
  }
```
Place this immediately after the `useEffect` and before the existing `const informational = …` / progression return. Reuse the existing `humanMuscle` helper and `panelRef` already defined in the file. (If `humanMuscle` is defined below the component, hoist nothing — it's a module-scope function declaration, already in scope.)

- [ ] **Step 7: Wire the flow's DELOAD mutations**

In `src/components/checkin/weekly-checkin-flow.tsx`:
- Widen the proposal state + import the union type:
```tsx
import type { DeloadProposalView, ProgressionProposalView } from "~/views/types";
// ...
  const [proposal, setProposal] = useState<ProgressionProposalView | DeloadProposalView | null>(null);
```
- Add the two deload mutations next to `apply`/`reject`:
```tsx
  const applyDeload = api.checkin.applyDeload.useMutation({
    onSuccess: async () => { setStage("closed"); await utils.checkin.getWeeklyCheckIn.invalidate({ weekIndex }); router.refresh(); },
  });
  const rejectDeload = api.checkin.rejectDeload.useMutation({
    onSuccess: async () => { setStage("closed"); await utils.checkin.getWeeklyCheckIn.invalidate({ weekIndex }); },
  });
```
- Update the proposal-stage render to route by kind:
```tsx
      {stage === "proposal" && proposal ? (
        <ProgressionProposalDialog
          proposal={proposal}
          isPending={apply.isPending || reject.isPending || applyDeload.isPending || rejectDeload.isPending}
          onAccept={() => (proposal.kind === "DELOAD" ? applyDeload.mutate({ weekIndex }) : apply.mutate({ weekIndex }))}
          onReject={() => {
            if (proposal.kind === "DELOAD") rejectDeload.mutate({ weekIndex });
            else if (proposal.kind === "CHANGES") reject.mutate({ weekIndex });
            else setStage("closed");
          }}
          errorMessage={apply.error?.message ?? reject.error?.message ?? applyDeload.error?.message ?? rejectDeload.error?.message}
        />
      ) : null}
```

- [ ] **Step 8: Gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: exit 0 / exit 0 / all pass. Fix any Prisma field-name drift, the `WeekForOutcome` cast, or `DecisionType`/`DecisionStatus` literal mismatches until clean. Let the design-detector run on the two edited components and address anything it flags.

- [ ] **Step 9: Commit**

```bash
git add src/server/api/routers/checkin.ts src/components/checkin/progression-proposal-dialog.tsx src/components/checkin/weekly-checkin-flow.tsx
git commit -m "feat(checkin): readiness-driven deload proposal (evaluateDeload → accept-gated)"
```

---

## Final verification (before offering merge)

- [ ] `pnpm typecheck` → 0 errors
- [ ] `pnpm lint` → clean
- [ ] `pnpm test` → all pass (existing + new pure tests from Tasks 1–3)
- [ ] Design detector clean on edited UI files
- [ ] Browser + Neon verification (user): drive two consecutive fatigued check-ins (muscles at MRV, recovery ≤1) → the check-in returns a **deload** proposal (not progression); Accept → week N+1 becomes a deload (≈half volume, RIR 4, marked deload) + `DecisionLog(DELOAD, APPLIED)`; "Keep pushing" → plan unchanged + `REJECTED`; a non-fatigued check-in still yields a progression proposal.
- [ ] On visual "lgtm": merge `freddy/feat/readiness-deload` → `freddy/experimental` (`--no-ff`), delete the feature branch. Do not push to origin.

## Self-Review notes

- **Spec coverage:** deloadWeekPlan §1→Task 1; weekOutcomesFromBlock §2→Task 2; view+mapper §4→Task 3; router deload branch + applyDeload/rejectDeload + status §3→Task 4; dialog+flow §5→Task 4; edge cases (N+1 absent/already-deload, <2 fatigue weeks, atomic gate) §"Error handling"→Tasks 4 (`computeDeload` guards) + engine; testing §→each task. All mapped.
- **Type consistency:** `deloadWeekPlan(spec,library,upcoming)→WeekPlan`, `weekOutcomesFromBlock(weeks)→WeekOutcome[]`, `toDeloadProposalView(upcoming,deloaded,fatiguedMuscles,fromWeekIndex)→DeloadProposalView`, `submitWeeklyCheckIn→ProgressionProposalView|DeloadProposalView`, `DeloadProposalView.kind==="DELOAD"` used identically across router/flow/dialog.
- **Placeholder scan:** clean; concrete constants (DELOAD_FRACTION 0.5, DELOAD_RIR 4). The two `>` asides in Task 4 are implementer confirmations (cast, `id` presence), not shipped placeholders.
- **Known implementer follow-ups (inline):** confirm the `WeekForOutcome` structural cast (Task 4 Step 2); confirm `id` on the loaded upcoming week (Task 4 Step 4); confirm `DecisionType` enum includes `DELOAD` (it does — verified in schema) and `type: { in: [...] }` typechecks against the Prisma enum.
