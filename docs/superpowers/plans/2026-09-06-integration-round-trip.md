# Integration Layer ① — Engine ↔ DB ↔ View Round-Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the DB → View → UI pipeline end-to-end: seed one engine-generated mesocycle, expose it through tRPC, map it to `MesocycleView` with pure functions, and swap the block surfaces off the `mockMesocycle` fixture onto real Postgres data.

**Architecture:** A pure mapper layer (`src/server/views/`) turns a deeply-included Prisma `Mesocycle` into the existing `MesocycleView` view models — unit-tested without a DB. A `mesocycle.getCurrentBlock` protected tRPC procedure loads the session user's active block and runs the mapper. The seed exercises the *write* path once: it builds a default `ConstraintSet`, runs the real engine (`resolveConstraints` → `generateMesocycle`), and persists the plan graph. The six fixture consumers (four RSC pages, one client analysis page, one client sidebar) are wired to the tRPC read path, with a shared empty state when no block exists.

**Tech Stack:** Next.js 15 App Router (RSC + client components), TypeScript, tRPC 11 (`protectedProcedure`, RSC caller via `~/trpc/server`), Prisma 6 (client generated at repo-root `generated/prisma`, `db` from `~/server/db`), the pure engine in `src/engine`, Vitest, pnpm. `~/` → `src/`.

## Global Constraints

Copy these verbatim into every task's context. Every task's requirements implicitly include this section.

