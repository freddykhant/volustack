# Integration Layer ④-C-1 — Readiness-Driven Deload Proposal (Design)

**Status:** Approved 2026-09-24
**Scope:** First cross-link of ④-C. Wire the already-built-but-orphaned `evaluateDeload` engine function into an **accept-gated "take a deload now?" proposal**, triggered at the weekly check-in when consecutive-week fatigue + low recovery is detected. Makes readiness *act* on the plan, not just report.
**Branch target:** merges into `freddy/experimental` (standing rule). Feature branch `freddy/feat/readiness-deload`.
**Builds on:** ④-A weekly check-in → progression (merged `bab8ab5`) and ④-B real readiness (merged `815570e`). Reuses ④-A's check-in flow, accept-gate, atomic `DecisionLog` claim, and proposal dialog; reuses ③'s `applyWeekPlanToDb`.
**Part of:** ④ — ④-A progression loop (done) → ④-B real readiness (done) → **④-C cross-links: ④-C-1 deload proposal (this)** → ④-C-2 recovery→Form blend (deferred).

## Problem

`evaluateDeload` (`src/engine/deload.ts`) is built and unit-tested but has **zero callers** — the same orphaned-brain situation `stepWeek` was in before ④-A. It already consumes the per-muscle `recovery` that ④-A persists (`CheckInMuscle`): when **2 consecutive completed weeks** each have **≥2 muscles at/over `effectiveMrv` with `recovery ≤ 1`**, it returns `recommend_early`. Nothing surfaces that. ④-C-1 wires it to an accept-gated deload proposal at the weekly check-in, completing the "coach proposes, athlete controls" loop for deloads and making the readiness signal drive a real plan action.

## Decisions (locked during brainstorming)

- **Integrate into the check-in flow; deload supersedes progression.** At `submitWeeklyCheckIn`, after persisting the check-in, run `evaluateDeload`. If it returns `recommend_early`, the submit returns a **DELOAD** proposal and writes `DecisionLog(DELOAD, PROPOSED)` — *instead of* the progression proposal. You deload OR you progress, never both in the same week. Otherwise the existing ④-A progression path runs unchanged.
- **Accept rebuilds week N+1 as a deload.** Volumes scaled to `DELOAD_FRACTION` (0.5), `DELOAD_RIR` (4), and `Week.isDeload = true`. New pure engine helper `deloadWeekPlan`. Persisted via `applyWeekPlanToDb` + a `Week.isDeload` flip, atomic-gated exactly like ④-A's `applyProgression`.
- **Reject applies no progression.** `DecisionLog(DELOAD, REJECTED)`; the planned week N+1 is left as-is (no step-up/step-down) — the conservative default for a fatigued athlete who chooses to push on.
- **The originally-scheduled deload week stays put.** An early deload is additive; reshaping the rest of the block is out of scope.
- **Reuse ④-A's surface.** The `ProgressionProposalDialog` gains a DELOAD variant; new `applyDeload`/`rejectDeload` router procedures parallel `applyProgression`/`rejectProgression` with the identical atomic accept-gate.
- **Engine constants (already defined, unchanged):** `CONSECUTIVE_FATIGUE_WEEKS = 2`, `FATIGUE_MUSCLE_THRESHOLD = 2`, `RECOVERY_LOW = 1`, `DELOAD_FRACTION = 0.5`, `DELOAD_RIR = 4`.

## Non-goals (deferred, named)

- **Recovery → Form blend** → ④-C-2. This slice reads recovery only through `evaluateDeload`; it does not change ④-B's Form math.
- **Reshaping the block after an early deload** (shifting/removing the scheduled deload, extending the block) → later. Early deload only rewrites week N+1.
- **Deload from readiness *band* alone** (e.g. Overreaching on the ④-B chart) → later. The trigger is `evaluateDeload`'s consecutive-fatigue rule (per-muscle recovery + MRV), not the ④-B `formPct` band. (They may converge in a future slice.)
- **Auto-applying a deload** → never; always accept-gated (interaction principle).
- **Editing the proposed deload** (partial deload, choose muscles) → v2.

## Architecture

### 1. Deload week builder (pure engine — `src/engine`)

`deloadWeekPlan(spec: ResolvedSpec, library: ExerciseDef[], upcoming: WeekPlan): WeekPlan` — sibling of ④-A's `weekPlanFromAdjustment` (`src/engine/apply-adjustment.ts`):
- Override each target's `weeklySetTarget` to its deload volume: `round1(spec.targets[m].weeklySetTarget × DELOAD_FRACTION)` — a half-volume deload off the peak target. (The generator additionally ramp-scales its scheduled deload; this reactive early-deload uses the simpler half-of-peak, which is the deload's intent; if the implementer finds a shared generator helper worth reusing, prefer it, but do not block on matching the ramp exactly.)
- `buildSessionSlots(spec.splitType, spec.daysPerWeek)` → `distributeVolume(overriddenSpec, library, slots)` → remap distributed sessions onto `upcoming`'s real `slotId`s (by canonical order, same length-guard as `weekPlanFromAdjustment`).
- Prescribe with `prescribe(a, library, /* isDeload */ true)` so RIR = `DELOAD_RIR`.
- Return `{ index: upcoming.index, isDeload: true, sessions, muscleVolume: template.achievedVolume }`.

