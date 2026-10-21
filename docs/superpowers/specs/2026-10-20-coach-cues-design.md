# Dynamic Scheduling ⑤ — Situational Coach Cues (Design)

**Status:** Section 1 (outside activities) approved in brainstorming 2026-10-20. Sections 2–3 (cue rules, numbers, UI) were written after the athlete said "u can start work"; they apply the four brainstorming answers below and are open to the athlete's review.
**Scope:** Short, engine-derived coach cues for today and tomorrow, triggered by how the athlete's day is laid out: lifting sessions plus simple outside activities (a run, a ride, a game) that the athlete can now mark on the week board.
**Branch target:** merges into `freddy/experimental` after the athlete's visual lgtm. Feature branch `freddy/feat/coach-cues`.
**Builds on:** ① schedule foundation (placements, `Footprint`, AM/PM), ③ blocked time (date-keyed `AvailabilityException`, the athlete's local date), ④ coach box (engine-phrased lines in `src/views/`).
**Part of:** Dynamic Scheduling ① → ② → ③ → ④ → **⑤ situational coach cues (this)**.

## Amendments (2026-10-20, during planning; these win over the body)

1. Router tests follow the repo's existing pattern: a mocked `db` (as in `schedule.test.ts`), not a live database.
2. `rankCues`'s placeholder breaks ties by cue id, not "first session": ids are stable and that keeps it deterministic.
3. The board's "+ activity" form opens inline under the day, not as a floating popover, so it stays outside dnd-kit's droppable cells.
4. `heavy_lower` carries `mealHoursBefore` (from `CUE_PRE_MEAL_HOURS = [2, 3]`), so the "2–3 hours" in its line is an engine number too (Law 1).
5. The home card renders nothing until it has read the device's dismissals, so a dismissed cue never flashes back.

## Problem

The plan knows *when* the athlete lifts, but not what else their day holds, and it never says anything timely about the day ahead. The athlete's own example: an AM run and leg day on the same day should get "make sure you get your carbs in", ideally with a number.

## Intended outcome

On the home page, a small coach card says one or two specific, useful things about today and tomorrow, with numbers when the engine has the athlete's bodyweight. The week board marks days that have a cue. Every cue comes from an engine rule over real facts; nothing is invented.

## Decisions (locked during brainstorming)

1. **Triggers:** lifting facts plus simple outside activities the athlete marks on the board.
2. **Numbers:** ranges computed from `weightKg`, shifted by `phase`; without a bodyweight, the cue uses plain words.
3. **Surface:** a dismissible cue card for today and tomorrow on the home page; a marker on board days that have a cue.
4. **Activities are cues only:** placement, scoring, critique, re-placement and the coach box ignore them.
5. **Approach A:** a pure engine rule module returns typed cue facts; `src/views/cues.ts` phrases them from fixed templates. No model call.

## Non-goals (deferred, named)

- Activities affecting placement or scoring (decision 4). Revisit when endurance is modelled.
- The coach box understanding "I'm running Tuesday morning". `add_activity` is not a coach intent in ⑤.
- Cues beyond tomorrow, push notifications, a cue history.
- Meal plans, daily macro totals, supplement advice, hydration volumes.
- Wearable or Strava import. `OutsideActivity` is shaped so an import could write rows later, but ⑤ adds no `source` field (YAGNI).
- A per-athlete cue opt-out setting.

## Architecture

### 1. Data: `OutsideActivity` (`prisma/schema.prisma`) — approved

```prisma
enum ActivityKind { RUN RIDE SWIM SPORT OTHER }
enum ActivityIntensity { EASY MODERATE HARD }

model OutsideActivity {
  id               String            @id @default(cuid())
  athleteProfileId String
  athleteProfile   AthleteProfile    @relation(fields: [athleteProfileId], references: [id], onDelete: Cascade)
  date             DateTime          @db.Date // the athlete's local date, as AvailabilityException
  daypart          Daypart?          // AM / PM / not said, in both schedule modes
  kind             ActivityKind
  intensity        ActivityIntensity
  durationMin      Int?              // 5–600 when set
  createdAt        DateTime          @default(now())

  @@index([athleteProfileId, date])
  @@map("outside_activity")
}
```

- Keyed by date, not by `Week`, so re-planning a block never touches it.
- `daypart` exists in one-a-day mode too: that mode limits lifting to one slot a day, but a cue needs to know whether the run comes first.
- At most `MAX_ACTIVITIES_PER_DAY = 3` per date. A fourth is refused with a plain message.
- Applied with `prisma db push` (no migrations; never `--accept-data-loss`).

### 2. Cue rules (`src/engine/cues.ts`, pure)

**Input** (one call per day; the server builds it):

```ts
interface CueDayInput {
  date: string;                 // "YYYY-MM-DD", the athlete's local date
  lifts: CueLift[];             // the day's SCHEDULED lifting sessions
  activities: CueActivity[];    // the day's outside activities
  previous: { lifts: CueLift[]; activities: CueActivity[] }; // the day before
  weightKg: number | null;
  phase: "CUT" | "MAINTAIN" | "BULK";
}
interface CueLift { id: string; label: string; daypart: "AM" | "PM" | null; footprint: Footprint; }
interface CueActivity { id: string; kind: ActivityKind; intensity: ActivityIntensity; daypart: "AM" | "PM" | null; durationMin: number | null; }
```

Only `SCHEDULED` lifting sessions count as `lifts` on the cue's own day: a cue about a session that is done or missed is not timely. The previous day's lifts include `COMPLETED` ones, since that is real load.

**Derived facts:**
- `lowerSets(lift)` = the footprint's `QUADS + HAMSTRINGS + GLUTES` sets. `CALVES` don't count.
- A lift is **heavy lower** when `lowerSets ≥ CUE_HEAVY_LOWER_SETS`.
- An activity is **demanding** when its intensity is `MODERATE` or `HARD`, or it is `EASY` with `durationMin ≥ CUE_LONG_EASY_MIN`.
- An activity is **leg-loading** when its kind is `RUN`, `RIDE` or `SPORT` and it is demanding. Swims and `OTHER` are not.

**Cue facts** (the output, `CueFact[]`):

| Kind | Fires when | Carries |
|---|---|---|
| `fuel_between` | The day has a lift and a demanding activity, or (AM/PM mode) two lifts. | `first` / `second` (labels or activity kinds), `order: "known" \| "unknown"` (unknown when either side has no daypart), `carbsG: [low, high] \| null` |
| `recovery_overlap` | A heavy-lower lift today follows a leg-loading activity yesterday, **or** a leg-loading activity today follows a heavy-lower lift yesterday. | `yesterday`, `today` (labels or kinds), `proteinG: [low, high] \| null` |
| `heavy_lower` | A lift today is heavy lower. | `liftLabel`, `lowerSets`, `carbsG: [low, high] \| null` |

When `fuel_between` names a lift, no `heavy_lower` fires for that same lift. Both would be carb advice about the same meal.

**Numbers** (all in `src/engine/constants.ts`, "Coach cues" section, starting values to tune):

| Constant | Starting value | Basis |
|---|---|---|
| `CUE_CARBS_BETWEEN_G_PER_KG` | `[1.0, 1.2]` | ACSM / ISSN rapid-refuelling guidance (~1.0–1.2 g/kg in the hours between sessions) |
| `CUE_CARBS_BEFORE_G_PER_KG` | `[1.0, 1.5]` | the low end of ACSM's 1–4 g/kg pre-exercise range, as one meal 2–3 h before |
| `CUE_PROTEIN_G_PER_KG` | `[0.3, 0.4]` | ISSN position stand, protein per meal |
| `CUE_PHASE_CARB_FACTOR` | `{ CUT: 0.8, MAINTAIN: 1, BULK: 1.2 }` | product judgement: a cut eats less, a bulk more |
| `CUE_HEAVY_LOWER_SETS` | `10` | product judgement |
| `CUE_LONG_EASY_MIN` | `60` | product judgement |

- Carbohydrate range = `g/kg × weightKg × phase factor`. Protein doesn't scale with phase.
- Bounds are rounded to the nearest 5 g, and the high bound is always at least 5 g above the low.
- `weightKg` null, or outside 30–250, → the number is `null`, and the sentence uses plain words.

**Ranking:** `rankCues(facts) → CueFact[]` returns at most `CUE_MAX_PER_DAY = 2`. The placeholder orders by `fuel_between > recovery_overlap > heavy_lower`, then by first session. **Reserved for the product owner** (learning mode, like `nominateOverflow`): the body ships as a working placeholder marked `TODO(product owner)`.

**Identity:** each cue has a stable `id` = `date:kind:sorted ids of what it names`. Dismissal keys on it, so a changed day (a new activity, a moved session) produces a new cue.

### 3. Phrasing (`src/views/cues.ts`, pure)

`toCueView(fact, date, today) → CueView { id, date, when: "today" | "tomorrow", kind, title, line }`.

- **Title** names the situation: "Run, then Legs", "Two sessions today", "Big lower-body day".
- **Line** gives one instruction, with the number when there is one.
  - "Aim for roughly 80–95 g of carbs between them." (the known order)
  - "Fit a carb-rich meal between them." (no number)
  - "Hard run yesterday: give the warm-up extra time and get 25–30 g of protein after."
- Each kind has two template variants. One is picked by a stable hash of the cue's `id`, so a cue reads the same on every load and differs between days.
- Copy follows `PRODUCT.md`'s voice.
  - Labels and kinds come from facts; numbers come from the fact, never from the template.
  - Plain words: no "glycogen" and no "macros".
  - No medical phrasing.
- The card's footer line is fixed: "Based on your bodyweight and phase. A guide, not a meal plan." It shows only when a shown cue carries a number.

### 4. API

**`activity` router** (`src/server/api/routers/activity.ts`):

| Procedure | Kind | Does |
|---|---|---|
| `list({ weekIndex })` | query | The athlete's activities on that week's dates |
| `add({ weekIndex, date, daypart, kind, intensity, durationMin })` | mutation | Refuses dates outside the viewed week, a finished week, or a 4th activity on the date |
| `remove({ id })` | mutation | Own rows only; refused on a finished week |

- Inputs are Zod schemas in `src/schema/activity.ts`.
- Writes don't take `lockActiveBlock`, because nothing in the lifting plan depends on them. The per-date cap is checked inside a transaction (count, then insert). A race can at worst make a 4th row; that is accepted and noted.

**`cue` router** (`src/server/api/routers/cue.ts`):

`upcoming()` is a query returning `{ date, when, cues: CueView[] }[]` for today and tomorrow, in the athlete's timezone.
- Tomorrow can fall in the next block week, so the server loads both weeks' sessions. It loads none past the block's end and none for a week that doesn't exist.
- The previous day for today can also be the previous block week.
- Placements come from the saved layout (`savedLayout`). Unplaced sessions are skipped.

### 5. UI

- **Home** (`src/app/app/page.tsx`): a new `CueCard` (`src/components/home/cue-card.tsx`) between `NextSessionCard` and the status/coach grid.
  - It renders nothing when there are no cues.
  - Each cue shows a "Today" / "Tomorrow" eyebrow, the title and the line, plus a dismiss button (`aria-label="Dismiss: <title>"`).
  - Dismissal is per viewer, stored in `localStorage` (`mesodapt.cue.dismissed`), with every access in try/catch. Ids older than 3 days are pruned. With storage unavailable, cues simply show.
  - Styled like `CoachCard`: monochrome, no accent fill.
- **Board** (`src/components/schedule/schedule-board.tsx`):
  - Each day gets an `ActivityStrip` (`src/components/schedule/activity-strip.tsx`) under the day's sessions.
    - Muted chips ("Run · hard · AM"), each with a remove button.
    - A "+ activity" button opens a small popover form: kind, intensity, AM/PM/not said, optional minutes.
    - Read-only on a finished week.
    - Chips aren't draggable and aren't drop targets; the strip sits outside dnd-kit's droppable cells.
  - Days with a cue (today or tomorrow) get a `CueMarker`, a small icon in the day header. Its `aria-label` and title are the cue titles, and activating it shows the lines in a popover.
  - A successful activity write invalidates `activity.list` and `cue.upcoming`. The draft, suggestion and replacement state are untouched.

## Data flow

The athlete adds "Run · hard · AM" on Tuesday, then:
1. `activity.add` writes the row.
2. The board invalidates `cue.upcoming`.
3. The server builds `CueDayInput` for today and tomorrow, then runs `deriveCues` → `rankCues` → `toCueView`.
4. Tuesday's header shows a marker, and the home page's card says "Run, then Legs — aim for roughly 80–95 g of carbs between them."

## Safety

- Cues are information, not plan changes. There is no accept-gate, because nothing mutates.
- Numbers are bounded ranges from cited starting points, labelled as a guide. They never appear without a bodyweight.
- Out-of-range bodyweights fall back to words rather than producing extreme numbers.

## Error and empty handling

- No block, a finished block, or no sessions and no activities today or tomorrow → `upcoming()` returns empty days, and the card renders nothing.
- `cue.upcoming` failing on home → the card is omitted. The home page never fails because of cues.
- Activity write refused → the popover shows the server's message (via the existing `confirmErrorText` style of mapping).

## Testing

- **Engine `cues.ts`:**
  - Per-rule tests for each fire / no-fire boundary: the heavy-lower threshold at 9/10/11, EASY at 59/60, swim not leg-loading, completed lifts excluded today but included yesterday, unknown order, two lifts in AM/PM.
  - Suppression of `heavy_lower` under `fuel_between`.
  - The number maths: rounding, the minimum width, the phase factor, and the null and out-of-range bodyweight.
  - A fast-check property: every number lies inside its g/kg bounds × weight × factor (±5 g of rounding), and no cue names a session or activity that isn't in the input.
- **Views `cues.ts`:** phrasing snapshots for each kind × number / no number × order known / unknown; variant choice is stable for one id; no `undefined` or `NaN` in any line.
- **Router tests** (the existing DB-backed pattern): the activity date window, the finished-week refusal, the per-day cap, own-rows-only remove, and `upcoming()` across a week boundary and at the block's end.
- **UI:**
  - Dismissal storage helper: works when storage throws, and prunes old ids.
  - The board's activity strip, add then remove.

## Files (anticipated)

- **New:**
  - `src/engine/cues.ts` (+ tests)
  - `src/views/cues.ts` (+ tests)
  - `src/schema/activity.ts`
  - `src/server/api/routers/activity.ts`, `src/server/api/routers/cue.ts` (+ tests)
  - `src/server/cues/day-input.ts` (DB → `CueDayInput`)
  - `src/components/home/cue-card.tsx`, `src/components/home/cue-dismissal.ts`
  - `src/components/schedule/activity-strip.tsx`, `src/components/schedule/cue-marker.tsx`
- **Changed:**
  - `prisma/schema.prisma`
  - `src/engine/constants.ts`, `src/engine/index.ts`
  - `src/server/api/root.ts`
  - `src/app/app/page.tsx`
  - `src/components/schedule/schedule-board.tsx`
  - `PRODUCT.md` (a "Scheduling (coach cues)" paragraph)

## Success criteria

1. An AM hard run plus a PM leg session today shows "Run, then Legs" with a carb range computed from the athlete's bodyweight. With no bodyweight, it shows the same cue in plain words.
2. Activities never change any placement, score, critique, suggestion, re-placement option or coach reply. `ScheduleInput`, `WeekContext` and `CoachWeek` gain no activity field, and `loadWeekContext` doesn't read the table. A router test adds activities and asserts `getWeekSchedule` and `getReplacementOptions` results are unchanged.
3. Every number on screen is reproducible from `weightKg`, `phase` and the constants table.
4. The home page renders, without cues, when the cue query fails.
5. Tests, typecheck and lint pass; the athlete's visual lgtm comes before the merge.
