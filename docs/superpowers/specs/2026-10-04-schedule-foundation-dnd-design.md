# Dynamic Scheduling ① + ② — Schedule Foundation and Drag-and-Drop (Design)

**Status:** Approved 2026-10-04. Amended the same day during planning (swaps, `placeWeek` algorithm, timezone, `firstOpenDay`, Day→AM/PM rule, keyboard path); see the plan's "Refinements" section.
**Scope:** Give the plan a notion of *when*. Sessions get a placement (day, optional AM/PM), the athlete gets an availability grid and a schedule mode, the engine gains a pure function that scores any week layout, and the week page becomes a board where sessions can be dragged, confirmed, and critiqued by the engine.
**Branch target:** merges into `freddy/experimental` (standing rule). Feature branch `freddy/feat/schedule-foundation`.
**Builds on:** ③ check-in + logging (`applyWeekPlanToDb`, `DecisionLog`, the `SCHEDULED` re-assert pattern) and the routing conventions (`requireCurrentBlock`, flat `/app/block/week/[n]`).
**Part of:** Dynamic Scheduling — **① schedule foundation + ② drag-and-drop with critique (this)** → ③ constraint-driven reschedule → ④ Coach conversation → ⑤ situational coach cues.

## Problem

The product vision is that an athlete arranges their week and the coach re-arranges it, with nobody doing recovery arithmetic by hand. Today the app knows *how much* per muscle per week and nothing about *when*:

- `TrainingSession.dayOfWeek` exists but `persistMesocyclePlan` always writes `null`; sessions only have an `order`.
- The engine's `SessionPlan` has no day or time, and nothing models rest between sessions.
- `ConstraintSet` holds `daysPerWeek` only. There is no availability and no preference.
- The week page is a card grid in `order`, with no drag library installed.
- "Reschedule" currently means `redistributeWeek`: moving a missed session's *sets* into other sessions. It moves volume, never time.

Drag-and-drop, "I can't make Thursday", AM/PM awareness and coach tweaks all need the same missing thing: a schedule the engine can score. This spec builds that, plus the first interaction on top of it.

## Intended outcome

An athlete opens a week and sees their sessions laid out on real dates. They can drag a session to another day (or half-day), see immediately whether the engine thinks that is a good idea and why, confirm it, optionally keep that layout for the rest of the block, and receive a specific suggested tweak when the engine can see a better arrangement. Every change the engine proposes is accepted or dismissed by the athlete; nothing moves silently.

## Decisions (locked during brainstorming)

- **Time unit: day plus optional AM/PM.** A session's position is a *placement* `{ day, daypart }`.
- **Schedule mode is an athlete setting.** `DAY` (one session per day, 7 cells) or `HALF_DAY` (AM/PM, 14 cells). Chosen in onboarding, changeable in Settings. Existing athletes default to `DAY`.
- **Availability is a standing weekly grid.** Each cell is Preferred, Available or Blocked. Blocked is a hard rule; Preferred is a scoring bonus. One-off exceptions belong to sub-project ③.
- **A move applies to the week being viewed**, with an optional "use this layout for remaining weeks" carry-forward at confirm time.
- **Warn, never block on recovery.** Only physical impossibilities are refused. Recovery concerns are shown as warnings with reasons, and the engine offers a better layout.
- **Scored layouts, deterministic.** One pure scoring function serves auto-placement, drop feedback and suggestions. No model call in this slice.
- **Athlete drags are recorded, not gated.** Like set logging, a manual move is the athlete stating what they want. Engine suggestions are applied only when the athlete presses Accept.
- **Weeks stay rolling 7-day windows from `Mesocycle.startDate`.** They are not snapped to Mon–Sun.

## Vocabulary

The engine already uses "slot" for a position in the split (`slotId`, `SessionSlot`, `splitSlot`). To avoid collision:

