# Recovery→Form Blend (④-C-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold subjective `CheckInMuscle.recovery` into the Fitness/Fatigue/Form curve as a bounded, athlete-relative corrective nudge, keeping `computeReadiness` a pure load model.

**Architecture:** Two pure engine functions (`weeklyRecoverySignal` collapses a week's per-muscle recovery to one worst-biased scalar; `blendRecovery` bends each weekly `ReadinessSample`'s Fatigue by that scalar and recomputes Form) plus a pure adapter (`recoveryByWeekFromBlock`) feed a two-line compose step added to the existing `readiness` router. The nudge lands on Fatigue so `form = fitness − fatigue` is preserved and the chart/view/banding need no change.

**Tech Stack:** Next.js 15 (App Router / RSC), tRPC 11, Prisma 6 (Neon), Vitest, pnpm. Engine is pure TypeScript in `src/engine`.

**Spec:** `docs/superpowers/specs/2026-09-24-recovery-form-blend-design.md`

## Global Constraints

- **Law 1 (engine/data owns numbers):** every Form/Fatigue number is engine-computed; the router only loads rows and composes pure functions. The recovery scalar and the nudge magnitude come from `weeklyRecoverySignal`/`blendRecovery`, never the UI.
- **Law 2 (deterministic, no invented data):** identical logs + identical check-ins → identical series. A week with no WEEK check-in (or a check-in with no recovery values) gets **no nudge** — the sample passes through unchanged. `fitness` is never altered (it is the `Building` floor denominator).
- **Preserve the identity:** `blendRecovery` must keep `form === round1(fitness − fatigue)` true on every emitted sample. Compute the stored `form` from the **rounded** stored `fatigue` (not the pre-round value) so the three chart lines stay exactly consistent.
- **Do not touch:** `computeReadiness`, `readinessState` banding thresholds (`+5/−10/−30`), `FITNESS_FLOOR`, `ReadinessView`/`ReadinessPoint` shapes, or any UI (chart/chip/headline). This slice is a blend layer over existing samples only.
- **Engine constants (new, exact values):** `RECOVERY_NEUTRAL = 2`, `RECOVERY_NUDGE_MAX_FRAC = 0.15`, `RECOVERY_WORST_N = 2`. Recovery scale is `0 = Wrecked … 3 = Fresh` (`CheckInMuscle.recovery`, `Int?`).
- **Subagents must NOT run any DB command** (`db:push`/`db:seed`/`prisma migrate`) — Neon is off-limits; DB verification is the user's. The router task gates on `pnpm typecheck` + `pnpm lint` + `pnpm test` only.
- **Branch:** all work on `freddy/feat/recovery-form-blend`; merges into `freddy/experimental` only after the user's visual "lgtm". Nothing pushed to origin unless asked.
- **Test runner:** `pnpm test <path>` (Vitest). Gate: `pnpm typecheck` (0 errors) + `pnpm lint` (clean; the 3 pre-existing warnings in `logging.test.ts`/`onboarding.test.ts`/`mock-block.ts` are acceptable). Full suite `pnpm test` stays green.

---

### Task 1: Engine — constants + `weeklyRecoverySignal`

**Files:**
- Modify: `src/engine/constants.ts` (add 3 recovery-blend constants)
- Modify: `src/engine/readiness.ts` (add `weeklyRecoverySignal`)
- Modify: `src/engine/index.ts` (export `weeklyRecoverySignal`)
- Test: `src/engine/readiness.test.ts` (add a `weeklyRecoverySignal` describe block)

**Interfaces:**
- Consumes: `RECOVERY_WORST_N` (`./constants`).
- Produces: `weeklyRecoverySignal(recoveries: (number | null)[]): number | null` — consumed by Tasks 2 and 3. Worst-biased: drops nulls, returns `null` when none remain, else the mean of the `RECOVERY_WORST_N` lowest values (or all, if fewer).

- [ ] **Step 1: Add the constants**

