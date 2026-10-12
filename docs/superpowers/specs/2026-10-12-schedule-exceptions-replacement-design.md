# Dynamic Scheduling ③ — Blocked Time and Week Re-placement (Design)

**Status:** Approved 2026-10-12. Amended the same day during planning; see "Amendments" directly below and the plan's "Refinements" section. Where the body of this document disagrees with the amendments, the amendments win.
**Scope:** Let an athlete say "I can't train then" for a specific date, and have the engine propose new layouts for the affected week. Adds one-off availability exceptions, a pure function that produces up to three distinct layouts, an advisory Jev ranking of them, and a proposal panel on the week board.
**Branch target:** merges into `freddy/experimental` (standing rule). Feature branch `freddy/feat/schedule-exceptions`.
**Builds on:** Dynamic Scheduling ① + ② (`docs/superpowers/specs/2026-10-04-schedule-foundation-dnd-design.md`): placements, the standing availability grid, `checkLayout` / `scoreLayout` / `placeWeek`, `applyLayout` with the block lock, and the week board. Also the missed-session flow (`session.getRescheduleOptions` / `applyReschedule`) and the judgement layer (`executeJudgement`, ADVISORY choice verdicts).
**Part of:** Dynamic Scheduling — ① schedule foundation + ② drag-and-drop (merged) → **③ blocked time and week re-placement (this)** → ④ Coach conversation → ⑤ situational coach cues.

## Amendments (2026-10-12, during planning)

1. **Skip comes first.** A skipped session still holds its cell until it is marked missed, and redistribution changes the remaining sessions' footprints. Choosing a skip option therefore opens the existing missed-session dialog; once it is accepted, the panel recomputes ordinary options for what is left. `applyLayout` gains no `skip` input and returns no `skipped` sessions for this purpose.
2. **No `Week.needsPlacementReview` column.** Options are offered whenever a movable session is standing on a blocked cell, which a future week that could not be re-placed quietly already is.
3. **Crowding is measured in days**, not cells: a week is crowded when movable sessions outnumber free days. In AM/PM mode that is exactly when doubling up becomes necessary.
4. **One new fact**, `session_does_not_fit { sessionId, sessions, freeDays }`. `one_off_block` and `lens` facts are not added; the lens and outcome travel as data on the option, and a one-off cell is flagged `oneOff` on the availability input.
5. **Option ids** are a lens name, `DOUBLE_UP`, `SKIP_1` or `SKIP_2`. Crowded-week options are returned in that fixed order (keep everything first).
6. **"Show on board"** button replaces hover preview.
7. **The lead is labelled "Coach's pick"** whenever a usable Jev verdict chose it, including when it agrees with the engine.
8. **`nominateOverflow(input, candidates)` returns a ranking** (`string[]`, most skippable first).
9. **The property "fewest changes never moves more sessions than balanced" is dropped**: both are local searches, so it is not guaranteed. A fixture test covers the intent.
10. **Ordinary move suggestions are suppressed** while a session is standing on blocked time, so the panel is the only voice.
11. **A double-up is offered only when every session fits by doubling** (added during the build, after review). It then skips nothing and names a session the athlete can still move. When even doubling cannot fit the week, only skip options are offered; "stack as many as fit and skip the rest" is withdrawn.

## Problem

The schedule knows the athlete's normal week and nothing about a week that is different. Today, an athlete who cannot train this Thursday has two bad choices: edit their standing grid in Settings (which changes every week and must be undone afterwards), or drag sessions around by hand and do the recovery reasoning themselves. Neither tells the engine the fact that matters: that time is unavailable on that date.

## Intended outcome

An athlete marks a day or half-day as unavailable, on this week or any later week of the block. For the current week the engine answers with up to three ways to re-arrange what is left, each with its reasons. The athlete accepts one or arranges the week themselves. If the week no longer has room for every session, the athlete is told which session does not fit and chooses what happens to it. Nothing moves, and nothing is skipped, without the athlete's tap.

