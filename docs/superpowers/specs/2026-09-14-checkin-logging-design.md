# Integration Layer ③ — Check-in + Logging Write Path (Design)

**Status:** Approved 2026-09-14
**Scope:** Third sub-project of the integration layer. The **session write path**: capture what the athlete actually performed, and adapt the plan when a session is missed.
**Branch target:** merges into `freddy/experimental` (standing rule).
**Builds on:** ② onboarding → plan (real ACTIVE blocks now exist in-app) — merged at `b1b776c`. Reuses the engine's already-built `redistributeWeek`.
**Part of:** the integration layer — ① round-trip → ② onboarding → **③ check-in + logging (this)** → ④ progression + real readiness.

## Problem

After ②, an athlete has a real, engine-generated ACTIVE block, but the block is **read-only** — there is no way to record what actually happened. ③ adds the write path: log a completed session's per-set actuals (weight × reps × achieved RIR), or mark a session missed and get an accept-gated, engine-computed reschedule. This is the slice that first captures **real performed data** — the input ④ turns into progression and real readiness.

## Decisions (locked during brainstorming)

- **Log granularity: per set.** Each performed set records weight × reps × achieved-RIR, with a "fill down from set 1" shortcut. Per-set load is what ④'s progressive-overload / e1RM math needs.
- **Logging flow: one save per session.** Fill the per-set actuals, hit "Finish session" → a single mutation writes all rows and flips the session to COMPLETED. Nothing persists until Finish.
- **Objective-only.** No subjective recovery/performance/joint sliders in ③ — those (`CheckInMuscle`) are deferred to ④, where `stepWeek`/`evaluateDeload` consume them.
- **Accept-gate boundary:** logging **records truth → no gate**. A reschedule **mutates the plan → accept-gated**, with a `DecisionLog` audit row. (Consistent with "the coach proposes, the athlete controls.")
- **Not ③ (→ ④):** the engine consuming logged load for progression proposals, and computing Fitness/Fatigue/Form from logged load. ③ only *captures* actuals; ④ *reads* them.

## Non-goals (deferred, named)

- **Progression / readiness from logged load** → ④. ③ persists actuals; nothing in ③ reads them back into the engine.
- **Subjective per-muscle/session check-in** (recovery/performance/joint) → ④.
- **Editing a completed log's history / audit trail of edits** → later. Re-logging a session overwrites its SetLogs idempotently.
- **Cross-week make-up** → out. `redistributeWeek` redistributes a missed session's volume into the *remaining sessions of the same week* only (engine contract). A missed final session of a week yields only LET_GO.
- **Live per-set persistence / in-gym optimistic UI** → later. One-save-per-session for now.
- **Undo of an applied reschedule** → later (the `DecisionLog` payload records the diff for a future undo).

## Architecture

### 1. Schema (Prisma migration — user-applied)

Subagents cannot touch Neon, so the migration is authored in `prisma/schema.prisma` by the implementer and **applied by the user** (`pnpm db:push` or a `prisma migrate`), same gate as ②'s DB steps.

- **`enum SessionStatus { SCHEDULED, COMPLETED, MISSED }`** (add to the enum block).
- **`TrainingSession`** gains `status SessionStatus @default(SCHEDULED)` and `completedAt DateTime?`. (Existing rows default to SCHEDULED — correct: nothing has been logged yet.)
- **New model `SetLog`** — one performed set:
  ```prisma
  model SetLog {
    id                     String               @id @default(cuid())
    exercisePrescriptionId String
    exercisePrescription   ExercisePrescription @relation(fields: [exercisePrescriptionId], references: [id], onDelete: Cascade)
    setNumber              Int    // 1-based, within the prescription
    weightKg               Float
    reps                   Int
    achievedRir            Int?   // nullable — RIR is encouraged but not required to log
    createdAt              DateTime @default(now())

    @@unique([exercisePrescriptionId, setNumber])
    @@map("set_log")
  }
  ```
  Add the back-relation `setLogs SetLog[]` to `ExercisePrescription`.