Pure, unit-tested. Export from `src/engine/index.ts`.

### 2. WeekOutcome adapter (pure — `src/server/mesocycle`)

`weekOutcomesFromBlock(block): WeekOutcome[]` — sibling of ④-B's `readinessInputsFromBlock`. For each week, build a `WeekOutcome { weekIndex, muscleVolume, feedback }`:
- `muscleVolume`: from the week's `WeekMuscleVolume` rows → full `MuscleVolumeMap` (0 for muscles with no row), same as `weekPlanFromDb`.
- `feedback`: the week's `CheckIn(scope: WEEK)` → `CheckInFeedback { weekIndex, muscles: [{muscle, recovery, performance, joint}] }` from its `CheckInMuscle` rows, or `null` if the week has no check-in.
- Include only weeks up to and including the just-checked-in week (completed history). `evaluateDeload` itself sorts/takes the last `CONSECUTIVE_FATIGUE_WEEKS`.

Pure given loaded rows; the Prisma include lives in the router.

### 3. Router — extend the `checkin` router (`src/server/api/routers/checkin.ts`)

`submitWeeklyCheckIn` (existing) gains a deload branch, evaluated **after** the `CheckIn` is persisted and **before** the progression proposal:
- Build `plan = mesocyclePlanFromDb(...)` (already used for stepWeek), `ctx = adaptationContextFrom(...)`, `history = weekOutcomesFromBlock(block)`.
- `const deload = evaluateDeload(plan, history, ctx)`.
- **If `deload.decision === "recommend_early"`** and week N+1 exists and is not already a deload: write `DecisionLog(DELOAD, PROPOSED)` (payload = the `deload_recommended` fact's muscles + facts), and return a **DELOAD** proposal view (see §4). Do **not** run stepWeek / write a PROGRESS decision.
- **Else:** the existing ④-A progression path runs unchanged.

Return type of `submitWeeklyCheckIn` becomes a discriminated union: `ProgressionProposalView | DeloadProposalView` (distinguished by `kind`).

New procedures (parallel to ④-A, same atomic accept-gate — the `PROPOSED→APPLIED` `updateMany` claim inside the tx, `count === 1` or CONFLICT, before mutating):
- `applyDeload: input({ weekIndex }).mutation → { appliesToWeekIndex }` — recompute deterministically (re-run `evaluateDeload` from the persisted check-in history; BAD_REQUEST if it no longer recommends), claim the `DecisionLog(DELOAD, PROPOSED)` atomically → `deloadWeekPlan(spec, library, upcomingPlan)` → `applyWeekPlanToDb(tx, upcoming.id, plan)` + `tx.week.update({ where: { id: upcoming.id }, data: { isDeload: true } })`; SCHEDULED re-assert guard on N+1's sessions as in ④-A.
- `rejectDeload: input({ weekIndex }).mutation → { ok: true }` — claim `DecisionLog(DELOAD, PROPOSED) → REJECTED`; no plan mutation.

`getWeeklyCheckIn`'s `status` derivation extends to recognize a terminal `DELOAD` decision (APPLIED/REJECTED) the same way it recognizes `PROGRESS`.

### 4. View (`src/views/types.ts` + mapper)

- `DeloadProposalView { kind: "DELOAD"; fromWeekIndex; appliesToWeekIndex; fatiguedMuscles: MuscleGroup[]; adjustments: MuscleProposalView[] }` where `adjustments` shows each trained muscle's `plannedSets → deloadedSets` (from `deloadWeekPlan`'s `muscleVolume` vs the current N+1 volume). Reuses `MuscleProposalView` (④-A).
- `toDeloadProposalView(upcoming: WeekPlan, deloaded: WeekPlan, fatiguedMuscles): DeloadProposalView` — pure mapper (no invented numbers; deltas from the two plans).
- `submitWeeklyCheckIn` return type: `ProgressionProposalView | DeloadProposalView`.

### 5. UI (`src/components/checkin`)

- `ProgressionProposalDialog` (or the flow) handles the new `kind: "DELOAD"`: title "Time to back off?", body "You've been deep in fatigue two weeks running — a deload next week protects your progress." + the fatigued muscles and the per-muscle `plannedSets → deloadedSets` rows, with **Accept deload** / **Keep pushing** actions. Reuses the modal keyboard contract.
- The flow's mutation wiring: on a DELOAD proposal, Accept → `applyDeload`, Keep pushing → `rejectDeload` (mirrors the CHANGES accept/reject wiring). Error surfacing as in ④-A.
- The check-in entry/grid are unchanged.

