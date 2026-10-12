# Blocked Time and Week Re-placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an athlete block a day or half-day on a specific date, and have the engine propose up to three re-arranged layouts for the affected week, with Jev choosing which leads.

**Architecture:** One-off exceptions are a new table overlaid onto the week's availability by the server adapter, so the existing hard rules, scoring and board honour them unchanged. A new pure engine function, `proposeLayouts`, re-runs the existing placement search under three cost "lenses" and, when the week is too crowded, produces skip and double-up variants. Accepting an option goes through the existing `applyLayout` write; skipping a session goes through the existing missed-session dialog.

**Tech Stack:** Next.js 15 App Router, React 19, tRPC 11, Prisma 6 on Postgres (`prisma db push`, no migrations folder), Zod, Vitest 4 + fast-check, Tailwind v4 tokens, `@dnd-kit/core`.

**Spec:** `docs/superpowers/specs/2026-10-12-schedule-exceptions-replacement-design.md`

## Global Constraints

- **Law 1:** placement code never changes sets, reps, RIR or volume. Nothing in this plan writes a prescription.
- **Law 2:** every athlete-facing sentence is phrased from an engine fact, a lens name or an overflow outcome. No model-written text reaches the athlete.
- **Engine purity:** `src/engine/**` is synchronous, has no I/O, and imports nothing from `src/server` or React.
- **Vocabulary:** "exception" (one-off blocked cell), "re-placement" (engine proposing layouts), "lens", "option". Never "slot" for time. "Reschedule" keeps meaning set redistribution.
- **One write path:** every placement change by the athlete goes through `schedule.applyLayout`. The only other placement write is the quiet future-week re-placement inside `setException`.
- **Every write runs under `lockActiveBlock`** in a transaction with `{ timeout: 15000 }`.
- **Exceptions never modify `AvailabilityCell` rows.**
- **One-a-day mode never doubles up.** `day_limit` stays a hard rule.
- **Jev is advisory.** It can reorder options. Any failure returns the engine's order.
- **Never** run `prisma db push` with `--accept-data-loss` or `--force-reset`. Never print values from `.env`.
- **Scoring constants are starting values** owned by the product owner. Add the three new ones exactly as given; do not tune them.
- **`nominateOverflow` ships as the placeholder given in Task 3.** Its body is reserved for the product owner. Do not improve it.
- Match the surrounding code's comment density and naming. Work on branch `freddy/feat/schedule-exceptions`. Do not push.
- Commands: `pnpm vitest run <path>`, `pnpm typecheck`, `pnpm lint`.

## Refinements made during planning (the spec is amended to match)

1. **Skip comes first, not last.** A skipped session still holds its cell until it is marked missed, and redistribution changes the footprints of the sessions that remain. So choosing a skip option opens the existing missed-session dialog; once that is accepted the panel recomputes ordinary options for what is left. `applyLayout` gains no `skip` input.
2. **No `Week.needsPlacementReview` column.** The trigger for options is "a movable session is standing on a blocked cell", which is already visible in the saved layout (`on_blocked_cell`). A future week that could not be re-placed quietly is in exactly that state.
3. **Crowding is measured in days.** A week is crowded when movable sessions outnumber free days. In AM/PM mode that is when doubling up becomes necessary, which is the moment the athlete should be offered the choice.
4. **One new fact, not three:** `session_does_not_fit`. Lens and block information travel as data on the option.
5. **"Show on board" button** replaces hover preview. It loads the option into the existing draft.
6. **The "fewest changes never moves more than balanced" property is dropped.** Both are local searches, so it is not guaranteed. A fixture test covers the intent.
7. **`nominateOverflow` returns a ranking** (`string[]`, most skippable first), so the engine can offer a runner-up.

## Review Focus

1. **Date boundary in a non-UTC timezone.** An athlete in `Australia/Perth` blocks "today" at 07:00 local, which is still yesterday in UTC. The exception must land on their local date and must not be refused as past. (Task 6 test.)
2. **Blocking a day that holds a completed session.** Nothing moves, no option is offered for that session, and no error is raised. (Task 3 and Task 6 tests.)
3. **Every remaining day blocked.** The engine returns skip options and never throws or returns an option that breaks a hard rule. (Task 3 test.)
4. **Jev returns an option id that was not offered, or low confidence.** Order is unchanged and nothing is marked as the coach's pick. (Task 4 test.)
5. **Setting the same exception twice, or clearing one that does not exist.** Both succeed and leave one row or none. (Task 6 test.)

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `AvailabilityException` model |
| `src/domain/local-day.ts` | `dayNumberOfIsoDate` |
| `src/schema/schedule.ts` | `IsoDateSchema`, `ExceptionInputSchema`, `origin` gains `"replacement"` |
| `src/engine/constants.ts` | three new constants |
| `src/engine/facts.ts` | `session_does_not_fit` |
| `src/engine/schedule.ts` | `oneOff` flag, lens search, `nominateOverflow`, `proposeLayouts` |
| `src/engine/schedule-judgement.ts` (new) | Jev question and verdict applier for re-placement |
| `src/server/mesocycle/schedule-adapters.ts` | exception overlay |
| `src/views/schedule.ts` | option view and phrasing |
| `src/server/api/routers/schedule.ts` | `setException`, `clearException`, `getReplacementOptions` |
| `src/components/schedule/exceptions.ts` (new) | pure helpers for toggle state |
| `src/components/schedule/replacement-panel.tsx` (new) | the options panel |
| `src/components/schedule/schedule-board.tsx`, `session-chip.tsx` | toggles and wiring |

---

### Task 1: Data model, schemas and the new fact

**Files:**
- Modify: `prisma/schema.prisma`, `src/domain/local-day.ts`, `src/schema/schedule.ts`, `src/engine/facts.ts`, `src/engine/constants.ts`, `src/engine/schedule.ts` (one field)
- Test: `src/domain/local-day.test.ts` (create if absent), `src/schema/schedule.test.ts` (create if absent)

**Interfaces:**
- Produces:
  - Prisma model `AvailabilityException { id, athleteProfileId, date (@db.Date), daypart, createdAt }`, relation field `AthleteProfile.availabilityExceptions`.
  - `dayNumberOfIsoDate(iso: string): number`
  - `IsoDateSchema`, `ExceptionInputSchema` (`{ date: string; daypart: "AM" | "PM" | null }`), type `ExceptionInput`
  - `ApplyLayoutInputSchema.origin`: `"athlete" | "suggestion" | "replacement"`
  - `AvailabilityCellInput.oneOff?: boolean`
  - `DecisionFact` variant `{ kind: "session_does_not_fit"; sessionId: string; sessions: number; freeDays: number }`
  - Constants `W_DISPLACEMENT = 50`, `PREFERENCE_LENS_FACTOR = 5`, `MAX_LAYOUT_OPTIONS = 3`

- [ ] **Step 1: Write the failing tests**

`src/domain/local-day.test.ts` (append if the file exists):

```ts
import { describe, expect, it } from "vitest";
import { dayNumberOfIsoDate, isoDateOfDayNumber, weekdayOfDayNumber } from "./local-day";

describe("dayNumberOfIsoDate", () => {
  it("round-trips with isoDateOfDayNumber", () => {
    expect(isoDateOfDayNumber(dayNumberOfIsoDate("2026-10-08"))).toBe("2026-10-08");
  });
  it("gives the right weekday", () => {
    // 8 Oct 2026 is a Thursday (3).
    expect(weekdayOfDayNumber(dayNumberOfIsoDate("2026-10-08"))).toBe(3);
  });
});
```

`src/schema/schedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApplyLayoutInputSchema, ExceptionInputSchema } from "./schedule";

describe("ExceptionInputSchema", () => {
  it("accepts a calendar date with a daypart or null", () => {
    expect(ExceptionInputSchema.safeParse({ date: "2026-10-08", daypart: null }).success).toBe(true);
    expect(ExceptionInputSchema.safeParse({ date: "2026-10-08", daypart: "PM" }).success).toBe(true);
  });
  it("rejects a date that is malformed or not on the calendar", () => {
    expect(ExceptionInputSchema.safeParse({ date: "8/10/2026", daypart: null }).success).toBe(false);
    expect(ExceptionInputSchema.safeParse({ date: "2026-02-30", daypart: null }).success).toBe(false);
    expect(ExceptionInputSchema.safeParse({ date: "2026-10-08T00:00:00Z", daypart: null }).success).toBe(false);
  });
});

describe("ApplyLayoutInputSchema", () => {
  it("accepts the replacement origin", () => {
    const parsed = ApplyLayoutInputSchema.safeParse({ weekIndex: 1, placements: [], expected: [], origin: "replacement" });
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/domain/local-day.test.ts src/schema/schedule.test.ts`
Expected: FAIL (`dayNumberOfIsoDate` and `ExceptionInputSchema` are not exported).

- [ ] **Step 3: Implement**

`src/domain/local-day.ts`, append:

```ts
/** Day number of a "YYYY-MM-DD" calendar date. The inverse of `isoDateOfDayNumber`. */
export function dayNumberOfIsoDate(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}
```

`src/schema/schedule.ts`, add after `TimezoneSchema` and change `origin`:

```ts
/** A calendar date with no time or zone: "YYYY-MM-DD". */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Use YYYY-MM-DD." })
  .refine(
    (s) => {
      const t = Date.parse(`${s}T00:00:00Z`);
      return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
    },
    { message: "Not a calendar date." },
  );

/** One-off blocked time. `daypart` null means the whole day. */
export const ExceptionInputSchema = z.object({ date: IsoDateSchema, daypart: DaypartEnum.nullable() });
export type ExceptionInput = z.infer<typeof ExceptionInputSchema>;
```

```ts
  origin: z.enum(["athlete", "suggestion", "replacement"]),
```

Check that `src/schema/index.ts` re-exports `./schedule` with `export *`; if it lists names, add `IsoDateSchema`, `ExceptionInputSchema` and `ExceptionInput`.

`prisma/schema.prisma`: add to `model AthleteProfile`, next to `availability AvailabilityCell[]`:

```prisma
  availabilityExceptions AvailabilityException[]
```

and after `model AvailabilityCell`:

```prisma
/// One-off blocked time on a specific date. Never edits the standing grid. Stored at
/// AM/PM resolution like AvailabilityCell: a whole day is two rows.
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

`src/engine/facts.ts`, add as the last variant of `DecisionFact`:

```ts
  | { kind: "session_does_not_fit"; sessionId: string; sessions: number; freeDays: number };
```

(move the terminating `;` from the `on_blocked_cell` line.)

`src/engine/constants.ts`, in the "Schedule scoring" block, before `SCHEDULE_EPS`:

```ts
/** Fewest-changes lens: cost of each session that leaves its saved placement. */
export const W_DISPLACEMENT = 50;
/** Keeps-preferences lens: how many times heavier an off-preference session counts. */
export const PREFERENCE_LENS_FACTOR = 5;
/** Re-placement options returned at most. */
export const MAX_LAYOUT_OPTIONS = 3;
```

`src/engine/schedule.ts`, in `AvailabilityCellInput`:

```ts
export interface AvailabilityCellInput {
  day: number;
  daypart: Daypart;
  state: "PREFERRED" | "BLOCKED";
  /** Set when the cell is blocked for this week only (an exception), not by the standing grid. */
  oneOff?: boolean;
}
```

- [ ] **Step 4: Push the schema and regenerate**

Run: `pnpm db:push`
Expected: "Your database is now in sync with your Prisma schema." with one table created. If it reports any data-loss warning, STOP and report; do not pass any flag.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm vitest run src/domain/local-day.test.ts src/schema/schedule.test.ts && pnpm typecheck`
Expected: PASS, typecheck clean. (`phraseScheduleFact` has a `default` branch, so the new fact kind does not break it.)

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/domain src/schema src/engine/facts.ts src/engine/constants.ts src/engine/schedule.ts
git commit -m "feat(schedule): exception model, input schema and does-not-fit fact"
```

---

### Task 2: Lens search in the engine

**Files:**
- Modify: `src/engine/schedule.ts`, `src/engine/index.ts`
- Test: `src/engine/schedule-lens.test.ts` (create)

**Interfaces:**
- Consumes: `ScheduleInput`, `Layout`, `PlaceResult`, `scoreLayout`, `neighbours`, `heldCells`, `isFixed`, `isOpenTarget`, `openCells` (all in `schedule.ts`); `sess`, `makeInput`, `withSaved` from `src/engine/_fixtures/schedule.ts`.
- Produces:
  - `type Lens = "BALANCED" | "FEWEST_CHANGES" | "KEEPS_PREFERENCES"`
  - `const LENS_ORDER: readonly Lens[]`
  - `lensCost(input: ScheduleInput, layout: Layout, lens: Lens): number`
  - `placeWithLens(input: ScheduleInput, lens: Lens): PlaceResult`
  - `placeWeek` keeps its signature and its exact behaviour.

- [ ] **Step 1: Write the failing tests**

`src/engine/schedule-lens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeInput, sess, withSaved } from "./_fixtures/schedule";
import { checkLayout, lensCost, placeWeek, placeWithLens, scoreLayout, type Layout } from "./schedule";

