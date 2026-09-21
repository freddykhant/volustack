# Integration Layer ④-A — Weekly Check-in → Progression Proposal (Design)

**Status:** Approved 2026-09-21
**Scope:** First sub-project of ④. The **weekly adaptation loop**: capture the athlete's subjective recovery/joint signal for a completed week, auto-derive performance from what they logged, and surface an **accept-gated** proposal for next week's volume computed by the already-built `stepWeek` engine.
**Branch target:** merges into `freddy/experimental` (standing rule). Feature branch `freddy/feat/weekly-checkin-progression`.
**Builds on:** ③ check-in + logging write path — merged at `2949020`. Reuses ③'s `weekPlanFromDb`, `adaptationContextFrom`, `applyWeekPlanToDb`, `WEEK_FOR_PLAN_INCLUDE`, `CS_WITH_TARGETS_INCLUDE`, and the reschedule dialog's modal pattern.
**Part of:** the integration layer — ① round-trip → ② onboarding → ③ check-in + logging → **④ progression + real readiness**. ④ decomposes into **④-A progression loop (this)** → ④-B real readiness from logged load → ④-C progression↔readiness cross-links.

## Problem

After ③, an athlete has a real ACTIVE block they can log and reschedule, and the plan already ships a **fully built, unit-tested progression brain** — `src/engine/step-week.ts` — that steps next week's per-muscle volume up/down from recovery/performance/joint feedback (ramping toward MRV, backing off when under-recovered, flagging joint stress for an exercise swap). But `stepWeek` has **zero callers**: no way to feed it feedback, no way to surface or accept its proposal. The product's signature promise — *the coach proposes, the athlete controls* — has no in-app instance yet.

④-A closes that gap. When a training week is resolved, the athlete does one weekly check-in (per-muscle recovery + joint); the server derives performance from the `SetLog` actuals ③ captured; `stepWeek` produces next week's adjustment; the athlete accepts or rejects it. This is the Stamina loop made real, and it produces the `CheckInMuscle` recovery data ④-B's real-readiness model will also read.

## Decisions (locked during brainstorming)

- **Capture cadence: one weekly per-muscle check-in.** `CheckInScope.WEEK`. A single end-of-week grid rates **recovery** (0–3) and **joint** (0–3) for each muscle trained that week. Maps 1:1 to `stepWeek`'s native `CheckInFeedback` shape — no per-session aggregation layer.
- **Performance is derived, never asked (Law 1).** `MuscleFeedback.performance` (0=regressed → 3=beat targets) is **computed** from the week's `SetLog` rows vs. the prescription targets — the athlete already logged the actuals, so asking them to self-rate performance is redundant *and* an invented number. The engine owns it.
- **Trigger: auto-surface when the week is resolved.** A week is check-in-eligible once **every** `TrainingSession` in it is `COMPLETED` or `MISSED` — derived from status, no new flag. A "Week N wrapped — how'd it land?" entry appears on Now-home and the Week page.
- **Accept model: whole-proposal accept/reject.** The proposal shows the full proposed next week (per-muscle Δsets + plain-language cause) as one coherent plan. **Accept** rebuilds week N+1 and writes a `DecisionLog(PROGRESS, APPLIED)`; **Reject** leaves the plan untouched and writes `DecisionLog(PROGRESS, REJECTED)`. Mirrors ③'s reschedule accept-gate; keeps the engine on its tested full-week path.
- **Muscle scope: trained-that-week only.** The grid lists only muscles with ≥1 prescription in the week. Untrained target muscles receive `default_progression` from `stepWeek` automatically — no need to ask.
- **Accept-gate boundary:** submitting the check-in **records truth → no gate** (writes `CheckIn`/`CheckInMuscle`, computes a proposal). Applying the proposal **mutates the plan → accept-gated**, with a `DecisionLog` audit row. Consistent with ③.

## Non-goals (deferred, named)