- Reschedule reuses **`DecisionLog`** (`type: REDISTRIBUTE`, `status: APPLIED`, `weekIndex`, `payload` = chosen candidate's facts + diff).

**Law-1 note:** `SetLog` stores athlete-entered performed numbers — the athlete owns these, the engine will consume them in ④. Prescriptions (targets) are unchanged.

### 2. Pure engine adapters (new, unit-testable — `src/engine` or `src/server/mesocycle`)

`redistributeWeek(week: WeekPlan, missedSessionIds: string[], ctx: AdaptationContext)` already exists. ③ must feed it real inputs reconstructed from the DB:

- **`weekPlanFromDb(week: WeekWithRelations): WeekPlan`** — inverse of the persist/view mappers. Maps a persisted week → the engine's `WeekPlan`: `index`, `isDeload`, `sessions[]` (`slotId = TrainingSession.id`, `label = splitSlot`, `estimatedMinutes = targetDurationMin ?? 0`, `prescriptions[]` from `ExercisePrescription` with `exerciseName = exercise.name`, `sets`, `repRangeLow/High`, `targetRir` — using the same nullable handling as the view mapper), and `muscleVolume` from `WeekMuscleVolume` (a full `MuscleVolumeMap`, 0 for muscles with no row). Pure; lives next to the existing mappers.
- **`adaptationContextFrom(cs: ConstraintSetWithTargets, athlete: AthleteContext): AdaptationContext`** — runs `resolveConstraints` on the stored constraint set to get `ResolvedSpec.targets` (the `ResolvedMuscleTarget[]` `redistributeWeek` needs) and `isBeginner`, then assembles `{ targets, splitType, daysPerWeek, sessionLengthCapMin, blockLengthWeeks, deloadWeekIndex, isBeginner, library: EXERCISE_LIBRARY }`. If the stored set re-resolves infeasible (shouldn't happen — it generated a block), throw. Pure apart from reading the module-constant library.

Because `weekPlanFromDb` sets `slotId = TrainingSession.id`, the router passes the DB session id straight to `redistributeWeek`, and candidate sessions map back to real rows by id.

### 3. Write paths (tRPC — new `session` router, `protectedProcedure`, user-scoped)

All procedures first load the session (or week) with a filter that scopes it to `athleteProfile.userId === ctx.session.user.id` and the ACTIVE mesocycle; a miss → `TRPCError NOT_FOUND`.

**a. `logSession`** — record truth, no gate.
```
logSession: input({ sessionId, sets: LogSetInput[] }).mutation → SessionView
LogSetInput = { prescriptionId, setNumber (int ≥1), weightKg (>0), reps (int ≥0), achievedRir? (int 0–10) }
```
- Validate every `prescriptionId` belongs to `sessionId` (else BAD_REQUEST).
- Reject if the session is MISSED (BAD_REQUEST — a missed session isn't logged; reschedule instead).
- One `$transaction`: `deleteMany` SetLogs for the session's prescriptions (idempotent re-log), `createMany` the new SetLogs, update the session `status = COMPLETED, completedAt = now`.
- Skipped exercises (no sets submitted) are allowed — a session can be COMPLETED with some prescriptions unlogged.
- Returns the updated `SessionView` (with `status` + `loggedSets`).

**b. `getRescheduleOptions`** — compute proposals, mutate nothing.
```
getRescheduleOptions: input({ sessionId }).query → RescheduleOptionView[]
```
- Load the session's week (+ constraint set, prescriptions/exercise, muscle volumes) scoped to the user.
- `weekPlanFromDb(week)` + `adaptationContextFrom(cs, athlete)` → `redistributeWeek(weekPlan, [sessionId], ctx)`.
- Map each `RedistributionCandidate` → `RescheduleOptionView { kind, recommended, recoveredSets, droppedSets, summary, perSession: {slotId,label,addedSets}[] }`.
- **LET_GO is always offered** (marking missed + dropping the volume is always a valid athlete choice): if the engine's candidate list omits it, the router appends a synthetic LET_GO option (`recoveredSets: 0`, `droppedSets` = the missed session's set count, `perSession: []`). MAKE_UP / PARTIAL appear only when `redistributeWeek` returns them (e.g. not for a missed final session, where remaining sessions don't exist).

**c. `applyReschedule`** — the accept-gate commit (plan mutation).
```
applyReschedule: input({ sessionId, kind: "MAKE_UP"|"PARTIAL"|"LET_GO" }).mutation → { weekIndex }
```
- Recompute candidates deterministically (same call as `getRescheduleOptions`), select the one matching `kind` (BAD_REQUEST if that kind isn't offered).
- One `$transaction`:
  - Set the missed session `status = MISSED`.
  - **MAKE_UP / PARTIAL:** apply the candidate `WeekPlan` to the week's **remaining** (non-missed, still-SCHEDULED) sessions — replace their `ExercisePrescription` rows to match the candidate's sessions (matched by `slotId = TrainingSession.id`), and recompute `WeekMuscleVolume` from the candidate's `muscleVolume` (rows only for volume > 0, mirroring `persistMesocyclePlan`).
  - **LET_GO:** no rewrite — the missed volume is simply dropped.
  - Write one `DecisionLog` (`type: REDISTRIBUTE`, `status: APPLIED`, `weekIndex`, `summary`, `payload` = candidate facts + diff).
- Reuses a small shared helper `applyWeekPlanToDb(tx, week, weekPlan)` for the per-session prescription rewrite + volume recompute (sibling of `persistMesocyclePlan`).

### 4. Read path / view extension

`src/views/types.ts` was frozen for ①/②; ③ extends it:
- `SessionView += status: SessionStatus` (the `"SCHEDULED" | "COMPLETED" | "MISSED"` union — the UI derives its badge from this).
- `PrescriptionView += loggedSets?: LoggedSetView[]` where `LoggedSetView = { setNumber, weightKg, reps, achievedRir: number | null }`.

Extend `MESOCYCLE_INCLUDE` to include each prescription's `setLogs` (ordered) and each session's `status`; extend `toMesocycleView`/`toSessionView`/`toPrescriptionView` to surface them. Pure-mapper unit tests cover the additions. No engine numbers invented — `loggedSets` are the stored athlete values; nullable `achievedRir` renders as "—" (do NOT coalesce to 0).

### 5. UI (session detail page)

The read-only `SessionCard` on `/app/block/[blockId]/week/[n]` gains interaction:
- **`LogSessionForm`** (client): for a SCHEDULED session, per-prescription per-set rows (weight / reps / RIR inputs) with a "fill down from set 1" control; "Finish session" → `logSession`; on success shows the COMPLETED state (logged actuals per set) + a COMPLETED badge. Uses the app-shell-kit tokens (dark, accent scarce — CTA only), matching the ② wizard's refinement bar.
- **`RescheduleDialog`** (client): a "Mark missed" action calls `getRescheduleOptions` and presents the accept-gate — MAKE_UP / PARTIAL / LET_GO cards with their recovered/dropped tradeoffs, recommended one highlighted; accept → `applyReschedule` → refresh. Nothing mutates until the athlete picks.
- Session/week surfaces show status (✓ COMPLETED, ✗ MISSED) via a small badge; the block grid stays as-is (volume already reflects an applied reschedule).

## Data flow

```
Session detail (SCHEDULED)
  ├─ log per-set actuals → session.logSession  [WRITE, no gate]
  │    tx: replace SetLogs, status=COMPLETED, completedAt=now → SessionView
  └─ mark missed → session.getRescheduleOptions [READ-ONLY]
       weekPlanFromDb + adaptationContextFrom → redistributeWeek → candidates
       athlete accepts a kind → session.applyReschedule  [WRITE, accept-gated]
         tx: status=MISSED; (MAKE_UP/PARTIAL) rewrite remaining sessions + WeekMuscleVolume; DecisionLog
getCurrentBlock (② read path, extended) → sessions carry status + loggedSets
```

## Error / empty handling

- Session not in the user's ACTIVE block → NOT_FOUND.
- `logSession` on a MISSED session, or a prescriptionId not in the session → BAD_REQUEST; no partial write (single tx).
- `applyReschedule` with a `kind` the engine didn't offer (e.g. MAKE_UP when only LET_GO is feasible) → BAD_REQUEST.
- `getRescheduleOptions` with nothing to redistribute (e.g. last session of the week) → returns only the (synthetic) LET_GO option; the dialog shows it as the sole choice.
- Re-logging a completed session overwrites its SetLogs idempotently (delete-then-create in one tx).

## Testing

**Pure / unit-tested (no DB):**
- `weekPlanFromDb` — a hand-built persisted week → correct `WeekPlan` (slotId=session id, exerciseName, full `muscleVolume` incl. 0s, isDeload).
- `adaptationContextFrom` — stored constraint set → `AdaptationContext` with resolved targets + `isBeginner`; infeasible re-resolve throws.
- `LogSetInput`/`logSession` input schema — bounds (weight > 0, reps ≥ 0, RIR 0–10, setNumber ≥ 1), rejects a prescriptionId/session mismatch shape.
- Reschedule candidate → `RescheduleOptionView` mapper — kind/recovered/dropped/perSession, recommended flag.
- `toMesocycleView` extensions — session `status` surfaced; `loggedSets` mapped with `achievedRir` null preserved (not 0); a session with no logs → `loggedSets` empty/undefined.

**DB-bound → typecheck/lint gate + user verification (subagents can't touch Neon):**
- The migration, `logSession`, `applyReschedule`, `applyWeekPlanToDb`. User verifies on Neon: log a session's per-set actuals → it shows COMPLETED with the entered numbers; re-logging overwrites; mark a mid-week session missed → accept MAKE_UP → remaining sessions' volume increases and a DecisionLog row is written; LET_GO drops the volume; `pnpm db:seed` still works.

**Client → typecheck/lint + user visual check:** the log form (fill-down, finish), the reschedule dialog (tradeoffs, accept), status badges.

## Files (anticipated)

- Modify `prisma/schema.prisma` (SessionStatus enum, TrainingSession.status/completedAt, SetLog model, ExercisePrescription.setLogs).
- Create `src/schema/logging.ts` (`LogSetInputSchema`, `LogSessionInputSchema`) + `.test.ts`; export from `src/schema/index.ts`.
- Create `src/server/mesocycle/week-plan-from-db.ts` (`weekPlanFromDb`) + `.test.ts`.
- Create `src/server/mesocycle/adaptation-context.ts` (`adaptationContextFrom`) + `.test.ts`.
- Create `src/server/mesocycle/apply-week-plan.ts` (`applyWeekPlanToDb`).
- Create `src/server/api/routers/session.ts` (`logSession`, `getRescheduleOptions`, `applyReschedule`); register `session` on `appRouter`.
- Create `src/views/reschedule.ts` (`RescheduleOptionView` + candidate→view mapper) + `.test.ts`.
- Modify `src/views/types.ts` (SessionView.status, PrescriptionView.loggedSets, LoggedSetView).
- Modify `src/server/views/to-mesocycle-view.ts` (+ SetLogs/status in include + mappers) + extend its test.
- Create `src/components/block/log-session-form.tsx` (client) and `src/components/block/reschedule-dialog.tsx` (client); wire into `session-card.tsx` / the week page.

## Success criteria

An athlete on a real ACTIVE block opens a scheduled session, enters per-set actuals (with fill-down), and finishes it → the session shows COMPLETED with the exact numbers entered, persisted as `SetLog` rows; re-logging overwrites cleanly. Marking a mid-week session missed surfaces engine-computed MAKE_UP / PARTIAL / LET_GO options with honest recovered/dropped tradeoffs; accepting one rewrites the remaining week (or drops the volume for LET_GO) atomically, records a `DecisionLog`, and the block's volumes reflect it — nothing mutating until acceptance. Logged actuals ride the ② read path into the view models, ready for ④ to consume. Laws 1 & 2 hold; the ① read path and ② write path are untouched; typecheck + lint clean.