## Decisions (locked during brainstorming)

- **"I can't make it" means time is unavailable.** The athlete blocks a day or half-day on a specific date. "Can't make this" on a session is a shortcut that blocks that session's day or half-day. No exception is ever attached to a session.
- **Exceptions are separate from the standing grid.** They never edit preferences and stop mattering once their date has passed.
- **Horizon: any week left in the current block.** Not past dates, not beyond the block's last day.
- **Overflow is the athlete's choice.** When open cells are fewer than sessions to place, the engine names the session that does not fit and offers options. Skipping hands off to the existing missed-session flow.
- **Doubling up exists only in AM/PM mode.** In one-a-day mode two sessions on one day is a hard rule (`day_limit`), and this sub-project does not relax it. One-a-day athletes get skip options only.
- **Up to three options, Jev picks the lead.** The engine generates and orders the options. Jev may reorder them at ADVISORY authority. Any Jev failure falls back to the engine's order.
- **Acceptance goes through `applyLayout`.** One write path for every placement change, with its lock, conflict check and decision log.

## Vocabulary

Additions to the vocabulary in the ① + ② spec:

| Term | Meaning |
|---|---|
| **exception** | A one-off blocked cell on a specific local calendar date. |
| **re-placement** | The engine proposing new layouts for a week. Distinct from "reschedule", which keeps its meaning (redistributing a missed session's sets). |
| **lens** | The named weighting an option was produced under: `BALANCED`, `FEWEST_CHANGES` or `KEEPS_PREFERENCES`. |
| **option** | One proposed layout with its lens, moves, facts and any overflow outcome. |
| **overflow** | A week with more sessions to place than open cells. |

## Non-goals (deferred, named)

- **Typing or saying a sentence** ("can't make Thursday", "sort out my week") → sub-project ④. The proposal panel is a standalone component so ④ can open it.
- **One-off "preferred" time.** An exception only blocks.
- **Exceptions that outlive the block** or apply to the next block.
- **Moving a session to another week.** Unchanged from ① + ②.
- **Relaxing `day_limit`** for one-a-day athletes.
- **Changing set counts as part of a re-placement.** Skipping a session changes sets only through the existing redistribution flow, after its own accept.
- **Clock times and calendar sync.**

## Architecture

### 1. Data model (`prisma/schema.prisma`)

```prisma
model AvailabilityException {
  id               String         @id @default(cuid())
  athleteProfileId String
  athleteProfile   AthleteProfile @relation(fields: [athleteProfileId], references: [id], onDelete: Cascade)
  date             DateTime       @db.Date // the athlete's local calendar date
  daypart          Daypart
  createdAt        DateTime       @default(now())

  @@unique([athleteProfileId, date, daypart])
  @@map("availability_exception")
}
```

- Stored at AM/PM resolution, like `AvailabilityCell`. A whole-day exception is two rows. In one-a-day mode the API always writes and clears both.
- `date` is a calendar date with no time or zone. It is produced from the athlete's local day via `src/domain/local-day.ts` and never from a UTC instant.
- No state column: a row means blocked.
- `Week` gains `needsPlacementReview Boolean @default(false)`, set when a future week overflowed during quiet re-placement (see §4).
- Applied with `prisma db push`. Both additions are additive.

### 2. Engine (`src/engine/schedule.ts`, pure)

**Availability overlay.** The engine does not learn about dates. The adapter merges exceptions into `ScheduleInput.availability` for the week being built, setting those cells to `BLOCKED`. `checkLayout`, `scoreLayout`, `openCells` and the board's drop rules honour exceptions with no change.

`AvailabilityCellInput` gains an optional `oneOff?: boolean`, set by the overlay, so views can style the cell and facts can say "this week".

**`proposeLayouts(input: ScheduleInput): LayoutOption[]`**

```ts
export type Lens = "BALANCED" | "FEWEST_CHANGES" | "KEEPS_PREFERENCES";

export type OverflowOutcome =
  | { kind: "skip"; sessionId: string }
  | { kind: "double_up"; sessionId: string; day: number };

export interface LayoutOption {
  id: string;              // stable: lens plus layoutKey
  lens: Lens;
  layout: Layout;          // excludes a skipped session
  moves: { sessionId: string; from: Placement | null; to: Placement }[];
  score: LayoutScore;
  overflow: OverflowOutcome | null;
  skipped: string[];       // every session this option leaves out; empty when none
}
```

- Each lens runs the existing greedy-plus-local-search with different weights:
  - `BALANCED`: current constants.
  - `FEWEST_CHANGES`: adds a per-moved-session cost (`W_DISPLACEMENT`) that dominates soft facts, so only sessions that must move do.
  - `KEEPS_PREFERENCES`: multiplies `W_OFF_PREFERENCE` by `PREFERENCE_LENS_FACTOR`.
- Sessions that are fixed (completed, missed, locked) keep their placement. Sessions whose current cell is still legal are free to move; the lens decides whether they do.
- Options with the same `layoutKey` collapse, keeping the first in lens order `BALANCED`, `FEWEST_CHANGES`, `KEEPS_PREFERENCES`. An option identical to the saved layout is dropped. Result length is 0 to `MAX_LAYOUT_OPTIONS` (3).
- Returned in engine order: ascending `BALANCED` cost of each layout, ties by lens order. This order is what the athlete sees when Jev does not reorder.
- Deterministic: same input, same options, same order.

**Overflow.** When sessions to place exceed open cells:

- `nominateOverflow(input): string` picks the session that does not fit. **This function is the athlete-coach judgement in this sub-project and is left for the product owner to write** (learning-mode contribution). The plan will supply the signature, the surrounding code and tests for its contract (returns the id of a non-fixed session; deterministic), with a placeholder that picks the last session by `order`.
- Options become overflow variants rather than lenses:
  - `skip`: the nominated session is removed and the rest placed under `BALANCED`.
  - `double_up` (AM/PM mode only): every session is kept. This is the ordinary `BALANCED` placement when both dayparts of some day are open; it is labelled `double_up` when it yields a `same_day_stack` fact.
  - A second `skip` variant for the runner-up nomination, when one exists, so the athlete has a real choice in one-a-day mode.
- If more than one session overflows, each option handles all of them the same way (skip all nominated, or stack as many as fit and skip the rest). `overflow` then describes the first, and `skipped` lists every session left out.
- If no session can be placed at all (every remaining cell blocked), the single option is "skip all remaining".

**New constants** (`src/engine/constants.ts`, "Schedule scoring" block; starting values, the product owner's to tune): `W_DISPLACEMENT = 50`, `PREFERENCE_LENS_FACTOR = 5`, `MAX_LAYOUT_OPTIONS = 3`.

**Facts** (`src/engine/facts.ts`): `{ kind: "one_off_block"; day: number; daypart: Daypart | null }`, `{ kind: "session_does_not_fit"; sessionId: string; needed: number; open: number }`, and `{ kind: "lens"; lens: Lens; moved: number }`. Every sentence in the panel is phrased from these and the existing schedule facts (Law 2).

### 3. Judgement (`src/engine/schedule-judgement.ts`, pure; executed by `src/server/judgement`)

- `JudgementSubject` gains `"replacement"`.
- `replacementQuestions(options, input): JudgementRequest` builds one `choice` question at `ADVISORY` authority: which option to show first.
- Option keys are the option ids. Descriptions and `state` carry derived labels only: lens, number of sessions moved, a count per fact kind, whether a session is skipped or stacked, and the muscle labels of a skipped session. No raw scores, weights or set counts.
- `applyReplacementVerdict(options, verdicts): LayoutOption[]` moves the chosen option to the front when `isUsableChoice` passes against the offered ids. Otherwise it returns the options untouched. It can never add, drop or alter an option.
- Skipped entirely when there is one option.

### 4. API (`src/server/api/routers/schedule.ts`, protected procedures)

- **`setException({ date, daypart | null })`** and **`clearException({ date, daypart | null })`**
  - `date` is an ISO calendar date. Refused with `BAD_REQUEST` if it is before the athlete's local today or outside the active block.
  - `daypart: null` means the whole day and writes or deletes both rows. In one-a-day mode a non-null daypart is refused.
  - Runs inside a transaction under `lockActiveBlock`.
  - Idempotent: setting an existing exception or clearing a missing one succeeds.
  - **Current week:** writes the exception and nothing else. The board then shows the proposal panel.
  - **Future week:** writes the exception, then re-places that week with `FEWEST_CHANGES`, applies it with `applyLayoutToDb`, and writes a `SCHEDULE` decision log with the facts. If the week overflows, no session is moved and `Week.needsPlacementReview` is set; the choice is made when the athlete reaches or opens that week.
  - Clearing an exception never moves a session. On the current week the board may show ordinary suggestions afterwards.
- **`getReplacementOptions({ weekIndex })`** — query, mutates nothing. Returns `[]` unless the week has a session sitting on a blocked cell, or `needsPlacementReview` is set. Builds the input, calls `proposeLayouts`, runs the judgement best-effort (any throw degrades to engine order, as `getRescheduleOptions` does), and returns option views.
- **Accepting an option** calls the existing `applyLayout` with the option's layout, the `expected` snapshot the options were computed from, and a new optional `skip: string[]`.
  - With `skip` empty, behaviour is unchanged.
  - With `skip` set, the layout is applied to the other sessions and the response carries `skipped: string[]`. The skipped sessions stay `SCHEDULED` on their blocked cell; the client routes the athlete into the existing missed-session flow for each, in order. Marking them `MISSED` and redistributing remains that flow's job and its accept.
  - `applyLayout` clears `needsPlacementReview` for the week.
- **`getWeekSchedule`** returns each cell's `oneOff` flag and the week's `needsPlacementReview`.
- `scheduleInputFromDb` takes the week's exceptions and applies the overlay. `updatePrefs` and the mode switch keep their current rules; switching to one-a-day widens any single-daypart exception to the whole day.

### 5. Views (`src/views/schedule.ts`)

`ReplacementOptionView`: id, a title from the lens or overflow outcome, the list of moves as "Legs: Thu → Sat AM", the facts as sentences, and `skipped` session labels. Titles and sentences are produced by pure phrasing functions over facts, with tests.

### 6. UI (`src/components/schedule/`)

- **Day header control.** Each day header on the board gets a "Can't train" toggle; in AM/PM mode each half-day has its own, plus a whole-day shortcut. Past days have none.
- **Session chip.** "Can't make this" in the chip's menu blocks its day (one-a-day) or half-day (AM/PM).
- **One-off blocked cells** use the existing ✕ mark with a "this week" label and an undo control.
- **`replacement-panel.tsx`.** Shown above the board when `getReplacementOptions` returns options. One card per option, the lead first and marked "Coach's pick" only when Jev reordered, otherwise "Suggested". Each card: title, moves, reasons, and Accept. A "I'll arrange it myself" control dismisses the panel for that week until availability changes again.
- Hovering or focusing a card previews its layout on the board as a draft, using the existing draft machinery, without saving.
- An unsaved drag draft blocks the toggles until confirmed or discarded, so two sources of change never mix.
- After an option with `skipped` sessions is accepted, the athlete lands on the existing reschedule screen for the first skipped session.
- Future weeks: toggling shows a toast with what moved ("Week 5: Legs moved Thu → Fri") and a link to that week.
- Keyboard and screen-reader paths: toggles are buttons with pressed state; option cards are a list of buttons; the "Move to…" select continues to respect blocked cells.

## Data flow

1. Athlete toggles "Can't train" on Thursday of the current week.
2. `setException` locks the block, writes the rows, returns.
3. The board refetches `getWeekSchedule` (Thursday is now a one-off blocked cell, and its session shows as sitting on blocked time) and `getReplacementOptions`.
4. The server builds the `ScheduleInput` with the overlay, calls `proposeLayouts`, asks Jev which leads, returns views.
5. The athlete previews, then accepts an option. The client calls `applyLayout` with the layout and the snapshot.
6. `applyLayout` locks, checks the snapshot (CONFLICT if the week changed), validates with `checkLayout`, writes, logs `SCHEDULE` with the lens and facts.
7. If the option skipped a session, the client opens the missed-session flow for it.

## Error and empty handling

- **Past date, date outside the block, daypart in one-a-day mode:** `BAD_REQUEST` with a plain message. The toggles do not offer these, so this is defence.
- **No active block:** toggles are absent; procedures return `NOT_FOUND`.
- **Blocking a cell with a completed or missed session:** allowed. Fixed sessions do not move and raise nothing.
- **Blocking an empty cell:** allowed, no panel. It simply closes the cell for later drags and suggestions.
- **Every remaining cell blocked:** one option, "skip all remaining".
- **Stale options** (week changed between fetch and accept): `applyLayout` returns CONFLICT; the panel refetches and says the week changed.
- **Jev unavailable, slow, low confidence or naming an unknown option:** engine order, no visible error.
- **Exception cleared while the panel is open:** options refetch and normally vanish.
- **Dismissed panel:** the session stays on its blocked cell with the existing `on_blocked_cell` warning. Dismissal is stored client-side per week and resets when exceptions change.
- **Week rollover:** a future week with `needsPlacementReview` shows the panel when it becomes current or is opened.

## Testing

- **Engine unit tests:** each lens on a fixture week; duplicate collapse; identical-to-saved dropped; fixed sessions never move; overflow in both modes; multi-session overflow; all-blocked week.
- **Engine property tests** (fast-check): no option violates a hard rule; no option places a session on a blocked cell; option ids are unique; output is deterministic; `FEWEST_CHANGES` never moves more sessions than `BALANCED`; every non-fixed session is either placed or listed in `skipped`.
- **`nominateOverflow` contract tests**, independent of the rule chosen.
- **Judgement:** question state contains no raw numbers; unknown option, low confidence and failure all return the input order.
- **Router:** set and clear under lock, idempotence, past-date and out-of-block refusal, whole-day writes two rows, future-week quiet re-placement and its log, overflowing future week sets the flag and moves nothing, `applyLayout` with `skip`, a date-boundary case in `Australia/Perth`.
- **Phrasing:** each fact and each option title renders the expected sentence.
- **Browser check before sign-off:** block a day in each mode, accept each lens, overflow with skip and with double-up, future-week block, undo, keyboard path.

## Files (anticipated)

- Modify: `prisma/schema.prisma`, `src/schema/schedule.ts`, `src/engine/schedule.ts`, `src/engine/constants.ts`, `src/engine/facts.ts`, `src/engine/judgement.ts`, `src/engine/_fixtures/schedule.ts`, `src/server/mesocycle/schedule-adapters.ts`, `src/server/api/routers/schedule.ts`, `src/views/schedule.ts`, `src/views/types.ts`, `src/components/schedule/schedule-board.tsx`, `src/components/schedule/session-chip.tsx`, `PRODUCT.md`.
- Create: `src/engine/schedule-judgement.ts`, `src/components/schedule/replacement-panel.tsx`, `src/components/schedule/block-toggle.tsx`, and tests beside each.

## Success criteria

- An athlete can block a day or half-day on the current or a future week of the block in one or two taps, and undo it in one.
- For the current week, options appear without further input, each with reasons traceable to engine facts.
- No option ever breaks a hard rule, uses blocked time, or changes a prescription.
- A week that cannot hold every session names the session that does not fit and waits for the athlete.
- With Jev switched off the feature behaves identically apart from the order of options.
- The standing grid is never modified by an exception.
