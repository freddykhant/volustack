# Integration Layer ② — Onboarding → Plan (Design)

**Status:** Approved 2026-09-11
**Scope:** Second sub-project of the integration layer. The in-app **write path** ① deferred to the seed.
**Branch target:** merges into `freddy/experimental` (standing rule).
**Builds on:** ① round-trip (read path, mappers, `mesocycle.getCurrentBlock`) — merged at `5e1eb5a`.
**Part of:** the integration layer — ① round-trip → **② onboarding (this)** → ③ check-in + logging → ④ progression + real readiness.

## Problem

① proved the read path but the only *write* is the seed. A real athlete has no way to create their first block in-app: signing in and landing on "No active block yet" is a dead end. ② builds the front door — collect the athlete's basics, run the real engine, and persist their first ACTIVE mesocycle — turning the seed's one-shot write into a user-driven flow.

It also closes the one latent blocker ①'s whole-branch review flagged as must-fix-before-③ (the BlockGrid union-vs-per-week cell crash), because ② is the first path that generates real blocks and ③'s adaptation is what would trigger it.

## Non-goals (deferred, named)

- **Editing / regenerating the generated plan** → later. Onboarding is *generate & land*: finish → save ACTIVE → redirect to the block. No preview/accept screen, no in-app block editing yet.
- **Bio used by the engine** (TDEE, biodata-driven adaptation) → phase 2. Bio (sex/height/weight/age) is captured and stored on `AthleteProfile` now so onboarding is complete, but the engine does not consume it yet.
- **Proficiency as an ongoing dimension** → never. Proficiency is a one-time onboarding shortcut only (see Reconciliation below).
- **AM/PM two-a-day scheduling** → later slice. One session-slot-per-training-day for now.
- **Discipline selection** → hypertrophy is the only discipline in MVP; no discipline question in the wizard. (Endurance is phase 2.)
- **Re-onboarding / multiple blocks over time** (completed block → new block) → later. ② only creates the *first* block; the route + mutation both refuse when an ACTIVE block already exists.
- **Real readiness / Form / swap** → still fixtures (③/④), unchanged by ②.

## Architecture

### 1. Route & gate

Onboarding is a **top-level `/onboarding` route**, NOT under `/app`. Rationale: `/app`'s layout renders the nav + block sidebar (which has no block during onboarding), and a redirect gate inside that same layout fights Next's RSC pathname limitations and risks a redirect loop. A focused, chrome-free first-run at `/onboarding` avoids both and reads better.

- **`src/app/app/layout.tsx`** (modify): after `getSession()`, it already fetches `getCurrentBlock()` for the sidebar. Add: signed in + `block === null` → `redirect("/onboarding")`.
- **`src/app/onboarding/page.tsx`** (create, RSC): not signed in → `redirect("/")`; already has an ACTIVE block → `redirect("/app")`; else render `<OnboardingWizard />`.
- **`src/app/onboarding/layout.tsx`** (create): a minimal chrome-free layout (no `AppFrame`). May be as small as passing children through inside a centered container.
- ①'s `EmptyBlockState` is retained as a safety-net fallback (rarely reached now).

### 2. What's captured → engine input

A Zod schema **`OnboardingInputSchema`** (`src/schema/onboarding.ts`):

```ts
export const OnboardingInputSchema = z.object({
  // Bio (stored on AthleteProfile; not consumed by the engine yet)
  sex: SexEnum,                              // MALE | FEMALE
  age: z.number().int().min(13).max(100),
  heightCm: z.number().min(120).max(250),
  weightKg: z.number().min(30).max(300),
  // Logistics (athlete-owned)
  daysPerWeek: z.number().int().min(1).max(7),
  sessionLengthCapMin: z.number().int().min(15).max(240),
  // Programming intent (athlete-chosen)
  splitType: SplitTypeEnum,                  // FULL_BODY | UPPER_LOWER | PUSH_PULL_LEGS | ...
  proficiency: ExperienceLevelEnum,          // BEGINNER | INTERMEDIATE | ADVANCED
  priorityMuscles: z.array(MuscleGroupEnum).max(3).default([]),
});
export type OnboardingInput = z.infer<typeof OnboardingInputSchema>;
```