- **Real readiness / Fitness-Fatigue-Form from logged load** → ④-B. This slice keeps `mockReadiness`. It *does* start persisting the `CheckInMuscle.recovery` signal ④-B can also consume.
- **Per-muscle curation of the proposal** (accept some Δs, skip others) → v2. Needs a partial-apply engine path; YAGNI for lighting up the loop. `DecisionLog.payload` records the full adjustment for a future finer-grained undo/curate.
- **Auto-triggered deload** (`evaluateDeload` wiring off `checkInValue: "high"`) → later. `stepWeek` already returns `checkInValue` and this slice persists it in the `DecisionLog` payload, but does not act on it beyond an advisory note in the proposal.
- **Undo of an applied progression** → later (the `DecisionLog(APPLIED)` payload records the full pre/post adjustment for a future undo).
- **Editing/overriding a proposed Δ before accept** → v2 (pairs with per-muscle curation).
- **Ad-hoc / per-session check-ins** (`CheckInScope.SESSION`/`AD_HOC`) → out; the enum values exist but only `WEEK` is wired here.

## Architecture

### 1. Schema (Prisma — user-applied if not already pushed)

The models this slice needs **already exist in `prisma/schema.prisma`** (added alongside ③'s schema work): `CheckIn` (`scope`, `weekId`, `athleteProfileId`), `CheckInMuscle` (`recovery`, `performance`, `jointStress`, `plannedSets`, `actualSets`, `@@unique([checkInId, muscle])`), and the `DecisionType.PROGRESS` / `DecisionStatus { PROPOSED, ACCEPTED, REJECTED, APPLIED }` enum values. So this slice needs **no new schema** — only a confirmation that the current schema is applied to Neon.

Subagents cannot touch Neon: the implementer authors no migration here, and the user confirms `pnpm db:push`/migrate parity as the DB gate (same as ②/③). If the CheckIn tables turn out not to be applied yet, that push is the only DB action.

**Law-1 note:** `CheckInMuscle.recovery`/`jointStress` are athlete-entered subjective values (the athlete owns them). `performance`, `plannedSets`, `actualSets` are engine/data-derived and stored for audit — never asked.

### 2. Pure engine adapters (new, unit-testable — `src/server/mesocycle`)

`stepWeek(plan: MesocyclePlan, weekIndex, feedback: CheckInFeedback, ctx: AdaptationContext)` already exists and needs the **whole** `MesocyclePlan` (it reads the current week and the upcoming week+1). ③ only built `weekPlanFromDb` (single week). ④-A adds:

- **`mesocyclePlanFromDb(mesocycle: MesocycleWithWeeks): MesocyclePlan`** — compose `weekPlanFromDb` across all weeks into `{ splitType, blockLengthWeeks, deloadWeekIndex, weeks[], facts: [] }`. Pure; sibling of `weekPlanFromDb` in `reschedule-adapters.ts`. Reuses the existing `WEEK_FOR_PLAN_INCLUDE` per week (extended to all weeks of the mesocycle). `facts` is `[]` (not needed by `stepWeek`).
- **`derivePerformance(week: WeekWithLogs, targets: ResolvedMuscleTarget[]): Map<MuscleGroup, number | undefined>`** — the Law-1 rule. For each **trained** muscle (a muscle that is the **primary** role of ≥1 prescription's exercise in the week, via `ExerciseMuscle` where `role = PRIMARY`), score each such prescription from its logged sets vs. its targets, then take the mean and floor to an int (`undefined` when the muscle has no logged sets — e.g. an all-missed week):
  - **per-prescription score** (only prescriptions with ≥1 `SetLog`):
    - `3` (beat) — median logged `reps ≥ targetRepHigh` **and** (no `targetRir`, or median `achievedRir ≤ targetRir`)
    - `2` (on target) — median `reps` within `[targetRepLow, targetRepHigh]` at roughly target RIR (median `achievedRir ≤ targetRir + 1`)
    - `1` (soft miss) — median `reps` within range but `achievedRir > targetRir + 1`, **or** `reps` in `[targetRepLow-2, targetRepLow)`
    - `0` (regressed) — median `reps < targetRepLow - 2`
  - Prescriptions with null targets (no `targetRepLow/High`) are skipped from the mean (can't judge). If every prescription for a muscle is unjudgeable/unlogged → `undefined`.

  `stepWeek` handles `performance === undefined` correctly: it won't step **up** (needs both recovery *and* performance `≥ SCORE_GOOD`), but still steps **down** on low recovery/joint. So an all-missed week yields a safe hold/back-off proposal.

`adaptationContextFrom(cs, athlete)` (③) is reused unchanged to build `ctx` with resolved `targets`.

### 3. Proposal application (reuse ③, one new composition)

`stepWeek` returns a `WeekAdjustment { adjustments: MuscleAdjustment[], checkInValue, facts }` describing per-muscle `adjustedSets` for week N+1 — **not** a `WeekPlan`. To apply it:

- **`weekPlanFromAdjustment(upcomingWeek: WeekPlan, adj: WeekAdjustment): WeekPlan`** (new, pure) — build the target `MuscleVolumeMap` from `adj.adjustments` (`adjustedSets` per muscle; muscles not in `adjustments` keep `upcomingWeek.muscleVolume`), then run the engine's existing `distributeVolume(...)` to lay that volume into the upcoming week's session structure, producing a `WeekPlan`. Reuses `distributeVolume` (`src/engine/distribute.ts`) — the same primitive the generator uses — so distribution stays consistent with how blocks are built.
- Persist with the existing **`applyWeekPlanToDb(tx, weekId, weekPlan)`** (③) against week N+1's id. Same rewrite-prescriptions + recompute-`WeekMuscleVolume` path the reschedule accept already uses and tests.

### 4. Write paths (tRPC — new `checkin` router, `protectedProcedure`, user-scoped)

All procedures first load the week scoped to `athleteProfile.userId === ctx.session.user.id` and the ACTIVE mesocycle; a miss → `TRPCError NOT_FOUND`.

**a. `getWeeklyCheckIn`** — eligibility + form scaffold, mutates nothing.
```
getWeeklyCheckIn: input({ weekIndex }).query → WeeklyCheckInView
WeeklyCheckInView = {
  weekIndex,
  eligible: boolean,              // all sessions COMPLETED|MISSED
  trainedMuscles: MuscleGroup[],  // primary-role muscles with a prescription this week
  status: "NOT_READY" | "READY" | "SUBMITTED" | "APPLIED" | "REJECTED",
  existing?: { muscles: {muscle, recovery, joint}[] }  // for re-open before apply
}
```
- `status` derives from session statuses + the latest `DecisionLog(type: PROGRESS)` for this week transition + whether a `CheckIn(scope: WEEK, weekId)` exists.

**b. `submitWeeklyCheckIn`** — record truth + compute proposal, **no plan mutation**.
```
submitWeeklyCheckIn: input({ weekIndex, muscles: CheckInMuscleInput[] }).mutation → ProgressionProposalView
CheckInMuscleInput = { muscle: MuscleGroup, recovery: int 0–3, joint: int 0–3 }
```
- Reject if the week isn't eligible (BAD_REQUEST — not all sessions resolved). Reject any `muscle` not in `trainedMuscles` (BAD_REQUEST).
- One `$transaction`:
  - **Upsert** the week's `CheckIn(scope: WEEK, weekId)` (idempotent re-submit): delete existing `CheckInMuscle` rows for it, then create one row per input muscle with `recovery`, `jointStress = joint`, derived `performance` (§2), `plannedSets`/`actualSets` (planned = `WeekMuscleVolume`; actual = counted `SetLog`s for that muscle's prescriptions).
  - Assemble `CheckInFeedback { weekIndex, muscles: [{muscle, recovery, performance, joint}] }`.
  - `mesocyclePlanFromDb` + `adaptationContextFrom` → `stepWeek(plan, weekIndex, feedback, ctx)` → `WeekAdjustment`.
  - Write/replace a `DecisionLog(type: PROGRESS, status: PROPOSED, weekIndex, summary, payload = { adjustments, checkInValue, facts })`.
- Returns `ProgressionProposalView` (mapped from `WeekAdjustment`, §5). **No `applyWeekPlanToDb` call** — the plan is untouched until accept.
- Edge outputs (§ Error/empty): upcoming-deload and last-week variants return a proposal whose `kind` marks it informational.

**c. `applyProgression`** — the accept-gate commit (plan mutation).
```
applyProgression: input({ weekIndex }).mutation → { appliesToWeekIndex }
```
- Recompute deterministically (same feedback from the persisted `CheckIn` → `stepWeek`), so the applied plan matches what was shown.
- One `$transaction`, guarded like ③'s reschedule (re-assert inside the tx that week N+1's sessions are still `SCHEDULED` — CONFLICT if any changed):
  - `weekPlanFromAdjustment(upcomingWeekPlan, adj)` → `applyWeekPlanToDb(tx, upcomingWeek.id, plan)`.
  - Update the `DecisionLog(PROGRESS)` row `PROPOSED → APPLIED` (add applied diff to payload).
- No-op for the informational edge cases (last week / deload): BAD_REQUEST "nothing to apply".

**d. `rejectProgression`** — decline, no plan mutation.
```
rejectProgression: input({ weekIndex }).mutation → { ok: true }
```
- Update the `DecisionLog(PROGRESS)` row `PROPOSED → REJECTED`. Plan unchanged. (The check-in stays recorded — recovery data is still truth for ④-B.)

### 5. Read path / view

`src/views/types.ts`:
- `WeeklyCheckInView` (§4a).
- `ProgressionProposalView = { fromWeekIndex, appliesToWeekIndex, kind: "CHANGES" | "DELOAD_HOLD" | "BLOCK_END", advisory?: string, adjustments: MuscleProposalView[] }`
- `MuscleProposalView = { muscle, plannedSets, adjustedSets, delta, cause: StepCause, swapCandidate }` — a thin, presentation-shaped mirror of the engine's `MuscleAdjustment` (no invented numbers; `cause` maps to plain-language copy in the UI).

Mapper `toProgressionProposalView(adj: WeekAdjustment, context): ProgressionProposalView` (new, pure, unit-tested). `kind` = `BLOCK_END` when there is no week N+1, `DELOAD_HOLD` when week N+1 `isDeload`, else `CHANGES`.

Check-in eligibility for the entry cards rides a light query (`getWeeklyCheckIn`) rather than bloating `MesocycleView`.

### 6. UI

Dark app-shell-kit tokens, accent scarce (CTA + recommended only), Data-Only Zone rule respected (zone-* only for the volume Δ semantics, never chrome). Motivational voice at the beats (matches the Now-home facelift).

- **`WeeklyCheckInEntry`** (client) — on Now-home and the Week page. Renders only when `getWeeklyCheckIn().status === "READY"`: a card "Week N wrapped — how'd it land?" → opens the grid. Hidden/soft state for `SUBMITTED`/`APPLIED` (show "Proposal ready →" / "Applied to Week N+1 ✓").
- **`WeeklyCheckInGrid`** (client, modal or Week-page panel) — per trained muscle, two 4-point selectors: **recovery** (wrecked → fresh) and **joint** (fine → painful). Submit → `submitWeeklyCheckIn` → opens the proposal. Same keyboard/focus contract as `reschedule-dialog.tsx` (focus-on-open, Escape, Tab-trap, focus-restore) when modal.
- **`ProgressionProposalDialog`** (client) — patterned on `reschedule-dialog.tsx`. Lists `adjustments` (muscle · `plannedSets → adjustedSets` · Δ · plain-language cause; swap-flagged muscles get a "consider swapping" note). `kind: CHANGES` → `[ Accept plan ] [ Keep as-is ]` (accept → `applyProgression`, keep → `rejectProgression`). `DELOAD_HOLD` → informational ("Next week is your planned deload — holding volume", single dismiss). `BLOCK_END` → recap ("Block's final week — nothing to progress into", single dismiss). On `checkInValue: "high"`, an advisory line ("Heads up — a few muscles are near the ceiling") — advisory only, no auto-deload.

## Data flow

```
Week N resolved (all sessions COMPLETED|MISSED)
  → getWeeklyCheckIn(N)  [READ] status=READY, trainedMuscles
Now-home / Week page: "Week N wrapped" entry → WeeklyCheckInGrid
  → submitWeeklyCheckIn(N, [{muscle, recovery, joint}])  [WRITE truth, no gate]
       tx: upsert CheckIn + CheckInMuscle (perf derived from SetLog vs targets)
       mesocyclePlanFromDb + adaptationContextFrom → stepWeek → WeekAdjustment
       DecisionLog(PROGRESS, PROPOSED); return ProgressionProposalView
  → ProgressionProposalDialog
       Accept → applyProgression(N)  [WRITE, accept-gated]
                 tx (guarded): weekPlanFromAdjustment → applyWeekPlanToDb(week N+1)
                 DecisionLog PROPOSED→APPLIED
       Keep   → rejectProgression(N)  [WRITE audit only] DecisionLog PROPOSED→REJECTED
getCurrentBlock (③ read path) → week N+1 volumes reflect an applied progression
```

## Error / empty handling

- Week not in the user's ACTIVE block → NOT_FOUND.
- `submitWeeklyCheckIn` on an un-resolved week, or a muscle not trained that week → BAD_REQUEST; single tx, no partial write.
- **All-missed week** → no `SetLog`s → every muscle `performance = undefined`; the check-in still records recovery/joint; `stepWeek` yields a hold/step-down proposal (never a step-up). Athlete can still Accept/Reject.
- **Upcoming week is the deload** → `stepWeek` emits no deltas → `kind: DELOAD_HOLD`, informational, `applyProgression` returns BAD_REQUEST ("nothing to apply").
- **Last week of block** (no week N+1) → `kind: BLOCK_END`, recap only, no apply.
- **Idempotent re-submit** before accept → upserts the `CheckIn`, re-runs `stepWeek`, replaces the `PROPOSED` `DecisionLog`.
- **Concurrent change** → `applyProgression`'s in-tx SCHEDULED re-assert on week N+1 → CONFLICT "a session changed while you were reviewing — please try again."
- **Double-apply** → once the `DecisionLog(PROGRESS)` is `APPLIED`, `getWeeklyCheckIn.status = APPLIED`; the dialog shows the applied state; a second `applyProgression` → BAD_REQUEST.

## Testing

**Pure / unit-tested (no DB):**
- `mesocyclePlanFromDb` — hand-built persisted mesocycle → correct `MesocyclePlan` (all weeks, deload flags, per-week `muscleVolume` incl. 0s).
- `derivePerformance` — the §2 banding: beat/on-target/soft-miss/regressed per prescription; mean+floor per muscle; `undefined` when unlogged; null-target prescriptions skipped; primary-role muscle selection via `ExerciseMuscle`.
- `weekPlanFromAdjustment` — target `MuscleVolumeMap` assembled from `adjustments` (adjusted muscles overridden, others held) → `distributeVolume` → `WeekPlan` with expected per-session set counts.
- `toProgressionProposalView` — `WeekAdjustment` → view; `kind` = CHANGES/DELOAD_HOLD/BLOCK_END; `cause`/`swapCandidate` preserved; `checkInValue: high` → advisory set.
- `CheckInMuscleInput` schema — bounds (recovery/joint int 0–3), rejects out-of-range and unknown muscle shape.
- Integration of the pieces against a fixture: fixture week + logs + feedback → `stepWeek` → proposal matches expected (e.g. good recovery+beat targets below MRV → `+STEP_UP responding_well`; low recovery at/above MAV → `−STEP_DOWN_HARD under_recovered`; joint ≥ pain → swap flagged).

**DB-bound → typecheck/lint gate + user verification (subagents can't touch Neon):**
- `submitWeeklyCheckIn`, `applyProgression`, `rejectProgression`, `applyWeekPlanToDb` on week N+1. User verifies on Neon: resolve a week (log/miss all sessions) → the "Week wrapped" entry appears → submit recovery/joint → a proposal shows honest per-muscle Δs with reasons → Accept → week N+1's `WeekMuscleVolume`/prescriptions change to match and a `DecisionLog(PROGRESS, APPLIED)` is written → re-open shows APPLIED; Reject path writes `REJECTED` and leaves the plan unchanged; `pnpm db:seed` still works.

**Client → typecheck/lint + user visual check:** the entry card (appears only when resolved), the grid (recovery/joint selectors, trained muscles only), the proposal dialog (Δs, causes, accept/keep, deload/block-end variants, keyboard contract).

## Files (anticipated)

- Confirm `prisma/schema.prisma` CheckIn/CheckInMuscle + `DecisionType.PROGRESS` are applied to Neon (user gate); no schema edit expected.
- Create `src/schema/checkin.ts` (`CheckInMuscleInputSchema`, `WeeklyCheckInInputSchema`) + `.test.ts`; export from `src/schema/index.ts`.
- Create `src/server/mesocycle/mesocycle-plan-from-db.ts` (`mesocyclePlanFromDb`) + `.test.ts` (or extend `reschedule-adapters.ts`).
- Create `src/server/mesocycle/derive-performance.ts` (`derivePerformance`) + `.test.ts`.
- Create `src/server/mesocycle/week-plan-from-adjustment.ts` (`weekPlanFromAdjustment`) + `.test.ts`.
- Create `src/server/api/routers/checkin.ts` (`getWeeklyCheckIn`, `submitWeeklyCheckIn`, `applyProgression`, `rejectProgression`); register `checkin` on `appRouter`.
- Create `src/views/progression.ts` (`toProgressionProposalView`) + `.test.ts`.
- Modify `src/views/types.ts` (`WeeklyCheckInView`, `ProgressionProposalView`, `MuscleProposalView`).
- Create `src/components/checkin/weekly-checkin-entry.tsx`, `weekly-checkin-grid.tsx`, `progression-proposal-dialog.tsx` (all client); wire the entry into Now-home (`src/app/app/page.tsx`) and the Week page (`src/app/app/block/week/[n]/page.tsx`).

## Success criteria

An athlete on a real ACTIVE block finishes (logs or misses) every session in a week; a "Week N wrapped" entry appears on Now-home and the Week page. Opening it shows a short grid of just the muscles they trained, each with a recovery and a joint selector. Submitting records the check-in and immediately shows a proposal for next week — per-muscle set changes, each with a plain-language reason ("+2 chest: responding well", "−3 quads: under-recovered", "swap flagged: knee") — with **performance inferred from what they logged, never asked**. Accepting rebuilds next week's volume atomically and records a `DecisionLog(PROGRESS, APPLIED)`; keeping-as-is leaves the plan untouched and records `REJECTED`. The deload-ahead and last-week cases render as honest informational states, not broken proposals. `stepWeek` — previously orphaned — now drives a real, accept-gated loop; the `CheckInMuscle.recovery` signal is persisted for ④-B; Laws 1 & 2 hold; ③'s logging/reschedule and the ①/② paths are untouched; typecheck + lint + existing tests clean.
