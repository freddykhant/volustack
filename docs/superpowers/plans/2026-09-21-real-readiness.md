# Real Readiness from Logged Load (④-B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the faked `mockReadiness` with real Fitness/Fatigue/Form computed from logged training load (a Banister/PMC model over per-session stimulus), banded athlete-relatively.

**Architecture:** A pure engine core (`sessionStimulus` → per-session load; `computeReadiness` → daily EWMA PMC sampled weekly) feeds a new `readiness` tRPC query via a pure DB adapter. Banding moves to an athlete-relative `formPct = form/fitness` with a cold-start `Building` state. The Readiness page and Now-home chip swap off the fixture. The existing `ReadinessView`/`ReadinessPoint` shapes are unchanged, so the chart is untouched.

**Tech Stack:** Next.js 15 (App Router / RSC), tRPC 11, Prisma 6 (Neon), Vitest, pnpm. Engine is pure TypeScript in `src/engine`.

**Spec:** `docs/superpowers/specs/2026-09-21-real-readiness-design.md`

## Global Constraints

- **Law 1 (engine/data owns numbers):** every readiness number (fitness/fatigue/form) is computed by the engine; UI/mappers only reshape and classify. `readinessState` is classification-only.
- **Law 2 (deterministic):** identical logs → identical readiness; no invented data points, no assumed pre-block history (EWMA seeds at 0).
- **Load metric:** stimulus sets, weight-agnostic. `w(achievedRir)`: `null`→0.7, ≤1→1.0, ≤3→0.7, else→0.4.
- **Model constants (tunable, exact defaults):** `τ_fit = 21` days, `τ_fat = 7` days; daily EWMA `k = 1 − e^(−1/τ)`.
- **Bands on `formPct = form/fitness`:** ≥ +0.05 Fresh · ≥ −0.10 Productive · ≥ −0.30 Fatigued · else Overreaching. `fitness < FITNESS_FLOOR (= 1.5)` → **Building**.
- **Scope:** load-only. Do NOT read `CheckInMuscle.recovery` (that's ④-C).
- **Subagents must NOT run any DB command** (`db:push`/`db:seed`/`prisma migrate`) — Neon is off-limits; DB verification is the user's. DB-bound tasks gate on `pnpm typecheck` + `pnpm lint` only.
- **Branch:** all work on `freddy/feat/real-readiness`; merges into `freddy/experimental` only after the user's visual "lgtm". Nothing pushed to origin unless asked.
- **UI tokens:** dark app-shell-kit; accent scarce; `zone-*` for data semantics only (the chip dot), never chrome.
- **Test runner:** `pnpm test <path>` (Vitest). Gate: `pnpm typecheck` (0 errors) + `pnpm lint` (clean; 3 pre-existing warnings in unrelated files are acceptable). Full suite `pnpm test` must stay green.

---

### Task 1: Engine — `sessionStimulus` + `computeReadiness`

**Files:**
- Create: `src/engine/readiness.ts`
- Test: `src/engine/readiness.test.ts`
- Modify: `src/engine/index.ts` (export the new symbols + types)

**Interfaces:**
- Consumes: `round1` from `./util`.
- Produces:
  - `sessionStimulus(sets: { achievedRir: number | null }[]): number`
  - types `LoadEvent { dayOffset: number; load: number }`, `WeekEnd { weekIndex: number; dayOffset: number }`, `ReadinessSample { weekIndex: number; fitness: number; fatigue: number; form: number }`, `ReadinessOpts { tauFit: number; tauFat: number }`
  - `computeReadiness(events: LoadEvent[], weekEnds: WeekEnd[], opts?: ReadinessOpts): ReadinessSample[]`
  - consumed by Tasks 3–5.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/readiness.test.ts
import { describe, expect, it } from "vitest";
import { computeReadiness, sessionStimulus, type LoadEvent, type WeekEnd } from "./readiness";

describe("sessionStimulus", () => {
  it("weights sets by RIR (null→0.7, ≤1→1.0, ≤3→0.7, ≥4→0.4)", () => {
    expect(sessionStimulus([{ achievedRir: 0 }, { achievedRir: 1 }])).toBeCloseTo(2.0);
    expect(sessionStimulus([{ achievedRir: 2 }, { achievedRir: 3 }])).toBeCloseTo(1.4);
    expect(sessionStimulus([{ achievedRir: 4 }, { achievedRir: 6 }])).toBeCloseTo(0.8);
    expect(sessionStimulus([{ achievedRir: null }])).toBeCloseTo(0.7);
    expect(sessionStimulus([])).toBe(0);
  });
});

describe("computeReadiness", () => {
  const weeks: WeekEnd[] = [1, 2, 3].map((w) => ({ weekIndex: w, dayOffset: w * 7 - 1 }));

  it("returns [] for no events", () => {
    expect(computeReadiness([], weeks)).toEqual([]);
  });

  it("fatigue reacts faster than fitness to a load block, so form goes negative then recovers", () => {
    // heavy load days 0-13 (weeks 1-2), then rest through week 3
    const events: LoadEvent[] = [];
    for (let d = 0; d < 14; d++) events.push({ dayOffset: d, load: 10 });
    const out = computeReadiness(events, weeks, { tauFit: 21, tauFat: 7 });
    expect(out.map((s) => s.weekIndex)).toEqual([1, 2, 3]);
    // during loading, fatigue > fitness → form negative
    expect(out[1]!.form).toBeLessThan(0);
    expect(out[1]!.fatigue).toBeGreaterThan(out[1]!.fitness);
    // after a rest week, fatigue decays below fitness → form rebounds upward
    expect(out[2]!.form).toBeGreaterThan(out[1]!.form);
  });

  it("samples the decayed curve at each week end even for weeks with no load", () => {
    const out = computeReadiness([{ dayOffset: 0, load: 10 }], weeks);
    expect(out).toHaveLength(3);
    // fitness present at week 1, still decaying (not zero) by week 3
    expect(out[0]!.fitness).toBeGreaterThan(0);
    expect(out[2]!.fitness).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/engine/readiness.test.ts`
Expected: FAIL (module `./readiness` not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/readiness.ts
import { round1 } from "./util";

/** Weight-agnostic per-set stimulus weight by proximity to failure. */
function setWeight(achievedRir: number | null): number {
  if (achievedRir === null) return 0.7;
  if (achievedRir <= 1) return 1.0;
  if (achievedRir <= 3) return 0.7;
  return 0.4;
}

/** A session's training stimulus: Σ per-set RIR weights. Weight-agnostic (Law 1:
 * a hypertrophy fatigue proxy, in the same "sets" currency as the volume engine). */
export function sessionStimulus(sets: { achievedRir: number | null }[]): number {
  return sets.reduce((sum, s) => sum + setWeight(s.achievedRir), 0);
}

export interface LoadEvent {
  dayOffset: number; // whole days since block start
  load: number;
}
export interface WeekEnd {
  weekIndex: number;
  dayOffset: number; // block-relative last day of the week
}
export interface ReadinessSample {
  weekIndex: number;
  fitness: number;
  fatigue: number;
  form: number;
}
export interface ReadinessOpts {
  tauFit: number;
  tauFat: number;
}
const DEFAULT_OPTS: ReadinessOpts = { tauFit: 21, tauFat: 7 };

/**
 * Banister PMC on a daily grid: fitness = slow EWMA of daily load, fatigue = fast
 * EWMA, form = fitness − fatigue. Sampled at each week end. Seeds at 0 (Law 2: no
 * assumed pre-block history). Empty events ⇒ [] (caller renders "not enough data").
 */
export function computeReadiness(
  events: LoadEvent[],
  weekEnds: WeekEnd[],
  opts: ReadinessOpts = DEFAULT_OPTS,
): ReadinessSample[] {
  if (events.length === 0 || weekEnds.length === 0) return [];

  const daily = new Map<number, number>();
  for (const e of events) daily.set(e.dayOffset, (daily.get(e.dayOffset) ?? 0) + e.load);

  const kFit = 1 - Math.exp(-1 / opts.tauFit);
  const kFat = 1 - Math.exp(-1 / opts.tauFat);
  const weekAt = new Map<number, number>(); // dayOffset → weekIndex
  for (const w of weekEnds) weekAt.set(w.dayOffset, w.weekIndex);
  const maxDay = Math.max(...weekEnds.map((w) => w.dayOffset));

  let fitness = 0;
  let fatigue = 0;
  const byWeek = new Map<number, ReadinessSample>();
  for (let d = 0; d <= maxDay; d++) {
    const load = daily.get(d) ?? 0;
    fitness += (load - fitness) * kFit;
    fatigue += (load - fatigue) * kFat;
    const wk = weekAt.get(d);
    if (wk !== undefined) {
      byWeek.set(wk, {
        weekIndex: wk,
        fitness: round1(fitness),
        fatigue: round1(fatigue),
        form: round1(fitness - fatigue),
      });
    }
  }
  return weekEnds.map((w) => byWeek.get(w.weekIndex)).filter((s): s is ReadinessSample => s !== undefined);
}
```

Add to `src/engine/index.ts`:
```ts
export { sessionStimulus, computeReadiness } from "./readiness";
export type { LoadEvent, WeekEnd, ReadinessSample, ReadinessOpts } from "./readiness";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/engine/readiness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/readiness.ts src/engine/readiness.test.ts src/engine/index.ts
git commit -m "feat(engine): sessionStimulus + computeReadiness (Banister PMC)"
```

---

### Task 2: Rework banding to athlete-relative % + `Building`, update consumers

**Files:**
- Modify: `src/views/types.ts` (`ReadinessLabel += "Building"`)
- Modify: `src/components/viz/readiness-state.ts` (point-based `readinessState`, `FITNESS_FLOOR`)
- Test: `src/components/viz/readiness-state.test.ts` (create if absent)
- Modify: `src/components/readiness/readiness-chip.tsx` (Building DOT + pass point)
- Modify: `src/components/readiness/readiness-headline.tsx` (Form %, Building case)
- Modify: `src/app/app/page.tsx` (pass point to `readinessState`)

**Interfaces:**
- Consumes: `ReadinessLabel`, `ReadinessView` (`~/views/types`).
- Produces: `readinessState(point: { fitness: number; form: number }): ReadinessLabel`, `FITNESS_FLOOR: number` — consumed by chip/headline/home and unchanged after Task 6's data swap.

**Note:** consumers still render `mockReadiness` after this task (data swap is Task 6). This task must leave typecheck/lint green — every `readinessState` call site changes from `.form` to the point, and the chip's `Record<ReadinessLabel,…>` DOT map gains a `Building` key.

- [ ] **Step 1: Add `Building` to the label union**

In `src/views/types.ts`:
```ts
export type ReadinessLabel = "Fresh" | "Productive" | "Fatigued" | "Overreaching" | "Building";
```

- [ ] **Step 2: Write the failing test**

```ts
// src/components/viz/readiness-state.test.ts
import { describe, expect, it } from "vitest";
import { readinessState, FITNESS_FLOOR } from "./readiness-state";

describe("readinessState", () => {
  it("returns Building when fitness is below the floor", () => {
    expect(readinessState({ fitness: FITNESS_FLOOR - 0.1, form: 0 })).toBe("Building");
  });
  it("bands on form/fitness percentage", () => {
    expect(readinessState({ fitness: 10, form: 1 })).toBe("Fresh"); // +10%
    expect(readinessState({ fitness: 10, form: 0 })).toBe("Productive"); // 0%
    expect(readinessState({ fitness: 10, form: -2 })).toBe("Fatigued"); // -20%
    expect(readinessState({ fitness: 10, form: -4 })).toBe("Overreaching"); // -40%
  });
  it("uses inclusive lower boundaries (+5% Fresh, -10% Productive, -30% Fatigued)", () => {
    expect(readinessState({ fitness: 100, form: 5 })).toBe("Fresh");
    expect(readinessState({ fitness: 100, form: -10 })).toBe("Productive");
    expect(readinessState({ fitness: 100, form: -30 })).toBe("Fatigued");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/components/viz/readiness-state.test.ts`
Expected: FAIL (`FITNESS_FLOOR` not exported / signature mismatch).

- [ ] **Step 4: Rework `readinessState`**

Replace the body of `src/components/viz/readiness-state.ts`:
```ts
import type { ReadinessLabel } from "~/views/types";

/** Below this settled-fitness level there is too little logged load to judge form. */
export const FITNESS_FLOOR = 1.5;

/** Band Form as a fraction of Fitness (athlete-relative, TSB-style). Classification
 * only — invents no numbers (Law 1). Cold start (fitness below floor) → Building. */
export function readinessState(point: { fitness: number; form: number }): ReadinessLabel {
  if (point.fitness < FITNESS_FLOOR) return "Building";
  const pct = point.form / point.fitness;
  if (pct >= 0.05) return "Fresh";
  if (pct >= -0.1) return "Productive";
  if (pct >= -0.3) return "Fatigued";
  return "Overreaching";
}
```

- [ ] **Step 5: Update the chip (Building DOT + pass point)**

In `src/components/readiness/readiness-chip.tsx`, add the `Building` key and pass the point:
```ts
const DOT: Record<ReadinessLabel, string> = {
  Fresh: "bg-zone-optimal",
  Productive: "bg-zone-building",
  Fatigued: "bg-zone-rest",
  Overreaching: "bg-zone-max",
  Building: "bg-fg-muted",
};
```
and change `const state = readinessState(current.form);` → `const state = readinessState(current);`.

- [ ] **Step 6: Update the headline (Form %, Building case)**

In `src/components/readiness/readiness-headline.tsx`, import the floor and render Form as a percentage:
```tsx
import { readinessState, FITNESS_FLOOR } from "~/components/viz/readiness-state";
// ...
  const state = readinessState(current);
  const pct =
    current.fitness >= FITNESS_FLOOR ? Math.round((current.form / current.fitness) * 100) : null;
```
Then in the Form cell, replace the numeric form display with:
```tsx
          <div className="mt-1 text-section text-fg tabular-nums">
            {pct === null ? "—" : pct > 0 ? `+${pct}%` : `${pct}%`}
          </div>
```
(Leave the Fitness and Fatigue cells showing `current.fitness` / `current.fatigue`.)

- [ ] **Step 7: Update Now-home call site**

In `src/app/app/page.tsx`, change:
```ts
  const readinessLabel = readinessPoint ? readinessState(readinessPoint) : undefined;
```
(pass the point, not `.form`).

- [ ] **Step 8: Verify tests + gate**

Run: `pnpm test src/components/viz/readiness-state.test.ts && pnpm typecheck && pnpm lint`
Expected: test PASS; typecheck 0 errors; lint clean.

- [ ] **Step 9: Commit**

```bash
git add src/views/types.ts src/components/viz/readiness-state.ts src/components/viz/readiness-state.test.ts src/components/readiness/readiness-chip.tsx src/components/readiness/readiness-headline.tsx src/app/app/page.tsx
git commit -m "feat(readiness): athlete-relative form% banding + Building state"
```

---

### Task 3: `readinessInputsFromBlock` adapter

**Files:**
- Create: `src/server/mesocycle/readiness-inputs.ts`
- Test: `src/server/mesocycle/readiness-inputs.test.ts`

**Interfaces:**
- Consumes: `sessionStimulus`, types `LoadEvent`, `WeekEnd` (`~/engine`).
- Produces: types `BlockForReadiness` and `readinessInputsFromBlock(block: BlockForReadiness): { events: LoadEvent[]; weekEnds: WeekEnd[] } | null` — consumed by Task 5. `null` when the block has no `startDate`.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/mesocycle/readiness-inputs.test.ts
import { describe, expect, it } from "vitest";
import { readinessInputsFromBlock, type BlockForReadiness } from "./readiness-inputs";

const start = new Date("2026-01-01T00:00:00Z");
function block(over: Partial<BlockForReadiness> = {}): BlockForReadiness {
  return {
    startDate: start,
    lengthWeeks: 2,
    weeks: [
      {
        sessions: [
          {
            status: "COMPLETED",
            completedAt: new Date("2026-01-02T10:00:00Z"), // day 1
            prescriptions: [{ setLogs: [{ achievedRir: 1 }, { achievedRir: 1 }] }],
          },
          {
            status: "SCHEDULED",
            completedAt: null,
            prescriptions: [{ setLogs: [] }],
          },
        ],
      },
    ],
    ...over,
  };
}

describe("readinessInputsFromBlock", () => {
  it("returns null when the block has no startDate", () => {
    expect(readinessInputsFromBlock(block({ startDate: null }))).toBeNull();
  });
  it("emits an event only for COMPLETED sessions, at completedAt's day offset", () => {
    const out = readinessInputsFromBlock(block());
    expect(out).not.toBeNull();
    expect(out!.events).toEqual([{ dayOffset: 1, load: 2 }]); // two RIR-1 sets → 2.0
  });
  it("emits a week end at w*7-1 for each week", () => {
    const out = readinessInputsFromBlock(block());
    expect(out!.weekEnds).toEqual([
      { weekIndex: 1, dayOffset: 6 },
      { weekIndex: 2, dayOffset: 13 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/mesocycle/readiness-inputs.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/server/mesocycle/readiness-inputs.ts
import { sessionStimulus, type LoadEvent, type WeekEnd } from "~/engine";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BlockForReadiness {
  startDate: Date | null;
  lengthWeeks: number;
  weeks: {
    sessions: {
      status: string;
      completedAt: Date | null;
      prescriptions: { setLogs: { achievedRir: number | null }[] }[];
    }[];
  }[];
}

/** Turn a persisted ACTIVE block into readiness model inputs: one LoadEvent per
 * COMPLETED session (stimulus at its completedAt day offset) + a week-end offset
 * per week. Null when the block has no timeline (no startDate). Pure. */
export function readinessInputsFromBlock(
  block: BlockForReadiness,
): { events: LoadEvent[]; weekEnds: WeekEnd[] } | null {
  if (!block.startDate) return null;
  const start = block.startDate.getTime();

  const events: LoadEvent[] = [];
  for (const week of block.weeks) {
    for (const s of week.sessions) {
      if (s.status !== "COMPLETED" || !s.completedAt) continue;
      const dayOffset = Math.floor((s.completedAt.getTime() - start) / DAY_MS);
      const load = sessionStimulus(s.prescriptions.flatMap((p) => p.setLogs));
      events.push({ dayOffset, load });
    }
  }

  const weekEnds: WeekEnd[] = Array.from({ length: block.lengthWeeks }, (_, i) => ({
    weekIndex: i + 1,
    dayOffset: (i + 1) * 7 - 1,
  }));

  return { events, weekEnds };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/server/mesocycle/readiness-inputs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/mesocycle/readiness-inputs.ts src/server/mesocycle/readiness-inputs.test.ts
git commit -m "feat(mesocycle): readinessInputsFromBlock adapter"
```

---

### Task 4: `toReadinessView` mapper

**Files:**
- Create: `src/views/readiness.ts`
- Test: `src/views/readiness.test.ts`

**Interfaces:**
- Consumes: `ReadinessSample` (`~/engine`), `ReadinessView` (`~/views/types`).
- Produces: `toReadinessView(samples: ReadinessSample[], currentWeekIndex: number): ReadinessView` — consumed by Task 5. `ReadinessSample` and `ReadinessPoint` are field-identical (`weekIndex/fitness/fatigue/form`), so this is a thin, Law-1 wrapper (no number invented).

- [ ] **Step 1: Write the failing test**

```ts
// src/views/readiness.test.ts
import { describe, expect, it } from "vitest";
import { toReadinessView } from "./readiness";

describe("toReadinessView", () => {
  it("wraps samples into a ReadinessView with the current week index", () => {
    const samples = [
      { weekIndex: 1, fitness: 3, fatigue: 4, form: -1 },
      { weekIndex: 2, fitness: 5, fatigue: 4, form: 1 },
    ];
    expect(toReadinessView(samples, 2)).toEqual({ series: samples, currentWeekIndex: 2 });
  });
  it("passes an empty series through", () => {
    expect(toReadinessView([], 1)).toEqual({ series: [], currentWeekIndex: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/views/readiness.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/views/readiness.ts
import type { ReadinessSample } from "~/engine";
import type { ReadinessView } from "./types";

/** Wrap engine readiness samples into the view model. Samples are field-identical
 * to ReadinessPoint; no numbers invented (Law 1). */
export function toReadinessView(samples: ReadinessSample[], currentWeekIndex: number): ReadinessView {
  return { series: samples, currentWeekIndex };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/views/readiness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/readiness.ts src/views/readiness.test.ts
git commit -m "feat(views): toReadinessView mapper"
```

---

### Task 5: `readiness` tRPC router

**Files:**
- Create: `src/server/api/routers/readiness.ts`
- Modify: `src/server/api/root.ts` (register `readiness`)

**Interfaces:**
- Consumes: `computeReadiness` (`~/engine`); `readinessInputsFromBlock` (`~/server/mesocycle/readiness-inputs`); `toReadinessView` (`~/views/readiness`); `currentWeekIndex` (`~/server/views/to-mesocycle-view`); `createTRPCRouter`/`protectedProcedure` (`~/server/api/trpc`); `ReadinessView` (`~/views/types`).
- Produces: `readiness.getReadiness: query → ReadinessView` on `appRouter`, consumed by Task 6.

**Note (no runnable test):** DB-bound; gate is `pnpm typecheck` + `pnpm lint`. Study `src/server/api/routers/checkin.ts` for the user-scoped ACTIVE-mesocycle load pattern. Confirm Prisma field names against `prisma/schema.prisma` (`Mesocycle.startDate/lengthWeeks/status`, `TrainingSession.status/completedAt`, `ExercisePrescription.setLogs`, `SetLog.achievedRir`).

- [ ] **Step 1: Write the router**

```ts
// src/server/api/routers/readiness.ts
import { computeReadiness } from "~/engine";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { readinessInputsFromBlock } from "~/server/mesocycle/readiness-inputs";
import { currentWeekIndex } from "~/server/views/to-mesocycle-view";
import { toReadinessView } from "~/views/readiness";
import type { ReadinessView } from "~/views/types";

export const readinessRouter = createTRPCRouter({
  // Real Fitness/Fatigue/Form from logged load. Read-only; engine owns numbers.
  getReadiness: protectedProcedure.query(async ({ ctx }): Promise<ReadinessView> => {
    const userId = ctx.session.user.id;
    const block = await ctx.db.mesocycle.findFirst({
      where: { status: "ACTIVE", athleteProfile: { userId } },
      select: {
        startDate: true,
        lengthWeeks: true,
        weeks: {
          select: {
            sessions: {
              select: {
                status: true,
                completedAt: true,
                prescriptions: { select: { setLogs: { select: { achievedRir: true } } } },
              },
            },
          },
        },
      },
    });

    const curIdx = block ? currentWeekIndex(block.startDate, block.lengthWeeks) : 1;
    if (!block) return { series: [], currentWeekIndex: curIdx };

    const inputs = readinessInputsFromBlock(block);
    if (!inputs) return { series: [], currentWeekIndex: curIdx };

    const samples = computeReadiness(inputs.events, inputs.weekEnds);
    return toReadinessView(samples, curIdx);
  }),
});
```

> If `currentWeekIndex` is not exported from `to-mesocycle-view.ts`, add `export` to its declaration (it is a pure helper; exporting is safe). Confirm the `block` select shape satisfies `BlockForReadiness` — the field names match, so it should assign directly; if TypeScript complains about the structural match, adapt the `select` (not the adapter's type).

- [ ] **Step 2: Register the router**

In `src/server/api/root.ts`, add the import and entry:
```ts
import { readinessRouter } from "~/server/api/routers/readiness";
// ...
export const appRouter = createTRPCRouter({
  health: healthRouter,
  mesocycle: mesocycleRouter,
  onboarding: onboardingRouter,
  session: sessionRouter,
  checkin: checkinRouter,
  readiness: readinessRouter,
});
```

- [ ] **Step 3: Typecheck/lint gate**

Run: `pnpm typecheck && pnpm lint`
Expected: exit 0 / exit 0. (Fix any Prisma field-name drift or the `currentWeekIndex` export until clean.)

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/readiness.ts src/server/api/root.ts src/server/views/to-mesocycle-view.ts
git commit -m "feat(api): readiness router — Fitness/Fatigue/Form from logged load"
```

---

### Task 6: Swap consumers off `mockReadiness`

**Files:**
- Modify: `src/app/app/readiness/page.tsx`
- Modify: `src/app/app/page.tsx`
- Modify: `src/server/mesocycle/current-block.ts` (add `readiness()` cache helper)
- Delete: `src/views/_fixtures/mock-readiness.ts` (only if unreferenced — see Step 4)

**Interfaces:**
- Consumes: `api.readiness.getReadiness` (Task 5); `ReadinessView` (`~/views/types`).
- Produces: real readiness on the Readiness page + Now-home chip.

**Note:** DB-bound + UI; gate is `pnpm typecheck` + `pnpm lint` + `pnpm test` + browser verification.

- [ ] **Step 1: Add a request-cached readiness accessor**

Append to `src/server/mesocycle/current-block.ts` (the file already imports `cache` from `react` and `api` from `~/trpc/server`; add the `ReadinessView` type import):
```ts
import type { MesocycleView, ReadinessView } from "~/views/types";

/** The signed-in athlete's readiness, fetched at most once per request. */
export const readiness = cache(
  async (): Promise<ReadinessView> => api.readiness.getReadiness(),
);
```
(Merge the `ReadinessView` into the existing `~/views/types` import line rather than adding a duplicate import.)

- [ ] **Step 2: Swap the Readiness page**

Replace the fixture import + usage in `src/app/app/readiness/page.tsx`:
```tsx
import { ReadinessHeadline } from "~/components/readiness/readiness-headline";
import { ReadinessChart } from "~/components/readiness/readiness-chart";
import { readiness } from "~/server/mesocycle/current-block";

export default async function ReadinessPage() {
  const data = await readiness();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="text-eyebrow font-medium text-fg-soft">Recovery</div>
        <h1 className="mt-1 text-page-title text-fg">Readiness</h1>
        <p className="mt-1 text-card-desc text-fg-muted">
          Fitness, fatigue, and form from your logged training. In phase 2 your wearables deepen it.
        </p>
      </header>
      <ReadinessHeadline readiness={data} />
      <ReadinessChart readiness={data} />
    </div>
  );
}
```

- [ ] **Step 3: Swap Now-home**

In `src/app/app/page.tsx`: remove the `mockReadiness` import; add `readiness` to the `current-block` import; fetch it and use it for both the chip and the label:
```tsx
import { readiness } from "~/server/mesocycle/current-block";
// ...inside the component, after `const block = await requireCurrentBlock();`
  const readinessData = await readiness();
  const readinessPoint =
    readinessData.series.find((p) => p.weekIndex === readinessData.currentWeekIndex) ??
    readinessData.series[readinessData.series.length - 1];
  const readinessLabel = readinessPoint ? readinessState(readinessPoint) : undefined;
```
and change `<ReadinessChip readiness={mockReadiness} />` → `<ReadinessChip readiness={readinessData} />`.

- [ ] **Step 4: Remove the fixture if unreferenced**

Run: `grep -rn "mock-readiness\|mockReadiness" src`
- If the only matches are its own file and `mock-readiness.test.ts`, delete both `src/views/_fixtures/mock-readiness.ts` and `src/views/_fixtures/mock-readiness.test.ts`.
- If anything else references it, leave the fixture in place and note it.

- [ ] **Step 5: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: exit 0 / exit 0 / all tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(readiness): wire real readiness into page + Now-home, drop mock"
```

---

## Final verification (before offering merge)

- [ ] `pnpm typecheck` → 0 errors
- [ ] `pnpm lint` → clean
- [ ] `pnpm test` → all pass
- [ ] Design detector clean on edited UI files
- [ ] Browser verification: Readiness page shows a real Fitness/Fatigue/Form curve + a banded state from Week 4's logged data; Now-home chip matches; the Form headline shows a signed %; a hypothetical no-log block would show Building / "Not enough data yet".
- [ ] On visual "lgtm": merge `freddy/feat/real-readiness` → `freddy/experimental` (`--no-ff`), delete the feature branch. Do not push to origin.

## Self-Review notes

- **Spec coverage:** load metric §1→Task 1; PMC model §2/§3→Task 1; banding/normalization §3→Task 2; adapter §4→Task 3; view mapper + tRPC §5→Tasks 4–5; consumer swap §5→Task 6; cold-start/Building §6→Tasks 2/3/5; testing §7→each task. All mapped.
- **Type consistency:** `readinessState(point:{fitness,form})`, `computeReadiness(events,weekEnds,opts?)→ReadinessSample[]`, `readinessInputsFromBlock(block)→{events,weekEnds}|null`, `toReadinessView(samples,currentWeekIndex)→ReadinessView`, `ReadinessSample`≡`ReadinessPoint` fields — used identically across tasks.
- **Placeholder scan:** clean; concrete constants throughout (τ 21/7, bands +0.05/−0.10/−0.30, FITNESS_FLOOR 1.5). The two illustrative `>` asides in Task 5/6 instruct the implementer to write the plain call — not placeholders in shipped code.
- **Known implementer follow-ups (inline):** confirm `currentWeekIndex` is exported (Task 5); confirm the Prisma `select` structurally satisfies `BlockForReadiness` (Task 5); the `readiness()` cache helper is a plain `api.readiness.getReadiness()` call (Task 6 Step 1).