(Field bounds mirror the existing `ConstraintSetInputSchema` where they overlap — `daysPerWeek` 1–7, `sessionLengthCapMin` 15–240.)

A **pure** mapper `buildConstraintSetInput(input: OnboardingInput): ConstraintSetInput` (`src/domain/onboarding-template.ts`):
- `daysPerWeek`, `sessionLengthCapMin`, `splitType` pass through directly.
- `priorityMuscles` → `muscleTargets: priorityMuscles.map(m => ({ muscle: m, priority: 3 }))` (the same shape the seed used for side-delts; `weeklySetTarget` left unset so the engine fills MEV-based defaults).
- `checkInCadence`: `"WEEKLY"` (default; no cadence question in ②).
- `excludedExerciseNames`: `[]`.
- **The proficiency template** fills block shape:

| `proficiency` | `blockLengthWeeks` | `deloadWeekIndex` |
|---|---|---|
| `BEGINNER` | 4 | 4 |
| `INTERMEDIATE` | 6 | 6 |
| `ADVANCED` | 8 | 8 |

Expressed as `const PROFICIENCY_TEMPLATE: Record<ExperienceLevel, { blockLengthWeeks: number; deloadWeekIndex: number }>`.

**Proficiency ↔ engine reconciliation.** The vision states proficiency is "NOT a persisted dimension the engine reasons about *later*." Read as a *starting-point shortcut*: proficiency (a) sets `AthleteProfile.experience`, which the engine legitimately consumes at generation time (`resolveConstraints` uses `experienceLevel`, e.g. `isBeginner`), and (b) selects the block template above. We build **no ongoing logic** that keys off proficiency after the block is generated. Persisting `experience` and feeding it to *this* generation is fully consistent with "not reasoned about later." Bio fields are persisted but not fed to the engine (phase-2 use).

### 3. The write path — `onboarding.createPlan` mutation

A new tRPC router `src/server/api/routers/onboarding.ts`, registered on `appRouter` as `onboarding`:

```
createPlan: protectedProcedure.input(OnboardingInputSchema).mutation → { mesocycleId: string }
```