| Term | Meaning |
|---|---|
| **daypart** | `AM` or `PM`. |
| **cell** | One availability unit: a weekday plus a daypart. |
| **placement** | Where a session sits: `{ day: 0..6 (0 = Mon), daypart: "AM" \| "PM" \| null }`. |
| **layout** | The full set of placements for one week. |
| **scheduling** | This feature. "Reschedule" keeps its existing meaning (redistributing a missed session's sets). |

## Non-goals (deferred, named)

- **One-off availability exceptions** ("not this Thursday") and **"I can't make this session" flows** → sub-project ③. That is also where Jev ADVISORY ranking of candidate layouts joins.
- **Free-text Coach conversation** → sub-project ④ (Jev seam 3, chat tables, prompt-injection design).
- **Situational coach cues** ("AM run and legs today, get roughly X g of carbs in first") → sub-project ⑤. Cues will be triggered by the facts this slice introduces (for example `same_day_stack`), with any quantities computed by the engine from stored data (`weightKg`, `tdee`, session footprint), never invented by a model. Most valuable once a second discipline exists.
- **Clock times and calendar sync** → later.
- **Endurance sessions** → phase 2. The fatigue-footprint input is designed so they need no rework here.
- **Changing set counts or volume as part of a move.** A placement change never alters a prescription.
- **Moving a session to a different week.**

## Architecture

### 1. Data model (`prisma/schema.prisma`)

- `enum ScheduleMode { DAY HALF_DAY }`; `AthleteProfile.scheduleMode ScheduleMode @default(DAY)`.
- `AthleteProfile.timezone String @default("UTC")` (IANA name). Availability is keyed by weekday, so the server must know which weekday each of the athlete's dates falls on. Set from the browser at onboarding; a profile still on `"UTC"` adopts the browser's timezone the first time the board loads.
- `enum Daypart { AM PM }`; `TrainingSession.daypart Daypart?`, alongside the existing `dayOfWeek Int?` (0 = Mon … 6 = Sun).
  - `dayOfWeek = null` means *not yet placed* (all data before this feature).
  - `daypart = null` means the session was placed in `DAY` mode.
- `enum AvailabilityState { PREFERRED BLOCKED }` and

  ```prisma
  model AvailabilityCell {
    id               String            @id @default(cuid())
    athleteProfileId String
    athleteProfile   AthleteProfile    @relation(fields: [athleteProfileId], references: [id], onDelete: Cascade)
    dayOfWeek        Int // 0=Mon … 6=Sun
    daypart          Daypart
    state            AvailabilityState

    @@unique([athleteProfileId, dayOfWeek, daypart])
    @@map("availability_cell")
  }
  ```

  Sparse: no row means Available. Always stored at AM/PM resolution. In `DAY` mode the UI edits both halves of a day together, and a day reads as Blocked when both halves are Blocked, Preferred when either half is Preferred. Switching modes therefore loses no data.
- `DecisionType` gains `SCHEDULE`.
- No DB uniqueness on placements. Collisions are checked inside the transaction that writes them.

### 2. Engine (`src/engine/schedule.ts`, pure, synchronous, no I/O)

```ts
scoreLayout(input: ScheduleInput, layout: Layout): LayoutScore
placeWeek(input: ScheduleInput): { kind: "placed"; layout: Layout } | { kind: "infeasible"; facts: DecisionFact[] }
suggestMoves(input: ScheduleInput, layout: Layout): MoveSuggestion[]
checkLayout(input: ScheduleInput, layout: Layout): HardViolation[]
```

**`ScheduleInput`**

- `mode`: `DAY` | `HALF_DAY`.
- `weekStartDay`: weekday (0..6) of the week's first day, so positions within a rolling week can be derived from weekday placements.
- `sessions`: each `{ id, footprint, locked, placement? }`, where `footprint` is stimulus sets per muscle, derived from the session's prescriptions using the library's existing fractional credit. The footprint is the discipline-agnostic part: an endurance session later is just a different footprint.
- `availability`: the 14-cell grid.
- `carryIn`: footprints and distance-from-week-start of the previous week's final sessions, so rest is measured across the week boundary.
- `firstOpenDay`: index (0..7) of the first day in the week that is not in the past, by the athlete's local calendar. Today is open. 0 for future weeks, 7 for a finished week.

**Hard rules** (`checkLayout`; always a refusal, never a cost):

| Violation | Rule |
|---|---|
| `blocked_cell` | A session moved into a Blocked cell. |
| `occupied` | Two sessions in the same placement. |
| `day_limit` | In `DAY` mode, more than one session on a day. |
| `in_past` | A session moved to a day before `firstOpenDay`. |
| `locked` | A `COMPLETED` or `MISSED` session moved at all. |
| `mode_mismatch` | A daypart set in `DAY` mode, or missing in `HALF_DAY` mode (unlocked sessions only). |

Hard rules judge *moves*, not standing state: a session that already sits on a cell the athlete later blocks is reported as a cost-side `on_blocked_cell` fact, not a violation. Two locked sessions are never reported against each other, so history left in an older shape after a mode switch cannot make every later move in that week fail.

**Swaps.** A final layout may never hold two sessions in one placement, but a *move onto an occupied placement swaps the two sessions*. Without this, an athlete training seven days in `DAY` mode has no empty cell and could never rearrange their week.

**Cost** (`scoreLayout`) is a sum of terms. Each term that fires emits a `DecisionFact`:

| Fact | Fires when |
|---|---|
| `short_rest` | Two sessions sharing a muscle sit closer than the overlap warrants. Scaled by overlapping stimulus sets. Measured in half-days; in `DAY` mode a day counts as two. |
| `load_streak` | More consecutive training days than the threshold. |
| `same_day_stack` | Two sessions on one day (`HALF_DAY` only); heavier when they share muscles. |
| `off_preference` | A session is not in a Preferred cell while a Preferred cell was open. |
| `uneven_spread` | Sessions are bunched at one end of the week. |
| `on_blocked_cell` | A session stands on a cell that is now Blocked. Weighted to dominate, so a suggestion always moves it. |

New `DecisionFact` variants carry session ids, the muscle where relevant, and the measured gap or count, so the UI and later the Coach can phrase them without the engine writing prose. Weights and thresholds live in `src/engine/constants.ts`.

**`placeWeek`** keeps locked sessions where they are and places every unlocked session: greedy construction in session order (each takes the open cell that costs least, earliest on ties), then local search over single moves and swaps until none lowers the cost. Identical inputs always produce the identical layout, and it is cheap enough to run in the browser. It is a local optimum of exactly the neighbourhood `suggestMoves` searches, so a freshly placed week never yields a suggestion. When hard rules leave fewer usable cells than sessions it returns `{ kind: "infeasible", facts }` rather than a partial layout.

**`suggestMoves`** evaluates every legal single change from the given layout (a session to an empty open cell, or two unlocked sessions swapping), keeps those that reduce cost by more than `SUGGESTION_MIN_GAIN`, and returns up to three, best first. Each suggestion is `{ sessionId, from, to, swapWithSessionId, gain, resolves: DecisionFact[] }`. It returns nothing when no change clears the threshold, so the coach stays quiet when there is nothing worth saying.

**Law 1.** Nothing in this module reads or writes a set count, rep target, RIR or muscle volume, beyond reading prescriptions to build footprints.

### 3. Adapters (`src/server/mesocycle`)

- `scheduleInputFromDb(week, prevWeek, profile, startDate, now)`: builds `ScheduleInput` from a persisted week. Session `id` = `TrainingSession.id`; `locked` = status is not `SCHEDULED`.
- `applyLayoutToDb(tx, weekId, layout)`: writes `dayOfWeek` and `daypart` for each session in the layout. Does not touch prescriptions.
- `persistMesocyclePlan` calls `placeWeek` per week and writes placements at creation (replacing the hard-coded `dayOfWeek: null`). If a week is infeasible it is left unplaced and the fact is recorded; creation does not fail.
- **Backfill:** a one-off script under `prisma/` places every unplaced `SCHEDULED` session in existing `ACTIVE` blocks and writes one `SCHEDULE` decision per block. Completed and missed sessions in already-finished weeks are placed on the weekday of `completedAt` where available, otherwise left unplaced.

`applyWeekPlanToDb` already updates sessions in place rather than recreating them, so placements survive set redistribution, progression and deload rewrites. This is a property the plan must keep under test.

### 4. API (`src/server/api/routers/schedule.ts`, user-scoped via the existing protected procedure)

| Procedure | Kind | Behaviour |
|---|---|---|
| `getWeekSchedule({ weekIndex })` | query | Returns the layout, mode, availability, locked ids, the layout's facts, and the `ScheduleInput` so the client can score drafts locally. |
| `getSuggestions({ weekIndex })` | query | `suggestMoves` on the saved layout. No writes. Returns nothing if that layout's suggestion was dismissed. |
| `applyLayout({ weekIndex, placements, expected, carryForward, origin })` | mutation | The only placement write. |
| `dismissSuggestion({ weekIndex })` | mutation | Writes `DecisionLog(SCHEDULE, REJECTED)` carrying a hash of the current layout. |
| `getPrefs()` / `updatePrefs({ scheduleMode, availability })` | query / mutation | Schedule mode and the availability grid. |

**`applyLayout`** in one `$transaction`:

1. Load the week and assert the caller owns it.
2. Compare `expected` (the placements the client started from) with the DB. Any difference → `CONFLICT`.
3. Re-assert every moved session is still `SCHEDULED`.
4. Run `checkLayout`. Any violation → `BAD_REQUEST` with the violations.
5. `applyLayoutToDb`.
6. Write `DecisionLog(SCHEDULE, APPLIED)` with `payload = { origin: "athlete" | "suggestion", before, after, facts }`.
7. If `carryForward`, for each later week whose sessions are all `SCHEDULED`: map the layout onto that week's sessions by `order`, run `checkLayout`, and apply if clean. Return `{ applied: number[], skipped: { weekIndex, reason }[] }`.

**`updatePrefs`** never moves a session. Switching `HALF_DAY → DAY` is refused with `BAD_REQUEST` naming the days while any day in a not-yet-finished week holds two `SCHEDULED` sessions; on success it nulls `daypart` on `SCHEDULED` sessions. Switching `DAY → HALF_DAY` assigns each `SCHEDULED` session PM when only PM is Preferred, or when AM is Blocked and PM is not; otherwise AM. A `setTimezone` procedure stores the athlete's IANA timezone.

**Onboarding.** `OnboardingInputSchema` gains optional `scheduleMode` (default `DAY`), `availability` (default empty) and `timezone` (default `"UTC"`, sent from the browser). `onboarding.createPlan` persists them in its existing transaction before `persistMesocyclePlan`, so the first block is placed against them.

### 5. Views (`src/views`, `src/server/views`)

- `SessionView` gains `placement?: { day: number; daypart: "AM" | "PM" | null }`; `dayTag` continues to be derived from it.
- `WeekView.sessions` is ordered by position within the rolling week, then `order`. Unplaced sessions sort last.
- `WeekView` gains `days: { date: string; weekday: number }[]` (seven entries from the week's start date) for column headers.
- `nextSession` returns the first `SCHEDULED` session in placement order instead of `sessions[0]`.
- New `ScheduleView` types for the board, facts and suggestions, mapped by pure functions with tests, following `src/views/reschedule.ts`.

### 6. UI

- **Schedule board** (`src/components/schedule/schedule-board.tsx`), placed at the top of `/app/block/week/[n]`. Seven date-labelled columns starting on the week's first day. One row in `DAY` mode, two (AM, PM) in `HALF_DAY`. Each session is a chip: label, estimated minutes, status. The existing `SessionPanel` grid stays below, now in placement order.
- **Dragging** uses `@dnd-kit/core` (new dependency) with pointer and touch sensors. While a chip is held, cells that would violate a hard rule are dimmed and not droppable; cells that would add a warning are marked; dropping on an occupied cell swaps the two sessions. Each chip also has a "Move to…" menu offering the same legal targets, which is the keyboard and screen-reader path (dnd-kit's keyboard sensor moves by free pixels and suits a grid poorly). Locked chips are not draggable.
- **Drafts.** Drops change local state only. A draft bar shows the number of changes, each warning with its reason, a "Use this layout for remaining weeks" checkbox, Discard, and Confirm. Scoring during a draft runs `scoreLayout` and `checkLayout` in the browser from the `ScheduleInput` the query shipped.
- **Coach suggestion card.** Shown after a confirm, or on load, when `getSuggestions` returns something: the top move, its reason, Accept and Dismiss. Accept calls `applyLayout` with `origin: "suggestion"`. This is the one elevated surface on the page, per `DESIGN.md`'s concentrated-glass rule.
- **Settings** (`/app/settings`): schedule mode toggle and the availability grid (tap to cycle Available → Preferred → Blocked).
- **Onboarding wizard:** one optional step with the same two controls.
- Visual treatment follows `DESIGN.md` and `PRODUCT.md`; copy uses the product voice defined there.

## Data flow

```
view week
  getWeekSchedule ──▶ layout + availability + ScheduleInput + facts
  getSuggestions  ──▶ MoveSuggestion[] (may be empty)

drag (client only)
  draft layout ──▶ checkLayout + scoreLayout (in browser) ──▶ tint cells, list warnings

confirm
  applyLayout(placements, expected, carryForward, origin: "athlete")
    tx: expected check → SCHEDULED re-assert → checkLayout → write → DecisionLog
    carry-forward → { applied, skipped }
  invalidate getCurrentBlock, getWeekSchedule, getSuggestions

accept suggestion
  applyLayout(…, origin: "suggestion")

dismiss suggestion
  dismissSuggestion → DecisionLog(SCHEDULE, REJECTED, layoutHash)
```

## Error and empty handling

| Situation | Behaviour |
|---|---|
| Week has unplaced sessions (pre-backfill, or infeasible at creation) | Board shows them in an "Unplaced" tray; they can be dragged onto the grid. A "Place for me" action runs `placeWeek` and loads the result as a draft. |
| `placeWeek` infeasible | No layout is written. The board explains that availability leaves too few open cells and links to Settings. |
| `applyLayout` `CONFLICT` | Draft is kept, the board refetches, and the athlete is told the week changed elsewhere. |
| Hard-rule violation reaches the server | `BAD_REQUEST` with the violations; nothing is written. |
| Session completed or missed mid-draft | The `SCHEDULED` re-assert fails the transaction; handled as `CONFLICT`. |
| Carry-forward cannot apply to a week | That week is skipped and named in the result; other weeks still apply. |
| Availability change strands a session on a Blocked cell | Session stays put; `on_blocked_cell` warning; the fix is offered as a suggestion. |
| Mode switch refused | Message names the days holding two sessions. |
| Past weeks | Board is read-only. |

## Testing

- **Engine unit:** each cost term in isolation; each hard rule; rest counted in half-days for both modes; rest across the week boundary via `carryIn`; rolling-week position from `weekStartDay`.
- **Engine property (fast-check, `src/engine/_fixtures/arbitraries.ts`):**
  - `placeWeek` output never violates a hard rule.
  - `placeWeek` is deterministic.
  - `placeWeek` output cannot be improved by any legal single move, so a freshly placed week yields no suggestion.
  - Every `suggestMoves` result is legal and strictly cheaper than its starting layout.
  - `DAY` mode never produces two sessions on one day.
  - No function in the module changes a set count or a muscle volume (Law 1).
- **Adapters:** `scheduleInputFromDb` footprints and locked flags; `applyLayoutToDb` leaves prescriptions untouched; `applyWeekPlanToDb` leaves placements untouched.
- **Router:** `applyLayout` conflict, completed-session lock, past-day refusal, blocked-cell refusal, double submit, carry-forward applied/skipped reporting; `dismissSuggestion` suppresses only the dismissed layout; `updatePrefs` mode-switch refusal and daypart assignment; preference change leaves placements untouched; all procedures are user-scoped.
- **Views:** placement mapping, ordering, unplaced-last, `nextSession` by placement.
- **Schema:** `prisma-parity` covers the new enums; onboarding schema defaults.
- **Browser verification before merge:** drag, keyboard move, confirm, carry-forward, suggestion accept and dismiss, mode switch, in both modes.

## Files (anticipated)

- New: `src/engine/schedule.ts` (+ tests, property tests), `src/server/mesocycle/schedule-adapters.ts`, `src/server/api/routers/schedule.ts`, `src/schema/schedule.ts`, `src/views/schedule.ts`, `src/components/schedule/{schedule-board,session-chip,draft-bar,suggestion-card,availability-grid}.tsx`, a Prisma migration, the backfill script.
- Changed: `prisma/schema.prisma`, `src/engine/{facts,constants,index}.ts`, `src/server/mesocycle/persist.ts`, `src/server/api/{root.ts,routers/onboarding.ts}`, `src/schema/{enums,onboarding}.ts`, `src/server/views/to-mesocycle-view.ts`, `src/views/{types,next-session}.ts`, `src/app/app/block/week/[n]/page.tsx`, `src/app/app/settings/page.tsx`, `src/components/onboarding/onboarding-wizard.tsx`, `PRODUCT.md` (AM/PM no longer listed as deferred), `package.json`.

## Success criteria

1. A newly onboarded athlete's first block has every session placed, respecting their mode and availability.
2. On the week page, a session can be moved by drag and by keyboard, with refused cells and warnings visible before the drop.
3. Confirming a layout persists it, records a `SCHEDULE` decision, and optionally carries it to remaining weeks with skipped weeks reported.
4. A layout with a clear recovery problem produces a suggestion naming one move and its reason; accepting it applies that move; dismissing it keeps it dismissed for that layout.
5. A freshly auto-placed week shows no suggestion.
6. No set count, rep target, RIR or muscle volume changes as a result of any scheduling action.
7. Switching schedule mode and editing availability work from Settings and never move a session without the athlete's action.
8. All existing tests pass; the new unit, property, router and view tests pass.
