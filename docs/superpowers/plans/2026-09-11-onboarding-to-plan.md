# Onboarding → Plan (Integration Layer ②) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the in-app write path — an onboarding wizard that collects an athlete's basics, runs the real engine, and persists their first ACTIVE mesocycle — replacing the seed-only creation ① left behind.

**Architecture:** A top-level chrome-free `/onboarding` route renders a 4-step client wizard that calls a new `onboarding.createPlan` tRPC mutation. The mutation upserts bio + experience onto `AthleteProfile`, maps onboarding input → `ConstraintSetInput` via a pure template, runs `resolveConstraints`/`generateMesocycle`, and persists the plan graph through a shared `persistMesocyclePlan` helper (also adopted by the seed). A redirect gate in `/app`'s layout sends blockless athletes to onboarding. Bundled: the ③-blocker BlockGrid cell-reconciliation fix in the mapper.

**Tech Stack:** Next.js 15 App Router (RSC + client), tRPC 11, Prisma 6, Zod, BetterAuth, Tailwind v4, Vitest, pnpm.

## Global Constraints

- **Branch:** all work on `freddy/feat/onboarding-to-plan`, branched off `freddy/experimental`. Merges into `freddy/experimental` after the user's visual "lgtm". Nothing pushed to origin unless asked.
- **Subagents MUST NOT touch the live Neon DB:** no `pnpm db:seed`, no migrations, no `prisma db push/migrate`, no any command that reads/writes Neon. DB-bound tasks are gated by `pnpm typecheck && pnpm lint` only; the user runs DB verification afterward.
- **Law 1:** the engine/data owns every number; mappers and the persist helper only reshape/relocate — they never invent or recompute a training number.
- **Law 2:** deterministic; no LLM/invented claims anywhere in this slice (the Coach is a later, separate surface).
- **Import paths:** `~/*` → `src/*` only. The generated Prisma client lives at repo root `generated/prisma` and MUST be imported by relative path (`../../../generated/prisma` from `src/server/**/*`). `db` from `~/server/db`; engine from `~/engine`; schema/enums from `~/schema`; domain from `~/domain/*`; RSC tRPC caller `api` from `~/trpc/server`; client tRPC `api` from `~/trpc/react`; `getSession` from `~/server/better-auth/server`.
- **Block name literal:** the created block's `name` is exactly `"Block 1"`.
- **Transaction timeout:** every `db.$transaction(...)` in this slice passes `{ timeout: 15000 }` (the plan graph is 4–8 sequential week creates against remote Neon; the default 5s is too tight).
- **Design tokens:** use existing tokens only — `text-fg` / `text-fg-soft` / `text-fg-muted` / `text-fg-subtle`, `border-border` / `border-border-subtle`, `bg-canvas` / `bg-selection`, `rounded-control` / `rounded-pill`, `text-nav` / `text-list`. Accent (`text-accent` / accent bg) is scarce — only the primary "Create my plan" CTA.
- **Enums (verbatim values):** `Sex` = MALE | FEMALE. `ExperienceLevel` = BEGINNER | INTERMEDIATE | ADVANCED. `SplitType` = FULL_BODY | UPPER_LOWER | PUSH_PULL_LEGS | BRO_SPLIT | CUSTOM (wizard offers only the first three). `MuscleGroup` enum order = CHEST, BACK, TRAPS, FRONT_DELTS, SIDE_DELTS, REAR_DELTS, BICEPS, TRICEPS, FOREARMS, ABS, QUADS, HAMSTRINGS, GLUTES, CALVES.
- **Proficiency template (exact):** BEGINNER → 4 weeks / deload wk 4; INTERMEDIATE → 6 / 6; ADVANCED → 8 / 8.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/schema/onboarding.ts` (+ `.test.ts`) | `OnboardingInputSchema`, `OnboardingInput` | 1 |
| `src/schema/index.ts` (modify) | re-export onboarding schema | 1 |
| `src/domain/onboarding-template.ts` (+ `.test.ts`) | `PROFICIENCY_TEMPLATE`, pure `buildConstraintSetInput` | 2 |
| `src/server/views/to-mesocycle-view.ts` (modify) + `.test.ts` (extend) | BlockGrid cell reconciliation (union cells, `plannedSets:0`) | 3 |
| `src/server/mesocycle/persist.ts` | shared `persistMesocyclePlan(tx, args)` | 4 |
| `prisma/seed/mesocycle.ts` (refactor) | seed adopts the shared helper, wraps in a tx | 4 |
| `src/server/api/routers/onboarding.ts` | `createPlan` mutation | 5 |
| `src/server/api/root.ts` (modify) | register `onboarding` router | 5 |
| `src/components/onboarding/onboarding-wizard.tsx` | 4-step client wizard | 6 |
| `src/app/onboarding/layout.tsx` + `page.tsx` | chrome-free route + gate | 7 |
| `src/app/app/layout.tsx` (modify) | redirect blockless athletes to `/onboarding` | 7 |

**Task order rationale:** 1→2 are pure leaves. 3 is an independent bug fix. 4 provides the persist helper both the seed and mutation need. 5 (mutation) consumes 1/2/4 and registers the router so `api.onboarding` types exist. 6 (wizard) consumes 5's mutation types. 7 (route) renders 6 and closes the gate.

---

## Setup: create the branch

- [ ] **Step 1: Branch off experimental**

```bash
git checkout freddy/experimental && git pull --ff-only 2>/dev/null; git checkout -b freddy/feat/onboarding-to-plan
```
Expected: `Switched to a new branch 'freddy/feat/onboarding-to-plan'`.

---

### Task 1: `OnboardingInputSchema`

**Files:**
- Create: `src/schema/onboarding.ts`
- Test: `src/schema/onboarding.test.ts`
- Modify: `src/schema/index.ts`

**Interfaces:**
- Consumes: `SexEnum`, `ExperienceLevelEnum`, `MuscleGroupEnum`, `SplitTypeEnum` from `./enums` (all already exist).
- Produces: `OnboardingInputSchema` (Zod), `OnboardingInput` (`z.infer`), re-exported from `~/schema`.

- [ ] **Step 1: Write the failing test**

Create `src/schema/onboarding.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { OnboardingInputSchema } from "./onboarding";