Steps (all inside a single `db.$transaction`):
1. **Guard** — if the user already has an ACTIVE `Mesocycle` (scoped `athleteProfile.userId === ctx.session.user.id`), throw `TRPCError({ code: "CONFLICT" })` (defense-in-depth over the route gate).
2. **Upsert `AthleteProfile`** for the user with bio (`sex`, `age`, `heightCm`, `weightKg`) + `experience = input.proficiency`.
3. **`buildConstraintSetInput(input)`** → run `resolveConstraints(csInput, { experienceLevel: input.proficiency, phase: profile.phase, landmarks: DEFAULT_LANDMARKS })`.
4. **Infeasibility guard** — if `spec.kind !== "resolved"`, throw a **friendly** `TRPCError({ code: "BAD_REQUEST", message })` derived from the infeasibility facts (e.g. "Your split doesn't fit that many muscles in {cap} min — try fewer priority muscles or a longer session cap."). **Nothing is committed** (the transaction rolls back).
5. **`generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS)`**.
6. **Create the `ConstraintSet` row** from `csInput` (version = max existing version for the athlete + 1), then call **`persistMesocyclePlan(tx, …)`** with that `constraintSetId` to persist the `Mesocycle` (`status: ACTIVE`, `name`, `startDate = new Date()` → current week 1) + weeks/sessions/prescriptions/volumes + `DecisionLog` rows. (The helper does *not* create the `ConstraintSet` — that stays the caller's job, since the seed and the mutation differ there: delete-first vs. version-bump.)
7. Return `{ mesocycleId }`. The wizard redirects to `/app/block` on success.

**Block name:** the deterministic default `"Block 1"` for ②; naming/customization is deferred.

### 4. Shared persistence helper (DRY)

The seed (`prisma/seed/mesocycle.ts`) and `createPlan` persist the **identical** `MesocyclePlan` graph. Extract `persistMesocyclePlan(tx, args)` into `src/server/mesocycle/persist.ts`:

```ts
export async function persistMesocyclePlan(
  tx: Prisma.TransactionClient,
  args: {
    athleteProfileId: string;
    constraintSetId: string;
    plan: MesocyclePlan;
    startDate: Date;
    name: string;
  },
): Promise<{ mesocycleId: string; weeks: number }>;
```

- Resolves each `PrescriptionPlan.exerciseName` → `Exercise.id` (throws on an unresolved name, as the seed does).
- Persists `WeekMuscleVolume` rows only for muscles with volume `> 0` (unchanged from the seed).
- Persists `DecisionLog` rows from `plan.facts` (one per fact, `type: GENERATE`, `status: APPLIED`, `payload: fact`) — unchanged from the seed.
- Runs inside the caller's transaction client.

Both callers wrap in `$transaction` — this also closes ①'s "seed not transactional" minor. The **seed is refactored** to build its default `ConstraintSetInput`, upsert profile + constraint set, run the engine, then call `persistMesocyclePlan` — same observable behavior (idempotent delete-first, `startDate` 14 days ago → week 3, name unchanged), just the persistence body shared. `buildConstraintSetInput` is *not* used by the seed (the seed keeps its own hardcoded default constraints so its narrative stays fixed and independent of the onboarding template).

### 5. The wizard (client)

`src/components/onboarding/onboarding-wizard.tsx` — a client component, a 4-step state machine over local `useState` (no per-step routes):
1. **About you** — sex, age, height, weight.
2. **Schedule** — days/week, session-length cap.
3. **Split** — Full Body / Upper-Lower / Push-Pull-Legs (the `SplitType` values MVP supports).
4. **Proficiency & priorities** — proficiency (beginner/intermediate/advanced) + optional priority muscle(s).

Next/Back navigation + progress dots. Per-step client-side validation gates "Next" (bounds mirror the Zod schema). The final step's "Create my plan" calls `api.onboarding.createPlan.useMutation()`; on success `router.push("/app/block")`; on error (including the friendly infeasibility message) shows it inline and stays on the wizard. Skeleton styling, existing tokens, accent scarce (only the primary "Create my plan" action).

### 6. Bundled fix — the ③ blocker (BlockGrid cell reconciliation)

`toMesocycleView` (`src/server/views/to-mesocycle-view.ts`) currently builds `block.muscles` as the union of muscles across all weeks, but each `week.cells` only from that week's `WeekMuscleVolume` rows. `block-grid.tsx:62` force-unwraps `w.cells.find(c => c.muscle === muscle)!`, which lies whenever a week omits a block-trained muscle → runtime crash.

**Fix:** compute `muscles` (the union, in `MuscleGroup` enum order) first, then have `toWeekView` emit a cell for **every** muscle in that union for **every** week — `plannedSets` from the row when present, else `0` (with that muscle's `DEFAULT_LANDMARKS`). Now `block.muscles` and each `week.cells` are reconciled by construction; the grid's `!` can never miss.

- **Factual, Law-1 safe:** a muscle absent from a week genuinely has 0 planned sets.
- **Zero behavioral change on current data:** every week already trains the full set, so the union equals each week's present set and no 0-cells are added.
- **Named consequence:** a genuinely-rested muscle now yields a `zoneFor(0) === "rest"` cell, so `rollUpStatus` counts it under `rest`/`total`. This is correct — the muscle *is* resting that week — and only manifests once ③ introduces weeks that drop a muscle.

## Data flow

```
/app/* (signed in, no ACTIVE block) ─redirect→ /onboarding
  wizard collect → api.onboarding.createPlan(OnboardingInput)   [WRITE]
    guard no-active → upsert profile(bio+experience)
    → buildConstraintSetInput → resolveConstraints
        └ infeasible? → friendly throw, tx rollback, stay on wizard
    → generateMesocycle → persistMesocyclePlan (tx) → Mesocycle ACTIVE, startDate=now
  success → router.push("/app/block")
/app/block → getCurrentBlock (① read path) → real week-1 plan
```

## Error / empty handling

- Not signed in at `/onboarding` → redirect `/`.
- Already has an ACTIVE block at `/onboarding` → redirect `/app` (and the mutation independently throws CONFLICT).
- Infeasible constraints → friendly error surfaced in the wizard; **no partial write** (single transaction).
- Unresolved exercise name during persist → throw (a generated plan must reference only library exercises); rolls back.
- `/app/*` with no block → redirect to `/onboarding` (empty state retained only as a fallback).

## Testing

**Pure / unit-tested (no DB):**
- `OnboardingInputSchema` — accepts a valid payload; rejects out-of-bounds age/height/weight/days, and `>3` priority muscles.
- `buildConstraintSetInput` — each proficiency → correct `blockLengthWeeks`/`deloadWeekIndex`; `experience` passthrough; `priorityMuscles` → `muscleTargets` at priority 3; logistics/split passthrough; empty priorities → empty targets.
- `toMesocycleView` 0-cell reconciliation — a hand-built payload where week B omits a muscle that week A has → week B still yields a `plannedSets: 0` cell for it with correct landmarks; and the no-op case (all weeks share muscles → no spurious cells, existing tests still green).

**DB-bound → typecheck/lint gate + user verification (subagents cannot touch Neon):**
- `onboarding.createPlan` mutation, `persistMesocyclePlan`, and the seed refactor are gated by `pnpm typecheck && pnpm lint`, then the user verifies: a fresh account completes onboarding and lands on a real **week-1** ACTIVE block; re-visiting `/onboarding` redirects to `/app`; an intentionally infeasible combo shows the friendly error and creates nothing; `pnpm db:seed` still works unchanged.

**Client interaction → typecheck/lint + user visual check** (matching the presentational-component convention): the wizard steps, validation gating, and redirect-on-success.

## Files (anticipated)

- Create `src/schema/onboarding.ts` (`OnboardingInputSchema`, `OnboardingInput`) + `.test.ts`; export from `src/schema/index.ts`.
- Create `src/domain/onboarding-template.ts` (`PROFICIENCY_TEMPLATE`, `buildConstraintSetInput`) + `.test.ts`.
- Create `src/server/mesocycle/persist.ts` (`persistMesocyclePlan`).
- Create `src/server/api/routers/onboarding.ts` (`createPlan`); modify `src/server/api/root.ts` (register `onboarding`).
- Create `src/app/onboarding/layout.tsx` + `src/app/onboarding/page.tsx`.
- Create `src/components/onboarding/onboarding-wizard.tsx` (client).
- Modify `src/app/app/layout.tsx` (redirect-to-onboarding gate).
- Modify `src/server/views/to-mesocycle-view.ts` (0-cell reconciliation) + extend `src/server/views/to-mesocycle-view.test.ts`.
- Refactor `prisma/seed/mesocycle.ts` to call `persistMesocyclePlan`.

## Success criteria

A brand-new signed-in athlete is redirected to `/onboarding`, completes the 4-step wizard, and lands on `/app/block` showing a **real, engine-generated, week-1 ACTIVE block** built from their own bio/schedule/split/proficiency — persisted transactionally, with priority muscles reflected in the plan. Re-visiting `/onboarding` bounces to `/app`. An infeasible combination is caught with a friendly message and writes nothing. `pnpm db:seed` still produces its week-3 demo block unchanged. The BlockGrid cell-reconciliation lands with green mapper unit tests and no behavioral change on current data. Typecheck + lint clean; ① read path untouched.