Append to `src/engine/constants.ts` (after the reactive-deload block at the end):
```ts
// ─── Readiness ↔ recovery blend (④-C-2) ───

/** Recovery scale is 0=Wrecked … 3=Fresh; "Okay" (2) is the zero-nudge anchor. */
export const RECOVERY_NEUTRAL = 2;
/** Max fraction of `fitness` the recovery nudge can move Form (at recovery 0). */
export const RECOVERY_NUDGE_MAX_FRAC = 0.15;
/** # of least-recovered muscles averaged into the weekly signal (mirrors FATIGUE_MUSCLE_THRESHOLD). */
export const RECOVERY_WORST_N = 2;
```

- [ ] **Step 2: Write the failing test**

Append to `src/engine/readiness.test.ts` (and add `weeklyRecoverySignal` to the existing top import from `./readiness`):
```ts
describe("weeklyRecoverySignal", () => {
  it("averages the two least-recovered muscles (worst-biased)", () => {
    expect(weeklyRecoverySignal([0, 1, 2, 3])).toBeCloseTo(0.5); // worst two: 0,1
  });

  it("averages all when fewer than RECOVERY_WORST_N muscles reported", () => {
    expect(weeklyRecoverySignal([3, 1])).toBeCloseTo(2); // both count
    expect(weeklyRecoverySignal([2])).toBeCloseTo(2);
  });

  it("ignores nulls", () => {
    expect(weeklyRecoverySignal([null, 2, null, 0])).toBeCloseTo(1); // worst two of {2,0}: 0,2
  });

  it("returns null when no muscle reported a value", () => {
    expect(weeklyRecoverySignal([null, null])).toBeNull();
    expect(weeklyRecoverySignal([])).toBeNull();
  });
});
```
Update the import line at the top of the file:
```ts
import {
  computeReadiness,
  sessionStimulus,
  weeklyRecoverySignal,
  type LoadEvent,
  type WeekEnd,
} from "./readiness";
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/engine/readiness.test.ts`
Expected: FAIL (`weeklyRecoverySignal` is not exported / not a function).

- [ ] **Step 4: Write the implementation**