const day = (d: number) => ({ day: d, daypart: null });

// Mon push, Wed pull, Fri legs: nothing overlaps, all well rested.
const base = makeInput({
  sessions: [sess("push", 0, { CHEST: 8 }), sess("pull", 1, { BACK: 8 }), sess("legs", 2, { QUADS: 8 })],
});
const saved: Layout = { push: day(0), pull: day(2), legs: day(4) };

describe("lensCost", () => {
  it("equals the plain score under BALANCED", () => {
    const input = withSaved(base, saved);
    expect(lensCost(input, saved, "BALANCED")).toBe(scoreLayout(input, saved).cost);
  });

  it("charges each session that left its saved placement under FEWEST_CHANGES", () => {
    const input = withSaved(base, saved);
    const moved: Layout = { ...saved, legs: day(5) };
    const plain = scoreLayout(input, moved).cost;
    expect(lensCost(input, moved, "FEWEST_CHANGES")).toBe(plain + 50);
    expect(lensCost(input, saved, "FEWEST_CHANGES")).toBe(scoreLayout(input, saved).cost);
  });

  it("weighs an off-preference session five times under KEEPS_PREFERENCES", () => {
    const input = withSaved(
      { ...base, availability: [{ day: 6, daypart: "AM", state: "PREFERRED" }] },
      saved,
    );
    const offFacts = scoreLayout(input, saved).facts.filter((f) => f.kind === "off_preference").length;
    expect(offFacts).toBeGreaterThan(0);
    expect(lensCost(input, saved, "KEEPS_PREFERENCES")).toBe(scoreLayout(input, saved).cost + 4 * 2 * offFacts);
  });
});

