# Check-in + Logging Write Path (Integration Layer ③) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an athlete log a session's per-set actuals (weight × reps × achieved-RIR) or mark it missed and accept an engine-computed reschedule — capturing the real performed data ④ will consume.

**Architecture:** A Prisma migration adds `SetLog` + session status. Two pure adapters (`weekPlanFromDb`, `adaptationContextFrom`) feed the existing `redistributeWeek`. A new `session` tRPC router exposes `logSession` (no gate — records truth), `getRescheduleOptions` (read-only), and `applyReschedule` (the only plan-mutating, accept-gated path, with a `DecisionLog` audit). The ② read path is extended to surface `status` + `loggedSets`, and the session detail page gains a log form + reschedule dialog.

**Tech Stack:** Next.js 15 App Router (RSC + client), tRPC 11, Prisma 6, Zod, BetterAuth, Tailwind v4, Vitest, pnpm.

## Global Constraints

- **Branch:** all work on `freddy/feat/checkin-logging`, branched off `freddy/experimental`; merges into `freddy/experimental` after the user's visual "lgtm". Nothing pushed to origin unless asked.
- **Subagents MUST NOT touch the live Neon DB:** no `pnpm db:seed`, no `prisma migrate deploy`/`prisma db push` against Neon, no running the mutations or `prisma/seed/seed.test.ts`. `pnpm prisma generate` is allowed (offline — regenerates the client from schema, no DB connection). DB-bound tasks are gated by `pnpm typecheck && pnpm lint`; the user applies the migration and verifies on Neon.
- **Law 1:** the engine/data owns every training number; adapters and mappers only reshape. `SetLog` rows are athlete-entered performed values (the athlete owns them); nothing in ③ feeds them back into the engine (that's ④).
- **Law 2:** deterministic; no LLM/invented claims in this slice.
- **Accept-gate:** `logSession` records truth → **no gate**. `applyReschedule` mutates the plan → **gated** (nothing mutates until the athlete accepts a `kind`), with a `DecisionLog` (REDISTRIBUTE / APPLIED) audit row. `getRescheduleOptions` mutates nothing.
- **Import paths:** `~/*` → `src/*` only. The generated Prisma client is at repo root `generated/prisma`, imported by RELATIVE path (`../../../generated/prisma` from `src/server/**`). `db` from `~/server/db`; engine from `~/engine`; schema/enums from `~/schema`; domain from `~/domain/*`; RSC caller `api` from `~/trpc/server`; client `api` from `~/trpc/react`.
- **Transaction timeout:** every `db.$transaction(...)` passes `{ timeout: 15000 }`.
- **Design tokens (dark theme):** existing tokens only — `bg-canvas`/`bg-surface`/`bg-surface-raised`/`bg-selection`, `text-fg`/`-soft`/`-muted`/`-subtle`, `border-border`/`-subtle`, `text-accent`/`bg-accent`/`hover:bg-accent-strong`, `rounded-card`/`-control`/`-pill`, `text-card-title`/`text-body`/`text-nav`, `.text-eyebrow`. Accent scarce — primary CTAs and selected states only. Primary CTA pattern: `rounded-control bg-accent px-4 py-2 text-nav font-medium text-white hover:bg-accent-strong`.
- **Enums (verbatim):** `SessionStatus` = SCHEDULED | COMPLETED | MISSED. `RedistributionKind` = MAKE_UP | PARTIAL | LET_GO. `MuscleGroup` order = CHEST, BACK, TRAPS, FRONT_DELTS, SIDE_DELTS, REAR_DELTS, BICEPS, TRICEPS, FOREARMS, ABS, QUADS, HAMSTRINGS, GLUTES, CALVES.
- **Engine guarantees (rely on, don't re-derive):** `redistributeWeek` always includes a LET_GO candidate and always flags exactly one `recommended`; a candidate's `week.sessions` are the remaining (non-missed) sessions, `slotId` = the `TrainingSession.id` passed in.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `prisma/schema.prisma` (modify) | `SessionStatus`, `TrainingSession.status/completedAt`, `SetLog`, `ExercisePrescription.setLogs` | 1 |
| `src/schema/logging.ts` (+ test) + `index.ts` | `LogSetInputSchema`, `LogSessionInputSchema` | 2 |
| `src/server/mesocycle/reschedule-adapters.ts` (+ test) | `weekPlanFromDb`, `adaptationContextFrom`, `constraintSetInputFromRow` + their includes | 3 |
| `src/views/reschedule.ts` (+ test) | `RescheduleOptionView`, `toRescheduleOptionViews` | 4 |
| `src/views/types.ts` (modify) + `src/server/views/to-mesocycle-view.ts` (modify) + test | `status` + `loggedSets` on the read path | 5 |
| `src/server/mesocycle/apply-week-plan.ts` | `applyWeekPlanToDb` | 6 |
| `src/server/api/routers/session.ts` + `root.ts` | `logSession`, `getRescheduleOptions`, `applyReschedule` | 7 |
| `src/components/block/session-panel.tsx` (client) + week page | log form + status + finish | 8 |
| `src/components/block/reschedule-dialog.tsx` (client) + panel wiring | mark-missed accept-gate | 9 |

**Order:** 1 (schema→types exist) → 2,3,4,5 (pure leaves) → 6 (DB helper) → 7 (router integrates 2/3/4/6) → 8 (log UI, needs 7 + 5) → 9 (reschedule UI, needs 7 + 4).

---

## Setup: create the branch

- [ ] **Step 1: Branch off experimental**

```bash
git checkout freddy/experimental && git checkout -b freddy/feat/checkin-logging
```
Expected: `Switched to a new branch 'freddy/feat/checkin-logging'`.

---

### Task 1: Schema — SetLog + session status

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `SessionStatus` enum; `TrainingSession.status` (default SCHEDULED) + `completedAt`; `SetLog` model; `ExercisePrescription.setLogs` back-relation. Regenerated Prisma client types consumed by all later tasks.

- [ ] **Step 1: Add the `SessionStatus` enum**

In `prisma/schema.prisma`, after the `BlockStatus` enum block, add:

```prisma
enum SessionStatus {
  SCHEDULED
  COMPLETED
  MISSED
}
```

- [ ] **Step 2: Add status + completedAt to `TrainingSession`**

In `model TrainingSession`, add these two fields (below `targetDurationMin`):

```prisma
  status            SessionStatus @default(SCHEDULED)
  completedAt       DateTime?
```

- [ ] **Step 3: Add the `SetLog` model + back-relation**

Add the back-relation inside `model ExercisePrescription` (below the `targetRir` field):

```prisma
  setLogs SetLog[]
```

Add the new model (place it after `model ExercisePrescription`):

```prisma
model SetLog {
  id                     String               @id @default(cuid())
  exercisePrescriptionId String
  exercisePrescription   ExercisePrescription @relation(fields: [exercisePrescriptionId], references: [id], onDelete: Cascade)
  setNumber              Int
  weightKg               Float
  reps                   Int
  achievedRir            Int?
  createdAt              DateTime             @default(now())

  @@unique([exercisePrescriptionId, setNumber])
  @@map("set_log")
}
```

- [ ] **Step 4: Regenerate the client + typecheck (do NOT push to Neon)**

Run: `pnpm prisma generate && pnpm typecheck`
Expected: client regenerates offline; typecheck clean (no consumers yet).
**Do NOT run `prisma db push`/`migrate` or `pnpm db:seed`** — the user applies the migration to Neon during verification.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma generated/prisma && git commit -m "feat(db): SetLog + TrainingSession status/completedAt"
```
(If `generated/prisma` is git-ignored, just commit `prisma/schema.prisma`.)

---

### Task 2: Logging input schema

**Files:**
- Create: `src/schema/logging.ts`
- Test: `src/schema/logging.test.ts`
- Modify: `src/schema/index.ts`

**Interfaces:**
- Produces: `LogSetInputSchema`, `LogSetInput`, `LogSessionInputSchema`, `LogSessionInput` — re-exported from `~/schema`.

- [ ] **Step 1: Write the failing test**

Create `src/schema/logging.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LogSessionInputSchema, LogSetInputSchema } from "./logging";

const set = { prescriptionId: "rx1", setNumber: 1, weightKg: 60, reps: 8, achievedRir: 2 };

describe("LogSetInputSchema", () => {
  it("accepts a valid set", () => {
    expect(LogSetInputSchema.parse(set)).toMatchObject(set);
  });
  it("allows a bodyweight set (weight 0) and omitted RIR", () => {
    const { achievedRir, ...rest } = set;
    expect(LogSetInputSchema.parse({ ...rest, weightKg: 0 }).achievedRir).toBeUndefined();
  });
  it("rejects setNumber < 1, negative weight/reps, and RIR out of 0–10", () => {
    expect(LogSetInputSchema.safeParse({ ...set, setNumber: 0 }).success).toBe(false);
    expect(LogSetInputSchema.safeParse({ ...set, weightKg: -1 }).success).toBe(false);
    expect(LogSetInputSchema.safeParse({ ...set, reps: -1 }).success).toBe(false);
    expect(LogSetInputSchema.safeParse({ ...set, achievedRir: 11 }).success).toBe(false);
  });
});

describe("LogSessionInputSchema", () => {
  it("accepts a session with sets and an empty session", () => {
    expect(LogSessionInputSchema.parse({ sessionId: "s1", sets: [set] }).sets).toHaveLength(1);
    expect(LogSessionInputSchema.parse({ sessionId: "s1", sets: [] }).sets).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/schema/logging.test.ts`
Expected: FAIL — cannot resolve `./logging`.

- [ ] **Step 3: Write the schema**

Create `src/schema/logging.ts`:

```ts
import { z } from "zod";

/** One performed set the athlete logs against a prescription. */
export const LogSetInputSchema = z.object({
  prescriptionId: z.string(),
  setNumber: z.number().int().min(1),
  weightKg: z.number().nonnegative(), // 0 allowed for bodyweight
  reps: z.number().int().min(0),
  achievedRir: z.number().int().min(0).max(10).optional(),
});
export type LogSetInput = z.infer<typeof LogSetInputSchema>;

/** A whole session's log, saved in one shot. An empty `sets` array is valid
 * (the session is completed with some/all exercises skipped). */
export const LogSessionInputSchema = z.object({
  sessionId: z.string(),
  sets: z.array(LogSetInputSchema),
});
export type LogSessionInput = z.infer<typeof LogSessionInputSchema>;
```

- [ ] **Step 4: Re-export**

In `src/schema/index.ts`, append:

```ts
export * from "./logging";
```

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm test src/schema/logging.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/schema/logging.ts src/schema/logging.test.ts src/schema/index.ts && git commit -m "feat(logging): LogSession input schema"
```

---

### Task 3: Reschedule engine adapters

**Files:**
- Create: `src/server/mesocycle/reschedule-adapters.ts`
- Test: `src/server/mesocycle/reschedule-adapters.test.ts`

**Interfaces:**
- Consumes: `WeekPlan`, `MuscleVolumeMap`, `AdaptationContext`, `AthleteContext`, `resolveConstraints` from `~/engine`; `EXERCISE_LIBRARY` from `~/domain/exercise-library`; `ConstraintSetInput`, `MUSCLE_GROUPS`, `MuscleGroup` from `~/schema`; `Prisma` (relative).
- Produces: `WEEK_FOR_PLAN_INCLUDE`, `WeekForPlan`, `weekPlanFromDb(week)`; `CS_WITH_TARGETS_INCLUDE`, `ConstraintSetWithTargets`, `constraintSetInputFromRow(cs)`, `adaptationContextFrom(cs, athlete)`.

- [ ] **Step 1: Write the failing test**

Create `src/server/mesocycle/reschedule-adapters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { WeekForPlan, ConstraintSetWithTargets } from "./reschedule-adapters";
import { adaptationContextFrom, constraintSetInputFromRow, weekPlanFromDb } from "./reschedule-adapters";

function makeWeek(): WeekForPlan {
  return {
    id: "wk1", mesocycleId: "m1", index: 2, isDeload: false,
    muscleVolumes: [
      { id: "v1", weekId: "wk1", muscle: "CHEST", plannedSets: 10 },
      { id: "v2", weekId: "wk1", muscle: "QUADS", plannedSets: 12 },
    ],
    sessions: [
      {
        id: "sB", weekId: "wk1", order: 1, splitSlot: "Lower A", dayOfWeek: null,
        targetDurationMin: 50, status: "SCHEDULED", completedAt: null,
        prescriptions: [
          { id: "p2", trainingSessionId: "sB", exerciseId: "eLP", order: 0, sets: 4, targetRepLow: 6, targetRepHigh: 10, targetRir: 2,
            exercise: { id: "eLP", name: "Leg Press", movementPattern: "SQUAT", equipment: "MACHINE", contraindications: [] } },
        ],
      },
      {
        id: "sA", weekId: "wk1", order: 0, splitSlot: "Upper A", dayOfWeek: 0,
        targetDurationMin: 58, status: "SCHEDULED", completedAt: null,
        prescriptions: [
          { id: "p1", trainingSessionId: "sA", exerciseId: "eBP", order: 0, sets: 3, targetRepLow: 6, targetRepHigh: 10, targetRir: 2,
            exercise: { id: "eBP", name: "Barbell Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "BARBELL", contraindications: [] } },
        ],
      },
    ],
  } as unknown as WeekForPlan;
}

function makeCs(): ConstraintSetWithTargets {
  return {
    id: "cs1", athleteProfileId: "ap1", version: 1, isActive: true,
    daysPerWeek: 4, splitType: "UPPER_LOWER", sessionLengthCapMin: 75,
    blockLengthWeeks: 6, deloadWeekIndex: 6, checkInCadence: "WEEKLY", createdAt: new Date(),
    muscleTargets: [
      { id: "t1", constraintSetId: "cs1", muscle: "SIDE_DELTS", weeklySetTarget: null, priority: 3 },
    ],
  } as unknown as ConstraintSetWithTargets;
}

describe("weekPlanFromDb", () => {
  it("maps a persisted week to an engine WeekPlan (slotId=session id, sorted, full volume map)", () => {
    const wp = weekPlanFromDb(makeWeek());
    expect(wp.index).toBe(2);
    expect(wp.isDeload).toBe(false);
    expect(wp.sessions.map((s) => s.slotId)).toEqual(["sA", "sB"]); // sorted by order
    expect(wp.sessions[0]!.prescriptions[0]!.exerciseName).toBe("Barbell Bench Press");
    expect(wp.muscleVolume.CHEST).toBe(10);
    expect(wp.muscleVolume.BICEPS).toBe(0); // muscles with no row default to 0
  });
});

describe("constraintSetInputFromRow", () => {
  it("maps a stored constraint set to a ConstraintSetInput", () => {
    const input = constraintSetInputFromRow(makeCs());
    expect(input.daysPerWeek).toBe(4);
    expect(input.muscleTargets).toEqual([{ muscle: "SIDE_DELTS", weeklySetTarget: undefined, priority: 3 }]);
    expect(input.excludedExerciseNames).toEqual([]);
  });
});

describe("adaptationContextFrom", () => {
  it("resolves the stored set into an AdaptationContext", () => {
    const ctx = adaptationContextFrom(makeCs(), { experienceLevel: "INTERMEDIATE", phase: "MAINTAIN", landmarks: {} as never });
    expect(ctx.splitType).toBe("UPPER_LOWER");
    expect(ctx.daysPerWeek).toBe(4);
    expect(ctx.isBeginner).toBe(false);
    expect(ctx.targets.length).toBeGreaterThan(0);
    expect(ctx.library.length).toBeGreaterThan(0);
  });
});
```

Note: `adaptationContextFrom` builds landmarks internally? No — it passes `athlete.landmarks` to `resolveConstraints`; the test passes a stubbed landmarks that resolveConstraints must tolerate. **If `resolveConstraints` dereferences landmarks per muscle**, the test must pass real landmarks — use `DEFAULT_LANDMARKS`:

```ts
// at top of test file:
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
// and in the adaptationContextFrom test, pass landmarks: DEFAULT_LANDMARKS
```
Use `DEFAULT_LANDMARKS` in the `adaptationContextFrom` test call (replace the `{} as never`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/mesocycle/reschedule-adapters.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the adapters**

Create `src/server/mesocycle/reschedule-adapters.ts`:

```ts
import type { Prisma } from "../../../generated/prisma";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import {
  resolveConstraints,
  type AdaptationContext,
  type AthleteContext,
  type MuscleVolumeMap,
  type WeekPlan,
} from "~/engine";
import { MUSCLE_GROUPS, type ConstraintSetInput, type MuscleGroup } from "~/schema";

/** The week shape `weekPlanFromDb` needs: sessions (+prescriptions+exercise) and muscle volumes. */
export const WEEK_FOR_PLAN_INCLUDE = {
  muscleVolumes: true,
  sessions: { include: { prescriptions: { include: { exercise: true } } } },
} satisfies Prisma.WeekInclude;

export type WeekForPlan = Prisma.WeekGetPayload<{ include: typeof WEEK_FOR_PLAN_INCLUDE }>;

/**
 * Inverse of the persist/view mappers: reconstruct the engine's WeekPlan from a
 * persisted week so `redistributeWeek` has real input. slotId = TrainingSession.id
 * (so candidates map straight back to DB rows). muscleVolume is a full map (0 for
 * muscles with no row). Nullable target fields coalesce to 0, matching the view mapper.
 */
export function weekPlanFromDb(week: WeekForPlan): WeekPlan {
  const muscleVolume = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0])) as MuscleVolumeMap;
  for (const v of week.muscleVolumes) muscleVolume[v.muscle] = v.plannedSets;

  const sessions = [...week.sessions]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      slotId: s.id,
      label: s.splitSlot,
      estimatedMinutes: s.targetDurationMin ?? 0,
      prescriptions: [...s.prescriptions]
        .sort((a, b) => a.order - b.order)
        .map((p) => ({
          exerciseName: p.exercise.name,
          sets: p.sets,
          repRangeLow: p.targetRepLow ?? 0,
          repRangeHigh: p.targetRepHigh ?? 0,
          targetRir: p.targetRir ?? 0,
        })),
    }));

  return { index: week.index, isDeload: week.isDeload, sessions, muscleVolume };
}

export const CS_WITH_TARGETS_INCLUDE = { muscleTargets: true } satisfies Prisma.ConstraintSetInclude;
export type ConstraintSetWithTargets = Prisma.ConstraintSetGetPayload<{
  include: typeof CS_WITH_TARGETS_INCLUDE;
}>;

/** Stored constraint-set row → the engine's ConstraintSetInput contract. Exclusions
 * are not wired by onboarding (② always sets []), and redistribute uses the full
 * library, so excludedExerciseNames is []. */
export function constraintSetInputFromRow(cs: ConstraintSetWithTargets): ConstraintSetInput {
  return {
    daysPerWeek: cs.daysPerWeek,
    splitType: cs.splitType,
    sessionLengthCapMin: cs.sessionLengthCapMin,
    blockLengthWeeks: cs.blockLengthWeeks,
    deloadWeekIndex: cs.deloadWeekIndex ?? undefined,
    checkInCadence: cs.checkInCadence,
    muscleTargets: cs.muscleTargets.map((t) => ({
      muscle: t.muscle,
      weeklySetTarget: t.weeklySetTarget ?? undefined,
      priority: t.priority,
    })),
    excludedExerciseNames: [],
  };
}

/** Assemble the AdaptationContext `redistributeWeek` needs by re-resolving the
 * stored constraint set (for resolved targets + isBeginner). */
export function adaptationContextFrom(
  cs: ConstraintSetWithTargets,
  athlete: AthleteContext,
): AdaptationContext {
  const spec = resolveConstraints(constraintSetInputFromRow(cs), athlete);
  if (spec.kind !== "resolved") {
    throw new Error("adaptationContextFrom: stored constraint set re-resolved as infeasible.");
  }
  return {
    targets: spec.targets,
    splitType: spec.splitType,
    daysPerWeek: spec.daysPerWeek,
    sessionLengthCapMin: spec.sessionLengthCapMin,
    blockLengthWeeks: spec.blockLengthWeeks,
    deloadWeekIndex: spec.deloadWeekIndex,
    isBeginner: spec.isBeginner,
    library: EXERCISE_LIBRARY,
  };
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm test src/server/mesocycle/reschedule-adapters.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/mesocycle/reschedule-adapters.ts src/server/mesocycle/reschedule-adapters.test.ts && git commit -m "feat(reschedule): weekPlanFromDb + adaptationContextFrom adapters"
```

---

### Task 4: Reschedule view mapper

**Files:**
- Create: `src/views/reschedule.ts`
- Test: `src/views/reschedule.test.ts`

**Interfaces:**
- Consumes: `RedistributionCandidate`, `WeekPlan` from `~/engine`.
- Produces: `RescheduleOptionView`, `toRescheduleOptionViews(candidates, originalWeek)`.

- [ ] **Step 1: Write the failing test**

Create `src/views/reschedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { RedistributionCandidate, WeekPlan } from "~/engine";
import { toRescheduleOptionViews } from "./reschedule";

const originalWeek = {
  index: 2, isDeload: false,
  muscleVolume: {} as never,
  sessions: [
    { slotId: "sA", label: "Upper A", estimatedMinutes: 50, prescriptions: [{ exerciseName: "Bench", sets: 3, repRangeLow: 6, repRangeHigh: 10, targetRir: 2 }] },
    { slotId: "sB", label: "Lower A", estimatedMinutes: 50, prescriptions: [{ exerciseName: "Squat", sets: 4, repRangeLow: 6, repRangeHigh: 10, targetRir: 2 }] },
  ],
} as unknown as WeekPlan;

function candidate(over: Partial<RedistributionCandidate>): RedistributionCandidate {
  return {
    kind: "MAKE_UP",
    recommended: false,
    tradeoff: { recovered: 3, dropped: 0 },
    facts: [],
    week: {
      index: 2, isDeload: false, muscleVolume: {} as never,
      sessions: [
        { slotId: "sA", label: "Upper A", estimatedMinutes: 74, prescriptions: [{ exerciseName: "Bench", sets: 6, repRangeLow: 6, repRangeHigh: 10, targetRir: 2 }] },
        { slotId: "sB", label: "Lower A", estimatedMinutes: 50, prescriptions: [{ exerciseName: "Squat", sets: 4, repRangeLow: 6, repRangeHigh: 10, targetRir: 2 }] },
      ],
    },
    ...over,
  } as RedistributionCandidate;
}

describe("toRescheduleOptionViews", () => {
  it("maps kind/recovered/dropped/recommended and per-session added sets", () => {
    const views = toRescheduleOptionViews([candidate({ recommended: true })], originalWeek);
    expect(views).toHaveLength(1);
    const v = views[0]!;
    expect(v.kind).toBe("MAKE_UP");
    expect(v.recommended).toBe(true);
    expect(v.recoveredSets).toBe(3);
    expect(v.droppedSets).toBe(0);
    // sA went 3 → 6 sets (+3); sB unchanged (filtered out)
    expect(v.perSession).toEqual([{ slotId: "sA", label: "Upper A", addedSets: 3 }]);
  });

  it("summarises LET_GO as a drop", () => {
    const letGo = candidate({ kind: "LET_GO", tradeoff: { recovered: 0, dropped: 4 }, week: originalWeek });
    const v = toRescheduleOptionViews([letGo], originalWeek)[0]!;
    expect(v.kind).toBe("LET_GO");
    expect(v.perSession).toEqual([]);
    expect(v.summary.toLowerCase()).toContain("drop");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/views/reschedule.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the mapper**

Create `src/views/reschedule.ts`:

```ts
import type { RedistributionCandidate, RedistributionKind, SessionPlan, WeekPlan } from "~/engine";

export interface RescheduleOptionView {
  kind: RedistributionKind;
  recommended: boolean;
  recoveredSets: number;
  droppedSets: number;
  summary: string;
  perSession: { slotId: string; label: string; addedSets: number }[];
}

function totalSets(s: SessionPlan): number {
  return s.prescriptions.reduce((n, p) => n + p.sets, 0);
}

function summarise(kind: RedistributionKind, recovered: number, dropped: number): string {
  if (kind === "MAKE_UP") return `Make up all ${recovered} sets across your remaining sessions.`;
  if (kind === "PARTIAL") return `Recover ${recovered} priority sets, drop ${dropped}.`;
  return `Skip it — drop ${dropped} sets this week.`;
}

/** Pure: engine redistribution candidates → athlete-facing option views. `addedSets`
 * per session is the candidate's set count minus the original week's. Numbers come
 * from the engine (tradeoff + candidate plan); this only reshapes. */
export function toRescheduleOptionViews(
  candidates: RedistributionCandidate[],
  originalWeek: WeekPlan,
): RescheduleOptionView[] {
  const origBySlot = new Map(originalWeek.sessions.map((s) => [s.slotId, totalSets(s)]));
  return candidates.map((c) => ({
    kind: c.kind,
    recommended: c.recommended,
    recoveredSets: c.tradeoff.recovered,
    droppedSets: c.tradeoff.dropped,
    summary: summarise(c.kind, c.tradeoff.recovered, c.tradeoff.dropped),
    perSession: c.week.sessions
      .map((s) => ({ slotId: s.slotId, label: s.label, addedSets: totalSets(s) - (origBySlot.get(s.slotId) ?? 0) }))
      .filter((p) => p.addedSets > 0),
  }));
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm test src/views/reschedule.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/views/reschedule.ts src/views/reschedule.test.ts && git commit -m "feat(reschedule): candidate → option view mapper"
```

---

### Task 5: Read-path extension — status + loggedSets

**Files:**
- Modify: `src/views/types.ts`
- Modify: `src/server/views/to-mesocycle-view.ts`
- Modify (extend): `src/server/views/to-mesocycle-view.test.ts`

**Interfaces:**
- Produces: `SessionStatus` view type, `LoggedSetView`; `SessionView.status`, `PrescriptionView.loggedSets`. `MESOCYCLE_INCLUDE` now pulls each prescription's `setLogs` and each session's `status`.

- [ ] **Step 1: Extend the view types**

In `src/views/types.ts`, add near the top (after `Zone`):

```ts
export type SessionStatus = "SCHEDULED" | "COMPLETED" | "MISSED";

export interface LoggedSetView {
  setNumber: number;
  weightKg: number;
  reps: number;
  achievedRir: number | null;
}
```

Add `loggedSets` to `PrescriptionView` (below `muscles`):

```ts
  loggedSets?: LoggedSetView[];
```

Add `status` to `SessionView` (below `estimatedMinutes`):

```ts
  status: SessionStatus;
```

- [ ] **Step 2: Extend the include + mappers**

In `src/server/views/to-mesocycle-view.ts`, add `setLogs: true` to the prescription include. Change:

```ts
          prescriptions: {
            include: { exercise: { include: { muscles: true } } },
          },
```

to:

```ts
          prescriptions: {
            include: { exercise: { include: { muscles: true } }, setLogs: true },
          },
```

Import the new view types — change the type import block to include `LoggedSetView` and `SessionStatus`:

```ts
import type {
  LoggedSetView,
  MesocycleView,
  MuscleChip,
  MuscleWeekCell,
  PrescriptionView,
  SessionStatus,
  SessionView,
  WeekView,
} from "~/views/types";
```

In `toPrescriptionView`, add `loggedSets` to the returned object (after `muscles`):

```ts
    loggedSets:
      p.setLogs.length > 0
        ? [...p.setLogs]
            .sort((a, b) => a.setNumber - b.setNumber)
            .map(
              (l): LoggedSetView => ({
                setNumber: l.setNumber,
                weightKg: l.weightKg,
                reps: l.reps,
                achievedRir: l.achievedRir, // Int? → number | null; do NOT coalesce to 0
              }),
            )
        : undefined,
```

In `toSessionView`, add `status` to the returned object (after `estimatedMinutes`):

```ts
    status: s.status as SessionStatus,
```

- [ ] **Step 3: Update the test fixture + add assertions**

In `src/server/views/to-mesocycle-view.test.ts`, the `makeMesocycle` builder's sessions and prescriptions now need `status` and `setLogs` (the include type requires them). For BOTH session objects in the builder, add `status: "SCHEDULED" as const,` and `completedAt: null,` alongside `dayOfWeek`. For every prescription object, add `setLogs: [],` alongside `exercise`.

Give the first prescription of the first session (the `Barbell Bench Press`, `rx-${index}-bench`) real logs to exercise the mapper — set its `setLogs` to:

```ts
              setLogs: [
                { id: `sl-${index}-2`, exercisePrescriptionId: `rx-${index}-bench`, setNumber: 2, weightKg: 60, reps: 7, achievedRir: 1, createdAt: new Date() },
                { id: `sl-${index}-1`, exercisePrescriptionId: `rx-${index}-bench`, setNumber: 1, weightKg: 60, reps: 8, achievedRir: null, createdAt: new Date() },
              ],
```

Then add two tests inside `describe("toMesocycleView", ...)`:

```ts
  it("surfaces session status", () => {
    expect(toMesocycleView(makeMesocycle()).weeks[0]!.sessions[0]!.status).toBe("SCHEDULED");
  });

  it("maps logged sets sorted by setNumber, preserving null achievedRir", () => {
    const bench = toMesocycleView(makeMesocycle()).weeks[0]!.sessions[0]!.prescriptions[0]!;
    expect(bench.loggedSets).toEqual([
      { setNumber: 1, weightKg: 60, reps: 8, achievedRir: null },
      { setNumber: 2, weightKg: 60, reps: 7, achievedRir: 1 },
    ]);
    // a prescription with no logs → undefined, not []
    const legPress = toMesocycleView(makeMesocycle()).weeks[0]!.sessions[1]!.prescriptions[0]!;
    expect(legPress.loggedSets).toBeUndefined();
  });
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm test src/server/views/to-mesocycle-view.test.ts && pnpm typecheck`
Expected: PASS (all pre-existing + 2 new); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/views/types.ts src/server/views/to-mesocycle-view.ts src/server/views/to-mesocycle-view.test.ts && git commit -m "feat(views): surface session status + logged sets"
```

---

### Task 6: `applyWeekPlanToDb` helper (DB-bound)

**Files:**
- Create: `src/server/mesocycle/apply-week-plan.ts`

**DB gate:** `pnpm typecheck && pnpm lint` only.

**Interfaces:**
- Consumes: `Prisma.TransactionClient` (relative); `WeekPlan` from `~/engine`; `MuscleGroup` from `~/schema`.
- Produces: `applyWeekPlanToDb(tx, weekId, plan): Promise<void>`.

- [ ] **Step 1: Write the helper**

Create `src/server/mesocycle/apply-week-plan.ts`:

```ts
import type { Prisma } from "../../../generated/prisma";
import type { WeekPlan } from "~/engine";
import type { MuscleGroup } from "~/schema";

/**
 * Applies a redistributed WeekPlan to the DB inside the caller's transaction:
 * rewrites each plan session's prescriptions (matched by slotId = TrainingSession.id)
 * and recomputes the week's WeekMuscleVolume from the plan. Only the sessions present
 * in `plan.sessions` are touched — the caller filters COMPLETED sessions out before
 * building the plan, so logged sessions (and their SetLogs) are never clobbered.
 * Throws on an unknown exercise name so a bad plan rolls the transaction back.
 */
export async function applyWeekPlanToDb(
  tx: Prisma.TransactionClient,
  weekId: string,
  plan: WeekPlan,
): Promise<void> {
  const exercises = await tx.exercise.findMany({ select: { id: true, name: true } });
  const idByName = new Map(exercises.map((e) => [e.name, e.id]));

  for (const session of plan.sessions) {
    await tx.exercisePrescription.deleteMany({ where: { trainingSessionId: session.slotId } });
    await tx.exercisePrescription.createMany({
      data: session.prescriptions.map((rx, order) => {
        const exerciseId = idByName.get(rx.exerciseName);
        if (!exerciseId) {
          throw new Error(`applyWeekPlanToDb: prescription references unknown exercise "${rx.exerciseName}".`);
        }
        return {
          trainingSessionId: session.slotId,
          exerciseId,
          order,
          sets: rx.sets,
          targetRepLow: rx.repRangeLow,
          targetRepHigh: rx.repRangeHigh,
          targetRir: rx.targetRir,
        };
      }),
    });
    await tx.trainingSession.update({
      where: { id: session.slotId },
      data: { targetDurationMin: session.estimatedMinutes },
    });
  }

  await tx.weekMuscleVolume.deleteMany({ where: { weekId } });
  await tx.weekMuscleVolume.createMany({
    data: Object.entries(plan.muscleVolume)
      .filter(([, sets]) => sets > 0)
      .map(([muscle, sets]) => ({ weekId, muscle: muscle as MuscleGroup, plannedSets: sets })),
  });
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/server/mesocycle/apply-week-plan.ts && git commit -m "feat(reschedule): applyWeekPlanToDb transaction helper"
```

---

### Task 7: `session` router (DB-bound)

**Files:**
- Create: `src/server/api/routers/session.ts`
- Modify: `src/server/api/root.ts`

**DB gate:** `pnpm typecheck && pnpm lint` only. Do NOT run the mutations.

**Interfaces:**
- Consumes: `LogSessionInputSchema` (`~/schema`); `redistributeWeek`, `AthleteContext` (`~/engine`); `DEFAULT_LANDMARKS` (`~/domain/landmarks`); `weekPlanFromDb`, `WEEK_FOR_PLAN_INCLUDE`, `adaptationContextFrom`, `CS_WITH_TARGETS_INCLUDE` (`~/server/mesocycle/reschedule-adapters`); `applyWeekPlanToDb` (`~/server/mesocycle/apply-week-plan`); `toRescheduleOptionViews` (`~/views/reschedule`).
- Produces: `sessionRouter` with `logSession → { status }`, `getRescheduleOptions → RescheduleOptionView[]`, `applyReschedule → { weekIndex }`, registered as `session`.

- [ ] **Step 1: Write the router**

Create `src/server/api/routers/session.ts`:

```ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { redistributeWeek, type AthleteContext, type WeekPlan } from "~/engine";
import { LogSessionInputSchema } from "~/schema";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { applyWeekPlanToDb } from "~/server/mesocycle/apply-week-plan";
import {
  adaptationContextFrom,
  weekPlanFromDb,
  CS_WITH_TARGETS_INCLUDE,
  WEEK_FOR_PLAN_INCLUDE,
} from "~/server/mesocycle/reschedule-adapters";
import { toRescheduleOptionViews } from "~/views/reschedule";

const RescheduleKindEnum = z.enum(["MAKE_UP", "PARTIAL", "LET_GO"]);

/** Load a SCHEDULED-eligible session scoped to the signed-in athlete's ACTIVE block,
 * plus everything the reschedule path needs. Throws NOT_FOUND if it isn't theirs. */
async function loadRescheduleContext(
  db: (typeof import("~/server/db"))["db"],
  userId: string,
  sessionId: string,
) {
  const session = await db.trainingSession.findFirst({
    where: {
      id: sessionId,
      week: { mesocycle: { status: "ACTIVE", athleteProfile: { userId } } },
    },
    select: {
      id: true,
      status: true,
      week: {
        select: {
          id: true,
          index: true,
          mesocycleId: true,
          mesocycle: {
            select: {
              constraintSetId: true,
              athleteProfile: { select: { experience: true, phase: true } },
            },
          },
        },
      },
    },
  });
  if (!session) throw new TRPCError({ code: "NOT_FOUND" });
  return session;
}

export const sessionRouter = createTRPCRouter({
  // Record truth — no accept-gate.
  logSession: protectedProcedure
    .input(LogSessionInputSchema)
    .mutation(async ({ ctx, input }): Promise<{ status: "COMPLETED" }> => {
      const userId = ctx.session.user.id;
      const session = await ctx.db.trainingSession.findFirst({
        where: { id: input.sessionId, week: { mesocycle: { status: "ACTIVE", athleteProfile: { userId } } } },
        select: { id: true, status: true, prescriptions: { select: { id: true } } },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.status === "MISSED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This session was marked missed — reschedule it instead of logging." });
      }
      const validIds = new Set(session.prescriptions.map((p) => p.id));
      for (const s of input.sets) {
        if (!validIds.has(s.prescriptionId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A logged set references an exercise not in this session." });
        }
      }
      await ctx.db.$transaction(
        async (tx) => {
          await tx.setLog.deleteMany({ where: { exercisePrescriptionId: { in: [...validIds] } } });
          if (input.sets.length > 0) {
            await tx.setLog.createMany({
              data: input.sets.map((s) => ({
                exercisePrescriptionId: s.prescriptionId,
                setNumber: s.setNumber,
                weightKg: s.weightKg,
                reps: s.reps,
                achievedRir: s.achievedRir ?? null,
              })),
            });
          }
          await tx.trainingSession.update({
            where: { id: session.id },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
        },
        { timeout: 15000 },
      );
      return { status: "COMPLETED" };
    }),

  // Compute reschedule proposals — mutates nothing.
  getRescheduleOptions: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const session = await loadRescheduleContext(ctx.db, userId, input.sessionId);
      if (session.status !== "SCHEDULED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only a scheduled session can be rescheduled." });
      }
      const { forRedistribute, candidates } = await computeCandidates(ctx.db, session);
      return toRescheduleOptionViews(candidates, forRedistribute);
    }),

  // Accept-gated plan mutation.
  applyReschedule: protectedProcedure
    .input(z.object({ sessionId: z.string(), kind: RescheduleKindEnum }))
    .mutation(async ({ ctx, input }): Promise<{ weekIndex: number }> => {
      const userId = ctx.session.user.id;
      const session = await loadRescheduleContext(ctx.db, userId, input.sessionId);
      if (session.status !== "SCHEDULED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only a scheduled session can be rescheduled." });
      }
      const { candidates } = await computeCandidates(ctx.db, session);
      const chosen = candidates.find((c) => c.kind === input.kind);
      if (!chosen) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That reschedule option isn't available." });
      }
      const weekIndex = session.week.index;
      await ctx.db.$transaction(
        async (tx) => {
          await tx.trainingSession.update({ where: { id: session.id }, data: { status: "MISSED" } });
          if (chosen.kind !== "LET_GO") {
            await applyWeekPlanToDb(tx, session.week.id, chosen.week);
          }
          await tx.decisionLog.create({
            data: {
              mesocycleId: session.week.mesocycleId,
              weekIndex,
              type: "REDISTRIBUTE",
              status: "APPLIED",
              summary: `Missed session rescheduled (${chosen.kind})`,
              reasoning: chosen.kind,
              payload: { kind: chosen.kind, tradeoff: chosen.tradeoff, facts: chosen.facts },
            },
          });
        },
        { timeout: 15000 },
      );
      return { weekIndex };
    }),
});

/** Shared: rebuild the week plan (excluding already-COMPLETED sessions so their logs
 * are never touched), build the adaptation context, and run redistributeWeek. */
async function computeCandidates(
  db: (typeof import("~/server/db"))["db"],
  session: Awaited<ReturnType<typeof loadRescheduleContext>>,
) {
  const week = await db.week.findUniqueOrThrow({
    where: { id: session.week.id },
    include: WEEK_FOR_PLAN_INCLUDE,
  });
  const cs = await db.constraintSet.findUniqueOrThrow({
    where: { id: session.week.mesocycle.constraintSetId },
    include: CS_WITH_TARGETS_INCLUDE,
  });
  const athlete: AthleteContext = {
    experienceLevel: session.week.mesocycle.athleteProfile.experience,
    phase: session.week.mesocycle.athleteProfile.phase,
    landmarks: DEFAULT_LANDMARKS,
  };
  const completed = new Set(week.sessions.filter((s) => s.status === "COMPLETED").map((s) => s.id));
  const fullPlan = weekPlanFromDb(week);
  // Exclude completed sessions from redistribution targets (protects their SetLogs).
  const forRedistribute: WeekPlan = { ...fullPlan, sessions: fullPlan.sessions.filter((s) => !completed.has(s.slotId)) };
  const ctxA = adaptationContextFrom(cs, athlete);
  const candidates = redistributeWeek(forRedistribute, [session.id], ctxA);
  return { forRedistribute, candidates };
}
```

Note on `WEEK_FOR_PLAN_INCLUDE`: `weekPlanFromDb` only reads `prescriptions.exercise`, but `computeCandidates` also reads `session.status` — `status` is a scalar on `TrainingSession`, auto-selected by the `include`, so it is present on `week.sessions[i].status` with no include change.

- [ ] **Step 2: Register the router**

In `src/server/api/root.ts`, add the import and registration:

```ts
import { healthRouter } from "~/server/api/routers/health";
import { mesocycleRouter } from "~/server/api/routers/mesocycle";
import { onboardingRouter } from "~/server/api/routers/onboarding";
import { sessionRouter } from "~/server/api/routers/session";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  mesocycle: mesocycleRouter,
  onboarding: onboardingRouter,
  session: sessionRouter,
});
```

(Leave `AppRouter` + `createCaller` unchanged.)

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/session.ts src/server/api/root.ts && git commit -m "feat(session): logSession + reschedule (options + accept-gated apply)"
```

---

### Task 8: Session logging UI (client)

**Files:**
- Create: `src/components/block/session-panel.tsx`
- Modify: `src/app/app/block/[blockId]/week/[n]/page.tsx`

**Verification:** `pnpm typecheck && pnpm lint` + user visual check.

**Interfaces:**
- Consumes: `SessionView` (`~/views/types`); `api` (`~/trpc/react`); `useRouter`.
- Produces: `SessionPanel` (client) rendering read-only view, a per-set log form (fill-down), status badges, and "Finish session"; wired into the week page in place of `SessionCard`. (Task 9 adds the "Mark missed" action + dialog to this component.)

- [ ] **Step 1: Write the panel**

Create `src/components/block/session-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PencilLine } from "lucide-react";
import type { PrescriptionView, SessionView } from "~/views/types";
import { api } from "~/trpc/react";

type SetRow = { weight: string; reps: string; rir: string };

function short(m: string): string {
  return m.replace(/_/g, " ").toLowerCase();
}

function StatusBadge({ status }: { status: SessionView["status"] }) {
  if (status === "COMPLETED") {
    return <span className="rounded-pill bg-zone-optimal-soft px-2 py-0.5 text-[11px] text-fg-soft">Completed</span>;
  }
  if (status === "MISSED") {
    return <span className="rounded-pill bg-zone-max-soft px-2 py-0.5 text-[11px] text-fg-soft">Missed</span>;
  }
  return <span className="rounded-pill bg-surface-raised px-2 py-0.5 text-[11px] text-fg-subtle">Scheduled</span>;
}

export function SessionPanel({ session }: { session: SessionView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // rows[prescriptionIndex] = one row per planned set
  const [rows, setRows] = useState<SetRow[][]>(() =>
    session.prescriptions.map((p) =>
      Array.from({ length: Math.max(p.sets, 1) }, () => ({ weight: "", reps: "", rir: "" })),
    ),
  );

  const logSession = api.session.logSession.useMutation({
    onSuccess: () => {
      setEditing(false);
      router.refresh();
    },
  });

  function setCell(pi: number, si: number, key: keyof SetRow, value: string) {
    setRows((prev) => prev.map((pr, i) => (i === pi ? pr.map((r, j) => (j === si ? { ...r, [key]: value } : r)) : pr)));
  }
  function fillDown(pi: number) {
    setRows((prev) =>
      prev.map((pr, i) => (i === pi && pr[0] ? pr.map(() => ({ ...pr[0]! })) : pr)),
    );
  }

  function finish() {
    const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
    const sets = session.prescriptions.flatMap((p, pi) =>
      rows[pi]!.flatMap((r, si) => {
        const w = num(r.weight), reps = num(r.reps), rir = num(r.rir);
        if (Number.isNaN(w) || Number.isNaN(reps)) return []; // skip un-filled sets
        return [{
          prescriptionId: p.id,
          setNumber: si + 1,
          weightKg: w,
          reps,
          achievedRir: Number.isNaN(rir) ? undefined : rir,
        }];
      }),
    );
    logSession.mutate({ sessionId: session.slotId, sets });
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-card-title text-fg">{session.label}</span>
          <StatusBadge status={session.status} />
        </div>
        <div className="text-[12px] text-fg-subtle">
          {session.dayTag ? `${session.dayTag} · ` : ""}
          {session.estimatedMinutes} min
        </div>
      </div>

      {editing ? (
        <div className="mt-4 flex flex-col gap-4">
          {session.prescriptions.map((p, pi) => (
            <LogRows key={`${p.exerciseName}-${pi}`} p={p} rows={rows[pi]!} pi={pi} onCell={setCell} onFill={() => fillDown(pi)} />
          ))}
          {logSession.isError && (
            <p className="rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">
              {logSession.error.message}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={finish}
              disabled={logSession.isPending}
              className="inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2 text-nav font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
            >
              <Check className="size-4" aria-hidden /> {logSession.isPending ? "Saving…" : "Finish session"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-nav text-fg-muted hover:text-fg">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-3">
            {session.prescriptions.map((p, i) => (
              <li key={`${p.exerciseName}-${i}`}>
                <div className="text-body text-fg">
                  {p.exerciseName} — {p.sets} × {p.repRangeLow}–{p.repRangeHigh} @ {p.targetRir} RIR
                </div>
                {p.loggedSets && p.loggedSets.length > 0 ? (
                  <div className="mt-1 text-nav text-fg-muted">
                    {p.loggedSets.map((l) => `${l.weightKg}×${l.reps}${l.achievedRir === null ? "" : ` @${l.achievedRir}`}`).join(" · ")}
                  </div>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.muscles.map((c) => (
                      <span key={c.muscle} className={"rounded-pill px-1.5 py-0.5 text-[11px] " + (c.role === "PRIMARY" ? "bg-surface-raised text-fg-soft" : "text-fg-subtle")}>
                        {short(c.muscle)} {c.fraction}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {session.status === "SCHEDULED" ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-4 inline-flex items-center gap-1.5 text-nav text-fg-muted transition-colors hover:text-fg"
            >
              <PencilLine className="size-4" aria-hidden /> Log session
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function LogRows({
  p,
  rows,
  pi,
  onCell,
  onFill,
}: {
  p: PrescriptionView;
  rows: SetRow[];
  pi: number;
  onCell: (pi: number, si: number, key: keyof SetRow, value: string) => void;
  onFill: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-nav text-fg">{p.exerciseName}</span>
        <button type="button" onClick={onFill} className="text-[12px] text-fg-subtle hover:text-fg">
          fill down
        </button>
      </div>
      {rows.map((r, si) => (
        <div key={si} className="flex items-center gap-2">
          <span className="w-10 text-[12px] text-fg-subtle">Set {si + 1}</span>
          <CellInput value={r.weight} onChange={(v) => onCell(pi, si, "weight", v)} unit="kg" />
          <CellInput value={r.reps} onChange={(v) => onCell(pi, si, "reps", v)} unit="reps" />
          <CellInput value={r.rir} onChange={(v) => onCell(pi, si, "rir", v)} unit="RIR" />
        </div>
      ))}
    </div>
  );
}

function CellInput({ value, onChange, unit }: { value: string; onChange: (v: string) => void; unit: string }) {
  return (
    <div className="relative flex-1">
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-control border border-border-subtle bg-canvas px-2 py-1.5 pr-10 text-nav text-fg outline-none transition-colors focus:border-accent"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-fg-subtle">{unit}</span>
    </div>
  );
}
```

- [ ] **Step 2: Wire the panel into the week page**

In `src/app/app/block/[blockId]/week/[n]/page.tsx`, replace the `SessionCard` import and usage with `SessionPanel`:

Change the import:
```ts
import { SessionCard } from "~/components/block/session-card";
```
to:
```ts
import { SessionPanel } from "~/components/block/session-panel";
```

Change the render:
```tsx
        {week.sessions.map((s) => (
          <SessionCard key={s.slotId} session={s} />
        ))}
```
to:
```tsx
        {week.sessions.map((s) => (
          <SessionPanel key={s.slotId} session={s} />
        ))}
```

(Leave `SessionCard` in place — it may be used elsewhere / in its own tests.)

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/block/session-panel.tsx "src/app/app/block/[blockId]/week/[n]/page.tsx" && git commit -m "feat(session): per-set logging UI (SessionPanel)"
```

---

### Task 9: Reschedule dialog (client)

**Files:**
- Create: `src/components/block/reschedule-dialog.tsx`
- Modify: `src/components/block/session-panel.tsx` (add the "Mark missed" action)

**Verification:** `pnpm typecheck && pnpm lint` + user visual check.

**Interfaces:**
- Consumes: `api` (`~/trpc/react`); `RescheduleOptionView` (`~/views/reschedule`); `useRouter`.
- Produces: `RescheduleDialog` (client, controlled by an `open` prop) that lazy-loads `getRescheduleOptions`, presents the accept-gate, and calls `applyReschedule`.

- [ ] **Step 1: Write the dialog**

Create `src/components/block/reschedule-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

export function RescheduleDialog({
  sessionId,
  open,
  onClose,
}: {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const options = api.session.getRescheduleOptions.useQuery({ sessionId }, { enabled: open });
  const apply = api.session.applyReschedule.useMutation({
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-card border border-border bg-canvas p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-card-title text-fg">Missed this session?</h2>
          <button type="button" onClick={onClose} className="text-nav text-fg-subtle hover:text-fg">
            Close
          </button>
        </div>
        <p className="mt-1 text-nav text-fg-muted">Choose how to handle the volume you missed.</p>

        <div className="mt-4 flex flex-col gap-2">
          {options.isLoading && <p className="text-nav text-fg-subtle">Working out your options…</p>}
          {options.data?.map((o) => (
            <button
              key={o.kind}
              type="button"
              disabled={apply.isPending}
              onClick={() => apply.mutate({ sessionId, kind: o.kind })}
              className={
                "flex flex-col gap-1 rounded-control border p-4 text-left transition-colors disabled:opacity-60 " +
                (o.recommended ? "border-accent bg-selection" : "border-border-subtle hover:border-border")
              }
            >
              <div className="flex items-center justify-between">
                <span className={"text-nav font-medium " + (o.recommended ? "text-accent" : "text-fg")}>
                  {o.kind === "MAKE_UP" ? "Make it up" : o.kind === "PARTIAL" ? "Partial recovery" : "Let it go"}
                  {o.recommended ? " · recommended" : ""}
                </span>
                <span className="text-[12px] text-fg-subtle">
                  +{o.recoveredSets} recovered · {o.droppedSets} dropped
                </span>
              </div>
              <span className="text-[12px] text-fg-muted">{o.summary}</span>
              {o.perSession.length > 0 ? (
                <span className="text-[12px] text-fg-subtle">
                  {o.perSession.map((s) => `${s.label} +${s.addedSets}`).join(" · ")}
                </span>
              ) : null}
            </button>
          ))}
          {apply.isError && (
            <p className="rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">
              {apply.error.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the "Mark missed" action to `SessionPanel`**

In `src/components/block/session-panel.tsx`:

Add the import at the top:
```ts
import { RescheduleDialog } from "~/components/block/reschedule-dialog";
```
Add `CalendarX` to the existing lucide import:
```ts
import { Check, PencilLine, CalendarX } from "lucide-react";
```
Add dialog state next to `editing`:
```ts
  const [rescheduling, setRescheduling] = useState(false);
```
Replace the read-only-mode action block — change:
```tsx
          {session.status === "SCHEDULED" ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-4 inline-flex items-center gap-1.5 text-nav text-fg-muted transition-colors hover:text-fg"
            >
              <PencilLine className="size-4" aria-hidden /> Log session
            </button>
          ) : null}
```
to:
```tsx
          {session.status === "SCHEDULED" ? (
            <div className="mt-4 flex items-center gap-4">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 text-nav text-fg-muted transition-colors hover:text-fg"
              >
                <PencilLine className="size-4" aria-hidden /> Log session
              </button>
              <button
                type="button"
                onClick={() => setRescheduling(true)}
                className="inline-flex items-center gap-1.5 text-nav text-fg-muted transition-colors hover:text-fg"
              >
                <CalendarX className="size-4" aria-hidden /> Mark missed
              </button>
            </div>
          ) : null}
          <RescheduleDialog sessionId={session.slotId} open={rescheduling} onClose={() => setRescheduling(false)} />
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/block/reschedule-dialog.tsx src/components/block/session-panel.tsx && git commit -m "feat(session): missed-session reschedule accept-gate dialog"
```

---

## Post-implementation: user DB verification (not a subagent step)

After all tasks pass typecheck/lint, the user applies the migration and verifies on Neon:
1. Apply schema: `pnpm prisma db push` (or a `prisma migrate`) — adds `set_log`, `training_session.status/completedAt`. Then `pnpm db:seed` still works (existing sessions default to SCHEDULED).
2. Open a scheduled session, enter per-set actuals (try fill-down), Finish → session shows COMPLETED with the entered numbers; re-logging overwrites cleanly.
3. Mark a mid-week session missed → see MAKE_UP / PARTIAL / LET_GO with honest tradeoffs; accept MAKE_UP → the remaining sessions' sets increase and a `decision_log` REDISTRIBUTE row is written; LET_GO just marks it missed.
4. A missed final session of a week → only LET_GO offered.

## Known limitation (documented, deferred to ④)

When a reschedule happens *after* some of the week's other sessions are already COMPLETED, those completed sessions are excluded from redistribution (to protect their `SetLog`s), so the recomputed `WeekMuscleVolume` reflects only the still-scheduled sessions — the grid may under-represent that week's volume. ④ recomputes real volume from logged load and supersedes this. The common proactive case (mark missed before completing later sessions) is exact.

## Final whole-branch review

Dispatch the whole-branch review (most capable model) over `freddy/experimental..freddy/feat/checkin-logging`. Carry-forward items to confirm still-non-live: ①'s `?? 0` on nullable reps/RIR in `toPrescriptionView` (now that `loggedSets` renders `achievedRir` as null, confirm the target-side `?? 0` is unchanged and still non-live); ②'s CONFLICT-guard TOCTOU (untouched). Then use superpowers:finishing-a-development-branch.

## Self-Review (completed)

- **Spec coverage:** schema (Task 1) ✓; log input schema (2) ✓; adapters `weekPlanFromDb`/`adaptationContextFrom` (3) ✓; reschedule view (4) ✓; view `status`+`loggedSets` (5) ✓; `applyWeekPlanToDb` (6) ✓; `logSession`/`getRescheduleOptions`/`applyReschedule` incl. accept-gate + DecisionLog (7) ✓; log UI (8) ✓; reschedule dialog (9) ✓; testing split ✓.
- **Deviations from spec (deliberate, noted):** (a) mutations return minimal acks (`{status}` / `{weekIndex}`) and the client `router.refresh()`es the RSC read path rather than returning a full `SessionView` — matches the ② wizard pattern and avoids plumbing view types through mutations. (b) No synthetic LET_GO — `redistributeWeek` always emits one, so the fallback is dead code. (c) Completed-session protection + the volume under-count limitation is documented above.
- **Type consistency:** `weekPlanFromDb(WeekForPlan): WeekPlan`, `adaptationContextFrom(ConstraintSetWithTargets, AthleteContext): AdaptationContext`, `toRescheduleOptionViews(RedistributionCandidate[], WeekPlan): RescheduleOptionView[]`, `applyWeekPlanToDb(tx, weekId, WeekPlan)` consistent across tasks 3/4/6/7. `session.slotId` (SessionView) = `TrainingSession.id` = engine `slotId` throughout.
- **Placeholder scan:** none; every code step carries full code.
