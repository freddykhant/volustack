# Integration Layer ① — Engine ↔ DB ↔ View Round-Trip (Design)

**Status:** Approved 2026-09-06
**Scope:** First sub-project of the integration layer. Read-path only.
**Branch target:** merges into `freddy/experimental` (standing rule).
**Part of:** the integration layer, decomposed as ① round-trip (this) → ② onboarding → ③ adaptation/check-in → ④ real readiness & trends.

## Problem

Every layer exists but nothing is connected: the Prisma schema, the pure engine (`resolveConstraints` → `generateMesocycle`), and the `MesocycleView` view models are all complete, but the experience renders a **fixture** (`mockMesocycle`). tRPC has only a `health` router. This sub-project builds the connective tissue for the **read path**: persist one engine-generated mesocycle via the seed, expose it through tRPC, map it to `MesocycleView`, and swap the block surfaces off the fixture — proving the DB → View → UI pipeline end-to-end with real data.

The in-app *generate* action is deliberately deferred to ② (onboarding); here the write is exercised **once, in the seed**.

## Non-goals (deferred, named)

- **In-app generate/write** → ② onboarding. Write happens only in the seed here.
- **Onboarding UI / real ConstraintSet capture** → ②. The seed uses a default ConstraintSet.
- **Adaptation / check-in write path** → ③.
- **Real readiness & trends** → ④. The `/app/readiness` surface and the Now-home **Form chip** + **swap** stay on their fixtures (`mockReadiness`, `swapOptions`). The Now home therefore renders a *real block* alongside a *fixture readiness chip* — intentional and scoped.
- **Coach notes on real data** → later slice. The mapper returns `coachNotes: []`; the `CoachCard` already returns null on empty, so it auto-hides.
- **Session `swapOptions` from real data** → ③. The mapper omits them; the swap control is guarded and won't render.
- **Athlete-specific `MuscleLandmark`** → later. The mapper uses `DEFAULT_LANDMARKS` (domain) for zone bounds — the same landmarks the engine generated against, so zones stay consistent.

## Architecture

### 1. Seed a real block (`prisma/seed/`)