describe("placeWithLens", () => {
  it("BALANCED gives exactly what placeWeek gives", () => {
    const input = withSaved(base, saved);
    expect(placeWithLens(input, "BALANCED")).toEqual(placeWeek(input));
  });

  it("FEWEST_CHANGES moves only the session whose day was blocked", () => {
    const input = withSaved(
      {
        ...base,
        availability: [
          { day: 2, daypart: "AM", state: "BLOCKED" },
          { day: 2, daypart: "PM", state: "BLOCKED" },
        ],
      },
      saved,
    );
    const res = placeWithLens(input, "FEWEST_CHANGES");
    expect(res.kind).toBe("placed");
    if (res.kind !== "placed") return;
    expect(res.layout.push).toEqual(day(0));
    expect(res.layout.legs).toEqual(day(4));
    expect(res.layout.pull!.day).not.toBe(2);
    expect(checkLayout(input, res.layout)).toEqual([]);
  });

  it("never moves a completed session", () => {
    const input = withSaved(
      { ...base, sessions: [sess("push", 0, { CHEST: 8 }, null, true), base.sessions[1]!, base.sessions[2]!] },
      saved,
    );
    for (const lens of ["BALANCED", "FEWEST_CHANGES", "KEEPS_PREFERENCES"] as const) {
      const res = placeWithLens(input, lens);
      expect(res.kind).toBe("placed");
      if (res.kind === "placed") expect(res.layout.push).toEqual(day(0));
    }
  });

  it("is infeasible when there are no open cells", () => {
    const input = withSaved({ ...base, firstOpenDay: 7 }, saved);
    expect(placeWithLens(input, "FEWEST_CHANGES").kind).toBe("infeasible");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm vitest run src/engine/schedule-lens.test.ts`
Expected: FAIL (`lensCost`, `placeWithLens` not exported).

- [ ] **Step 3: Implement**

In `src/engine/schedule.ts`, add `PREFERENCE_LENS_FACTOR` and `W_DISPLACEMENT` to the import from `./constants`. Replace the whole `placeWeek` function (keep its doc comment on the new `placeWeek`) with:

```ts
/** The weighting a layout was searched under. */
export type Lens = "BALANCED" | "FEWEST_CHANGES" | "KEEPS_PREFERENCES";

export const LENS_ORDER: readonly Lens[] = ["BALANCED", "FEWEST_CHANGES", "KEEPS_PREFERENCES"];

/**
 * A layout's cost as one lens sees it. Every lens starts from `scoreLayout`, so the hard
 * preferences (blocked cells, rest) still count; a lens only adds weight to one concern.
 */
export function lensCost(input: ScheduleInput, layout: Layout, lens: Lens): number {
  const score = scoreLayout(input, layout);
  if (lens === "FEWEST_CHANGES") {
    const moved = input.sessions.filter(
      (s) => !isFixed(s) && s.placement !== null && layout[s.id] !== undefined && !samePlacement(s.placement, layout[s.id]),
    ).length;
    return score.cost + W_DISPLACEMENT * moved;
  }
  if (lens === "KEEPS_PREFERENCES") {
    const off = score.facts.filter((f) => f.kind === "off_preference").length;
    return score.cost + (PREFERENCE_LENS_FACTOR - 1) * W_OFF_PREFERENCE * off;
  }
  return score.cost;
}

/**
 * Where a search starts. Fixed sessions always keep their placement. With `keepStanding`,
 * so does every other session whose saved cell is still open and not already taken, so the
 * search only has to find homes for the sessions that were displaced.
 */
function seedLayout(input: ScheduleInput, keepStanding: boolean): Layout {
  const seed: Layout = {};
  for (const s of input.sessions) {
    if (isFixed(s) && s.placement) seed[s.id] = s.placement;
  }
  if (!keepStanding) return seed;
  const held = heldCells(input, seed);
  for (const s of [...input.sessions].sort((a, b) => a.order - b.order)) {
    if (isFixed(s) || !s.placement || !isOpenTarget(input, s.placement)) continue;
    // A day-only placement in AM/PM mode (or the reverse) has to be re-placed.
    if ((s.placement.daypart !== null) !== (input.mode === "HALF_DAY")) continue;
    const key = cellKey(s.placement, input.mode);
    if (held.has(key)) continue;
    seed[s.id] = s.placement;
    held.add(key);
  }
  return seed;
}

/**
 * Greedy construction in session order (each unseeded session takes the open cell that
 * costs least, earliest on ties), then local search over `neighbours` until no single
 * move or swap lowers the cost. Deterministic.
 */
function searchLayout(input: ScheduleInput, costOf: (layout: Layout) => number, seed: Layout): PlaceResult {
  let layout: Layout = { ...seed };
  const toPlace = [...input.sessions]
    .sort((a, b) => a.order - b.order)
    .filter((s) => !isFixed(s) && layout[s.id] === undefined);
  const cells = openCells(input);

  for (const s of toPlace) {
    const occupied = heldCells(input, layout);
    let best: Placement | null = null;
    let bestCost = Infinity;
    for (const c of cells) {
      if (occupied.has(cellKey(c, input.mode))) continue;
      const cost = costOf({ ...layout, [s.id]: c });
      if (cost < bestCost - SCHEDULE_EPS) {
        best = c;
        bestCost = cost;
      }
    }
    if (best === null) {
      const taken = new Set(
        input.sessions.filter((x) => x.locked && !x.inert && x.placement).map((x) => cellKey(x.placement!, input.mode)),
      );
      const open = cells.filter((c) => !taken.has(cellKey(c, input.mode))).length;
      const needed = input.sessions.filter((x) => !isFixed(x)).length;
      return {
        kind: "infeasible",
        facts: [{ kind: "infeasible", constraint: "schedule_cells", detail: { needed, open } }],
      };
    }
    layout = { ...layout, [s.id]: best };
  }

  for (let step = 0; step < LOCAL_SEARCH_MAX_STEPS; step++) {
    let bestCost = costOf(layout);
    let bestLayout: Layout | null = null;
    for (const n of neighbours(input, layout)) {
      const cost = costOf(n.layout);
      if (cost < bestCost - SCHEDULE_EPS) {
        bestCost = cost;
        bestLayout = n.layout;
      }
    }
    if (bestLayout === null) break;
    layout = bestLayout;
  }

  return { kind: "placed", layout };
}

/**
 * Auto-place a week. Locked and inert sessions stay put; every other session is (re)placed.
 * Greedy construction in session order (each takes the open cell that costs least,
 * earliest on ties), then local search over `neighbours` until no single move or swap
 * lowers the cost. Deterministic. Because it stops at a local optimum of the same
 * neighbourhood `suggestMoves` searches, a freshly placed week has no suggestion.
 */
export function placeWeek(input: ScheduleInput): PlaceResult {
  return searchLayout(input, (layout) => scoreLayout(input, layout).cost, seedLayout(input, false));
}

/**
 * Place a week as one lens would. BALANCED is `placeWeek`. FEWEST_CHANGES starts from the
 * saved layout and pays for every session it moves. KEEPS_PREFERENCES re-places everything
 * with preferred times weighted up.
 */
export function placeWithLens(input: ScheduleInput, lens: Lens): PlaceResult {
  return searchLayout(input, (layout) => lensCost(input, layout, lens), seedLayout(input, lens === "FEWEST_CHANGES"));
}
```

`src/engine/index.ts`: add `LENS_ORDER`, `lensCost`, `placeWithLens` to the value export from `./schedule` and `Lens` to the type export.

- [ ] **Step 4: Run the new tests and every existing schedule test**

Run: `pnpm vitest run src/engine`
Expected: PASS, including `schedule-place.test.ts`, `schedule.properties.test.ts` and any snapshot, unchanged. If an existing `placeWeek` test fails, the refactor changed behaviour: fix the refactor, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/engine/schedule.ts src/engine/index.ts src/engine/schedule-lens.test.ts
git commit -m "feat(engine): lens-weighted week placement"
```

---

### Task 3: `proposeLayouts` and overflow

**Files:**
- Modify: `src/engine/schedule.ts`, `src/engine/index.ts`, `src/engine/schedule.properties.test.ts`
- Test: `src/engine/schedule-propose.test.ts` (create)

**Interfaces:**
- Consumes: Task 2's `Lens`, `LENS_ORDER`, `placeWithLens`; `MAX_LAYOUT_OPTIONS`; fact `session_does_not_fit`.
- Produces:

```ts
export interface LayoutMove { sessionId: string; from: Placement | null; to: Placement }
export type OverflowOutcome =
  | { kind: "skip"; sessionId: string }
  | { kind: "double_up"; sessionId: string; day: number };
export interface LayoutOption {
  /** Unique within one result: a lens name, "DOUBLE_UP", "SKIP_1" or "SKIP_2". */
  id: string;
  lens: Lens;
  /** Placements of every session the option keeps. Skipped sessions are absent. */
  layout: Layout;
  moves: LayoutMove[];
  score: LayoutScore;
  /** Why the week is crowded; empty when it is not. */
  fit: DecisionFact[];
  overflow: OverflowOutcome | null;
  skipped: string[];
}
export function freeDayCount(input: ScheduleInput): number;
export function isStranded(input: ScheduleInput): boolean;       // a movable session stands on a blocked cell
export function isCrowded(input: ScheduleInput): boolean;        // movable sessions outnumber free days
export function nominateOverflow(input: ScheduleInput, candidates: ScheduleSession[]): string[];
export function proposeLayouts(input: ScheduleInput): LayoutOption[];
```

- [ ] **Step 1: Write the failing tests**

`src/engine/schedule-propose.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeInput, sess, withSaved } from "./_fixtures/schedule";
import {
  checkLayout,
  cellState,
  isCrowded,
  isStranded,
  nominateOverflow,
  proposeLayouts,
  type AvailabilityCellInput,
  type Layout,
  type ScheduleInput,
} from "./schedule";

const day = (d: number) => ({ day: d, daypart: null });
const blockDay = (d: number): AvailabilityCellInput[] => [
  { day: d, daypart: "AM", state: "BLOCKED", oneOff: true },
  { day: d, daypart: "PM", state: "BLOCKED", oneOff: true },
];

const three = makeInput({
  sessions: [sess("push", 0, { CHEST: 8 }), sess("pull", 1, { BACK: 8 }), sess("legs", 2, { QUADS: 8 })],
});
const saved3: Layout = { push: day(0), pull: day(2), legs: day(4) };

/** Six sessions Mon…Sat, Sunday free. */
const six = makeInput({
  sessions: ["a", "b", "c", "d", "e", "f"].map((id, i) => sess(id, i, { CHEST: 2 + i })),
});
const saved6: Layout = Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((id, i) => [id, day(i)]));

function assertLegal(input: ScheduleInput, layout: Layout) {
  expect(checkLayout(input, layout)).toEqual([]);
  for (const s of input.sessions) {
    const p = layout[s.id];
    if (p && !s.locked) expect(cellState(input.availability, input.mode, p)).not.toBe("BLOCKED");
  }
}

describe("isStranded / isCrowded", () => {
  it("is stranded only when a movable session stands on a blocked cell", () => {
    expect(isStranded(withSaved(three, saved3))).toBe(false);
    expect(isStranded(withSaved({ ...three, availability: blockDay(2) }, saved3))).toBe(true);
    const done = withSaved(
      { ...three, availability: blockDay(2), sessions: [three.sessions[0]!, sess("pull", 1, { BACK: 8 }, null, true), three.sessions[2]!] },
      saved3,
    );
    expect(isStranded(done)).toBe(false);
  });

  it("is crowded when movable sessions outnumber free days", () => {
    expect(isCrowded(withSaved({ ...six, availability: blockDay(3) }, saved6))).toBe(false); // 6 sessions, 6 days
    expect(isCrowded(withSaved({ ...six, availability: [...blockDay(3), ...blockDay(6)] }, saved6))).toBe(true);
  });
});

describe("proposeLayouts, roomy week", () => {
  const input = withSaved({ ...three, availability: blockDay(2) }, saved3);
  const options = proposeLayouts(input);

  it("returns one to three distinct, legal options with unique ids", () => {
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options.length).toBeLessThanOrEqual(3);
    expect(new Set(options.map((o) => o.id)).size).toBe(options.length);
    for (const o of options) {
      assertLegal(input, o.layout);
      expect(o.overflow).toBeNull();
      expect(o.skipped).toEqual([]);
      expect(o.fit).toEqual([]);
      expect(Object.keys(o.layout).sort()).toEqual(["legs", "pull", "push"]);
    }
  });

  it("lists exactly the sessions that changed placement as moves", () => {
    for (const o of options) {
      const changed = Object.keys(o.layout).filter(
        (id) => o.layout[id]!.day !== saved3[id]!.day,
      );
      expect(o.moves.map((m) => m.sessionId).sort()).toEqual(changed.sort());
      for (const m of o.moves) expect(m.from).toEqual(saved3[m.sessionId]);
    }
  });

  it("includes an option that moves only the blocked session", () => {
    expect(options.some((o) => o.moves.length === 1 && o.moves[0]!.sessionId === "pull")).toBe(true);
  });

  it("is deterministic", () => {
    expect(proposeLayouts(input)).toEqual(options);
  });

  it("returns nothing when the saved layout is already the answer", () => {
    expect(proposeLayouts(withSaved(three, saved3)).every((o) => o.moves.length > 0)).toBe(true);
  });
});

describe("proposeLayouts, fixed sessions", () => {
  it("leaves a completed session on a blocked day and offers nothing for it", () => {
    const input = withSaved(
      { ...three, availability: blockDay(0), sessions: [sess("push", 0, { CHEST: 8 }, null, true), three.sessions[1]!, three.sessions[2]!] },
      saved3,
    );
    for (const o of proposeLayouts(input)) {
      expect(o.layout.push).toEqual(day(0));
      expect(o.moves.some((m) => m.sessionId === "push")).toBe(false);
    }
  });
});

describe("proposeLayouts, crowded one-a-day week", () => {
  // Thursday and Sunday blocked: six sessions, five free days.
  const input = withSaved({ ...six, availability: [...blockDay(3), ...blockDay(6)] }, saved6);
  const options = proposeLayouts(input);

  it("offers only skip options, never a double-up", () => {
    expect(options.length).toBeGreaterThanOrEqual(1);
    for (const o of options) {
      expect(o.overflow?.kind).toBe("skip");
      expect(o.skipped).toHaveLength(1);
      expect(o.layout[o.skipped[0]!]).toBeUndefined();
      expect(o.fit).toEqual([{ kind: "session_does_not_fit", sessionId: o.skipped[0], sessions: 6, freeDays: 5 }]);
      assertLegal({ ...input, sessions: input.sessions.filter((s) => !o.skipped.includes(s.id)) }, o.layout);
    }
  });

  it("offers a runner-up when one session overflows", () => {
    expect(options.map((o) => o.id)).toEqual(["SKIP_1", "SKIP_2"]);
    expect(options[0]!.skipped).not.toEqual(options[1]!.skipped);
  });
});

describe("proposeLayouts, crowded AM/PM week", () => {
  const halfSaved: Layout = Object.fromEntries(
    ["a", "b", "c", "d", "e", "f"].map((id, i) => [id, { day: i, daypart: "AM" as const }]),
  );
  const input = withSaved({ ...six, mode: "HALF_DAY", availability: [...blockDay(3), ...blockDay(6)] }, halfSaved);
  const options = proposeLayouts(input);

  it("leads with a double-up that keeps every session", () => {
    expect(options[0]!.id).toBe("DOUBLE_UP");
    expect(options[0]!.skipped).toEqual([]);
    expect(options[0]!.overflow?.kind).toBe("double_up");
    expect(Object.keys(options[0]!.layout)).toHaveLength(6);
    expect(options[0]!.score.facts.some((f) => f.kind === "same_day_stack")).toBe(true);
    assertLegal(input, options[0]!.layout);
  });

  it("also offers a skip", () => {
    expect(options.some((o) => o.overflow?.kind === "skip")).toBe(true);
  });
});

describe("proposeLayouts, nothing left open", () => {
  it("offers to skip every remaining session and never throws", () => {
    const all = [0, 1, 2, 3, 4, 5, 6].flatMap(blockDay);
    const input = withSaved({ ...three, availability: all }, saved3);
    const options = proposeLayouts(input);
    expect(options).toHaveLength(1);
    expect(options[0]!.skipped.sort()).toEqual(["legs", "pull", "push"]);
    expect(options[0]!.layout).toEqual({});
    expect(options[0]!.moves).toEqual([]);
  });
});

describe("nominateOverflow contract", () => {
  it("returns every candidate id exactly once, the same way each time", () => {
    const input = withSaved(six, saved6);
    const ranked = nominateOverflow(input, input.sessions);
    expect([...ranked].sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(nominateOverflow(input, input.sessions)).toEqual(ranked);
  });
});
```

Append to `src/engine/schedule.properties.test.ts`, reusing the file's existing `arbInput()` generator and its `fc`, `it`, `expect`, `checkLayout` imports (add `proposeLayouts`, `cellState` to the import from `./schedule`):

```ts
describe("proposeLayouts properties", () => {
  it("never breaks a hard rule, never uses a blocked cell, accounts for every movable session", () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        const options = proposeLayouts(input);
        expect(options.length).toBeLessThanOrEqual(3);
        expect(new Set(options.map((o) => o.id)).size).toBe(options.length);
        for (const o of options) {
          const kept = { ...input, sessions: input.sessions.filter((s) => !o.skipped.includes(s.id)) };
          expect(checkLayout(kept, o.layout)).toEqual([]);
          for (const m of o.moves) {
            expect(cellState(input.availability, input.mode, m.to)).not.toBe("BLOCKED");
          }
          for (const s of input.sessions) {
            if (s.locked || s.inert) continue;
            expect(o.layout[s.id] !== undefined || o.skipped.includes(s.id)).toBe(true);
          }
        }
        expect(proposeLayouts(input)).toEqual(options);
      }),
    );
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm vitest run src/engine/schedule-propose.test.ts`
Expected: FAIL (`proposeLayouts` not exported).

- [ ] **Step 3: Implement**

In `src/engine/schedule.ts`, add `MAX_LAYOUT_OPTIONS` to the constants import and append at the end of the file:

```ts
export interface LayoutMove {
  sessionId: string;
  from: Placement | null;
  to: Placement;
}

export type OverflowOutcome =
  | { kind: "skip"; sessionId: string }
  | { kind: "double_up"; sessionId: string; day: number };

/** One way to arrange the week, with what it changes and what it leaves the athlete with. */
export interface LayoutOption {
  /** Unique within one result: a lens name, "DOUBLE_UP", "SKIP_1" or "SKIP_2". */
  id: string;
  lens: Lens;
  /** Placements of every session the option keeps. Skipped sessions are absent. */
  layout: Layout;
  moves: LayoutMove[];
  score: LayoutScore;
  /** Why the week is crowded; empty when it is not. */
  fit: DecisionFact[];
  overflow: OverflowOutcome | null;
  skipped: string[];
}

/** Live fixed sessions: they happened (or will, where they are), so they hold their day. */
function liveFixed(input: ScheduleInput): ScheduleSession[] {
  return input.sessions.filter((s) => s.locked && !s.inert && s.placement !== null);
}

/** Days that still have an open cell and no completed session on them. */
export function freeDayCount(input: ScheduleInput): number {
  const heldDays = new Set(liveFixed(input).map((s) => s.placement!.day));
  return new Set(openCells(input).map((c) => c.day).filter((d) => !heldDays.has(d))).size;
}

function freeCellCount(input: ScheduleInput): number {
  const held = new Set(liveFixed(input).map((s) => cellKey(s.placement!, input.mode)));
  return openCells(input).filter((c) => !held.has(cellKey(c, input.mode))).length;
}

/** A session the athlete could still train is standing on time they have blocked. */
export function isStranded(input: ScheduleInput): boolean {
  return scoreLayout(input, savedLayout(input)).facts.some((f) => f.kind === "on_blocked_cell");
}

/** More sessions left to train than days left to train them on. */
export function isCrowded(input: ScheduleInput): boolean {
  return input.sessions.filter((s) => !isFixed(s)).length > freeDayCount(input);
}

/**
 * When a week is crowded, which sessions should be offered for skipping first?
 * Returns the candidates' ids, most skippable first. Must return each candidate exactly
 * once and be deterministic; `proposeLayouts` repairs anything else.
 *
 * TODO(product owner): this is a coaching call. The placeholder skips the last session
 * of the week first. Alternatives: the smallest footprint, the session whose muscles are
 * trained again soonest, or the session standing on the blocked time.
 */
export function nominateOverflow(input: ScheduleInput, candidates: ScheduleSession[]): string[] {
  return [...candidates].sort((a, b) => b.order - a.order).map((s) => s.id);
}

/** The same week with some sessions treated as not happening. */
function withoutSessions(input: ScheduleInput, ids: string[]): ScheduleInput {
  const gone = new Set(ids);
  return { ...input, sessions: input.sessions.map((s) => (gone.has(s.id) ? { ...s, inert: true } : s)) };
}

function buildOption(
  input: ScheduleInput,
  id: string,
  lens: Lens,
  skipped: string[],
  fit: DecisionFact[],
): LayoutOption | null {
  const reduced = withoutSessions(input, skipped);
  const res = placeWithLens(reduced, lens);
  if (res.kind !== "placed") return null;
  const gone = new Set(skipped);
  const layout: Layout = {};
  for (const [sid, p] of Object.entries(res.layout)) {
    if (!gone.has(sid)) layout[sid] = p;
  }
  const moves: LayoutMove[] = [...input.sessions]
    .sort((a, b) => a.order - b.order)
    .filter((s) => !isFixed(s) && !gone.has(s.id) && layout[s.id] !== undefined && !samePlacement(s.placement, layout[s.id]))
    .map((s) => ({ sessionId: s.id, from: s.placement, to: layout[s.id]! }));
  return {
    id,
    lens,
    layout,
    moves,
    score: scoreLayout(reduced, res.layout),
    fit,
    overflow: skipped.length > 0 ? { kind: "skip", sessionId: skipped[0]! } : null,
    skipped,
  };
}

/** Identity of an option's outcome: what it skips and where everything else goes. */
function optionKey(o: LayoutOption): string {
  return `${[...o.skipped].sort().join(",")}#${layoutKey(o.layout)}`;
}

/**
 * Up to MAX_LAYOUT_OPTIONS distinct ways to arrange the week, in the engine's order of
 * preference. In a roomy week each option is the same search under a different lens.
 * In a crowded week the options are the athlete's real choices: keep everything by
 * doubling up (AM/PM mode only), or skip a session. Never changes a prescription, and
 * never returns an option `checkLayout` would refuse. Deterministic.
 */
export function proposeLayouts(input: ScheduleInput): LayoutOption[] {
  const movable = input.sessions.filter((s) => !isFixed(s));
  if (movable.length === 0) return [];
  const out: LayoutOption[] = [];
  const seen = new Set<string>();
  const push = (o: LayoutOption | null) => {
    if (o === null) return;
    const key = optionKey(o);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(o);
  };

  const freeDays = freeDayCount(input);
  const overDays = movable.length - freeDays;

  if (overDays <= 0) {
    for (const lens of LENS_ORDER) push(buildOption(input, lens, lens, [], []));
    const balanced = (o: LayoutOption) => lensCost(input, o.layout, "BALANCED");
    return out
      .filter((o) => o.moves.length > 0)
      .map((o, index) => ({ o, index, cost: balanced(o) }))
      .sort((a, b) => a.cost - b.cost || a.index - b.index)
      .map((x) => x.o)
      .slice(0, MAX_LAYOUT_OPTIONS);
  }

  // Crowded. Repair the ranking so a faulty nomination can never lose or invent a session.
  const ids = movable.map((s) => s.id);
  const nominated = nominateOverflow(input, movable).filter((id, i, all) => ids.includes(id) && all.indexOf(id) === i);
  const ranked = [...nominated, ...ids.filter((id) => !nominated.includes(id))];
  const fitFor = (sessionId: string): DecisionFact[] => [
    { kind: "session_does_not_fit", sessionId, sessions: movable.length, freeDays },
  ];

  if (input.mode === "HALF_DAY") {
    const overCells = Math.max(0, movable.length - freeCellCount(input));
    const skipped = ranked.slice(0, overCells);
    const o = buildOption(input, "DOUBLE_UP", "BALANCED", skipped, fitFor(ranked[0]!));
    if (o !== null) {
      const stack = o.score.facts.find((f) => f.kind === "same_day_stack");
      if (stack?.kind === "same_day_stack") {
        const mover = stack.sessionIds.find((id) => o.moves.some((m) => m.sessionId === id)) ?? stack.sessionIds[1];
        push({ ...o, overflow: { kind: "double_up", sessionId: mover, day: stack.day } });
      } else if (skipped.length > 0) {
        push(o);
      }
    }
  }

  const primary = ranked.slice(0, overDays);
  push(buildOption(input, "SKIP_1", "BALANCED", primary, fitFor(primary[0]!)));
  if (overDays === 1 && ranked.length >= 2) {
    push(buildOption(input, "SKIP_2", "BALANCED", [ranked[1]!], fitFor(ranked[1]!)));
  }
  return out.slice(0, MAX_LAYOUT_OPTIONS);
}
```

Note for the implementer: when every session is skipped, `buildOption` still succeeds because `placeWithLens` has nothing to place; `layout` is then only fixed sessions. The "nothing left open" test expects `layout` to equal `{}` for a week with no fixed sessions.

`src/engine/index.ts`: export `freeDayCount`, `isCrowded`, `isStranded`, `nominateOverflow`, `proposeLayouts` and the types `LayoutMove`, `LayoutOption`, `OverflowOutcome`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/engine`
Expected: PASS. If the property test finds a counter-example, fix the engine; do not narrow the property. Report the counter-example in your notes.

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck
git add src/engine
git commit -m "feat(engine): propose week layouts around blocked time, with overflow options"
```

---

### Task 4: Advisory judgement for re-placement

**Files:**
- Create: `src/engine/schedule-judgement.ts`, `src/engine/schedule-judgement.test.ts`
- Modify: `src/engine/judgement.ts` (subject union), `src/engine/index.ts`, `prisma/schema.prisma` (comment only)

**Interfaces:**
- Consumes: `LayoutOption`, `ScheduleInput`; from `./judgement`: `JudgementRequest`, `Verdict`, `verdictById`, `isUsableChoice`.
- Produces:
  - `JudgementSubject` gains `"replacement"`.
  - `const REPLACEMENT_PICK_ID = "replacement_pick"`
  - `replacementQuestions(options: LayoutOption[], input: ScheduleInput, label: (id: string) => string): JudgementRequest`
  - `applyReplacementVerdict(options: LayoutOption[], verdicts: Verdict[]): { options: LayoutOption[]; judged: boolean }`

- [ ] **Step 1: Write the failing tests**

`src/engine/schedule-judgement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeInput, sess, withSaved } from "./_fixtures/schedule";
import { JUDGEMENT_MIN_CONFIDENCE_ADVISORY } from "./constants";
import type { Verdict } from "./judgement";
import { proposeLayouts, type Layout } from "./schedule";
import { applyReplacementVerdict, REPLACEMENT_PICK_ID, replacementQuestions } from "./schedule-judgement";

const day = (d: number) => ({ day: d, daypart: null });
const input = withSaved(
  makeInput({
    sessions: ["a", "b", "c", "d", "e", "f"].map((id, i) => sess(id, i, { CHEST: 2 + i })),
    availability: [3, 6].flatMap((d) => [
      { day: d, daypart: "AM" as const, state: "BLOCKED" as const },
      { day: d, daypart: "PM" as const, state: "BLOCKED" as const },
    ]),
  }),
  Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((id, i) => [id, day(i)])) as Layout,
);
const options = proposeLayouts(input); // SKIP_1, SKIP_2
const label = (id: string) => `Session ${id.toUpperCase()}`;

const pick = (choice: string, confidence: number): Verdict[] => [
  { id: REPLACEMENT_PICK_ID, kind: "choice", choice, confidence, probabilities: { [choice]: confidence } },
];

describe("replacementQuestions", () => {
  const request = replacementQuestions(options, input, label);

  it("asks one advisory choice over exactly the offered options", () => {
    expect(request.subject).toBe("replacement");
    expect(request.questions).toHaveLength(1);
    const q = request.questions[0]!;
    expect(q.kind).toBe("choice");
    expect(q.authority).toBe("ADVISORY");
    if (q.kind === "choice") expect(Object.keys(q.options)).toEqual(options.map((o) => o.id));
  });

  it("names skipped sessions by label and carries no session ids, scores or weights", () => {
    const json = JSON.stringify(request);
    expect(json).toContain("Session F");
    expect(json).not.toMatch(/"cost"/);
    expect(json).not.toMatch(/"sessionId"/);
    expect(json).not.toMatch(/"layout"/);
  });
});

describe("applyReplacementVerdict", () => {
  it("moves a confidently chosen option to the front and keeps the rest in order", () => {
    const res = applyReplacementVerdict(options, pick("SKIP_2", 0.95));
    expect(res.judged).toBe(true);
    expect(res.options.map((o) => o.id)).toEqual(["SKIP_2", "SKIP_1"]);
    expect(res.options).toHaveLength(options.length);
  });

  it("marks the lead as judged even when the verdict agrees with the engine", () => {
    const res = applyReplacementVerdict(options, pick("SKIP_1", 0.95));
    expect(res.judged).toBe(true);
    expect(res.options.map((o) => o.id)).toEqual(["SKIP_1", "SKIP_2"]);
  });

  it("ignores an option that was never offered", () => {
    const res = applyReplacementVerdict(options, pick("SKIP_9", 0.99));
    expect(res).toEqual({ options, judged: false });
  });

  it("ignores a verdict below the advisory confidence gate", () => {
    const res = applyReplacementVerdict(options, pick("SKIP_2", JUDGEMENT_MIN_CONFIDENCE_ADVISORY - 0.01));
    expect(res).toEqual({ options, judged: false });
  });

  it("ignores a missing verdict", () => {
    expect(applyReplacementVerdict(options, [])).toEqual({ options, judged: false });
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm vitest run src/engine/schedule-judgement.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/engine/judgement.ts`:

```ts
export type JudgementSubject = "reschedule" | "progression" | "replacement";
```

`prisma/schema.prisma`: update the comment on `Judgement.subject` to `// "reschedule" | "progression" | "replacement"` (comment only; no push needed).

`src/engine/schedule-judgement.ts`:

```ts
// src/engine/schedule-judgement.ts
import type { DecisionFact } from "./facts";
import { isUsableChoice, verdictById, type JudgementRequest, type Verdict } from "./judgement";
import type { LayoutOption, ScheduleInput } from "./schedule";

export const REPLACEMENT_PICK_ID = "replacement_pick";

const LENS_DESCRIPTION = {
  BALANCED: "Re-arrange the week for the best recovery between sessions.",
  FEWEST_CHANGES: "Move as few sessions as possible.",
  KEEPS_PREFERENCES: "Keep sessions in the athlete's preferred times where possible.",
} as const;

function describeOption(o: LayoutOption, label: (id: string) => string): string {
  if (o.overflow?.kind === "double_up") return "Keep every session by training twice on one day.";
  if (o.skipped.length > 0) return `Skip ${o.skipped.map(label).join(" and ")} this week and re-arrange the rest.`;
  return LENS_DESCRIPTION[o.lens];
}

/** How many of each kind of warning a layout leaves the athlete with. */
function issueCounts(facts: DecisionFact[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of facts) out[f.kind] = (out[f.kind] ?? 0) + 1;
  return out;
}

/**
 * One advisory question: which of the engine's options should the athlete see first?
 * The state carries labels and small counts only. Layouts, costs and weights stay in the
 * engine, so the model has nothing to recompute and nothing numeric to get wrong.
 */
export function replacementQuestions(
  options: LayoutOption[],
  input: ScheduleInput,
  label: (id: string) => string,
): JudgementRequest {
  const offered: Record<string, string | null> = {};
  for (const o of options) offered[o.id] = describeOption(o, label);

  return {
    subject: "replacement",
    state: {
      scheduleMode: input.mode === "HALF_DAY" ? "morning or afternoon sessions" : "one session a day",
      sessionsLeftThisWeek: input.sessions.filter((s) => !s.locked && !s.inert).length,
      options: options.map((o) => ({
        option: o.id,
        sessionsMoved: o.moves.length,
        sessionsSkipped: o.skipped.map(label),
        trainsTwiceInOneDay: o.overflow?.kind === "double_up",
        warningsLeft: issueCounts(o.score.facts),
      })),
    },
    questions: [
      {
        id: REPLACEMENT_PICK_ID,
        kind: "choice",
        authority: "ADVISORY",
        instructions:
          "A strength athlete has said they cannot train at a time they were scheduled to this week. Each entry in `options` is a complete, already-checked way to arrange the rest of the week: how many sessions it moves, which sessions it skips, whether it has them train twice in one day, and in `warningsLeft` how many recovery or preference warnings remain afterwards (`short_rest` is two sessions for the same muscles too close together, `same_day_stack` is two sessions in one day, `load_streak` is too many training days in a row, `off_preference` is a session outside the athlete's preferred times, `uneven_spread` is sessions bunched together). Which option serves this athlete best?",
        options: offered,
      },
    ],
  };
}

/**
 * Put Jev's pick first. Only a confident verdict for an option that was actually offered
 * counts; anything else returns the engine's order untouched. Can never add, drop or
 * alter an option.
 */
export function applyReplacementVerdict(
  options: LayoutOption[],
  verdicts: Verdict[],
): { options: LayoutOption[]; judged: boolean } {
  const v = verdictById(verdicts, REPLACEMENT_PICK_ID);
  if (!isUsableChoice(v, options.map((o) => o.id))) return { options, judged: false };
  const lead = options.find((o) => o.id === v.choice)!;
  return { options: [lead, ...options.filter((o) => o !== lead)], judged: true };
}
```

`src/engine/index.ts`: add

```ts
export { replacementQuestions, applyReplacementVerdict, REPLACEMENT_PICK_ID } from "./schedule-judgement";
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm vitest run src/engine src/server/judgement && pnpm typecheck`
Expected: PASS. If a `switch` or record keyed on `JudgementSubject` elsewhere now fails to typecheck, add a `"replacement"` entry that mirrors `"reschedule"` and say so in your report.

- [ ] **Step 5: Commit**

```bash
git add src/engine prisma/schema.prisma
git commit -m "feat(engine): advisory judgement question for week re-placement"
```

---

### Task 5: Exception overlay in the adapter, and option views

**Files:**
- Modify: `src/server/mesocycle/schedule-adapters.ts`, `src/views/schedule.ts`
- Test: `src/server/mesocycle/schedule-adapters.test.ts` (append; create if absent), `src/views/schedule.test.ts` (append; create if absent)

**Interfaces:**
- Consumes: `AvailabilityCellInput.oneOff`, `LayoutOption`, `LayoutMove`, fact `session_does_not_fit`, `weekDays`, `WeekDay`.
- Produces (adapters):

```ts
export interface ExceptionCell { date: string; daypart: Daypart }   // date "YYYY-MM-DD"
export function exceptionsFromRows(rows: { date: Date; daypart: Daypart }[]): ExceptionCell[];
export function withExceptions(availability: AvailabilityCellInput[], days: WeekDay[], exceptions: ExceptionCell[]): AvailabilityCellInput[];
// scheduleInputFromDb args gain: exceptions?: ExceptionCell[]
```

- Produces (views):

```ts
export interface ReplacementOptionView {
  id: string;
  kind: "lens" | "double_up" | "skip";
  title: string;
  /** "Legs: Thu → Sat". */
  moves: string[];
  /** Why the week is crowded, then the warnings this layout leaves. */
  reasons: string[];
  /** Every placement the option changes, ready for applyLayout. */
  placements: { sessionId: string; day: number; daypart: "AM" | "PM" | null }[];
  layout: Layout;
  skipped: { sessionId: string; label: string }[];
  lead: boolean;
  /** The lead was chosen by the coach (Jev), not only by engine order. */
  judged: boolean;
}
export function moveLine(m: LayoutMove, label: (id: string) => string): string;
export function toReplacementOptionView(o: LayoutOption, label: (id: string) => string, flags: { lead: boolean; judged: boolean }): ReplacementOptionView;
```

- [ ] **Step 1: Write the failing tests**

Adapter tests:

```ts
import { describe, expect, it } from "vitest";
import { exceptionsFromRows, weekDays, withExceptions } from "./schedule-adapters";

describe("exceptions overlay", () => {
  // Block started Mon 5 Oct 2026 (UTC). Week 1 is 5…11 Oct, week 2 is 12…18 Oct.
  const days = weekDays(new Date("2026-10-05T00:00:00Z"), 1, "UTC");

  it("reads a date-only column as a calendar date", () => {
    expect(exceptionsFromRows([{ date: new Date("2026-10-08T00:00:00Z"), daypart: "AM" }])).toEqual([
      { date: "2026-10-08", daypart: "AM" },
    ]);
  });

  it("blocks the matching weekday cell and marks it one-off", () => {
    const out = withExceptions([], days, [{ date: "2026-10-08", daypart: "PM" }]);
    expect(out).toEqual([{ day: 3, daypart: "PM", state: "BLOCKED", oneOff: true }]);
  });

  it("ignores an exception in another week", () => {
    expect(withExceptions([], days, [{ date: "2026-10-15", daypart: "AM" }])).toEqual([]);
  });

  it("replaces a standing Preferred cell, and leaves a standing Blocked cell as standing", () => {
    const standing = [
      { day: 3, daypart: "AM" as const, state: "PREFERRED" as const },
      { day: 4, daypart: "AM" as const, state: "BLOCKED" as const },
    ];
    const out = withExceptions(standing, days, [
      { date: "2026-10-08", daypart: "AM" },
      { date: "2026-10-09", daypart: "AM" },
    ]);
    expect(out).toContainEqual({ day: 3, daypart: "AM", state: "BLOCKED", oneOff: true });
    expect(out).toContainEqual({ day: 4, daypart: "AM", state: "BLOCKED" });
    expect(out).toHaveLength(2);
  });

  it("does not mutate the standing availability", () => {
    const standing = [{ day: 3, daypart: "AM" as const, state: "PREFERRED" as const }];
    withExceptions(standing, days, [{ date: "2026-10-08", daypart: "AM" }]);
    expect(standing).toEqual([{ day: 3, daypart: "AM", state: "PREFERRED" }]);
  });

  it("uses the athlete's local week in a non-UTC timezone", () => {
    // 16:00Z on Sun 4 Oct is already Mon 5 Oct in Perth (UTC+8).
    const perth = weekDays(new Date("2026-10-04T16:00:00Z"), 1, "Australia/Perth");
    expect(perth[0]).toEqual({ date: "2026-10-05", weekday: 0 });
    expect(withExceptions([], perth, [{ date: "2026-10-05", daypart: "AM" }])).toEqual([
      { day: 0, daypart: "AM", state: "BLOCKED", oneOff: true },
    ]);
  });
});
```

View tests:

```ts
import { describe, expect, it } from "vitest";
import { makeInput, sess, withSaved } from "~/engine/_fixtures/schedule";
import { proposeLayouts, type Layout } from "~/engine/schedule";
import { moveLine, phraseScheduleFact, toReplacementOptionView } from "./schedule";

const day = (d: number) => ({ day: d, daypart: null });
const label = (id: string) => ({ a: "Push", b: "Pull", c: "Legs", d: "Upper", e: "Lower", f: "Arms" })[id] ?? "Session";
const blockDay = (d: number) => [
  { day: d, daypart: "AM" as const, state: "BLOCKED" as const, oneOff: true },
  { day: d, daypart: "PM" as const, state: "BLOCKED" as const, oneOff: true },
];

describe("replacement option views", () => {
  it("phrases a move", () => {
    expect(moveLine({ sessionId: "c", from: day(3), to: { day: 5, daypart: "AM" } }, label)).toBe("Legs: Thu → Sat AM");
    expect(moveLine({ sessionId: "c", from: null, to: day(5) }, label)).toBe("Legs: not placed → Sat");
  });

  it("phrases the does-not-fit fact", () => {
    expect(phraseScheduleFact({ kind: "session_does_not_fit", sessionId: "f", sessions: 6, freeDays: 5 }, label)).toBe(
      "6 sessions are left this week and only 5 days are open.",
    );
    expect(phraseScheduleFact({ kind: "session_does_not_fit", sessionId: "f", sessions: 2, freeDays: 1 }, label)).toBe(
      "2 sessions are left this week and only 1 day is open.",
    );
  });

  it("titles lens options and lists only changed placements", () => {
    const input = withSaved(
      makeInput({ sessions: [sess("a", 0, { CHEST: 8 }), sess("b", 1, { BACK: 8 }), sess("c", 2, { QUADS: 8 })], availability: blockDay(2) }),
      { a: day(0), b: day(2), c: day(4) } as Layout,
    );
    const [first] = proposeLayouts(input);
    const view = toReplacementOptionView(first!, label, { lead: true, judged: false });
    expect(["Best recovery", "Fewest changes", "Keeps your preferred times"]).toContain(view.title);
    expect(view.kind).toBe("lens");
    expect(view.placements.map((p) => p.sessionId).sort()).toEqual(first!.moves.map((m) => m.sessionId).sort());
    expect(view.moves).toHaveLength(first!.moves.length);
    expect(view.skipped).toEqual([]);
    expect(view.lead).toBe(true);
  });

  it("titles a skip option with the session's label and explains why", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const input = withSaved(
      makeInput({ sessions: ids.map((id, i) => sess(id, i, { CHEST: 2 + i })), availability: [...blockDay(3), ...blockDay(6)] }),
      Object.fromEntries(ids.map((id, i) => [id, day(i)])) as Layout,
    );
    const view = toReplacementOptionView(proposeLayouts(input)[0]!, label, { lead: true, judged: true });
    expect(view.kind).toBe("skip");
    expect(view.title).toBe("Skip Arms this week");
    expect(view.skipped).toEqual([{ sessionId: "f", label: "Arms" }]);
    expect(view.reasons[0]).toBe("6 sessions are left this week and only 5 days are open.");
    expect(view.judged).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm vitest run src/server/mesocycle/schedule-adapters.test.ts src/views/schedule.test.ts`
Expected: FAIL (exports missing).

- [ ] **Step 3: Implement the adapter**

`src/server/mesocycle/schedule-adapters.ts`, add after `availabilityFromRows`:

```ts
/** One-off blocked time, as a local calendar date. */
export interface ExceptionCell {
  date: string; // "YYYY-MM-DD"
  daypart: Daypart;
}

/** A `@db.Date` column comes back as midnight UTC of that calendar date. */
export function exceptionsFromRows(rows: { date: Date; daypart: Daypart }[]): ExceptionCell[] {
  return rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), daypart: r.daypart }));
}

/**
 * The week's availability with its exceptions laid over the standing grid. The engine
 * never sees dates: an exception simply becomes a Blocked cell for this week, flagged
 * `oneOff` so the board can tell it from a standing block. A cell the standing grid
 * already blocks stays a standing block.
 */
export function withExceptions(
  availability: AvailabilityCellInput[],
  days: WeekDay[],
  exceptions: ExceptionCell[],
): AvailabilityCellInput[] {
  const out = availability.map((c) => ({ ...c }));
  for (const e of exceptions) {
    const weekday = days.find((d) => d.date === e.date)?.weekday;
    if (weekday === undefined) continue;
    const at = out.findIndex((c) => c.day === weekday && c.daypart === e.daypart);
    if (at >= 0 && out[at]!.state === "BLOCKED") continue;
    const cell: AvailabilityCellInput = { day: weekday, daypart: e.daypart, state: "BLOCKED", oneOff: true };
    if (at >= 0) out[at] = cell;
    else out.push(cell);
  }
  return out;
}
```

In `scheduleInputFromDb`, add `exceptions?: ExceptionCell[]` to the args type, destructure it, and change the availability line:

```ts
  const days = weekDays(startDate, week.index, settings.timezone);
  const weekStartDay = days[0]!.weekday;
```

```ts
    availability: withExceptions(settings.availability, days, exceptions ?? []),
```

- [ ] **Step 4: Implement the views**

`src/views/schedule.ts`: add `LayoutMove`, `LayoutOption` to the type import from `~/engine/schedule`. Add a case to `phraseScheduleFact` before `default`:

```ts
    case "session_does_not_fit":
      return `${fact.sessions} sessions are left this week and only ${fact.freeDays} ${fact.freeDays === 1 ? "day is" : "days are"} open.`;
```

Append:

```ts
export interface ReplacementOptionView {
  id: string;
  kind: "lens" | "double_up" | "skip";
  title: string;
  /** "Legs: Thu → Sat". */
  moves: string[];
  /** Why the week is crowded, then the warnings this layout leaves. */
  reasons: string[];
  /** Every placement the option changes, ready for applyLayout. */
  placements: { sessionId: string; day: number; daypart: "AM" | "PM" | null }[];
  layout: Layout;
  skipped: { sessionId: string; label: string }[];
  lead: boolean;
  /** The lead was chosen by the coach (Jev), not only by engine order. */
  judged: boolean;
}

const LENS_TITLE = {
  BALANCED: "Best recovery",
  FEWEST_CHANGES: "Fewest changes",
  KEEPS_PREFERENCES: "Keeps your preferred times",
} as const;

export function moveLine(m: LayoutMove, label: (id: string) => string): string {
  return `${label(m.sessionId)}: ${m.from ? placementLabel(m.from) : "not placed"} → ${placementLabel(m.to)}`;
}

/** One engine option → what the panel shows. Every string comes from the option's own
 * lens, outcome, moves and facts (Law 2). */
export function toReplacementOptionView(
  o: LayoutOption,
  label: (id: string) => string,
  flags: { lead: boolean; judged: boolean },
): ReplacementOptionView {
  const kind = o.overflow?.kind === "double_up" ? "double_up" : o.skipped.length > 0 ? "skip" : "lens";
  const title =
    o.overflow?.kind === "double_up"
      ? `Keep every session, train twice on ${DAY_NAMES[o.overflow.day] ?? "?"}`
      : o.skipped.length > 0
        ? `Skip ${o.skipped.map(label).join(" and ")} this week`
        : LENS_TITLE[o.lens];
  return {
    id: o.id,
    kind,
    title,
    moves: o.moves.map((m) => moveLine(m, label)),
    reasons: toWarnings([...o.fit, ...o.score.facts], label),
    placements: o.moves.map((m) => ({ sessionId: m.sessionId, day: m.to.day, daypart: m.to.daypart })),
    layout: o.layout,
    skipped: o.skipped.map((sessionId) => ({ sessionId, label: label(sessionId) })),
    lead: flags.lead,
    judged: flags.judged && flags.lead,
  };
}
```

- [ ] **Step 5: Run tests, typecheck, commit**

```bash
pnpm vitest run src/server/mesocycle src/views && pnpm typecheck
git add src/server/mesocycle src/views
git commit -m "feat(schedule): overlay exceptions on availability; replacement option views"
```

---

### Task 6: Router — exceptions and replacement options

**Files:**
- Modify: `src/server/api/routers/schedule.ts`, `src/server/api/routers/schedule.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas and model; Task 2 `placeWithLens`; Task 3 `isStranded`, `isCrowded`, `proposeLayouts`; Task 4 `replacementQuestions`, `applyReplacementVerdict`; Task 5 `exceptionsFromRows`, `scheduleInputFromDb({ exceptions })`, `moveLine`, `toReplacementOptionView`, `ReplacementOptionView`; `executeJudgement` from `~/server/judgement/execute`; `dayNumberOfIsoDate`, `localDayNumber` from `~/domain/local-day`.
- Produces (tRPC, all `protectedProcedure`):
  - `schedule.setException(ExceptionInput) → { weekIndex: number; moved: string[]; needsChoice: boolean }`
  - `schedule.clearException(ExceptionInput) → { ok: true }`
  - `schedule.getReplacementOptions({ weekIndex }) → ReplacementOptionView[]`
  - `schedule.getSuggestions` returns `[]` while the week is stranded.
  - `schedule.applyLayout` accepts `origin: "replacement"`.
  - `schedule.updatePrefs` widens single-daypart exceptions to whole days when switching to `DAY`.

- [ ] **Step 1: Extend the test harness**

In `src/server/api/routers/schedule.test.ts`:

1. At the top, before the router import, add:

```ts
vi.mock("~/server/judgement/execute", () => ({ executeJudgement: vi.fn().mockResolvedValue([]) }));
import { executeJudgement } from "~/server/judgement/execute";
```

2. Add to `Opts`:

```ts
  /** One-off blocked time on the athlete's profile. */
  exceptions?: { date: Date; daypart: "AM" | "PM" }[];
  scheduleMode?: "DAY" | "HALF_DAY";
```

3. In `makeCaller`, change the profile and add delegates:

```ts
    athleteProfile: {
      id: "profile-1",
      scheduleMode: opts.scheduleMode ?? "DAY",
      timezone: opts.timezone ?? "UTC",
      availability: opts.availability ?? [],
      availabilityExceptions: opts.exceptions ?? [],
    },
```

```ts
    availabilityException: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue(opts.exceptions ?? []),
    },
```

`mesocycle.findFirst` already returns `meso` for every call, including the new ones.

- [ ] **Step 2: Write the failing tests**

Append to the same file:

```ts
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const bothHalves = (iso: string) => [
  { date: D(iso), daypart: "AM" as const },
  { date: D(iso), daypart: "PM" as const },
];

describe("setException", () => {
  it("writes both halves for a whole day under the block lock and moves nothing this week", async () => {
    const { caller, db } = makeCaller();
    const res = await caller.setException({ date: "2026-10-08", daypart: null }); // Thu, week 1 (current)
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.availabilityException.createMany).toHaveBeenCalledWith({
      data: [
        { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: "AM" },
        { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: "PM" },
      ],
      skipDuplicates: true,
    });
    expect(res).toEqual({ weekIndex: 1, moved: [], needsChoice: false });
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a day that has passed, a date outside the block, and a half-day in one-a-day mode", async () => {
    const { caller, db } = makeCaller();
    await expect(caller.setException({ date: "2026-10-06", daypart: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.setException({ date: "2026-11-02", daypart: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.setException({ date: "2026-10-04", daypart: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.setException({ date: "2026-10-08", daypart: "AM" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.availabilityException.createMany).not.toHaveBeenCalled();
  });

  it("allows today", async () => {
    const { caller } = makeCaller();
    await expect(caller.setException({ date: "2026-10-07", daypart: null })).resolves.toMatchObject({ weekIndex: 1 });
  });

  it("uses the athlete's local date: early morning in Perth is not yesterday", async () => {
    // 23:30Z on Tue 6 Oct is 07:30 on Wed 7 Oct in Perth.
    vi.setSystemTime(new Date("2026-10-06T23:30:00Z"));
    try {
      const { caller } = makeCaller({ timezone: "Australia/Perth", startDate: new Date("2026-10-04T16:00:00Z") });
      await expect(caller.setException({ date: "2026-10-07", daypart: null })).resolves.toMatchObject({ weekIndex: 1 });
      await expect(caller.setException({ date: "2026-10-06", daypart: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      vi.setSystemTime(NOW);
    }
  });

  it("returns NOT_FOUND without an active block", async () => {
    const { caller } = makeCaller({ noLock: true });
    await expect(caller.setException({ date: "2026-10-08", daypart: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("quietly re-places a future week and logs it", async () => {
    // Week 2 is Mon 12…Sun 18 Oct. s3 sits on Thu 15, which is being blocked.
    const week2 = weekRow(2, [sessionRow("s3", "wk-2", 0, "Upper A", 3), sessionRow("s4", "wk-2", 1, "Upper B", 5)]);
    const { caller, db } = makeCaller({ weeks: [weekRow(1, []), week2], exceptions: bothHalves("2026-10-15") });
    const res = await caller.setException({ date: "2026-10-15", daypart: null });
    expect(res.weekIndex).toBe(2);
    expect(res.needsChoice).toBe(false);
    expect(res.moved).toHaveLength(1);
    expect(res.moved[0]).toMatch(/^Upper A: Thu → /);
    expect(db.trainingSession.updateMany).toHaveBeenCalledTimes(1);
    expect(db.trainingSession.updateMany.mock.calls[0]![0].where).toEqual({ id: "s3", status: "SCHEDULED" });
    expect(db.decisionLog.create.mock.calls[0]![0].data).toMatchObject({ weekIndex: 2, type: "SCHEDULE", status: "APPLIED", reasoning: "exception" });
  });

  it("moves nothing in a future week that is too crowded, and says a choice is needed", async () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const week2 = weekRow(2, ids.map((id, i) => sessionRow(id, "wk-2", i, `S${i}`, i)));
    const { caller, db } = makeCaller({ weeks: [weekRow(1, []), week2], exceptions: bothHalves("2026-10-15") });
    const res = await caller.setException({ date: "2026-10-15", daypart: null });
    expect(res).toEqual({ weekIndex: 2, moved: [], needsChoice: true });
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
  });
});

describe("clearException", () => {
  it("deletes both halves for a whole day and never moves a session", async () => {
    const { caller, db } = makeCaller();
    await expect(caller.clearException({ date: "2026-10-08", daypart: null })).resolves.toEqual({ ok: true });
    expect(db.availabilityException.deleteMany).toHaveBeenCalledWith({
      where: { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: { in: ["AM", "PM"] } },
    });
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  it("succeeds when there was nothing to clear", async () => {
    const { caller, db } = makeCaller();
    db.availabilityException.deleteMany.mockResolvedValue({ count: 0 });
    await expect(caller.clearException({ date: "2026-10-08", daypart: null })).resolves.toEqual({ ok: true });
  });
});

describe("getWeekSchedule with exceptions", () => {
  it("shows the exception as a one-off blocked cell and warns about the stranded session", async () => {
    const { caller } = makeCaller({ exceptions: bothHalves("2026-10-08") }); // s1 is on Thu
    const view = await caller.getWeekSchedule({ weekIndex: 1 });
    expect(view.input.availability).toContainEqual({ day: 3, daypart: "AM", state: "BLOCKED", oneOff: true });
    expect(view.warnings.some((w) => w.includes("blocked"))).toBe(true);
  });
});

describe("getReplacementOptions", () => {
  it("returns nothing when no session is stranded", async () => {
    const { caller } = makeCaller();
    await expect(caller.getReplacementOptions({ weekIndex: 1 })).resolves.toEqual([]);
  });

  it("returns engine-ordered options with the first as lead when Jev says nothing", async () => {
    vi.mocked(executeJudgement).mockResolvedValue([]);
    const { caller } = makeCaller({ exceptions: bothHalves("2026-10-08") });
    const options = await caller.getReplacementOptions({ weekIndex: 1 });
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options[0]!.lead).toBe(true);
    expect(options.every((o) => !o.judged)).toBe(true);
    expect(options[0]!.moves.some((m) => m.startsWith("Upper A: Thu → "))).toBe(true);
  });

  it("leads with Jev's confident pick", async () => {
    const { caller } = makeCaller({
      exceptions: bothHalves("2026-10-08"),
      availability: [{ dayOfWeek: 6, daypart: "AM", state: "PREFERRED" }],
    });
    vi.mocked(executeJudgement).mockResolvedValue([]);
    const plain = await caller.getReplacementOptions({ weekIndex: 1 });
    if (plain.length < 2) return; // the fixture collapsed to one option; nothing to reorder
    const last = plain[plain.length - 1]!.id;
    vi.mocked(executeJudgement).mockResolvedValue([
      { id: "replacement_pick", kind: "choice", choice: last, confidence: 0.99, probabilities: { [last]: 0.99 } },
    ]);
    const judged = await caller.getReplacementOptions({ weekIndex: 1 });
    expect(judged[0]!.id).toBe(last);
    expect(judged[0]!.judged).toBe(true);
    vi.mocked(executeJudgement).mockResolvedValue([]);
  });

  it("falls back to engine order when the judgement throws", async () => {
    vi.mocked(executeJudgement).mockRejectedValueOnce(new Error("boom"));
    const { caller } = makeCaller({
      exceptions: bothHalves("2026-10-08"),
      availability: [{ dayOfWeek: 6, daypart: "AM", state: "PREFERRED" }],
    });
    const options = await caller.getReplacementOptions({ weekIndex: 1 });
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options.every((o) => !o.judged)).toBe(true);
  });

  it("offers nothing for a completed session on a blocked day", async () => {
    const { caller } = makeCaller({
      week1: [sessionRow("s1", "wk-1", 0, "Upper A", 3, "COMPLETED"), sessionRow("s2", "wk-1", 1, "Upper B", 5)],
      exceptions: bothHalves("2026-10-08"),
    });
    await expect(caller.getReplacementOptions({ weekIndex: 1 })).resolves.toEqual([]);
  });
});

describe("getSuggestions while stranded", () => {
  it("stays quiet so the replacement panel is the only voice", async () => {
    const { caller } = makeCaller({ exceptions: bothHalves("2026-10-08") });
    await expect(caller.getSuggestions({ weekIndex: 1 })).resolves.toEqual([]);
  });
});

describe("applyLayout with a replacement", () => {
  it("applies an accepted option and logs its origin", async () => {
    const { caller, db } = makeCaller({ exceptions: bothHalves("2026-10-08") });
    const [option] = await caller.getReplacementOptions({ weekIndex: 1 });
    await caller.applyLayout({ weekIndex: 1, placements: option!.placements, expected: SAVED, origin: "replacement" });
    const log = db.decisionLog.create.mock.calls.at(-1)![0].data;
    expect(log).toMatchObject({ type: "SCHEDULE", status: "APPLIED", reasoning: "replacement", summary: "Week re-arranged around blocked time" });
  });
});

describe("updatePrefs with exceptions", () => {
  it("widens a half-day exception to the whole day when switching to one-a-day", async () => {
    const { caller, db } = makeCaller({ scheduleMode: "HALF_DAY", exceptions: [{ date: D("2026-10-08"), daypart: "AM" }] });
    // The harness needs these delegates for updatePrefs; add them if the existing
    // updatePrefs tests build them differently and reuse that helper instead.
    Object.assign(db, {
      athleteProfile: {
        findUnique: vi.fn().mockResolvedValue({ id: "profile-1", scheduleMode: "HALF_DAY", timezone: "UTC" }),
        update: vi.fn().mockResolvedValue({}),
      },
      availabilityCell: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
    });
    Object.assign(db.mesocycle, { findUnique: vi.fn().mockResolvedValue({ startDate: START, lengthWeeks: 4 }) });
    Object.assign(db.trainingSession, { findMany: vi.fn().mockResolvedValue([]) });
    await caller.updatePrefs({ scheduleMode: "DAY", availability: [] });
    expect(db.availabilityException.createMany).toHaveBeenCalledWith({
      data: [
        { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: "AM" },
        { athleteProfileId: "profile-1", date: D("2026-10-08"), daypart: "PM" },
      ],
      skipDuplicates: true,
    });
  });
});
```

If `updatePrefs` is tested in `schedule-prefs.test.ts` with its own harness, put the last `describe` there, using that file's harness plus an `availabilityException` delegate, instead of patching `db` here.

- [ ] **Step 3: Run and watch them fail**

Run: `pnpm vitest run src/server/api/routers/schedule.test.ts`
Expected: FAIL (`setException` is not a function, and so on). Existing tests still pass.

- [ ] **Step 4: Implement**

In `src/server/api/routers/schedule.ts`:

Imports: add `isCrowded`, `isStranded`, `placeWithLens`, `proposeLayouts`, `replacementQuestions`, `applyReplacementVerdict` from `~/engine`; `ExceptionInputSchema` from `~/schema`; `exceptionsFromRows` from the adapters; `moveLine`, `toReplacementOptionView`, `type ReplacementOptionView` from `~/views/schedule`; and

```ts
import { dayNumberOfIsoDate, localDayNumber } from "~/domain/local-day";
import { executeJudgement } from "~/server/judgement/execute";
```

`loadWeekContext`: select the exceptions and pass them through.

```ts
      athleteProfile: {
        select: { id: true, scheduleMode: true, timezone: true, availability: true, availabilityExceptions: true },
      },
```

```ts
  const exceptions = exceptionsFromRows(meso.athleteProfile.availabilityExceptions);
  const input = scheduleInputFromDb({
    week,
    prevWeek: meso.weeks.find((w) => w.index === weekIndex - 1) ?? null,
    settings,
    startDate,
    exceptions,
    now,
  });
  return {
    mesocycleId: meso.id,
    athleteProfileId: meso.athleteProfile.id,
    lengthWeeks: meso.lengthWeeks,
    currentWeek: currentWeekIndex(meso.startDate, meso.lengthWeeks, now, settings.timezone),
    week,
    settings,
    startDate,
    exceptions,
    input,
    readOnly: weekIndex < currentWeekIndex(meso.startDate, meso.lengthWeeks, now, settings.timezone),
    days: weekDays(startDate, weekIndex, settings.timezone),
    label: (id: string) => week.sessions.find((s) => s.id === id)?.splitSlot ?? "Session",
  };
```

In `applyLayout`'s carry-forward loop, pass the exceptions so a carried layout cannot land on blocked time:

```ts
              const wInput = scheduleInputFromDb({ week: w, prevWeek: null, settings: c.settings, startDate: c.startDate, exceptions: c.exceptions, now });
```

In `applyLayout`'s main decision log (the one with `reasoning: input.origin`, not the carry-forward one), replace the `summary` line:

```ts
              summary:
                input.origin === "suggestion"
                  ? "Accepted a suggested move"
                  : input.origin === "replacement"
                    ? "Week re-arranged around blocked time"
                    : "Sessions moved",
```

`getSuggestions`: after the `readOnly` check add

```ts
    // A stranded session is the replacement panel's job; one voice at a time.
    if (isStranded(c.input)) return [];
```

Add a helper above the router:

```ts
/** The dayparts an exception covers. Null means the whole day. */
const daypartsOf = (daypart: "AM" | "PM" | null): ("AM" | "PM")[] => (daypart === null ? ["AM", "PM"] : [daypart]);
/** A calendar date as Prisma wants a `@db.Date`. */
const dbDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
```

Add the procedures to the router:

```ts
  // One-off blocked time. On the current week this only records the fact: the board
  // then offers options. A later week has not been trained, so it is re-placed quietly.
  setException: protectedProcedure
    .input(ExceptionInputSchema)
    .mutation(async ({ ctx, input }): Promise<{ weekIndex: number; moved: string[]; needsChoice: boolean }> => {
      const userId = ctx.session.user.id;
      const now = new Date();
      return ctx.db.$transaction(
        async (tx) => {
          if ((await lockActiveBlock(tx, userId)) === null) throw new TRPCError({ code: "NOT_FOUND" });

          // Week 1 always exists; it gives us the block's dates and the athlete's settings.
          const block = await loadWeekContext(tx, userId, 1, now);
          const tz = block.settings.timezone;
          const day = dayNumberOfIsoDate(input.date);
          const start = localDayNumber(block.startDate, tz);
          if (day < start || day >= start + block.lengthWeeks * 7) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "That date is outside your current block." });
          }
          if (day < localDayNumber(now, tz)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "That day has already passed." });
          }
          if (block.settings.mode === "DAY" && input.daypart !== null) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "You're set to one session a day, so block the whole day." });
          }

          await tx.availabilityException.createMany({
            data: daypartsOf(input.daypart).map((daypart) => ({
              athleteProfileId: block.athleteProfileId,
              date: dbDate(input.date),
              daypart,
            })),
            skipDuplicates: true,
          });

          const weekIndex = Math.floor((day - start) / 7) + 1;
          if (weekIndex <= block.currentWeek) return { weekIndex, moved: [], needsChoice: false };

          const c = await loadWeekContext(tx, userId, weekIndex, now);
          if (!isStranded(c.input)) return { weekIndex, moved: [], needsChoice: false };
          if (isCrowded(c.input)) return { weekIndex, moved: [], needsChoice: true };
          const res = placeWithLens(c.input, "FEWEST_CHANGES");
          if (res.kind !== "placed") return { weekIndex, moved: [], needsChoice: true };

          const before = savedLayout(c.input);
          const changed = Object.fromEntries(
            Object.entries(res.layout).filter(([id, p]) => !samePlacement(before[id] ?? null, p)),
          );
          const written = await applyLayoutToDb(tx, changed, { onlyScheduled: true });
          if (written !== Object.keys(changed).length) {
            throw new TRPCError({ code: "CONFLICT", message: "A session changed while we were re-arranging that week. Please try again." });
          }
          await tx.decisionLog.create({
            data: {
              mesocycleId: c.mesocycleId,
              weekIndex,
              type: "SCHEDULE",
              status: "APPLIED",
              summary: "Week re-arranged around blocked time",
              reasoning: "exception",
              payload: asJson({
                origin: "exception",
                lens: "FEWEST_CHANGES",
                before,
                after: res.layout,
                facts: scoreLayout(c.input, res.layout).facts,
              }),
            },
          });
          return {
            weekIndex,
            moved: Object.entries(changed).map(([sessionId, to]) =>
              moveLine({ sessionId, from: before[sessionId] ?? null, to }, c.label),
            ),
            needsChoice: false,
          };
        },
        { timeout: 15000 },
      );
    }),

  // Unblocking never moves a session back; the athlete or a suggestion can.
  clearException: protectedProcedure.input(ExceptionInputSchema).mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
    const userId = ctx.session.user.id;
    await ctx.db.$transaction(
      async (tx) => {
        if ((await lockActiveBlock(tx, userId)) === null) throw new TRPCError({ code: "NOT_FOUND" });
        const block = await loadWeekContext(tx, userId, 1, new Date());
        await tx.availabilityException.deleteMany({
          where: {
            athleteProfileId: block.athleteProfileId,
            date: dbDate(input.date),
            daypart: { in: block.settings.mode === "DAY" ? ["AM", "PM"] : daypartsOf(input.daypart) },
          },
        });
      },
      { timeout: 15000 },
    );
    return { ok: true };
  }),

  // Read: ways to re-arrange a week in which a session is standing on blocked time.
  // Mutates nothing. The engine's order stands unless a confident verdict says otherwise;
  // the judgement is best-effort, so any failure degrades to the engine's order.
  getReplacementOptions: protectedProcedure
    .input(WeekInput)
    .query(async ({ ctx, input }): Promise<ReplacementOptionView[]> => {
      const c = await loadWeekContext(ctx.db, ctx.session.user.id, input.weekIndex, new Date());
      if (c.readOnly || !isStranded(c.input)) return [];
      const options = proposeLayouts(c.input);
      if (options.length === 0) return [];

      let ordered = { options, judged: false };
      if (options.length > 1) {
        try {
          const verdicts = await executeJudgement({
            db: ctx.db,
            mesocycleId: c.mesocycleId,
            request: replacementQuestions(options, c.input, c.label),
            fallback: { lead: options[0]!.id },
          });
          ordered = applyReplacementVerdict(options, verdicts);
        } catch {
          ordered = { options, judged: false };
        }
      }
      return ordered.options.map((o, i) => toReplacementOptionView(o, c.label, { lead: i === 0, judged: ordered.judged }));
    }),
```

`updatePrefs`: inside the `if (input.scheduleMode === "DAY")` branch, after the `updateMany` that clears dayparts, add:

```ts
              // One-a-day has no half-days, so a half-day exception becomes the whole day.
              const partial = await tx.availabilityException.findMany({
                where: { athleteProfileId: profile.id },
                select: { date: true },
              });
              if (partial.length > 0) {
                await tx.availabilityException.createMany({
                  data: partial.flatMap((e) =>
                    (["AM", "PM"] as const).map((daypart) => ({ athleteProfileId: profile.id, date: e.date, daypart })),
                  ),
                  skipDuplicates: true,
                });
              }
```

Dedupe `partial` by date before building `data` if the test's expected `data` (one AM and one PM row per date) requires it:

```ts
              const dates = [...new Map(partial.map((e) => [e.date.toISOString(), e.date])).values()];
```

and build `data` from `dates`.

Note: `executeJudgement`'s `db` parameter is typed as `JudgementDb`. `session.ts` passes `ctx.db` the same way; mirror whatever cast or typing it uses.

- [ ] **Step 5: Run the router tests, the whole suite, typecheck and lint**

Run: `pnpm vitest run && pnpm typecheck && pnpm lint`
Expected: all PASS, lint 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers
git commit -m "feat(schedule): set and clear one-off blocked time; replacement options endpoint"
```

---

### Task 7: Board — block toggles and the replacement panel

**Files:**
- Create: `src/components/schedule/exceptions.ts`, `src/components/schedule/exceptions.test.ts`, `src/components/schedule/replacement-panel.tsx`
- Modify: `src/components/schedule/schedule-board.tsx`, `src/components/schedule/session-chip.tsx`

**Interfaces:**
- Consumes: `api.schedule.setException`, `clearException`, `getReplacementOptions`; `ReplacementOptionView`; `RescheduleDialog` from `~/components/block/reschedule-dialog` (`{ sessionId, open, onClose }`); `ScheduleInput`, `dayIndex`, `cellState`.
- Produces:

```ts
// exceptions.ts
export type BlockState = "open" | "one_off" | "standing" | "past";
export function blockState(input: ScheduleInput, day: number, daypart: "AM" | "PM" | null): BlockState;
```

- [ ] **Step 1: Write the failing test**

`src/components/schedule/exceptions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeInput } from "~/engine/_fixtures/schedule";
import { blockState } from "./exceptions";

const oneOff = (day: number, daypart: "AM" | "PM") => ({ day, daypart, state: "BLOCKED" as const, oneOff: true });
const standing = (day: number, daypart: "AM" | "PM") => ({ day, daypart, state: "BLOCKED" as const });

describe("blockState", () => {
  it("is past before the first open day, whatever else is true", () => {
    const input = makeInput({ firstOpenDay: 2, availability: [oneOff(0, "AM"), oneOff(0, "PM")] });
    expect(blockState(input, 0, null)).toBe("past");
    expect(blockState(input, 2, null)).toBe("open");
  });

  it("counts the rolling week from its start day", () => {
    // Week starts Wednesday (2); Monday (0) is index 5.
    const input = makeInput({ weekStartDay: 2, firstOpenDay: 3 });
    expect(blockState(input, 2, null)).toBe("past");
    expect(blockState(input, 0, null)).toBe("open");
  });

  it("a whole day is one-off only when both halves are one-off", () => {
    expect(blockState(makeInput({ availability: [oneOff(3, "AM"), oneOff(3, "PM")] }), 3, null)).toBe("one_off");
    expect(blockState(makeInput({ availability: [oneOff(3, "AM")] }), 3, null)).toBe("open");
  });

  it("a whole day blocked partly by the standing grid is standing", () => {
    expect(blockState(makeInput({ availability: [standing(3, "AM"), oneOff(3, "PM")] }), 3, null)).toBe("standing");
    expect(blockState(makeInput({ availability: [standing(3, "AM"), standing(3, "PM")] }), 3, null)).toBe("standing");
  });

  it("reads a half-day on its own", () => {
    const input = makeInput({ mode: "HALF_DAY", availability: [oneOff(3, "PM"), standing(4, "AM")] });
    expect(blockState(input, 3, "PM")).toBe("one_off");
    expect(blockState(input, 3, "AM")).toBe("open");
    expect(blockState(input, 4, "AM")).toBe("standing");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm vitest run src/components/schedule/exceptions.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helper**

`src/components/schedule/exceptions.ts`:

```ts
import { dayIndex, type ScheduleInput } from "~/engine/schedule";

/** What a "Can't train" control should show for a day (daypart null) or a half-day. */
export type BlockState = "open" | "one_off" | "standing" | "past";

export function blockState(input: ScheduleInput, day: number, daypart: "AM" | "PM" | null): BlockState {
  if (dayIndex(day, input.weekStartDay) < input.firstOpenDay) return "past";
  const cells = (daypart === null ? (["AM", "PM"] as const) : [daypart]).map((dp) =>
    input.availability.find((c) => c.day === day && c.daypart === dp),
  );
  const blocked = cells.filter((c) => c?.state === "BLOCKED");
  if (blocked.length < cells.length) return "open";
  return blocked.every((c) => c!.oneOff === true) ? "one_off" : "standing";
}
```

- [ ] **Step 4: Build the panel**

`src/components/schedule/replacement-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { RescheduleDialog } from "~/components/block/reschedule-dialog";
import { api } from "~/trpc/react";
import type { ReplacementOptionView } from "~/views/schedule";

/** Ways to re-arrange a week in which a session is standing on blocked time. Renders
 * nothing when the engine has no options. Every change is the athlete's tap: an option
 * is applied on Accept, and a skip goes through the missed-session dialog first. */
export function ReplacementPanel({
  weekIndex,
  disabled,
  onAccept,
  onShow,
}: {
  weekIndex: number;
  /** A drag draft is open, or a save is in flight. */
  disabled: boolean;
  onAccept: (option: ReplacementOptionView) => void;
  onShow: (option: ReplacementOptionView) => void;
}) {
  const utils = api.useUtils();
  const query = api.schedule.getReplacementOptions.useQuery({ weekIndex });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<string | null>(null);

  const options = query.data ?? [];
  // Dismissal is for exactly these options; a change in blocked time brings the panel back.
  const signature = JSON.stringify(options.map((o) => [o.id, o.placements, o.skipped.map((s) => s.sessionId)]));
  if (options.length === 0 || dismissed === signature) return null;

  return (
    <div
      className="rounded-card border-accent bg-selection flex flex-col gap-3 border p-4"
      role="region"
      aria-label="Ways to re-arrange this week"
    >
      <div>
        <div className="text-accent text-[12px] font-medium">You&rsquo;ve blocked time this week</div>
        <div className="text-card-title text-fg mt-1">
          {options.length === 1 ? "Here is how the week could go." : "Here are a few ways the week could go."}
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {options.map((o) => (
          <li key={o.id} className="rounded-control border-border-subtle bg-surface-raised flex flex-col gap-2 border p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-nav text-fg font-medium">{o.title}</span>
              {o.lead ? (
                <span className="text-accent text-[12px] font-medium">{o.judged ? "Coach’s pick" : "Suggested"}</span>
              ) : null}
            </div>
            {o.moves.length > 0 ? (
              <ul className="text-nav text-fg-soft flex flex-col gap-0.5">
                {o.moves.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
            {o.reasons.length > 0 ? (
              <ul className="text-fg-muted flex flex-col gap-0.5 text-[12px]">
                {o.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
            <div className="flex items-center gap-3">
              {o.kind === "skip" ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setSkipping(o.skipped[0]!.sessionId)}
                  className="rounded-control bg-accent text-nav hover:bg-accent-strong px-3 py-1.5 font-medium text-white transition-colors disabled:opacity-60"
                >
                  Skip {o.skipped[0]!.label}…
                </button>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onAccept(o)}
                  className="rounded-control bg-accent text-nav hover:bg-accent-strong px-3 py-1.5 font-medium text-white transition-colors disabled:opacity-60"
                >
                  Accept
                </button>
              )}
              {o.kind !== "skip" && o.moves.length > 0 ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onShow(o)}
                  className="text-nav text-fg-muted hover:text-fg transition-colors disabled:opacity-60"
                >
                  Show on board
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setDismissed(signature)}
        className="text-nav text-fg-muted hover:text-fg self-start transition-colors"
      >
        I&rsquo;ll arrange it myself
      </button>
      {skipping !== null ? (
        <RescheduleDialog
          sessionId={skipping}
          open
          onClose={() => {
            setSkipping(null);
            // The session may now be missed: the week and its options are different.
            void utils.schedule.invalidate();
          }}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Wire the board**

`src/components/schedule/session-chip.tsx`: add an optional prop and a button.

```tsx
  onCantMake,
}: {
  // …existing props…
  /** Block this session's day or half-day for this week. Absent when not offered. */
  onCantMake?: () => void;
}) {
```

After the `select` block, inside the outer `div`:

```tsx
      {draggable && onCantMake ? (
        <button
          type="button"
          onClick={onCantMake}
          className="text-fg-muted hover:text-fg mt-1 text-[12px] transition-colors"
        >
          Can&rsquo;t make this
        </button>
      ) : null}
```

`src/components/schedule/schedule-board.tsx`:

1. Imports: `blockState` from `./exceptions`; `ReplacementPanel` from `./replacement-panel`; `type ReplacementOptionView` from `~/views/schedule`.

2. Mutations, next to `apply`:

```tsx
  const onExceptionChange = async () => {
    await utils.schedule.invalidate();
    router.refresh();
  };
  const setException = api.schedule.setException.useMutation({
    onSuccess: async (res) => {
      await onExceptionChange();
      setNotice(
        res.moved.length > 0
          ? { text: `Re-arranged: ${res.moved.join(", ")}.`, availabilityLink: false }
          : null,
      );
    },
    onError: (err) => setNotice({ text: err.message, availabilityLink: false }),
  });
  const clearException = api.schedule.clearException.useMutation({
    onSuccess: onExceptionChange,
    onError: (err) => setNotice({ text: err.message, availabilityLink: false }),
  });
```

3. After `const editable = …`:

```tsx
  // Blocked time is saved straight away, so it cannot be mixed with an unsaved drag.
  const canBlock =
    editable && draft === null && !setException.isPending && !clearException.isPending;
  const dateOf = (weekday: number) =>
    data.days.find((d) => d.weekday === weekday)!.date;

  function toggleBlock(weekday: number, daypart: "AM" | "PM" | null) {
    const state = blockState(data.input, weekday, daypart);
    if (state === "open") setException.mutate({ date: dateOf(weekday), daypart });
    else if (state === "one_off") clearException.mutate({ date: dateOf(weekday), daypart });
  }
```

4. Add a small control component above `Cell`:

```tsx
function BlockToggle({
  state,
  label,
  disabled,
  onToggle,
}: {
  state: "open" | "one_off";
  label: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={state === "one_off"}
      aria-label={state === "one_off" ? `Unblock ${label}` : `Can’t train ${label}`}
      disabled={disabled}
      onClick={onToggle}
      className="text-fg-muted hover:text-fg text-[11px] transition-colors disabled:opacity-50"
    >
      {state === "one_off" ? "Undo" : "Can’t train"}
    </button>
  );
}
```

5. Day headers: replace the header `div` body so each day carries its toggle.

```tsx
            {data.days.map((d) => {
              const state = blockState(data.input, d.weekday, null);
              return (
                <div key={d.date} className="text-fg-subtle flex items-baseline justify-between gap-1 px-1 text-[12px]">
                  <span>
                    <span className="text-fg-soft font-medium">{DAY_NAMES[d.weekday]}</span>{" "}
                    {Number(d.date.slice(8))}
                  </span>
                  {!data.readOnly && (state === "open" || state === "one_off") ? (
                    <BlockToggle
                      state={state}
                      label={DAY_NAMES[d.weekday]!}
                      disabled={!canBlock}
                      onToggle={() => toggleBlock(d.weekday, null)}
                    />
                  ) : null}
                </div>
              );
            })}
```

6. `Cell`: add props `note?: string` and `toggle?: React.ReactNode`, and render them in the header row. Change the header condition to `showHalf || blocked || toggle` and add inside the row, after the ✕:

```tsx
          {note ? <span className="text-fg-subtle text-[11px]">{note}</span> : null}
          {toggle ? <span className="ml-auto">{toggle}</span> : null}
```

At the call site compute the half-day state and pass it:

```tsx
                const half = daypart === null ? null : blockState(data.input, d.weekday, daypart);
                const oneOff =
                  blockState(data.input, d.weekday, daypart) === "one_off";
```

```tsx
                    note={oneOff ? "this week" : undefined}
                    toggle={
                      !data.readOnly && half !== null && (half === "open" || half === "one_off") ? (
                        <BlockToggle
                          state={half}
                          label={`${DAY_NAMES[d.weekday]} ${daypart}`}
                          disabled={!canBlock}
                          onToggle={() => toggleBlock(d.weekday, daypart)}
                        />
                      ) : undefined
                    }
```

7. Chip: pass `onCantMake` for a placed, movable session whose cell is open.

```tsx
    const at = data.layout[id];
    const canFlag =
      canBlock && !session.locked && at !== undefined && blockState(data.input, at.day, at.daypart) === "open";
```

```tsx
        onCantMake={canFlag && at ? () => toggleBlock(at.day, at.daypart) : undefined}
```

8. Widen `confirm` to take the new origin and optional placements:

```tsx
  function confirm(next: Layout, origin: "athlete" | "suggestion" | "replacement") {
```

(the body is unchanged.)

9. Panel handlers:

```tsx
  function acceptOption(o: ReplacementOptionView) {
    confirm({ ...data.layout, ...Object.fromEntries(o.placements.map((p) => [p.sessionId, { day: p.day, daypart: p.daypart }])) }, "replacement");
  }

  function showOption(o: ReplacementOptionView) {
    setNotice(null);
    startOrUpdateDraft({
      ...data.layout,
      ...Object.fromEntries(o.placements.map((p) => [p.sessionId, { day: p.day, daypart: p.daypart }])),
    });
  }
```

10. Render the panel in the non-draft branch, above the warnings list, and keep `SuggestionCard` (it renders nothing while the week is stranded because the server returns `[]`):

```tsx
          {!data.readOnly ? (
            <ReplacementPanel
              weekIndex={weekIndex}
              disabled={!editable || setException.isPending || clearException.isPending}
              onAccept={acceptOption}
              onShow={showOption}
            />
          ) : null}
```

- [ ] **Step 6: Run everything**

Run: `pnpm vitest run && pnpm typecheck && pnpm lint`
Expected: all PASS, lint 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/schedule
git commit -m "feat(schedule): block time from the board and choose how the week is re-arranged"
```

---

### Task 8: Product record and browser verification

**Files:**
- Modify: `PRODUCT.md`

- [ ] **Step 1: Record the feature**

In `PRODUCT.md`, in the section where scheduling is recorded as present, add one paragraph in the document's existing voice stating: athletes can block a day or half-day on a specific date without changing their standing availability; the engine then offers up to three ways to re-arrange the week (best recovery, fewest changes, keeps preferred times), or, when the week is too crowded, a choice between skipping a session and (in AM/PM mode) doubling up; the coach model may choose which option leads but cannot create or change one; nothing moves without the athlete's tap, except a not-yet-started later week, which is re-arranged immediately and logged.

- [ ] **Step 2: Full check**

Run: `pnpm vitest run && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add PRODUCT.md
git commit -m "docs(product): record blocked time and week re-placement"
```

- [ ] **Step 4: Browser verification (controller, with the product owner signed in)**

With `pnpm dev` running, on `/app/block/week/<current>`:

1. One-a-day mode: press "Can't train" on a day holding a scheduled session. The cell shows ✕ and "this week"; the panel appears with at least one option whose moves name that session.
2. "Show on board" loads the option as a draft; Discard returns to the saved layout.
3. Accept applies the option; the panel disappears; the block's decision log has a `SCHEDULE` entry with reasoning `replacement`.
4. "Undo" on the blocked day clears it and nothing moves.
5. "Can't make this" on a chip blocks that chip's day.
6. Block days until the week is crowded: only skip options appear. "Skip …" opens the missed-session dialog; accepting it returns to the board with fresh options.
7. Switch to AM/PM in Settings, repeat step 6: a "train twice on …" option leads.
8. Open a later week, block a day holding a session: a notice lists what moved, and the board shows the new layout.
9. A past day has no toggle; a finished week has none at all.
10. Keyboard only: tab to a toggle, press Space, tab to an option's Accept, press Enter.

Report each item as pass or fail with what was seen. Do not sign in on the product owner's behalf.