- **Law 1 — the engine/data owns numbers.** Mappers only classify/aggregate/reshape; they invent no training numbers. Every prescribed set/rep/RIR/volume value comes straight from the persisted graph (which came from the engine).
- **Law 2 — no invented claims, no LLM.** Deterministic, templated text only. The mapper returns `coachNotes: []` (deferred); no generated prose.
- **This sub-project is READ-PATH ONLY.** The only write is in the seed. No in-app generate/write/edit.
- **Readiness, the Now-home Form chip, and session `swapOptions` STAY ON FIXTURES.** Do not touch `mock-readiness.ts`, `readiness-state.ts`, the `ReadinessChip`, or `session-swap-control.tsx`. The mapper OMITS `swapOptions` from every `SessionView` (the swap control is already guarded and won't render).
- **Discipline-agnostic view models are frozen.** Do NOT add muscle-specific fields to `ReadinessView`/`ReadinessPoint`/`SwapOption`. Do not modify `src/views/types.ts` at all — the view models are already complete for this work.
- **Zones use `DEFAULT_LANDMARKS`** (`~/domain/landmarks`) — the same landmarks the engine generated against — so persisted zones stay consistent. No athlete-specific `MuscleLandmark` here.
- **Muscle row/display order = the `MuscleGroup` enum order**, available as `MUSCLE_GROUPS` from `~/schema` (`= MuscleGroupEnum.options`). Use it; do not hand-write a muscle array.
- **Seed narrative:** default block is 5 days/week, `UPPER_LOWER`, side-delts priority, 6-week block, deload week 6, `startDate` = **14 days ago** so the derived current week resolves to **3**.
- **Accent stays scarce** (only the Now-home "Start session" button). The empty state uses `fg` shades, not accent.
- **No new dependencies.** Existing tokens and patterns only.
- **Prisma types** are imported relative to repo-root `generated/prisma` (tsconfig `paths` only maps `~/*`→`src/*`; the generated client is excluded from tsc and imported by relative path, exactly like `src/server/db.ts` does).

---

## File Structure

- **Create** `src/server/views/to-mesocycle-view.ts` — pure mappers, `MESOCYCLE_INCLUDE` (the shared Prisma include), the derived `MesocycleWithRelations` type, and the `splitLabel`/`currentWeekIndex` helpers. One responsibility: Prisma graph → view models.
- **Create** `src/server/views/to-mesocycle-view.test.ts` — pure unit tests over hand-built payloads (no DB).
- **Create** `src/server/api/routers/mesocycle.ts` — the `getCurrentBlock` procedure.
- **Modify** `src/server/api/root.ts` — register the `mesocycle` router.
- **Create** `prisma/seed/mesocycle.ts` — `seedMesocycle`, the one-time write path.
- **Modify** `prisma/seed/index.ts` — call `seedMesocycle` after `seedExercises`.
- **Create** `src/components/app/empty-block-state.tsx` — shared "no active block" state.
- **Modify** `src/app/app/page.tsx` — Now home reads real block; empty-state fallback.
- **Modify** `src/app/app/block/page.tsx` — redirect to the real block id or empty state.
- **Modify** `src/app/app/block/[blockId]/page.tsx` — read real block.
- **Modify** `src/app/app/block/[blockId]/week/[n]/page.tsx` — read real block.
- **Modify** `src/app/app/analysis/page.tsx` — becomes an RSC wrapper that fetches + renders empty state.
- **Create** `src/components/analysis/analysis-view.tsx` — the moved client body (the current analysis interactivity).
- **Modify** `src/app/app/layout.tsx` — fetch the block once, pass to `AppFrame`.
- **Modify** `src/components/nav/app-frame.tsx` — accept a `block` prop, pass to `BlockNavigator`.
- **Modify** `src/components/nav/block-navigator.tsx` — take `block` as a prop instead of importing the fixture.

---

### Task 1: Pure view-model mappers

**Files:**
- Create: `src/server/views/to-mesocycle-view.ts`
- Test: `src/server/views/to-mesocycle-view.test.ts`

**Interfaces:**
- Consumes: `MesocycleView`, `WeekView`, `SessionView`, `PrescriptionView`, `MuscleWeekCell`, `MuscleChip`, `MuscleRole` from `~/views/types`; `DEFAULT_LANDMARKS` from `~/domain/landmarks`; `MUSCLE_GROUPS`, `MuscleGroup` from `~/schema`; `Prisma` from `../../../generated/prisma`.
- Produces (later tasks rely on these exact names):
  - `export const MESOCYCLE_INCLUDE` — a `Prisma.MesocycleInclude` value the router passes to `findFirst`.
  - `export type MesocycleWithRelations = Prisma.MesocycleGetPayload<{ include: typeof MESOCYCLE_INCLUDE }>`.
  - `export function toMesocycleView(m: MesocycleWithRelations): MesocycleView`.
  - `export function currentWeekIndex(startDate: Date | null, lengthWeeks: number, now?: Date): number`.

- [ ] **Step 1: Write the failing test**

Create `src/server/views/to-mesocycle-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MesocycleWithRelations } from "./to-mesocycle-view";
import { currentWeekIndex, toMesocycleView } from "./to-mesocycle-view";

const DAY_MS = 24 * 60 * 60 * 1000;

// A minimal but structurally complete Mesocycle payload builder.
function makeMesocycle(over: Partial<{
  startDate: Date | null;
  lengthWeeks: number;
  splitType: MesocycleWithRelations["constraintSet"]["splitType"];
  deloadIndex: number | null; // which week has isDeload=true
  csDeloadWeekIndex: number | null;
}> = {}): MesocycleWithRelations {
  const lengthWeeks = over.lengthWeeks ?? 6;
  const deloadIndex = over.deloadIndex === undefined ? 6 : over.deloadIndex;
  const weeks = Array.from({ length: lengthWeeks }, (_, i) => {
    const index = i + 1;
    return {
      id: `week-${index}`,
      mesocycleId: "meso-1",
      index,
      isDeload: index === deloadIndex,
      muscleVolumes: [
        { id: `wmv-${index}-quads`, weekId: `week-${index}`, muscle: "QUADS" as const, plannedSets: 12 },
        { id: `wmv-${index}-chest`, weekId: `week-${index}`, muscle: "CHEST" as const, plannedSets: 10 },
      ],
      sessions: [
        {
          id: `sess-${index}-b`,
          weekId: `week-${index}`,
          order: 1,
          splitSlot: "Lower A",
          dayOfWeek: null,
          targetDurationMin: 46,
          prescriptions: [
            {
              id: `rx-${index}-legpress`,
              trainingSessionId: `sess-${index}-b`,
              exerciseId: "ex-legpress",
              order: 0,
              sets: 4,
              targetRepLow: 6,
              targetRepHigh: 10,
              targetRir: 2,
              exercise: {
                id: "ex-legpress",
                name: "Leg Press",
                muscles: [
                  { id: "em-1", exerciseId: "ex-legpress", muscle: "QUADS" as const, role: "PRIMARY" as const, fraction: 1 },
                ],
              },
            },
          ],
        },
        {
          id: `sess-${index}-a`,
          weekId: `week-${index}`,
          order: 0,
          splitSlot: "Upper A",
          dayOfWeek: 0,
          targetDurationMin: 58,
          prescriptions: [
            {
              id: `rx-${index}-bench`,
              trainingSessionId: `sess-${index}-a`,
              exerciseId: "ex-bench",
              order: 0,
              sets: 3,
              targetRepLow: 6,
              targetRepHigh: 10,
              targetRir: 2,
              exercise: {
                id: "ex-bench",
                name: "Barbell Bench Press",
                muscles: [
                  { id: "em-2", exerciseId: "ex-bench", muscle: "CHEST" as const, role: "PRIMARY" as const, fraction: 1 },
                  { id: "em-3", exerciseId: "ex-bench", muscle: "TRICEPS" as const, role: "SECONDARY" as const, fraction: 0.5 },
                ],
              },
            },
          ],
        },
      ],
    };
  });

  return {
    id: "meso-1",
    athleteProfileId: "ap-1",
    constraintSetId: "cs-1",
    name: "Test Block",
    status: "ACTIVE",
    startDate: over.startDate === undefined ? new Date(Date.now() - 14 * DAY_MS) : over.startDate,
    lengthWeeks,
    createdAt: new Date(),
    constraintSet: {
      id: "cs-1",
      athleteProfileId: "ap-1",
      version: 1,
      isActive: true,
      daysPerWeek: 5,
      splitType: over.splitType ?? "UPPER_LOWER",
      sessionLengthCapMin: 75,
      blockLengthWeeks: lengthWeeks,
      deloadWeekIndex: over.csDeloadWeekIndex === undefined ? 6 : over.csDeloadWeekIndex,
      checkInCadence: "WEEKLY",
      createdAt: new Date(),
      muscleTargets: [
        { id: "mt-1", constraintSetId: "cs-1", muscle: "SIDE_DELTS" as const, weeklySetTarget: null, priority: 3 },
        { id: "mt-2", constraintSetId: "cs-1", muscle: "CHEST" as const, weeklySetTarget: null, priority: 0 },
      ],
    },
    weeks,
  } as MesocycleWithRelations;
}

describe("currentWeekIndex", () => {
  it("returns 1 when there is no startDate", () => {
    expect(currentWeekIndex(null, 6)).toBe(1);
  });
  it("derives week 3 from a startDate 14 days ago", () => {
    const start = new Date(Date.now() - 14 * DAY_MS);
    expect(currentWeekIndex(start, 6)).toBe(3);
  });
  it("clamps to lengthWeeks when the block is long past", () => {
    const start = new Date(Date.now() - 100 * DAY_MS);
    expect(currentWeekIndex(start, 6)).toBe(6);
  });
  it("clamps to 1 for a future startDate", () => {
    const start = new Date(Date.now() + 100 * DAY_MS);
    expect(currentWeekIndex(start, 6)).toBe(1);
  });
});

describe("toMesocycleView", () => {
  it("maps splitType to a human label", () => {
    expect(toMesocycleView(makeMesocycle({ splitType: "PUSH_PULL_LEGS" })).splitLabel).toBe("Push/Pull/Legs");
    expect(toMesocycleView(makeMesocycle({ splitType: "UPPER_LOWER" })).splitLabel).toBe("Upper/Lower");
  });

  it("takes deloadWeekIndex from the week flagged isDeload", () => {
    expect(toMesocycleView(makeMesocycle({ deloadIndex: 4 })).deloadWeekIndex).toBe(4);
  });

  it("falls back to the constraint set's deloadWeekIndex when no week is flagged", () => {
    const v = toMesocycleView(makeMesocycle({ deloadIndex: null, csDeloadWeekIndex: 5 }));
    expect(v.deloadWeekIndex).toBe(5);
  });

  it("orders muscles by the MuscleGroup enum, not insertion order", () => {
    // fixture inserts QUADS before CHEST; enum order puts CHEST first
    expect(toMesocycleView(makeMesocycle()).muscles).toEqual(["CHEST", "QUADS"]);
  });

  it("lists only priority muscles (priority > 0), in enum order", () => {
    expect(toMesocycleView(makeMesocycle()).priorityMuscles).toEqual(["SIDE_DELTS"]);
  });

  it("marks the current week with isCurrent", () => {
    const v = toMesocycleView(makeMesocycle()); // startDate 14d ago → week 3
    expect(v.currentWeekIndex).toBe(3);
    expect(v.weeks.find((w) => w.index === 3)?.isCurrent).toBe(true);
    expect(v.weeks.filter((w) => w.isCurrent)).toHaveLength(1);
  });

  it("sorts weeks, sessions, and prescriptions deterministically", () => {
    const v = toMesocycleView(makeMesocycle());
    expect(v.weeks.map((w) => w.index)).toEqual([1, 2, 3, 4, 5, 6]);
    // session order 0 ('Upper A') must precede order 1 ('Lower A')
    expect(v.weeks[0]!.sessions.map((s) => s.label)).toEqual(["Upper A", "Lower A"]);
  });

  it("derives muscle chips from the exercise's muscle rows", () => {
    const bench = toMesocycleView(makeMesocycle()).weeks[0]!.sessions[0]!.prescriptions[0]!;
    expect(bench.exerciseName).toBe("Barbell Bench Press");
    expect(bench.muscles).toEqual([
      { muscle: "CHEST", role: "PRIMARY", fraction: 1 },
      { muscle: "TRICEPS", role: "SECONDARY", fraction: 0.5 },
    ]);
  });

  it("maps a session's dayOfWeek to a day tag, undefined when null", () => {
    const week = toMesocycleView(makeMesocycle()).weeks[0]!;
    expect(week.sessions[0]!.dayTag).toBe("Mon"); // dayOfWeek 0
    expect(week.sessions[1]!.dayTag).toBeUndefined(); // dayOfWeek null
  });

  it("builds week cells with landmarks from DEFAULT_LANDMARKS", () => {
    const cell = toMesocycleView(makeMesocycle()).weeks[0]!.cells.find((c) => c.muscle === "CHEST")!;
    expect(cell.plannedSets).toBe(10);
    expect(cell.mev).toBe(8); // DEFAULT_LANDMARKS.CHEST.mev
    expect(cell.mrv).toBe(22);
  });

  it("returns empty coachNotes and omits swapOptions (deferred)", () => {
    const v = toMesocycleView(makeMesocycle());
    expect(v.coachNotes).toEqual([]);
    expect(v.weeks[0]!.sessions[0]!.swapOptions).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/server/views/to-mesocycle-view.test.ts`
Expected: FAIL — `to-mesocycle-view` module not found / exports undefined.

- [ ] **Step 3: Write the mapper implementation**

Create `src/server/views/to-mesocycle-view.ts`:

```ts
import type { Prisma } from "../../../generated/prisma";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { MUSCLE_GROUPS, type MuscleGroup } from "~/schema";
import type {
  MesocycleView,
  MuscleChip,
  MuscleRole,
  MuscleWeekCell,
  PrescriptionView,
  SessionView,
  WeekView,
} from "~/views/types";

/**
 * The deep include the read path needs: constraint set (+ targets), and each
 * week's muscle volumes and sessions down to each prescription's exercise and
 * its muscle attribution. Exported so the router and the mapper input type stay
 * in lockstep.
 */
export const MESOCYCLE_INCLUDE = {
  constraintSet: { include: { muscleTargets: true } },
  weeks: {
    include: {
      muscleVolumes: true,
      sessions: {
        include: {
          prescriptions: {
            include: { exercise: { include: { muscles: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.MesocycleInclude;

export type MesocycleWithRelations = Prisma.MesocycleGetPayload<{
  include: typeof MESOCYCLE_INCLUDE;
}>;

type WeekWithRelations = MesocycleWithRelations["weeks"][number];
type SessionWithRelations = WeekWithRelations["sessions"][number];
type PrescriptionWithRelations = SessionWithRelations["prescriptions"][number];

const SPLIT_LABEL: Record<MesocycleWithRelations["constraintSet"]["splitType"], string> = {
  FULL_BODY: "Full Body",
  UPPER_LOWER: "Upper/Lower",
  PUSH_PULL_LEGS: "Push/Pull/Legs",
  BRO_SPLIT: "Bro Split",
  CUSTOM: "Custom",
};

const DAY_TAGS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 1-based current week from the block's start date: full weeks elapsed + 1,
 * clamped to [1, lengthWeeks]. No start date → week 1.
 */
export function currentWeekIndex(
  startDate: Date | null,
  lengthWeeks: number,
  now: Date = new Date(),
): number {
  if (!startDate) return 1;
  const elapsed = Math.floor((now.getTime() - startDate.getTime()) / WEEK_MS) + 1;
  return Math.min(Math.max(elapsed, 1), lengthWeeks);
}

function toPrescriptionView(p: PrescriptionWithRelations): PrescriptionView {
  return {
    exerciseName: p.exercise.name,
    sets: p.sets,
    repRangeLow: p.targetRepLow ?? 0,
    repRangeHigh: p.targetRepHigh ?? 0,
    targetRir: p.targetRir ?? 0,
    muscles: p.exercise.muscles.map(
      (em): MuscleChip => ({
        muscle: em.muscle,
        role: em.role as MuscleRole,
        fraction: em.fraction,
      }),
    ),
  };
}

function toSessionView(s: SessionWithRelations): SessionView {
  return {
    slotId: s.id,
    label: s.splitSlot,
    dayTag: s.dayOfWeek == null ? undefined : DAY_TAGS[s.dayOfWeek],
    estimatedMinutes: s.targetDurationMin ?? 0,
    prescriptions: [...s.prescriptions]
      .sort((a, b) => a.order - b.order)
      .map(toPrescriptionView),
    // swapOptions intentionally omitted — deferred to sub-project ③.
  };
}

function toWeekView(w: WeekWithRelations, curIdx: number): WeekView {
  const sessions = [...w.sessions].sort((a, b) => a.order - b.order).map(toSessionView);
  const cells: MuscleWeekCell[] = MUSCLE_GROUPS.flatMap((muscle): MuscleWeekCell[] => {
    const v = w.muscleVolumes.find((x) => x.muscle === muscle);
    if (!v) return [];
    const lm = DEFAULT_LANDMARKS[muscle];
    return [{ muscle, weekIndex: w.index, plannedSets: v.plannedSets, mev: lm.mev, mav: lm.mav, mrv: lm.mrv }];
  });
  const totalSets = sessions.reduce(
    (s, sess) => s + sess.prescriptions.reduce((n, p) => n + p.sets, 0),
    0,
  );
  return {
    index: w.index,
    isDeload: w.isDeload,
    isCurrent: w.index === curIdx,
    totalSets,
    sessions,
    cells,
  };
}

export function toMesocycleView(m: MesocycleWithRelations): MesocycleView {
  const cs = m.constraintSet;
  const lengthWeeks = m.lengthWeeks;
  const curIdx = currentWeekIndex(m.startDate, lengthWeeks);
  const deloadIdx = m.weeks.find((w) => w.isDeload)?.index ?? cs.deloadWeekIndex ?? lengthWeeks;

  const present = new Set<MuscleGroup>();
  for (const w of m.weeks) for (const v of w.muscleVolumes) present.add(v.muscle);

  const muscles = MUSCLE_GROUPS.filter((mm) => present.has(mm));
  const priorityMuscles = MUSCLE_GROUPS.filter((mm) =>
    cs.muscleTargets.some((t) => t.muscle === mm && t.priority > 0),
  );

  const weeks = [...m.weeks].sort((a, b) => a.index - b.index).map((w) => toWeekView(w, curIdx));

  return {
    id: m.id,
    name: m.name,
    status: m.status,
    splitLabel: SPLIT_LABEL[cs.splitType],
    daysPerWeek: cs.daysPerWeek,
    blockLengthWeeks: lengthWeeks,
    currentWeekIndex: curIdx,
    deloadWeekIndex: deloadIdx,
    muscles,
    priorityMuscles,
    weeks,
    coachNotes: [],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/server/views/to-mesocycle-view.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors. (Confirms the `Prisma.MesocycleGetPayload` type resolves and the mapper output satisfies `MesocycleView`.)

- [ ] **Step 6: Commit**

```bash
git add src/server/views/to-mesocycle-view.ts src/server/views/to-mesocycle-view.test.ts
git commit -m "feat(views): pure Prisma→MesocycleView mappers"
```

---

### Task 2: tRPC `mesocycle.getCurrentBlock` procedure

**Files:**
- Create: `src/server/api/routers/mesocycle.ts`
- Modify: `src/server/api/root.ts`

**Interfaces:**
- Consumes: `MESOCYCLE_INCLUDE`, `toMesocycleView`, `MesocycleView` (re-exported type) from `~/server/views/to-mesocycle-view` and `~/views/types`; `createTRPCRouter`, `protectedProcedure` from `~/server/api/trpc` (context has `ctx.db` and `ctx.session.user`).
- Produces: `mesocycleRouter` with `getCurrentBlock: () => Promise<MesocycleView | null>`, registered on `appRouter` as `mesocycle`. Callable from RSC as `api.mesocycle.getCurrentBlock()`.

- [ ] **Step 1: Write the router**

Create `src/server/api/routers/mesocycle.ts`:

```ts
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { MESOCYCLE_INCLUDE, toMesocycleView } from "~/server/views/to-mesocycle-view";
import type { MesocycleView } from "~/views/types";

/**
 * Read path for the athlete's current training block. User-scoped: only the
 * signed-in user's own ACTIVE mesocycle is ever returned. Returns null when the
 * user has no active block (the UI renders an empty state).
 */
export const mesocycleRouter = createTRPCRouter({
  getCurrentBlock: protectedProcedure.query(async ({ ctx }): Promise<MesocycleView | null> => {
    const meso = await ctx.db.mesocycle.findFirst({
      where: {
        status: "ACTIVE",
        athleteProfile: { userId: ctx.session.user.id },
      },
      orderBy: { createdAt: "desc" },
      include: MESOCYCLE_INCLUDE,
    });
    return meso ? toMesocycleView(meso) : null;
  }),
});
```

- [ ] **Step 2: Register the router**

Modify `src/server/api/root.ts` — add the import and the router entry:

```ts
import { healthRouter } from "~/server/api/routers/health";
import { mesocycleRouter } from "~/server/api/routers/mesocycle";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  health: healthRouter,
  mesocycle: mesocycleRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 */
export const createCaller = createCallerFactory(appRouter);
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 errors. (No unit test — the procedure needs a live DB + session; correctness of the mapping is covered by Task 1, and the query itself is verified when the user runs `pnpm dev` after Task 3's seed.)

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/mesocycle.ts src/server/api/root.ts
git commit -m "feat(api): mesocycle.getCurrentBlock read procedure"
```

---

### Task 3: Seed a real engine-generated block

**Files:**
- Create: `prisma/seed/mesocycle.ts`
- Modify: `prisma/seed/index.ts`

**Interfaces:**
- Consumes: `db` from `~/server/db`; `resolveConstraints`, `generateMesocycle`, and types `AthleteContext`, `ConstraintSetInput` (the latter from `~/schema`) — engine from `~/engine`; `EXERCISE_LIBRARY` from `~/domain/exercise-library`; `DEFAULT_LANDMARKS` from `~/domain/landmarks`; `MesocyclePlan`/`ResolvedSpec` engine types.
- Produces: `export async function seedMesocycle(): Promise<{ mesocycleId: string; weeks: number }>`, called by `main()` in `index.ts`.

**Notes for the implementer:**
- `resolveConstraints(input, athlete)` returns `ResolveResult = ResolvedSpec | InfeasibilityReport`; guard on `spec.kind === "resolved"` and throw if infeasible.
- `generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS)` returns a `MesocyclePlan` with `weeks[]` (each `{ index, isDeload, sessions[], muscleVolume }`), where `muscleVolume` is a `Record<MuscleGroup, number>`. Persist a `WeekMuscleVolume` row only for muscles with volume `> 0` (keeps the grid to trained muscles, matching the fixture).
- `AthleteContext` = `{ experienceLevel: profile.experience, phase: profile.phase, landmarks: DEFAULT_LANDMARKS }`.
- The DecisionLog `type` enum is `GENERATE | PROGRESS | DELOAD | REDISTRIBUTE | MANUAL_ADJUST`; the plan's `facts` have free-form `kind`s that don't map to it. Persist one `DecisionLog` row per fact with `type: "GENERATE"`, `status: "APPLIED"`, `summary: fact.kind`, `reasoning: fact.kind`, `payload: fact` (JSON). The mapper ignores these; they exist for later slices.
- Idempotent: delete this athlete's mesocycles (cascades weeks/sessions/prescriptions/volumes/decisions) and constraint sets (cascades targets) before recreating.
- Use `process.env.SEED_USER_EMAIL` directly (seed is a plain node script; do not route through `~/env`).

- [ ] **Step 1: Write the seed builder**

Create `prisma/seed/mesocycle.ts`:

```ts
import { db } from "~/server/db";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { generateMesocycle, resolveConstraints, type AthleteContext } from "~/engine";
import type { ConstraintSetInput } from "~/schema";

/** The default block character — mirrors the fixture (5 days, Upper/Lower, side-delts priority, 6-week, deload wk6). */
const DEFAULT_CONSTRAINTS: ConstraintSetInput = {
  daysPerWeek: 5,
  splitType: "UPPER_LOWER",
  sessionLengthCapMin: 75,
  blockLengthWeeks: 6,
  deloadWeekIndex: 6,
  checkInCadence: "WEEKLY",
  muscleTargets: [{ muscle: "SIDE_DELTS", priority: 3 }],
  excludedExerciseNames: [],
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Persists ONE engine-generated mesocycle for the target user, exercising the
 * write path end-to-end. Idempotent: re-running converges (prior seeded block +
 * constraint set for the athlete are deleted first).
 *
 * Target user: SEED_USER_EMAIL env var, else the first User row. Errors clearly
 * if no user exists (log in once to create your user, then re-run).
 */
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

  // 1. Athlete profile (upsert on the unique userId).
  const profile = await db.athleteProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  // 2. Idempotency: clear any prior seeded block + constraint set for this athlete.
  await db.mesocycle.deleteMany({ where: { athleteProfileId: profile.id } });
  await db.constraintSet.deleteMany({ where: { athleteProfileId: profile.id } });

  // 3. Persist the constraint set the engine will run against.
  const constraintSet = await db.constraintSet.create({
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

  // 4. Run the real engine.
  const athlete: AthleteContext = {
    experienceLevel: profile.experience,
    phase: profile.phase,
    landmarks: DEFAULT_LANDMARKS,
  };
  const spec = resolveConstraints(DEFAULT_CONSTRAINTS, athlete);
  if (spec.kind !== "resolved") {
    throw new Error("seedMesocycle: default constraints resolved as infeasible — the engine could not generate a plan.");
  }
  const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);

  // Resolve exercise names → ids up front; a generated plan must only reference library exercises.
  const exercises = await db.exercise.findMany({ select: { id: true, name: true } });
  const idByName = new Map(exercises.map((e) => [e.name, e.id]));

  // 5. Persist the mesocycle graph. startDate 14 days ago → current week 3.
  const meso = await db.mesocycle.create({
    data: {
      athleteProfileId: profile.id,
      constraintSetId: constraintSet.id,
      name: "Autumn Hypertrophy — Block 1",
      status: "ACTIVE",
      startDate: new Date(Date.now() - 14 * DAY_MS),
      lengthWeeks: plan.blockLengthWeeks,
    },
  });

  for (const week of plan.weeks) {
    const persistedWeek = await db.week.create({
      data: {
        mesocycleId: meso.id,
        index: week.index,
        isDeload: week.isDeload,
        muscleVolumes: {
          create: Object.entries(week.muscleVolume)
            .filter(([, sets]) => sets > 0)
            .map(([muscle, sets]) => ({
              muscle: muscle as (typeof EXERCISE_LIBRARY)[number]["muscles"][number]["muscle"],
              plannedSets: sets,
            })),
        },
      },
    });

    for (const [order, session] of week.sessions.entries()) {
      await db.trainingSession.create({
        data: {
          weekId: persistedWeek.id,
          order,
          splitSlot: session.label,
          dayOfWeek: null,
          targetDurationMin: session.estimatedMinutes,
          prescriptions: {
            create: session.prescriptions.map((rx, rxOrder) => {
              const exerciseId = idByName.get(rx.exerciseName);
              if (!exerciseId) {
                throw new Error(
                  `seedMesocycle: prescription references unknown exercise "${rx.exerciseName}". Run the exercise seed first / check the library.`,
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
        },
      });
    }
  }

  // 6. DecisionLog rows from the plan's facts (used by later slices; mapper ignores them).
  if (plan.facts.length > 0) {
    await db.decisionLog.createMany({
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

- [ ] **Step 2: Wire it into the seed entrypoint**

Modify `prisma/seed/index.ts` — import `seedMesocycle` and call it inside `main()` after `seedExercises`. Replace the existing `main` with:

```ts
import { seedMesocycle } from "./mesocycle";

// ... (seedExercises unchanged above) ...

async function main() {
  const count = await seedExercises();
  console.log(`Seeded ${count} exercises.`);
  const { mesocycleId, weeks } = await seedMesocycle();
  console.log(`Seeded mesocycle ${mesocycleId} (${weeks} weeks).`);
}
```

Keep the existing `import { fileURLToPath }` guard and `.catch/.finally` block exactly as they are. Place the `seedMesocycle` import at the top with the other imports.

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 errors.

> The seed writes to a live Neon DB, which subagents cannot reach. Do NOT run `pnpm db:seed` here — it is a user-verified step (Task 8). This task's gate is typecheck + lint only.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed/mesocycle.ts prisma/seed/index.ts
git commit -m "feat(seed): persist one engine-generated mesocycle (write path)"
```

---

### Task 4: Shared empty-block state

**Files:**
- Create: `src/components/app/empty-block-state.tsx`

**Interfaces:**
- Produces: `export function EmptyBlockState(): JSX.Element` — a calm, self-contained "no active block" panel used by every block surface when `getCurrentBlock()` returns null.

- [ ] **Step 1: Write the component**

Create `src/components/app/empty-block-state.tsx`. Match the existing token vocabulary (`text-fg`, `text-fg-muted`, `border-border-subtle`, `rounded-*`). No accent, no new tokens.

```tsx
/**
 * Rendered by every block surface when the signed-in user has no ACTIVE
 * mesocycle. Deliberately calm and monochrome — onboarding (which will create a
 * block) arrives in sub-project ②, so this only gestures toward it.
 */
export function EmptyBlockState() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-[420px] flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-section text-fg">No active block yet</h1>
      <p className="text-card-desc text-fg-muted">
        Once you have a training block, your week, sessions, and volume will show up here.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 errors. (Presentational component — no unit test, per the codebase convention; verified visually in Task 8.)

- [ ] **Step 3: Commit**

```bash
git add src/components/app/empty-block-state.tsx
git commit -m "feat(app): shared empty-block state"
```

---

### Task 5: Wire the RSC block surfaces (home, block index, block detail, week detail)

**Files:**
- Modify: `src/app/app/page.tsx`
- Modify: `src/app/app/block/page.tsx`
- Modify: `src/app/app/block/[blockId]/page.tsx`
- Modify: `src/app/app/block/[blockId]/week/[n]/page.tsx`

**Interfaces:**
- Consumes: `api` from `~/trpc/server` (`await api.mesocycle.getCurrentBlock()` → `MesocycleView | null`); `EmptyBlockState` from `~/components/app/empty-block-state`.
- These four are already RSC (async server components). Replace the `mockMesocycle` import with the tRPC read, keep all downstream component usage identical (the view model shape is unchanged).

- [ ] **Step 1: Wire the Now home**

Modify `src/app/app/page.tsx`. Keep the readiness chip + swap on their fixtures (`mockReadiness`, `readinessState`). Only the block becomes real. Make the component `async` and add the empty-state guard:

```tsx
import { nextSession } from "~/views/next-session";
import { rollUpStatus } from "~/components/viz/roll-up-status";
import { NextSessionCard } from "~/components/home/next-session-card";
import { TrainingStatusCard } from "~/components/home/training-status-card";
import { CoachCard } from "~/components/home/coach-card";
import { readinessState } from "~/components/viz/readiness-state";
import { ReadinessChip } from "~/components/readiness/readiness-chip";
import { mockReadiness } from "~/views/_fixtures/mock-readiness";
import { EmptyBlockState } from "~/components/app/empty-block-state";
import { api } from "~/trpc/server";

export default async function NowHome() {
  const block = await api.mesocycle.getCurrentBlock();
  if (!block) return <EmptyBlockState />;

  const week =
    block.weeks.find((w) => w.index === block.currentWeekIndex) ?? block.weeks[0];
  const session = week ? nextSession(week) : undefined;
  const status = week ? rollUpStatus(week) : undefined;
  const readinessPoint =
    mockReadiness.series.find((p) => p.weekIndex === mockReadiness.currentWeekIndex) ??
    mockReadiness.series[mockReadiness.series.length - 1];
  const readinessLabel = readinessPoint ? readinessState(readinessPoint.form) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="text-eyebrow font-medium text-fg-soft">{block.splitLabel}</div>
        <h1 className="mt-1 text-page-title text-fg">
          Week {block.currentWeekIndex} of {block.blockLengthWeeks}
        </h1>
        <p className="mt-1 text-card-desc text-fg-muted">{block.name}</p>
        <div className="mt-3">
          <ReadinessChip readiness={mockReadiness} />
        </div>
      </header>

      <NextSessionCard
        session={session}
        blockId={block.id}
        weekIndex={block.currentWeekIndex}
        readinessLabel={readinessLabel}
      />

      <div className="grid gap-6 md:grid-cols-2">
        {status ? <TrainingStatusCard status={status} /> : null}
        <CoachCard notes={block.coachNotes} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the block index redirect**

Modify `src/app/app/block/page.tsx`. Redirect to the real block, or show the empty state when there is none:

```tsx
import { redirect } from "next/navigation";
import { EmptyBlockState } from "~/components/app/empty-block-state";
import { api } from "~/trpc/server";

export default async function BlockIndex() {
  const block = await api.mesocycle.getCurrentBlock();
  if (!block) return <EmptyBlockState />;
  redirect(`/app/block/${block.id}`);
}
```

- [ ] **Step 3: Wire the block detail page**

Modify `src/app/app/block/[blockId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { BlockHeader } from "~/components/block/block-header";
import { BlockGrid } from "~/components/block/block-grid";
import { EmptyBlockState } from "~/components/app/empty-block-state";
import { api } from "~/trpc/server";

export default async function BlockPage({ params }: { params: Promise<{ blockId: string }> }) {
  const { blockId } = await params;
  const block = await api.mesocycle.getCurrentBlock();
  if (!block) return <EmptyBlockState />;
  if (blockId !== block.id) notFound();
  return (
    <div className="flex min-h-full flex-col">
      <BlockHeader block={block} />
      <BlockGrid block={block} />
    </div>
  );
}
```

- [ ] **Step 4: Wire the week detail page**

Modify `src/app/app/block/[blockId]/week/[n]/page.tsx` — swap the fixture for the read, add the empty guard, keep the rest identical:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { SessionCard } from "~/components/block/session-card";
import { zoneFor } from "~/components/viz/zone";
import { EmptyBlockState } from "~/components/app/empty-block-state";
import { api } from "~/trpc/server";

export default async function WeekDetail({ params }: { params: Promise<{ blockId: string; n: string }> }) {
  const { blockId, n } = await params;
  const block = await api.mesocycle.getCurrentBlock();
  if (!block) return <EmptyBlockState />;
  if (blockId !== block.id) notFound();
  const week = block.weeks.find((w) => w.index === Number(n));
  if (!week) notFound();

  const optimal = week.cells.filter((c) => zoneFor(c.plannedSets, c) === "optimal").length;
  const nearMax = week.cells.filter((c) => zoneFor(c.plannedSets, c) === "max").length;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border-subtle px-6 py-5">
        <Link href={`/app/block/${block.id}`} className="mb-2 inline-flex items-center gap-1 text-nav text-fg-muted hover:text-fg">
          <ChevronLeft className="size-4" /> Block
        </Link>
        <h1 className="text-section text-fg">
          {week.isDeload ? "Deload week" : `Week ${week.index}`} · {week.sessions.length} sessions · {week.totalSets} total sets
        </h1>
        <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
          <span className="rounded-pill bg-zone-optimal-soft px-2 py-0.5 text-fg-soft">{optimal} muscles optimal</span>
          {nearMax > 0 ? <span className="rounded-pill bg-zone-max-soft px-2 py-0.5 text-fg-soft">{nearMax} near MRV</span> : null}
        </div>
      </header>
      <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        {week.sessions.map((s) => (
          <SessionCard key={s.slotId} session={s} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 errors. (Visual verification is Task 8, after the user seeds.)

- [ ] **Step 6: Commit**

```bash
git add src/app/app/page.tsx src/app/app/block/page.tsx "src/app/app/block/[blockId]/page.tsx" "src/app/app/block/[blockId]/week/[n]/page.tsx"
git commit -m "feat(app): wire RSC block surfaces to getCurrentBlock"
```

---

### Task 6: Wire the analysis surface (RSC wrapper + client view)

**Files:**
- Modify: `src/app/app/analysis/page.tsx`
- Create: `src/components/analysis/analysis-view.tsx`

**Interfaces:**
- Consumes: `api` from `~/trpc/server`; `EmptyBlockState`; `MesocycleView` from `~/views/types`.
- Produces: `export function AnalysisView({ block }: { block: MesocycleView })` — the moved client body.
- The current `analysis/page.tsx` is `"use client"` with `useState`, so it can't call the RSC caller. Split: the page becomes an async RSC that fetches the block and renders `<EmptyBlockState />` or `<AnalysisView block={block} />`; the interactive body moves verbatim into the client component, parameterized on the `block` prop instead of `mockMesocycle`.

- [ ] **Step 1: Create the client view**

Create `src/components/analysis/analysis-view.tsx` — this is the existing analysis body with `"use client"`, taking `block` as a prop (the ONLY change from the current file is the removed `mockMesocycle` import and the added prop):

```tsx
"use client";

import { useState } from "react";
import { LandmarkBar } from "~/components/viz/landmark-bar";
import { BodyMap } from "~/components/viz/body-map";
import { zoneFor } from "~/components/viz/zone";
import type { LandmarkBarDatum, MesocycleView } from "~/views/types";
import type { MuscleGroup } from "~/schema";

const ZONE_VAR: Record<string, string> = {
  rest: "var(--color-zone-rest-soft)",
  building: "var(--color-zone-building-soft)",
  optimal: "var(--color-zone-optimal-soft)",
  max: "var(--color-zone-max-soft)",
};

export function AnalysisView({ block }: { block: MesocycleView }) {
  const [weekIndex, setWeekIndex] = useState(block.currentWeekIndex);
  const [hover, setHover] = useState<MuscleGroup | null>(null);
  const week = block.weeks.find((w) => w.index === weekIndex)!;

  const bars: LandmarkBarDatum[] = week.cells
    .map((c) => ({ muscle: c.muscle, planned: c.plannedSets, mev: c.mev, mav: c.mav, mrv: c.mrv }))
    .sort((a, b) => b.planned / b.mrv - a.planned / a.mrv); // closeness to MRV, risk on top

  const scaleMax = Math.max(...week.cells.map((c) => c.mrv)) * 1.1;
  const fillFor = (m: MuscleGroup): string => {
    const cell = week.cells.find((c) => c.muscle === m);
    if (!cell) return "var(--color-surface)";
    const base = ZONE_VAR[zoneFor(cell.plannedSets, cell)]!;
    return m === hover ? "var(--color-accent)" : base;
  };

  const perSession = week.sessions.map((s) => ({
    label: s.label,
    sets: s.prescriptions.reduce((n, p) => n + p.sets, 0),
  }));
  const maxSession = Math.max(...perSession.map((s) => s.sets));

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-border-subtle px-6 py-5">
        <h1 className="text-section text-fg">Analysis</h1>
        <label className="flex items-center gap-2 text-nav text-fg-muted">
          Week
          <select
            value={weekIndex}
            onChange={(e) => setWeekIndex(Number(e.target.value))}
            className="rounded-control border border-border bg-surface px-2 py-1 text-fg"
          >
            {block.weeks.map((w) => (
              <option key={w.index} value={w.index}>
                {w.isDeload ? "Deload" : `Week ${w.index}`}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="grid gap-8 p-6 lg:grid-cols-[320px_1fr]">
        <div><BodyMap fillFor={fillFor} onHover={setHover} /></div>
        <div className="flex flex-col gap-2">
          {bars.map((d) => (
            <LandmarkBar key={d.muscle} datum={d} scaleMax={scaleMax} />
          ))}
        </div>
      </div>

      <div className="border-t border-border-subtle px-6 py-5">
        <div className="text-eyebrow font-semibold text-fg-muted">Volume distribution</div>
        <div className="mt-3 flex items-end gap-3">
          {perSession.map((s) => (
            <div key={s.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end">
                <div className="w-full rounded-t bg-accent/60" style={{ height: `${(s.sets / maxSession) * 100}%` }} />
              </div>
              <div className="text-[11px] text-fg-subtle">{s.label}</div>
              <div className="text-[11px] text-fg-muted">{s.sets}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the page with an RSC wrapper**

Overwrite `src/app/app/analysis/page.tsx`:

```tsx
import { AnalysisView } from "~/components/analysis/analysis-view";
import { EmptyBlockState } from "~/components/app/empty-block-state";
import { api } from "~/trpc/server";

export default async function AnalysisPage() {
  const block = await api.mesocycle.getCurrentBlock();
  if (!block) return <EmptyBlockState />;
  return <AnalysisView block={block} />;
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/analysis/page.tsx src/components/analysis/analysis-view.tsx
git commit -m "feat(app): analysis reads real block via RSC wrapper + client view"
```

---

### Task 7: Wire the training sidebar (layout → AppFrame → BlockNavigator)

**Files:**
- Modify: `src/app/app/layout.tsx`
- Modify: `src/components/nav/app-frame.tsx`
- Modify: `src/components/nav/block-navigator.tsx`

**Interfaces:**
- `BlockNavigator` and `AppFrame` are client components (they use `usePathname`) and so cannot call the RSC caller. The RSC `layout.tsx` fetches the block once and prop-drills the (fully serializable) `MesocycleView | null` down. `BlockNavigator` renders nothing when the block is null.
- Consumes: `api` from `~/trpc/server` (in the layout); `MesocycleView` from `~/views/types`.

- [ ] **Step 1: Fetch in the layout, pass to AppFrame**

Modify `src/app/app/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { AppFrame } from "~/components/nav/app-frame";
import { api } from "~/trpc/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  const block = await api.mesocycle.getCurrentBlock();
  return (
    <AppFrame userName={session.user.name} userEmail={session.user.email} block={block}>
      {children}
    </AppFrame>
  );
}
```

- [ ] **Step 2: Thread the prop through AppFrame**

Modify `src/components/nav/app-frame.tsx` — accept `block` and pass it to `BlockNavigator`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "~/components/ui-kit/app-shell-kit";
import type { MesocycleView } from "~/views/types";
import { AppNav } from "./app-nav";
import { BlockNavigator } from "./block-navigator";

export function AppFrame({
  children,
  userName,
  userEmail,
  block,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  block: MesocycleView | null;
}) {
  const pathname = usePathname() ?? "";
  const isTraining = pathname.startsWith("/app/block");
  const isAnalysis = pathname.startsWith("/app/analysis");
  return (
    <AppShell
      slug="app"
      workspaceName="Mesodapt"
      column1={<AppNav userName={userName} userEmail={userEmail} />}
      column2={isTraining && block ? <BlockNavigator block={block} /> : undefined}
      fullBleed={isTraining || isAnalysis}
      topNav={<div className="text-nav text-fg-muted">Mesodapt</div>}
    >
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 3: Make BlockNavigator take the block as a prop**

Modify `src/components/nav/block-navigator.tsx` — remove the fixture import, accept `block`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MesocycleView } from "~/views/types";

export function BlockNavigator({ block }: { block: MesocycleView }) {
  const pathname = usePathname() ?? "";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/app/block/${block.id}`} className="text-list font-semibold text-fg hover:text-accent">
          {block.name}
        </Link>
        <div className="text-[12px] text-fg-subtle">{block.status}</div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {block.weeks.map((w) => {
          const href = `/app/block/${block.id}/week/${w.index}`;
          const active = pathname === href;
          const marker = w.index < block.currentWeekIndex ? "✓" : w.isCurrent ? "◀" : "";
          const label = w.isDeload ? "Deload" : `Wk ${w.index}`;
          return (
            <Link
              key={w.index}
              href={href}
              className={
                "flex items-center justify-between rounded-pill px-2.5 py-1.5 text-list transition-colors " +
                (active ? "bg-selection text-accent" : "text-fg-muted hover:text-fg")
              }
            >
              <span>{label}</span>
              <span className={w.isCurrent ? "text-accent" : "text-fg-subtle"}>{marker}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

- [ ] **Step 4: Confirm no remaining fixture consumers**

Run: `grep -rn "mockMesocycle" src --include="*.ts" --include="*.tsx"`
Expected: matches ONLY in `src/views/_fixtures/mock-block.ts` and `src/views/_fixtures/mock-block.test.ts` (the fixture + its test are retained deliberately). No `src/app/**` or `src/components/**` consumers remain.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 errors.

- [ ] **Step 6: Run the full test suite**

Run: `pnpm test`
Expected: all green (the `mock-block` fixture tests and mapper tests all pass; nothing else regressed).

- [ ] **Step 7: Commit**

```bash
git add src/app/app/layout.tsx src/components/nav/app-frame.tsx src/components/nav/block-navigator.tsx
git commit -m "feat(nav): training sidebar reads real block via prop-drill"
```

---

### Task 8: User verification (live DB) — NOT a subagent task

This task cannot be run by a subagent (it needs the live Neon DB and a browser). The controller presents it to the user after Task 7's automated gates pass.

- [ ] **Step 1: Seed**

User runs:
```bash
pnpm db:seed
```
Expected: `Seeded 15 exercises.` then `Seeded mesocycle <id> (6 weeks).` If it errors with "no User found", log into the app once (creates the user), then re-run. Optionally set `SEED_USER_EMAIL=you@example.com` to target a specific user.

- [ ] **Step 2: Run the app and verify**

User runs `pnpm dev` and checks, signed in:
- `/app` (Now home): header reads **"Week 3 of 6"**, block name "Autumn Hypertrophy — Block 1"; the Next-Session hero, Training Status, and (auto-hidden) Coach card render from real data; the Form chip + swap still show (fixture — expected).
- `/app/block`: redirects into the real block; the heat-map grid shows trained muscles in enum order with correct zone shading; the left sidebar lists Wk 1–6 with ✓ on 1–2, ◀ on 3, "Deload" on 6.
- A week detail page: sessions and prescriptions match the seeded plan.
- `/app/analysis`: body map + landmark bars + volume distribution render; the week selector switches weeks.
- Signing in as a user with no seeded block (or before seeding) shows the calm **"No active block yet"** empty state everywhere, no crash.

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-09-06-integration-round-trip-design.md`):
- Seed a real block (§Architecture 1) → Task 3. ✓ (default ConstraintSet, engine run, graph persist with startDate 14d ago, exercise-name resolution with throw, DecisionLog from facts, idempotent).
- Pure mappers (§2) with the full mapping table → Task 1. ✓ (splitLabel, currentWeekIndex derivation + clamp, deloadWeekIndex from isDeload with CS fallback, muscle enum ordering, priorityMuscles, cells with DEFAULT_LANDMARKS, coachNotes:[], swapOptions omitted, dayTag).
- tRPC `getCurrentBlock` protected + user-scoped + deep include + registered → Task 2. ✓
- Wire UI off fixtures with shared empty state (§4) → Tasks 4–7. ✓ (Spec named five surfaces; the plan additionally handles the two client consumers — `analysis` page and the sidebar `BlockNavigator` — that the spec's "RSC" wording didn't account for. Resolved via RSC-wrapper + prop-drill; flagged to the user before planning.)
- Error/empty handling (§) → EmptyBlockState + `null` returns + seed throws. ✓
- Testing split (§) → pure mapper unit tests (Task 1); typecheck/lint gates on DB pieces; user verification (Task 8). ✓

**2. Placeholder scan:** No TBD/TODO/"add error handling" placeholders; every code step carries complete code and every command has an expected result. ✓

**3. Type consistency:** `MESOCYCLE_INCLUDE` / `MesocycleWithRelations` / `toMesocycleView` / `currentWeekIndex` names are consistent between Task 1 (producer) and Tasks 2 (router). `AthleteContext`/`ConstraintSetInput`/`resolveConstraints`/`generateMesocycle` match the engine's real signatures. `MesocycleView` prop threads consistently through Tasks 5–7. The seed's `deloadWeekIndex`, `splitType`, `checkInCadence`, `muscleTargets` shapes match both `ConstraintSetInput` (Zod) and the Prisma `ConstraintSet`/`MuscleTarget` models. ✓

**Deviation from spec wording, deliberate:** the spec says "DecisionLog **rows** from `MesocyclePlan.facts`"; because `DecisionType` is a fixed 5-value enum that facts' free-form `kind`s don't map onto, the plan persists one row per fact all typed `GENERATE` (status `APPLIED`, `payload: fact`). The mapper ignores DecisionLog in ①, so this has no read-path effect; it exists for later slices. If the reviewer/user prefers a single summary row instead, that's a trivial change — flag rather than block.