const valid = {
  sex: "MALE" as const,
  age: 28,
  heightCm: 180,
  weightKg: 82,
  daysPerWeek: 5,
  sessionLengthCapMin: 75,
  splitType: "UPPER_LOWER" as const,
  proficiency: "INTERMEDIATE" as const,
  priorityMuscles: ["SIDE_DELTS" as const],
};

describe("OnboardingInputSchema", () => {
  it("accepts a valid payload", () => {
    expect(OnboardingInputSchema.parse(valid)).toMatchObject(valid);
  });

  it("defaults priorityMuscles to an empty array", () => {
    const { priorityMuscles, ...rest } = valid;
    expect(OnboardingInputSchema.parse(rest).priorityMuscles).toEqual([]);
  });

  it("rejects age out of bounds", () => {
    expect(OnboardingInputSchema.safeParse({ ...valid, age: 12 }).success).toBe(false);
    expect(OnboardingInputSchema.safeParse({ ...valid, age: 101 }).success).toBe(false);
  });

  it("rejects height/weight out of bounds", () => {
    expect(OnboardingInputSchema.safeParse({ ...valid, heightCm: 119 }).success).toBe(false);
    expect(OnboardingInputSchema.safeParse({ ...valid, weightKg: 29 }).success).toBe(false);
  });

  it("rejects daysPerWeek outside 1–7", () => {
    expect(OnboardingInputSchema.safeParse({ ...valid, daysPerWeek: 0 }).success).toBe(false);
    expect(OnboardingInputSchema.safeParse({ ...valid, daysPerWeek: 8 }).success).toBe(false);
  });

  it("rejects more than 3 priority muscles", () => {
    expect(
      OnboardingInputSchema.safeParse({
        ...valid,
        priorityMuscles: ["CHEST", "BACK", "QUADS", "BICEPS"],
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/schema/onboarding.test.ts`
Expected: FAIL — cannot resolve `./onboarding`.

- [ ] **Step 3: Write the schema**

Create `src/schema/onboarding.ts`:

```ts
import { z } from "zod";
import {
  ExperienceLevelEnum,
  MuscleGroupEnum,
  SexEnum,
  SplitTypeEnum,
} from "./enums";

/**
 * Everything the first-run wizard collects. Bio fields are stored on
 * AthleteProfile (not consumed by the engine yet — phase 2). Logistics, split,
 * proficiency, and priority muscles drive the engine via buildConstraintSetInput.
 * Numeric bounds mirror ConstraintSetInputSchema where they overlap.
 */
export const OnboardingInputSchema = z.object({
  sex: SexEnum,
  age: z.number().int().min(13).max(100),
  heightCm: z.number().min(120).max(250),
  weightKg: z.number().min(30).max(300),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionLengthCapMin: z.number().int().min(15).max(240),
  splitType: SplitTypeEnum,
  proficiency: ExperienceLevelEnum,
  priorityMuscles: z.array(MuscleGroupEnum).max(3).default([]),
});
export type OnboardingInput = z.infer<typeof OnboardingInputSchema>;
```

- [ ] **Step 4: Re-export from the schema barrel**

Modify `src/schema/index.ts` — append:

```ts
export * from "./onboarding";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/schema/onboarding.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck && git add src/schema/onboarding.ts src/schema/onboarding.test.ts src/schema/index.ts && git commit -m "feat(onboarding): OnboardingInputSchema"
```

---

### Task 2: `buildConstraintSetInput` + proficiency template

**Files:**
- Create: `src/domain/onboarding-template.ts`
- Test: `src/domain/onboarding-template.test.ts`

**Interfaces:**
- Consumes: `OnboardingInput` from `~/schema` (Task 1); `ConstraintSetInput` from `~/schema`; `ExperienceLevel` from `~/schema`.
- Produces: `PROFICIENCY_TEMPLATE: Record<ExperienceLevel, { blockLengthWeeks: number; deloadWeekIndex: number }>` and `buildConstraintSetInput(input: OnboardingInput): ConstraintSetInput` (pure).

- [ ] **Step 1: Write the failing test**

Create `src/domain/onboarding-template.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { OnboardingInput } from "~/schema";
import { buildConstraintSetInput, PROFICIENCY_TEMPLATE } from "./onboarding-template";

const base: OnboardingInput = {
  sex: "FEMALE",
  age: 30,
  heightCm: 168,
  weightKg: 64,
  daysPerWeek: 4,
  sessionLengthCapMin: 60,
  splitType: "PUSH_PULL_LEGS",
  proficiency: "INTERMEDIATE",
  priorityMuscles: [],
};

describe("PROFICIENCY_TEMPLATE", () => {
  it("maps each proficiency to block length and deload week", () => {
    expect(PROFICIENCY_TEMPLATE.BEGINNER).toEqual({ blockLengthWeeks: 4, deloadWeekIndex: 4 });
    expect(PROFICIENCY_TEMPLATE.INTERMEDIATE).toEqual({ blockLengthWeeks: 6, deloadWeekIndex: 6 });
    expect(PROFICIENCY_TEMPLATE.ADVANCED).toEqual({ blockLengthWeeks: 8, deloadWeekIndex: 8 });
  });
});

describe("buildConstraintSetInput", () => {
  it("passes logistics and split through unchanged", () => {
    const cs = buildConstraintSetInput(base);
    expect(cs.daysPerWeek).toBe(4);
    expect(cs.sessionLengthCapMin).toBe(60);
    expect(cs.splitType).toBe("PUSH_PULL_LEGS");
  });

  it("applies the proficiency template for block length and deload", () => {
    expect(buildConstraintSetInput({ ...base, proficiency: "BEGINNER" })).toMatchObject({
      blockLengthWeeks: 4,
      deloadWeekIndex: 4,
    });
    expect(buildConstraintSetInput({ ...base, proficiency: "ADVANCED" })).toMatchObject({
      blockLengthWeeks: 8,
      deloadWeekIndex: 8,
    });
  });

  it("maps priority muscles to muscleTargets at priority 3", () => {
    const cs = buildConstraintSetInput({ ...base, priorityMuscles: ["SIDE_DELTS", "BACK"] });
    expect(cs.muscleTargets).toEqual([
      { muscle: "SIDE_DELTS", priority: 3 },
      { muscle: "BACK", priority: 3 },
    ]);
  });

  it("produces empty muscleTargets when no priorities are given", () => {
    expect(buildConstraintSetInput(base).muscleTargets).toEqual([]);
  });

  it("sets weekly cadence and no exclusions", () => {
    const cs = buildConstraintSetInput(base);
    expect(cs.checkInCadence).toBe("WEEKLY");
    expect(cs.excludedExerciseNames).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/onboarding-template.test.ts`
Expected: FAIL — cannot resolve `./onboarding-template`.

- [ ] **Step 3: Write the mapper**

Create `src/domain/onboarding-template.ts`:

```ts
import type { ConstraintSetInput, ExperienceLevel, OnboardingInput } from "~/schema";

/**
 * The one-time onboarding shortcut: proficiency picks a cookie-cutter block
 * shape so a new athlete gets a real template instead of a blank slate. It is
 * NOT an ongoing engine dimension — after generation, nothing keys off it.
 */
export const PROFICIENCY_TEMPLATE: Record<
  ExperienceLevel,
  { blockLengthWeeks: number; deloadWeekIndex: number }
> = {
  BEGINNER: { blockLengthWeeks: 4, deloadWeekIndex: 4 },
  INTERMEDIATE: { blockLengthWeeks: 6, deloadWeekIndex: 6 },
  ADVANCED: { blockLengthWeeks: 8, deloadWeekIndex: 8 },
};

/**
 * Pure map: wizard input → the engine's ConstraintSetInput contract. Logistics
 * and split pass through; priority muscles become priority-3 targets (weekly
 * target left unset so the engine fills MEV-based defaults); block shape comes
 * from the proficiency template.
 */
export function buildConstraintSetInput(input: OnboardingInput): ConstraintSetInput {
  const template = PROFICIENCY_TEMPLATE[input.proficiency];
  return {
    daysPerWeek: input.daysPerWeek,
    splitType: input.splitType,
    sessionLengthCapMin: input.sessionLengthCapMin,
    blockLengthWeeks: template.blockLengthWeeks,
    deloadWeekIndex: template.deloadWeekIndex,
    checkInCadence: "WEEKLY",
    muscleTargets: input.priorityMuscles.map((muscle) => ({ muscle, priority: 3 })),
    excludedExerciseNames: [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/onboarding-template.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck && git add src/domain/onboarding-template.ts src/domain/onboarding-template.test.ts && git commit -m "feat(onboarding): buildConstraintSetInput + proficiency template"
```

---

### Task 3: BlockGrid cell reconciliation (the ③-blocker fix)

**Files:**
- Modify: `src/server/views/to-mesocycle-view.ts`
- Modify (extend): `src/server/views/to-mesocycle-view.test.ts`

**Context:** `block-grid.tsx:60` does `w.cells.find((c) => c.muscle === muscle)!` over `block.muscles` (the union across weeks). Today every week trains the full set so the `!` never misses, but ③ will introduce weeks that drop a muscle → crash. Fix: emit a cell for every union muscle in every week (`plannedSets: 0` when the week has no row for it). Factual (an untrained muscle genuinely has 0 sets), and zero behavioral change on current data.

**Interfaces:**
- `toWeekView` gains a third parameter `muscles: readonly MuscleGroup[]` (the block-wide union, already computed in `toMesocycleView`). No exported signatures change.

- [ ] **Step 1: Extend the test builder to allow omitting a muscle from one week**

In `src/server/views/to-mesocycle-view.test.ts`, add the `MuscleGroup` import at the top (after the existing imports):

```ts
import type { MuscleGroup } from "~/schema";
```

Add `omitMuscleInWeek` to the `makeMesocycle` override type — change:

```ts
function makeMesocycle(over: Partial<{
  startDate: Date | null;
  lengthWeeks: number;
  splitType: MesocycleWithRelations["constraintSet"]["splitType"];
  deloadIndex: number | null; // which week has isDeload=true
  csDeloadWeekIndex: number | null;
}> = {}): MesocycleWithRelations {
```

to:

```ts
function makeMesocycle(over: Partial<{
  startDate: Date | null;
  lengthWeeks: number;
  splitType: MesocycleWithRelations["constraintSet"]["splitType"];
  deloadIndex: number | null; // which week has isDeload=true
  csDeloadWeekIndex: number | null;
  omitMuscleInWeek: { week: number; muscle: MuscleGroup };
}> = {}): MesocycleWithRelations {
```

Then make the week's `muscleVolumes` respect it — change:

```ts
      muscleVolumes: [
        { id: `wmv-${index}-quads`, weekId: `week-${index}`, muscle: "QUADS" as const, plannedSets: 12 },
        { id: `wmv-${index}-chest`, weekId: `week-${index}`, muscle: "CHEST" as const, plannedSets: 10 },
      ],
```

to:

```ts
      muscleVolumes: [
        { id: `wmv-${index}-quads`, weekId: `week-${index}`, muscle: "QUADS" as const, plannedSets: 12 },
        { id: `wmv-${index}-chest`, weekId: `week-${index}`, muscle: "CHEST" as const, plannedSets: 10 },
      ].filter(
        (mv) => !(over.omitMuscleInWeek?.week === index && over.omitMuscleInWeek?.muscle === mv.muscle),
      ),
```

- [ ] **Step 2: Add the failing reconciliation tests**

Inside the `describe("toMesocycleView", ...)` block, add:

```ts
  it("emits a plannedSets:0 cell for a muscle a week omits (union reconciliation)", () => {
    const v = toMesocycleView(makeMesocycle({ omitMuscleInWeek: { week: 2, muscle: "QUADS" } }));
    expect(v.muscles).toEqual(["CHEST", "QUADS"]); // union across weeks unchanged
    const wk2 = v.weeks.find((w) => w.index === 2)!;
    // every union muscle has a cell in week 2, even the omitted one
    expect(wk2.cells.map((c) => c.muscle)).toEqual(["CHEST", "QUADS"]);
    const quads = wk2.cells.find((c) => c.muscle === "QUADS")!;
    expect(quads.plannedSets).toBe(0);
    expect(quads.mev).toBe(8); // DEFAULT_LANDMARKS.QUADS.mev
    expect(quads.mrv).toBe(20); // DEFAULT_LANDMARKS.QUADS.mrv
  });

  it("adds no spurious cells when every week trains the full muscle set", () => {
    const v = toMesocycleView(makeMesocycle());
    for (const w of v.weeks) {
      expect(w.cells.map((c) => c.muscle)).toEqual(["CHEST", "QUADS"]);
      expect(w.cells.every((c) => c.plannedSets > 0)).toBe(true);
    }
  });
```

- [ ] **Step 3: Run tests to verify the reconciliation test fails**

Run: `pnpm test src/server/views/to-mesocycle-view.test.ts`
Expected: FAIL — the omitted-muscle test finds no QUADS cell in week 2 (`.find(...)!` yields undefined → throws), because the current mapper skips absent muscles.

- [ ] **Step 4: Fix the mapper**

In `src/server/views/to-mesocycle-view.ts`, change `toWeekView` to take the union and emit a cell per union muscle. Replace:

```ts
function toWeekView(w: WeekWithRelations, curIdx: number): WeekView {
  const sessions = [...w.sessions].sort((a, b) => a.order - b.order).map(toSessionView);
  const cells: MuscleWeekCell[] = MUSCLE_GROUPS.flatMap((muscle): MuscleWeekCell[] => {
    const v = w.muscleVolumes.find((x) => x.muscle === muscle);
    if (!v) return [];
    const lm = DEFAULT_LANDMARKS[muscle];
    return [{ muscle, weekIndex: w.index, plannedSets: v.plannedSets, mev: lm.mev, mav: lm.mav, mrv: lm.mrv }];
  });
```

with:

```ts
function toWeekView(w: WeekWithRelations, curIdx: number, muscles: readonly MuscleGroup[]): WeekView {
  const sessions = [...w.sessions].sort((a, b) => a.order - b.order).map(toSessionView);
  // A cell for every block-trained muscle every week, reconciled with
  // block.muscles by construction — a week that omits a muscle yields a
  // factual plannedSets:0 cell (BlockGrid force-unwraps these; it must never miss).
  const cells: MuscleWeekCell[] = muscles.map((muscle): MuscleWeekCell => {
    const v = w.muscleVolumes.find((x) => x.muscle === muscle);
    const lm = DEFAULT_LANDMARKS[muscle];
    return {
      muscle,
      weekIndex: w.index,
      plannedSets: v?.plannedSets ?? 0,
      mev: lm.mev,
      mav: lm.mav,
      mrv: lm.mrv,
    };
  });
```

Then update the call site in `toMesocycleView` — change:

```ts
  const weeks = [...m.weeks].sort((a, b) => a.index - b.index).map((w) => toWeekView(w, curIdx));
```

to:

```ts
  const weeks = [...m.weeks].sort((a, b) => a.index - b.index).map((w) => toWeekView(w, curIdx, muscles));
```

(Note: `muscles` is already computed above this line. `MUSCLE_GROUPS` is still imported for the union computation, so leave the import untouched.)

- [ ] **Step 5: Run tests to verify all pass**

Run: `pnpm test src/server/views/to-mesocycle-view.test.ts`
Expected: PASS — both new tests and all pre-existing mapper tests green (no behavioral change on the full-set fixture).

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck && git add src/server/views/to-mesocycle-view.ts src/server/views/to-mesocycle-view.test.ts && git commit -m "fix(views): reconcile BlockGrid cells across weeks (emit plannedSets:0)"
```

---

### Task 4: `persistMesocyclePlan` helper + seed refactor (DB-bound)

**Files:**
- Create: `src/server/mesocycle/persist.ts`
- Refactor: `prisma/seed/mesocycle.ts`

**DB gate:** subagent runs `pnpm typecheck && pnpm lint` only. Do NOT run `pnpm db:seed` or any DB command — the user verifies the seed afterward.

**Interfaces:**
- Consumes: `Prisma.TransactionClient` (relative import from `../../../generated/prisma`); `MesocyclePlan` from `~/engine`; `MuscleGroup` from `~/schema`.
- Produces: `PersistMesocycleArgs` interface and `persistMesocyclePlan(tx, args): Promise<{ mesocycleId: string; weeks: number }>`.

- [ ] **Step 1: Write the persist helper**

Create `src/server/mesocycle/persist.ts`:

```ts
import type { Prisma } from "../../../generated/prisma";
import type { MesocyclePlan } from "~/engine";
import type { MuscleGroup } from "~/schema";

export interface PersistMesocycleArgs {
  athleteProfileId: string;
  constraintSetId: string;
  plan: MesocyclePlan;
  startDate: Date;
  name: string;
}

/**
 * Persists an engine-generated MesocyclePlan graph (Mesocycle → weeks →
 * sessions → prescriptions, plus WeekMuscleVolume and DecisionLog rows) using
 * the caller's transaction client. Shared by the seed and the onboarding
 * mutation. It does NOT create the ConstraintSet — the caller owns that, since
 * the two callers differ there (seed delete-first vs. mutation version-bump).
 *
 * WeekMuscleVolume rows are written only for muscles with volume > 0.
 * Each prescription's exerciseName is resolved to an Exercise.id; an unknown
 * name throws so a malformed plan rolls the transaction back rather than
 * persisting a partial graph.
 */
export async function persistMesocyclePlan(
  tx: Prisma.TransactionClient,
  args: PersistMesocycleArgs,
): Promise<{ mesocycleId: string; weeks: number }> {
  const { athleteProfileId, constraintSetId, plan, startDate, name } = args;

  const exercises = await tx.exercise.findMany({ select: { id: true, name: true } });
  const idByName = new Map(exercises.map((e) => [e.name, e.id]));

  const meso = await tx.mesocycle.create({
    data: {
      athleteProfileId,
      constraintSetId,
      name,
      status: "ACTIVE",
      startDate,
      lengthWeeks: plan.blockLengthWeeks,
    },
  });

  for (const week of plan.weeks) {
    await tx.week.create({
      data: {
        mesocycleId: meso.id,
        index: week.index,
        isDeload: week.isDeload,
        muscleVolumes: {
          create: Object.entries(week.muscleVolume)
            .filter(([, sets]) => sets > 0)
            .map(([muscle, sets]) => ({ muscle: muscle as MuscleGroup, plannedSets: sets })),
        },
        sessions: {
          create: week.sessions.map((session, order) => ({
            order,
            splitSlot: session.label,
            dayOfWeek: null,
            targetDurationMin: session.estimatedMinutes,
            prescriptions: {
              create: session.prescriptions.map((rx, rxOrder) => {
                const exerciseId = idByName.get(rx.exerciseName);
                if (!exerciseId) {
                  throw new Error(
                    `persistMesocyclePlan: prescription references unknown exercise "${rx.exerciseName}". Run the exercise seed first / check the library.`,
                  );
                }
                return {
                  exerciseId,
                  order: rxOrder,
                  sets: rx.sets,
                  targetRepLow: rx.repRangeLow,
                  targetRepHigh: rx.repRangeHigh,
                  targetRir: rx.targetRir,
                };
              }),
            },
          })),
        },
      },
    });
  }

  if (plan.facts.length > 0) {
    await tx.decisionLog.createMany({
      data: plan.facts.map((fact) => ({
        mesocycleId: meso.id,
        type: "GENERATE" as const,
        status: "APPLIED" as const,
        summary: fact.kind,
        reasoning: fact.kind,
        payload: fact,
      })),
    });
  }

  return { mesocycleId: meso.id, weeks: plan.weeks.length };
}
```

- [ ] **Step 2: Refactor the seed to use the helper (identical observable behavior)**

Replace the entire body of `seedMesocycle` in `prisma/seed/mesocycle.ts`. Keep the top-of-file `DEFAULT_CONSTRAINTS`, `DAY_MS`, and the existing imports; add the persist import. Change the import block at the top to:

```ts
import { db } from "~/server/db";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { generateMesocycle, resolveConstraints, type AthleteContext } from "~/engine";
import { persistMesocyclePlan } from "~/server/mesocycle/persist";
import type { ConstraintSetInput } from "~/schema";
```

Replace the whole `export async function seedMesocycle(...) { ... }` with:

```ts
export async function seedMesocycle(): Promise<{ mesocycleId: string; weeks: number }> {
  const email = process.env.SEED_USER_EMAIL;
  const user = email
    ? await db.user.findUnique({ where: { email } })
    : await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    throw new Error(
      "seedMesocycle: no User found. Log in to the app once to create your user, then re-run `pnpm db:seed`.",
    );
  }

  // Athlete profile (upsert on the unique userId). Idempotent, so kept outside the tx.
  const profile = await db.athleteProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  // Run the real engine (pure) before opening the transaction.
  const athlete: AthleteContext = {
    experienceLevel: profile.experience,
    phase: profile.phase,
    landmarks: DEFAULT_LANDMARKS,
  };
  const spec = resolveConstraints(DEFAULT_CONSTRAINTS, athlete);
  if (spec.kind !== "resolved") {
    throw new Error(
      "seedMesocycle: default constraints resolved as infeasible — the engine could not generate a plan.",
    );
  }
  const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);

  // One atomic write: clear the prior seeded block + constraint set, create the
  // constraint set, then persist the plan graph. startDate 14 days ago → week 3.
  return db.$transaction(
    async (tx) => {
      await tx.mesocycle.deleteMany({ where: { athleteProfileId: profile.id } });
      await tx.constraintSet.deleteMany({ where: { athleteProfileId: profile.id } });

      const constraintSet = await tx.constraintSet.create({
        data: {
          athleteProfileId: profile.id,
          version: 1,
          isActive: true,
          daysPerWeek: DEFAULT_CONSTRAINTS.daysPerWeek,
          splitType: DEFAULT_CONSTRAINTS.splitType,
          sessionLengthCapMin: DEFAULT_CONSTRAINTS.sessionLengthCapMin,
          blockLengthWeeks: DEFAULT_CONSTRAINTS.blockLengthWeeks,
          deloadWeekIndex: DEFAULT_CONSTRAINTS.deloadWeekIndex,
          checkInCadence: DEFAULT_CONSTRAINTS.checkInCadence,
          muscleTargets: {
            create: DEFAULT_CONSTRAINTS.muscleTargets.map((t) => ({
              muscle: t.muscle,
              weeklySetTarget: t.weeklySetTarget ?? null,
              priority: t.priority ?? 0,
            })),
          },
        },
      });

      return persistMesocyclePlan(tx, {
        athleteProfileId: profile.id,
        constraintSetId: constraintSet.id,
        plan,
        startDate: new Date(Date.now() - 14 * DAY_MS),
        name: "Autumn Hypertrophy — Block 1",
      });
    },
    { timeout: 15000 },
  );
}
```

- [ ] **Step 3: Typecheck + lint (DB gate — do NOT run the seed)**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (The existing `prisma/seed/seed.test.ts` imports `seedExercises` from the index, not `seedMesocycle`; do not run it — it touches the DB.)

- [ ] **Step 4: Commit**

```bash
git add src/server/mesocycle/persist.ts prisma/seed/mesocycle.ts && git commit -m "refactor(mesocycle): extract persistMesocyclePlan, adopt in seed (transactional)"
```

---

### Task 5: `onboarding.createPlan` mutation (DB-bound)

**Files:**
- Create: `src/server/api/routers/onboarding.ts`
- Modify: `src/server/api/root.ts`

**DB gate:** `pnpm typecheck && pnpm lint` only. Do NOT execute the mutation or any DB command — the user verifies afterward.

**Interfaces:**
- Consumes: `OnboardingInputSchema` (`~/schema`, Task 1); `buildConstraintSetInput` (`~/domain/onboarding-template`, Task 2); `persistMesocyclePlan` (`~/server/mesocycle/persist`, Task 4); `resolveConstraints`, `generateMesocycle`, `AthleteContext`, `InfeasibilityReport` (`~/engine`); `EXERCISE_LIBRARY` (`~/domain/exercise-library`); `DEFAULT_LANDMARKS` (`~/domain/landmarks`); `createTRPCRouter`, `protectedProcedure` (`~/server/api/trpc`).
- Produces: `onboardingRouter` with `createPlan: (OnboardingInput) => { mesocycleId: string }`, registered on `appRouter` as `onboarding` (so `api.onboarding.createPlan` exists on the client).

- [ ] **Step 1: Write the router**

Create `src/server/api/routers/onboarding.ts`:

```ts
import { TRPCError } from "@trpc/server";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { buildConstraintSetInput } from "~/domain/onboarding-template";
import {
  generateMesocycle,
  resolveConstraints,
  type AthleteContext,
  type InfeasibilityReport,
} from "~/engine";
import { OnboardingInputSchema } from "~/schema";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { persistMesocyclePlan } from "~/server/mesocycle/persist";

/** Turn an engine infeasibility report into an athlete-facing sentence. */
function infeasibilityMessage(report: InfeasibilityReport): string {
  const fact = report.facts.find((f) => f.kind === "infeasible");
  if (fact?.kind === "infeasible") {
    if (fact.constraint === "session_time") {
      return "Your split doesn't fit that much training into the session length you chose. Try a longer session cap, more training days, or fewer priority muscles.";
    }
    if (fact.constraint === "weekly_volume") {
      return "That combination asks for more weekly volume than can be recovered. Try fewer priority muscles or more training days.";
    }
  }
  return "That combination can't be turned into a workable plan. Try adjusting your schedule, split, or priority muscles.";
}

export const onboardingRouter = createTRPCRouter({
  createPlan: protectedProcedure
    .input(OnboardingInputSchema)
    .mutation(async ({ ctx, input }): Promise<{ mesocycleId: string }> => {
      const userId = ctx.session.user.id;

      // Defense-in-depth over the route gate: never overwrite an active block.
      const existing = await ctx.db.mesocycle.findFirst({
        where: { status: "ACTIVE", athleteProfile: { userId } },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "You already have an active block." });
      }

      // Persist bio + experience (proficiency legitimately drives THIS generation).
      const profile = await ctx.db.athleteProfile.upsert({
        where: { userId },
        update: {
          sex: input.sex,
          age: input.age,
          heightCm: input.heightCm,
          weightKg: input.weightKg,
          experience: input.proficiency,
        },
        create: {
          userId,
          sex: input.sex,
          age: input.age,
          heightCm: input.heightCm,
          weightKg: input.weightKg,
          experience: input.proficiency,
        },
      });

      const csInput = buildConstraintSetInput(input);
      const athlete: AthleteContext = {
        experienceLevel: input.proficiency,
        phase: profile.phase,
        landmarks: DEFAULT_LANDMARKS,
      };
      const spec = resolveConstraints(csInput, athlete);
      if (spec.kind !== "resolved") {
        // Nothing written yet — friendly error, athlete stays on the wizard.
        throw new TRPCError({ code: "BAD_REQUEST", message: infeasibilityMessage(spec) });
      }
      const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);

      const { mesocycleId } = await ctx.db.$transaction(
        async (tx) => {
          const last = await tx.constraintSet.findFirst({
            where: { athleteProfileId: profile.id },
            orderBy: { version: "desc" },
            select: { version: true },
          });
          const constraintSet = await tx.constraintSet.create({
            data: {
              athleteProfileId: profile.id,
              version: (last?.version ?? 0) + 1,
              isActive: true,
              daysPerWeek: csInput.daysPerWeek,
              splitType: csInput.splitType,
              sessionLengthCapMin: csInput.sessionLengthCapMin,
              blockLengthWeeks: csInput.blockLengthWeeks,
              deloadWeekIndex: csInput.deloadWeekIndex,
              checkInCadence: csInput.checkInCadence,
              muscleTargets: {
                create: csInput.muscleTargets.map((t) => ({
                  muscle: t.muscle,
                  weeklySetTarget: t.weeklySetTarget ?? null,
                  priority: t.priority ?? 0,
                })),
              },
            },
          });

          return persistMesocyclePlan(tx, {
            athleteProfileId: profile.id,
            constraintSetId: constraintSet.id,
            plan,
            startDate: new Date(), // brand-new block → current week 1
            name: "Block 1",
          });
        },
        { timeout: 15000 },
      );

      return { mesocycleId };
    }),
});
```

- [ ] **Step 2: Register the router**

Modify `src/server/api/root.ts`. Add the import and the registration:

```ts
import { healthRouter } from "~/server/api/routers/health";
import { mesocycleRouter } from "~/server/api/routers/mesocycle";
import { onboardingRouter } from "~/server/api/routers/onboarding";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  health: healthRouter,
  mesocycle: mesocycleRouter,
  onboarding: onboardingRouter,
});
```

(Leave the rest of `root.ts` — `AppRouter` type and `createCaller` — unchanged.)

- [ ] **Step 3: Typecheck + lint (DB gate — do NOT run the mutation)**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/onboarding.ts src/server/api/root.ts && git commit -m "feat(onboarding): createPlan mutation (engine → persisted ACTIVE block)"
```

---

### Task 6: Onboarding wizard (client)

**Files:**
- Create: `src/components/onboarding/onboarding-wizard.tsx`

**Verification:** `pnpm typecheck && pnpm lint` + user visual check (matches the presentational-component convention).

**Interfaces:**
- Consumes: `api` from `~/trpc/react` (`api.onboarding.createPlan.useMutation()` — exists after Task 5); enum types `Sex`, `SplitType`, `ExperienceLevel`, `MuscleGroup`, and `MUSCLE_GROUPS` from `~/schema`; `useRouter` from `next/navigation`.
- Produces: default-exported? No — named export `OnboardingWizard` (Task 7's page imports `{ OnboardingWizard }`).

- [ ] **Step 1: Write the wizard**

Create `src/components/onboarding/onboarding-wizard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MUSCLE_GROUPS, type ExperienceLevel, type MuscleGroup, type Sex, type SplitType } from "~/schema";
import { api } from "~/trpc/react";

const SPLIT_OPTIONS: { value: SplitType; label: string; hint: string }[] = [
  { value: "FULL_BODY", label: "Full Body", hint: "Every muscle each session — great at lower frequency" },
  { value: "UPPER_LOWER", label: "Upper / Lower", hint: "Alternating upper- and lower-body days" },
  { value: "PUSH_PULL_LEGS", label: "Push / Pull / Legs", hint: "Push, pull, and leg days — higher frequency" },
];

const PROFICIENCY_OPTIONS: { value: ExperienceLevel; label: string; hint: string }[] = [
  { value: "BEGINNER", label: "Beginner", hint: "New to structured training — 4-week block" },
  { value: "INTERMEDIATE", label: "Intermediate", hint: "A year or two of consistent training — 6-week block" },
  { value: "ADVANCED", label: "Advanced", hint: "Years of hard training — 8-week block" },
];

function muscleLabel(m: string): string {
  return m.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

const STEP_TITLES = ["About you", "Your schedule", "Your split", "Experience & priorities"];

export function OnboardingWizard() {
  const router = useRouter();
  const createPlan = api.onboarding.createPlan.useMutation({
    onSuccess: () => router.push("/app/block"),
  });

  const [step, setStep] = useState(0);

  // Bio + logistics kept as strings so number inputs can be cleared; parsed on submit.
  const [sex, setSex] = useState<Sex | null>(null);
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [sessionLengthCapMin, setSessionLengthCapMin] = useState("75");
  const [splitType, setSplitType] = useState<SplitType>("UPPER_LOWER");
  const [proficiency, setProficiency] = useState<ExperienceLevel>("INTERMEDIATE");
  const [priorityMuscles, setPriorityMuscles] = useState<MuscleGroup[]>([]);

  const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

  const stepValid = (s: number): boolean => {
    if (s === 0) {
      const a = num(age), h = num(heightCm), w = num(weightKg);
      return (
        sex !== null &&
        Number.isInteger(a) && a >= 13 && a <= 100 &&
        h >= 120 && h <= 250 &&
        w >= 30 && w <= 300
      );
    }
    if (s === 1) {
      const cap = num(sessionLengthCapMin);
      return daysPerWeek >= 1 && daysPerWeek <= 7 && Number.isInteger(cap) && cap >= 15 && cap <= 240;
    }
    return true; // steps 2 & 3 always have a valid default selection
  };

  const canContinue = stepValid(step);
  const isLast = step === STEP_TITLES.length - 1;

  function togglePriority(m: MuscleGroup) {
    setPriorityMuscles((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : prev.length >= 3 ? prev : [...prev, m],
    );
  }

  function submit() {
    if (sex === null) return;
    createPlan.mutate({
      sex,
      age: num(age),
      heightCm: num(heightCm),
      weightKg: num(weightKg),
      daysPerWeek,
      sessionLengthCapMin: num(sessionLengthCapMin),
      splitType,
      proficiency,
      priorityMuscles,
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          {STEP_TITLES.map((_, i) => (
            <span
              key={i}
              className={"h-1.5 w-8 rounded-pill " + (i <= step ? "bg-accent" : "bg-border-subtle")}
            />
          ))}
        </div>
        <h1 className="text-list font-semibold text-fg">{STEP_TITLES[step]}</h1>
        <p className="text-nav text-fg-muted">Let&apos;s build your first training block.</p>
      </header>

      <div className="flex flex-col gap-5">
        {step === 0 && (
          <>
            <Field label="Sex">
              <div className="flex gap-2">
                {(["MALE", "FEMALE"] as const).map((s) => (
                  <Choice key={s} selected={sex === s} onClick={() => setSex(s)}>
                    {s === "MALE" ? "Male" : "Female"}
                  </Choice>
                ))}
              </div>
            </Field>
            <NumberField label="Age" value={age} onChange={setAge} placeholder="28" />
            <NumberField label="Height (cm)" value={heightCm} onChange={setHeightCm} placeholder="180" />
            <NumberField label="Weight (kg)" value={weightKg} onChange={setWeightKg} placeholder="82" />
          </>
        )}

        {step === 1 && (
          <>
            <Field label="Training days per week">
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <Choice key={d} selected={daysPerWeek === d} onClick={() => setDaysPerWeek(d)}>
                    {d}
                  </Choice>
                ))}
              </div>
            </Field>
            <NumberField
              label="Session length cap (min)"
              value={sessionLengthCapMin}
              onChange={setSessionLengthCapMin}
              placeholder="75"
            />
          </>
        )}

        {step === 2 && (
          <Field label="Split">
            <div className="flex flex-col gap-2">
              {SPLIT_OPTIONS.map((o) => (
                <CardChoice
                  key={o.value}
                  selected={splitType === o.value}
                  onClick={() => setSplitType(o.value)}
                  title={o.label}
                  hint={o.hint}
                />
              ))}
            </div>
          </Field>
        )}

        {step === 3 && (
          <>
            <Field label="Experience">
              <div className="flex flex-col gap-2">
                {PROFICIENCY_OPTIONS.map((o) => (
                  <CardChoice
                    key={o.value}
                    selected={proficiency === o.value}
                    onClick={() => setProficiency(o.value)}
                    title={o.label}
                    hint={o.hint}
                  />
                ))}
              </div>
            </Field>
            <Field label={`Priority muscles (optional, up to 3 — ${priorityMuscles.length}/3)`}>
              <div className="flex flex-wrap gap-2">
                {MUSCLE_GROUPS.map((m) => {
                  const on = priorityMuscles.includes(m);
                  const disabled = !on && priorityMuscles.length >= 3;
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={disabled}
                      onClick={() => togglePriority(m)}
                      className={
                        "rounded-pill border px-3 py-1.5 text-nav transition-colors " +
                        (on
                          ? "border-accent bg-selection text-accent"
                          : disabled
                            ? "border-border-subtle text-fg-subtle"
                            : "border-border-subtle text-fg-muted hover:text-fg")
                      }
                    >
                      {muscleLabel(m)}
                    </button>
                  );
                })}
              </div>
            </Field>
          </>
        )}
      </div>

      {createPlan.isError && (
        <p className="rounded-control border border-border px-3 py-2 text-nav text-fg-soft">
          {createPlan.error.message}
        </p>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || createPlan.isPending}
          className="text-nav text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
        >
          Back
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={submit}
            disabled={createPlan.isPending}
            className="rounded-control bg-accent px-4 py-2 text-nav font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {createPlan.isPending ? "Building your plan…" : "Create my plan"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canContinue}
            className="rounded-control border border-border px-4 py-2 text-nav text-fg transition-colors hover:border-fg-muted disabled:opacity-40"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-nav text-fg-muted">{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-control border border-border-subtle bg-canvas px-3 py-2 text-nav text-fg outline-none focus:border-border"
      />
    </Field>
  );
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-control border px-4 py-2 text-nav transition-colors " +
        (selected ? "border-accent bg-selection text-accent" : "border-border-subtle text-fg-muted hover:text-fg")
      }
    >
      {children}
    </button>
  );
}

function CardChoice({
  selected,
  onClick,
  title,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex flex-col gap-0.5 rounded-control border px-4 py-3 text-left transition-colors " +
        (selected ? "border-accent bg-selection" : "border-border-subtle hover:border-border")
      }
    >
      <span className={"text-nav " + (selected ? "text-accent" : "text-fg")}>{title}</span>
      <span className="text-[12px] text-fg-muted">{hint}</span>
    </button>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (All token classes used here are confirmed present in `src/components/ui-kit/app-shell-kit/theme.css`: `bg-accent`/`text-accent`/`border-accent` from `--color-accent`, `text-canvas`/`bg-canvas` from `--color-canvas`, `bg-selection`, `rounded-control`/`rounded-pill`, `text-nav`/`text-list`, `text-fg*`, `border-border*`. The theme is dark — `text-canvas` on `bg-accent` is intentional near-black text on the blue CTA.)

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/onboarding-wizard.tsx && git commit -m "feat(onboarding): 4-step wizard client component"
```

---

### Task 7: Onboarding route + redirect gate

**Files:**
- Create: `src/app/onboarding/layout.tsx`
- Create: `src/app/onboarding/page.tsx`
- Modify: `src/app/app/layout.tsx`

**Verification:** `pnpm typecheck && pnpm lint` + user visual/flow check.

**Interfaces:**
- Consumes: `OnboardingWizard` (`~/components/onboarding/onboarding-wizard`, Task 6); `getSession` (`~/server/better-auth/server`); `api` RSC caller (`~/trpc/server`); `redirect` (`next/navigation`).

- [ ] **Step 1: Chrome-free onboarding layout**

Create `src/app/onboarding/layout.tsx`:

```tsx
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-12">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Onboarding page with gate**

Create `src/app/onboarding/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { OnboardingWizard } from "~/components/onboarding/onboarding-wizard";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/");
  const block = await api.mesocycle.getCurrentBlock();
  if (block) redirect("/app"); // already has an active block — no re-onboarding
  return <OnboardingWizard />;
}
```

- [ ] **Step 3: Redirect blockless athletes from /app to onboarding**

Modify `src/app/app/layout.tsx` — add one line after the block fetch:

```tsx
import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { AppFrame } from "~/components/nav/app-frame";
import { api } from "~/trpc/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  const block = await api.mesocycle.getCurrentBlock();
  if (!block) redirect("/onboarding");
  return (
    <AppFrame userName={session.user.name} userEmail={session.user.email} block={block}>
      {children}
    </AppFrame>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/onboarding/layout.tsx src/app/onboarding/page.tsx src/app/app/layout.tsx && git commit -m "feat(onboarding): /onboarding route + /app redirect gate"
```

---

## Post-implementation: user DB verification (not a subagent step)

After all tasks pass typecheck/lint, the user verifies against Neon:
1. `pnpm db:seed` still produces its week-3 demo block unchanged.
2. A fresh account (no block) signing in is redirected to `/onboarding`; completing the 4-step wizard lands on `/app/block` showing a **real week-1 ACTIVE block** built from their inputs, with priority muscles reflected.
3. Re-visiting `/onboarding` redirects to `/app`.
4. An intentionally infeasible combo (e.g. many priority muscles + a very short session cap) shows the friendly error and creates nothing (re-run onboarding still works).

## Final whole-branch review

Dispatch the whole-branch code review (most capable model) over `freddy/experimental..freddy/feat/onboarding-to-plan`. Carry forward from ①'s review: the `?? 0` nullable-coalescing in `toPrescriptionView` (render "—" not 0) remains a ③ follow-up, not this slice. Then use superpowers:finishing-a-development-branch.

## Self-Review (completed)

- **Spec coverage:** route+gate (Task 7) ✓; `OnboardingInputSchema` (Task 1) ✓; `buildConstraintSetInput` + template + reconciliation (Tasks 2) ✓; `createPlan` mutation incl. infeasibility guard + version-bump + CONFLICT (Task 5) ✓; `persistMesocyclePlan` DRY + seed refactor (Task 4) ✓; wizard (Task 6) ✓; BlockGrid fix (Task 3) ✓; testing split (pure unit vs. DB-gated) ✓.
- **Type consistency:** `persistMesocyclePlan(tx, PersistMesocycleArgs)` signature identical in Tasks 4/5; `buildConstraintSetInput(OnboardingInput): ConstraintSetInput` identical in Tasks 2/5; `toWeekView(w, curIdx, muscles)` internal-only.
- **Placeholder scan:** no TBD/TODO; every code step carries full code.
- **Known acceptable:** the active-block guard in Task 5 reads before the transaction (tiny TOCTOU window) — acceptable defense-in-depth over the route gate for single-athlete first-block creation.