Add to `src/engine/readiness.ts` (import the constant at the top: `import { RECOVERY_WORST_N } from "./constants";`, alongside the existing `round1` import):
```ts
/** Worst-biased weekly recovery: the mean of the RECOVERY_WORST_N least-recovered
 * muscles (or all, if fewer). null when no muscle reported a recovery value. Pure. */
export function weeklyRecoverySignal(recoveries: (number | null)[]): number | null {
  const present = recoveries.filter((r): r is number => r !== null);
  if (present.length === 0) return null;
  const worst = [...present].sort((a, b) => a - b).slice(0, RECOVERY_WORST_N);
  return worst.reduce((sum, r) => sum + r, 0) / worst.length;
}
```
Add to `src/engine/index.ts` (merge into the existing readiness export line):
```ts
export { sessionStimulus, computeReadiness, weeklyRecoverySignal } from "./readiness";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/engine/readiness.test.ts`
Expected: PASS (existing `sessionStimulus`/`computeReadiness` tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/engine/constants.ts src/engine/readiness.ts src/engine/index.ts src/engine/readiness.test.ts
git commit -m "feat(engine): weeklyRecoverySignal + recovery-blend constants"
```

---

### Task 2: Engine — `blendRecovery`

**Files:**
- Modify: `src/engine/readiness.ts` (add `blendRecovery`)
- Modify: `src/engine/index.ts` (export `blendRecovery`)
- Test: `src/engine/readiness.test.ts` (add a `blendRecovery` describe block)

**Interfaces:**
- Consumes: `RECOVERY_NEUTRAL`, `RECOVERY_NUDGE_MAX_FRAC` (`./constants`); `round1` (`./util`); `ReadinessSample` (local type).
- Produces: `blendRecovery(samples: ReadinessSample[], recoveryByWeek: Map<number, number | null>): ReadinessSample[]` — consumed by Task 4. Each sample's Fatigue is nudged by that week's recovery signal (worse recovery ⇒ more Fatigue ⇒ lower Form); Form is recomputed from the rounded Fatigue so `form === round1(fitness − fatigue)` holds. Weeks absent from the map, or mapped to `null`, pass through unchanged. `fitness` is never altered.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/readiness.test.ts` (add `blendRecovery` and `type ReadinessSample` to the import from `./readiness`):
```ts
describe("blendRecovery", () => {
  // load-form: fitness 20, fatigue 10, form 10
  const base: ReadinessSample[] = [{ weekIndex: 1, fitness: 20, fatigue: 10, form: 10 }];

  it("neutral recovery (2) is the identity", () => {
    expect(blendRecovery(base, new Map([[1, 2]]))).toEqual(base);
  });

  it("wrecked (0) drops Form by ~15% of fitness (Fatigue up)", () => {
    const [s] = blendRecovery(base, new Map([[1, 0]]));
    expect(s!.fatigue).toBeCloseTo(13); // +0.15*20
    expect(s!.form).toBeCloseTo(7); // 20 - 13
    expect(s!.fitness).toBe(20); // untouched
  });

  it("fresh (3) lifts Form by ~7.5% of fitness (Fatigue down)", () => {
    const [s] = blendRecovery(base, new Map([[1, 3]]));
    expect(s!.fatigue).toBeCloseTo(8.5); // -0.5*0.15*20
    expect(s!.form).toBeCloseTo(11.5);
  });

  it("passes weeks through unchanged when absent from the map or mapped to null", () => {
    expect(blendRecovery(base, new Map())).toEqual(base);
    expect(blendRecovery(base, new Map([[1, null]]))).toEqual(base);
  });

  it("preserves form === round1(fitness - fatigue) on every output", () => {
    const samples: ReadinessSample[] = [
      { weekIndex: 1, fitness: 17.3, fatigue: 9.1, form: 8.2 },
      { weekIndex: 2, fitness: 22.6, fatigue: 14.4, form: 8.2 },
    ];
    const out = blendRecovery(samples, new Map([[1, 0], [2, 3]]));
    for (const s of out) expect(s.form).toBeCloseTo(Math.round((s.fitness - s.fatigue) * 10) / 10);
  });

  it("returns [] for an empty series", () => {
    expect(blendRecovery([], new Map([[1, 0]]))).toEqual([]);
  });
});
```
Update the import at the top of the file to also include `blendRecovery` and `type ReadinessSample`:
```ts
import {
  blendRecovery,
  computeReadiness,
  sessionStimulus,
  weeklyRecoverySignal,
  type LoadEvent,
  type ReadinessSample,
  type WeekEnd,
} from "./readiness";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/engine/readiness.test.ts`
Expected: FAIL (`blendRecovery` not exported).

- [ ] **Step 3: Write the implementation**

Add to `src/engine/readiness.ts` (extend the constants import to include `RECOVERY_NEUTRAL, RECOVERY_NUDGE_MAX_FRAC`):
```ts
/**
 * Bounded, athlete-relative corrective nudge: each week's recovery signal bends
 * that week's Fatigue (Form recomputed as fitness − fatigue'). Neutral at
 * RECOVERY_NEUTRAL; worse recovery raises Fatigue (lower Form), better lowers it.
 * Weeks absent from the map — or mapped to null — pass through unchanged (Law 2).
 * fitness is never touched; form stays === round1(fitness − fatigue). Pure.
 */
export function blendRecovery(
  samples: ReadinessSample[],
  recoveryByWeek: Map<number, number | null>,
): ReadinessSample[] {
  return samples.map((s) => {
    const r = recoveryByWeek.get(s.weekIndex);
    if (r === undefined || r === null) return s;
    const deviation = (RECOVERY_NEUTRAL - r) / RECOVERY_NEUTRAL; // r2→0, r0→+1, r3→−0.5
    const fatigue = round1(s.fatigue + deviation * RECOVERY_NUDGE_MAX_FRAC * s.fitness);
    return { weekIndex: s.weekIndex, fitness: s.fitness, fatigue, form: round1(s.fitness - fatigue) };
  });
}
```
Add to `src/engine/index.ts` (merge into the readiness export line):
```ts
export { sessionStimulus, computeReadiness, weeklyRecoverySignal, blendRecovery } from "./readiness";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/engine/readiness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/readiness.ts src/engine/index.ts src/engine/readiness.test.ts
git commit -m "feat(engine): blendRecovery — bounded athlete-relative recovery→Form nudge"
```

---

### Task 3: `recoveryByWeekFromBlock` adapter

**Files:**
- Create: `src/server/mesocycle/recovery-by-week.ts`
- Test: `src/server/mesocycle/recovery-by-week.test.ts`

**Interfaces:**
- Consumes: `weeklyRecoverySignal` (`~/engine`).
- Produces: type `BlockForRecovery` and `recoveryByWeekFromBlock(block: BlockForRecovery): Map<number, number | null>` — consumed by Task 4. Maps `week.index → weeklyRecoverySignal(...)` for each week that has a `scope === "WEEK"` check-in; weeks without a WEEK check-in are absent from the map.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/mesocycle/recovery-by-week.test.ts
import { describe, expect, it } from "vitest";
import { recoveryByWeekFromBlock, type BlockForRecovery } from "./recovery-by-week";

function block(weeks: BlockForRecovery["weeks"]): BlockForRecovery {
  return { weeks };
}

describe("recoveryByWeekFromBlock", () => {
  it("maps week.index → worst-biased recovery for weeks with a WEEK check-in", () => {
    const map = recoveryByWeekFromBlock(
      block([
        {
          index: 1,
          checkIns: [{ scope: "WEEK", muscleFeedback: [{ recovery: 0 }, { recovery: 1 }, { recovery: 3 }] }],
        },
      ]),
    );
    expect(map.get(1)).toBeCloseTo(0.5); // worst two: 0,1
  });

  it("omits weeks with no WEEK check-in", () => {
    const map = recoveryByWeekFromBlock(block([{ index: 2, checkIns: [] }]));
    expect(map.has(2)).toBe(false);
  });

  it("ignores non-WEEK check-ins", () => {
    const map = recoveryByWeekFromBlock(
      block([{ index: 3, checkIns: [{ scope: "SESSION", muscleFeedback: [{ recovery: 0 }] }] }]),
    );
    expect(map.has(3)).toBe(false);
  });

  it("maps to null when the WEEK check-in has no recovery values", () => {
    const map = recoveryByWeekFromBlock(
      block([{ index: 4, checkIns: [{ scope: "WEEK", muscleFeedback: [{ recovery: null }] }] }]),
    );
    expect(map.get(4)).toBeNull();
    expect(map.has(4)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/mesocycle/recovery-by-week.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/server/mesocycle/recovery-by-week.ts
import { weeklyRecoverySignal } from "~/engine";

export interface BlockForRecovery {
  weeks: {
    index: number;
    checkIns: { scope: string; muscleFeedback: { recovery: number | null }[] }[];
  }[];
}

/** Map week.index → worst-biased weekly recovery signal, for weeks that have a
 * WEEK check-in. Weeks with no WEEK check-in are absent from the map (→ no nudge).
 * A WEEK check-in with no recovery values maps to null (also → no nudge). Pure. */
export function recoveryByWeekFromBlock(block: BlockForRecovery): Map<number, number | null> {
  const map = new Map<number, number | null>();
  for (const week of block.weeks) {
    const checkIn = week.checkIns.find((c) => c.scope === "WEEK");
    if (!checkIn) continue;
    map.set(week.index, weeklyRecoverySignal(checkIn.muscleFeedback.map((m) => m.recovery)));
  }
  return map;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/server/mesocycle/recovery-by-week.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/mesocycle/recovery-by-week.ts src/server/mesocycle/recovery-by-week.test.ts
git commit -m "feat(mesocycle): recoveryByWeekFromBlock adapter"
```

---

### Task 4: Wire the blend into `getReadiness`

**Files:**
- Modify: `src/server/api/routers/readiness.ts` (check-in include on the `weeks` select; compose `recoveryByWeekFromBlock` + `blendRecovery`)

**Interfaces:**
- Consumes: `blendRecovery` (`~/engine`); `recoveryByWeekFromBlock` (`~/server/mesocycle/recovery-by-week`); everything `getReadiness` already imports.
- Produces: no new export — `getReadiness` now returns the blended `ReadinessView`. Shape unchanged.

**Gate:** DB-bound, so `pnpm typecheck` + `pnpm lint` + `pnpm test` (the pure tests from Tasks 1–3 must stay green; there is no runnable test for the router). No DB commands.

- [ ] **Step 1: Add imports**

At the top of `src/server/api/routers/readiness.ts`:
```ts
import { computeReadiness, blendRecovery } from "~/engine";
import { recoveryByWeekFromBlock } from "~/server/mesocycle/recovery-by-week";
```
(Merge `blendRecovery` into the existing `~/engine` import that already brings in `computeReadiness`.)

- [ ] **Step 2: Extend the `weeks` select to load index + WEEK check-in recovery**

In the `mesocycle.findFirst` `select.weeks.select`, add `index` and a filtered `checkIns` include alongside the existing `sessions` select:
```ts
        weeks: {
          select: {
            index: true,
            sessions: {
              select: {
                status: true,
                completedAt: true,
                prescriptions: { select: { setLogs: { select: { achievedRir: true } } } },
              },
            },
            checkIns: {
              where: { scope: "WEEK" },
              select: { scope: true, muscleFeedback: { select: { recovery: true } } },
            },
          },
        },
```
(`readinessInputsFromBlock` ignores the extra `index`/`checkIns` fields; harmless.)

- [ ] **Step 3: Compose the blend in the query body**

Replace the tail (`const samples = computeReadiness(...)` … `return toReadinessView(samples, curIdx);`) with:
```ts
    const samples = computeReadiness(inputs.events, inputs.weekEnds);
    const recovery = recoveryByWeekFromBlock(block);
    const blended = blendRecovery(samples, recovery);
    return toReadinessView(blended, curIdx);
```
`block` already satisfies `BlockForRecovery` structurally (weeks with `index` + WEEK `checkIns` → `muscleFeedback.recovery`). If TypeScript complains about the structural match, adjust the `select` — do NOT change `BlockForRecovery`.

- [ ] **Step 4: Gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: exit 0 / exit 0 / all pass (existing + the new pure tests from Tasks 1–3).

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/readiness.ts
git commit -m "feat(readiness): blend subjective recovery into the Form curve"
```

---

## Final verification (before offering merge)

- [ ] `pnpm typecheck` → 0 errors
- [ ] `pnpm lint` → clean
- [ ] `pnpm test` → all pass (existing + new pure tests from Tasks 1–3)
- [ ] Browser + Neon verification (user): a block with two "wrecked" WEEK check-ins (low recovery) shows a visibly **lower** Form than logged load alone predicts, with the Fatigue line lifting on those weeks; a "Fresh" week lifts Form; a block with **no** check-ins renders identically to ④-B (pure load-Form); banded state on the Readiness page + the Now-home Form chip both move consistently.
- [ ] On visual "lgtm": merge `freddy/feat/recovery-form-blend` → `freddy/experimental` (`--no-ff`), delete the feature branch. Do not push to origin.

## Self-Review notes

- **Spec coverage:** `weeklyRecoverySignal` (§1) → Task 1; `blendRecovery` (§2) → Task 2; `recoveryByWeekFromBlock` (§3) → Task 3; constants (§4) → Task 1; router include + compose (§5) → Task 4. Edge cases (missing week, null signal, empty series, identity preservation, fitness untouched) → Task 2/3 tests + Task 4 Law-2 pass-through. All mapped.
- **Type consistency:** `weeklyRecoverySignal(recoveries: (number|null)[]) → number|null`, `blendRecovery(samples, Map<number, number|null>) → ReadinessSample[]`, `recoveryByWeekFromBlock(BlockForRecovery) → Map<number, number|null>` used identically across engine/adapter/router. `RECOVERY_NEUTRAL/RECOVERY_NUDGE_MAX_FRAC/RECOVERY_WORST_N` referenced by symbol everywhere.
- **Placeholder scan:** clean; concrete constants and concrete test magnitudes (fitness 20 → 15%/7.5% moves = Fatigue 13 / 8.5).
- **Identity note (plan refinement over spec):** the stored `form` is computed from the **rounded** stored `fatigue` so `form === round1(fitness − fatigue)` holds exactly (the spec wrote the two rounds separately; this ordering guarantees chart-line consistency). No behavior change beyond sub-0.1 rounding.