## Data flow

```
submitWeeklyCheckIn  [WRITE truth, no gate]
  persist CheckIn/CheckInMuscle (④-A)
  history = weekOutcomesFromBlock(block); plan = mesocyclePlanFromDb; ctx = adaptationContextFrom
  deload = evaluateDeload(plan, history, ctx)
  ├─ recommend_early (+ N+1 exists, not deload):
  │     DecisionLog(DELOAD, PROPOSED); return DeloadProposalView
  └─ else: ④-A stepWeek path → ProgressionProposalView
Accept deload → applyDeload  [WRITE, accept-gated]
    tx (atomic claim): deloadWeekPlan → applyWeekPlanToDb(week N+1) + week.isDeload=true; DecisionLog DELOAD APPLIED
Keep pushing → rejectDeload  [audit only] DecisionLog DELOAD REJECTED
```

## Error / empty handling

- Week not in the user's ACTIVE block → NOT_FOUND (reuses ④-A's `loadCheckInContext`).
- `applyDeload` when no `DecisionLog(DELOAD, PROPOSED)` exists (already applied / rejected / never proposed) → BAD_REQUEST via the atomic `count !== 1` claim → CONFLICT/BAD_REQUEST.
- `recommend_early` but week N+1 is the scheduled deload or doesn't exist → treat as no-deload (fall through to progression / normal); never propose a deload onto a deload or off the end of the block.
- Fewer than 2 checked-in weeks, or fatigue not sustained → `evaluateDeload` returns `none` → normal progression.
- Determinism (Law 2): `applyDeload` recomputes `evaluateDeload` from persisted history, never trusts client state.

## Testing

**Pure / unit-tested (no DB):**
- `deloadWeekPlan` — volumes ≈ `DELOAD_FRACTION × peak target`, RIR = `DELOAD_RIR`, `isDeload: true`, sessions remapped onto `upcoming`'s slotIds, count-mismatch guard throws.
- `weekOutcomesFromBlock` — per-week `muscleVolume` (incl. 0s) + `feedback` from `CheckInMuscle` (null when no check-in); completed-history only.
- `toDeloadProposalView` — deltas `planned → deloaded` per muscle; `fatiguedMuscles` passthrough; `kind: "DELOAD"`.
- Integration: a 2-consecutive-fatigue-week fixture (≥2 muscles at MRV, recovery ≤1) through `evaluateDeload` → `recommend_early`; a non-fatigued fixture → `none`.

**DB-bound → typecheck/lint gate + user/browser verification (subagents can't touch Neon):**
- The `submitWeeklyCheckIn` deload branch, `applyDeload`, `rejectDeload`. Verify in-browser: drive two consecutive fatigued check-ins → the check-in returns a **deload** proposal (not progression); Accept → week N+1 becomes a deload (0.5× volume, RIR 4, shown as deload) + `DecisionLog(DELOAD, APPLIED)`; Keep pushing → plan unchanged + `REJECTED`.

**Client → typecheck/lint + visual:** the DELOAD dialog variant.

## Files (anticipated)

- Create `src/engine/deload-week.ts` (`deloadWeekPlan`) + `.test.ts`; export from `src/engine/index.ts`.
- Create `src/server/mesocycle/week-outcomes.ts` (`weekOutcomesFromBlock`) + `.test.ts`.
- Create `src/views/deload.ts` (`toDeloadProposalView`) + `.test.ts`.
- Modify `src/views/types.ts` (`DeloadProposalView`; `submitWeeklyCheckIn` union).
- Modify `src/server/api/routers/checkin.ts` (deload branch in `submitWeeklyCheckIn`; `applyDeload`, `rejectDeload`; `getWeeklyCheckIn` status).
- Modify `src/components/checkin/progression-proposal-dialog.tsx` + `weekly-checkin-flow.tsx` (DELOAD variant + wiring).

## Success criteria

An athlete who logs and checks in two consecutive fatigued weeks (muscles at their ceiling, recovery bottomed out) is offered a **deload for next week** at check-in — instead of a progression — with the fatigued muscles named and the reduced per-muscle volumes shown. Accepting rewrites next week to a real deload (half volume, RIR 4, marked as a deload) atomically and records `DecisionLog(DELOAD, APPLIED)`; "Keep pushing" leaves the plan untouched and records `REJECTED`. A non-fatigued or lightly-logged athlete never sees it. The orphaned `evaluateDeload` now drives a real accept-gated action; Laws 1 & 2 hold; ①–④-B are untouched; typecheck + lint + existing tests clean.