A new `seedMesocycle(userEmail?)`, run after the existing `seedExercises`, that:
1. Finds the target **User** — by `SEED_USER_EMAIL` env var, else the first `User` row. Errors clearly ("log in once to create your user, then re-run") if none exists.
2. Upserts an `AthleteProfile` for that user, and a default `ConstraintSet` + `MuscleTarget`s mirroring the fixture's character (5 days/week, `UPPER_LOWER`, side-delts priority, 6-week block, deload week 6, a sane session cap).
3. Runs the engine: `resolveConstraints(...)` → `generateMesocycle(...)` → a `MesocyclePlan`.
4. Persists the plan graph (idempotent — deletes any prior seeded block for that athlete first):
   - `Mesocycle` (`status: ACTIVE`, `lengthWeeks`, `startDate` = **14 days ago** so the derived current week lands on **week 3**, matching the readiness fixture's narrative).
   - per `WeekPlan`: `Week` (`index`, `isDeload`), `WeekMuscleVolume` rows from `muscleVolume`, `TrainingSession`s (`splitSlot` = `label`, `order`, `targetDurationMin` = `estimatedMinutes`), and `ExercisePrescription`s (resolving `PrescriptionPlan.exerciseName` → `Exercise.id` by unique name; `sets`/`targetRepLow`/`targetRepHigh`/`targetRir`).
   - `DecisionLog` rows from `MesocyclePlan.facts` (cheap; used by later slices — mapper ignores them here).

The **write path is thus exercised and proven in the seed**, even though the app only reads.

### 2. Pure view-model mappers (`src/server/views/`)

`toMesocycleView(m: MesocycleWithRelations): MesocycleView` plus sub-mappers, all **pure** (take a Prisma-shaped object, return view models) so they unit-test **without a DB**. Mapping:

| View field | Source |
|---|---|
| `id`, `name`, `status` | `Mesocycle.id` / `.name` / `.status` |
| `splitLabel` | `ConstraintSet.splitType` → label (`UPPER_LOWER`→"Upper/Lower", `PUSH_PULL_LEGS`→"Push/Pull/Legs", `FULL_BODY`→"Full Body", `BRO_SPLIT`→"Bro Split", `CUSTOM`→"Custom") |
| `daysPerWeek` | `ConstraintSet.daysPerWeek` |
| `blockLengthWeeks` | `Mesocycle.lengthWeeks` |
| `currentWeekIndex` | derived: `startDate` present → `clamp(floor((now−startDate)/7d)+1, 1, lengthWeeks)`, else `1` |
| `deloadWeekIndex` | the `Week` with `isDeload`, else `ConstraintSet.deloadWeekIndex ?? lengthWeeks` |
| `muscles` (row order) | muscles present in `WeekMuscleVolume`, sorted by a canonical `MUSCLE_DISPLAY_ORDER` (the `MuscleGroup` enum order) |
| `priorityMuscles` | `MuscleTarget` where `priority > 0` |
| `coachNotes` | `[]` (deferred) |
| `weeks[]` | `Week[]` → `WeekView` |

`WeekView`: `index`, `isDeload`, `isCurrent` (= `index === currentWeekIndex`), `totalSets` (Σ prescription `sets`), `sessions` (`TrainingSession[]` → `SessionView`), `cells` (`WeekMuscleVolume[]` → `MuscleWeekCell` with `plannedSets` from the row and `mev/mav/mrv` from `DEFAULT_LANDMARKS[muscle]`).

`SessionView`: `slotId` = `TrainingSession.id`, `label` = `splitSlot`, `dayTag` from `dayOfWeek` (0=Mon…6=Sun → "Mon"…"Sun", undefined if null), `estimatedMinutes` = `targetDurationMin ?? 0`, `prescriptions` → `PrescriptionView`. `swapOptions` omitted.

`PrescriptionView`: `exerciseName` = `exercise.name`, `sets`, `repRangeLow/High` = `targetRepLow/High`, `targetRir`, `muscles` (`MuscleChip[]`) from `exercise.muscles` (`ExerciseMuscle` → `{muscle, role, fraction}`).

### 3. tRPC `mesocycle` router (`src/server/api/routers/mesocycle.ts`)

`getCurrentBlock: protectedProcedure.query` → loads the session user's most-recent `ACTIVE` `Mesocycle` (scoped `athleteProfile.userId === ctx.session.user.id`) with the deep `include` needed by the mapper (`constraintSet.muscleTargets`, `weeks.muscleVolumes`, `weeks.sessions.prescriptions.exercise.muscles`), runs `toMesocycleView`, and returns `MesocycleView | null`. Registered in `root.ts`.

### 4. Wire the UI off fixtures

The five block surfaces replace `import { mockMesocycle }` with `const block = await api.mesocycle.getCurrentBlock()` (RSC via `~/trpc/server`):
- `src/app/app/page.tsx` (Now home — block data real; readiness chip + swap stay fixture)
- `src/app/app/block/page.tsx`, `.../block/[blockId]/page.tsx`, `.../block/[blockId]/week/[n]/page.tsx`, `src/app/app/analysis/page.tsx`

When `block` is `null`, render a shared **empty state** ("No active block yet" — gestures toward onboarding, which arrives in ②) instead of the fixture.

## Data flow

```
seed: default ConstraintSet → resolveConstraints → generateMesocycle → Prisma (Mesocycle graph + DecisionLog)   [write, once]
app:  getCurrentBlock (protected, user-scoped) → Prisma read (deep include) → toMesocycleView → MesocycleView → block pages   [read]
```

## Error / empty handling

- No `User` at seed time → the seed throws a clear, actionable error (log in first).
- `getCurrentBlock` returns `null` when the user has no `ACTIVE` mesocycle → pages render the empty state, never crash.
- A prescription whose `exerciseName` doesn't resolve to an `Exercise` at seed time → the seed throws (a generated plan must only reference library exercises; this catches library drift early).

## Testing

- **Mappers** — pure unit tests over hand-built Prisma-shaped fixtures: `splitLabel` mapping, `currentWeekIndex` derivation (no `startDate`→1; a `startDate` 14d ago→3; clamping past `lengthWeeks`), `deloadWeekIndex` from `isDeload`, muscle row ordering, `isCurrent`, chip derivation from `exercise.muscles`, `coachNotes: []`. No DB.
- **Seed** — extend `prisma/seed/seed.test.ts` for the new path where it can run against the test DB; otherwise its correctness is covered by the user running `pnpm db:seed`.
- **Seed, tRPC router, page wiring** need a live Neon DB (subagents cannot touch it) → gated by `pnpm typecheck` + `pnpm lint`, then **the user** runs `pnpm db:seed` and `pnpm dev` for visual verification. This division is why the risky pieces are kept thin and the logic lives in the pure, tested mappers.

## Files (anticipated)

- Create `src/server/views/to-mesocycle-view.ts` (+ `.test.ts`) — the mappers + `MUSCLE_DISPLAY_ORDER` + `splitLabel`/`currentWeekIndex` helpers.
- Create `src/server/api/routers/mesocycle.ts`; modify `src/server/api/root.ts`.
- Create `prisma/seed/mesocycle.ts` (the `seedMesocycle` builder); modify `prisma/seed/index.ts` to call it; extend `prisma/seed/seed.test.ts`.
- Create `src/components/app/empty-block-state.tsx` (shared empty state).
- Modify the five block pages to fetch via tRPC with the empty-state fallback.

## Success criteria

After `pnpm db:seed` (with a logged-in user present), navigating the app shows the **same block surfaces now driven by a real, persisted, engine-generated mesocycle** instead of the fixture: the Now home hero, the block heat-map grid, week detail, and analysis all read from Postgres via tRPC; the current week resolves to week 3; a user with no active block sees a clean empty state. Mappers are green in unit tests; typecheck + lint clean.
