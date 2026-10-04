# Schedule Foundation and Drag-and-Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every training session a placement (weekday, optional AM/PM), let the athlete drag sessions around a week board, and have the engine warn about and suggest fixes for recovery problems.

**Architecture:** One pure engine module (`src/engine/schedule.ts`) owns hard rules (`checkLayout`), scoring (`scoreLayout`), auto-placement (`placeWeek`) and suggestions (`suggestMoves`). Server adapters rebuild its input from Postgres; a new `schedule` tRPC router is the only writer of placements. The browser imports the same pure module to score drafts instantly, and the server re-validates on every write.

**Tech Stack:** Next.js 15 App Router, tRPC 11, Prisma 6 (Postgres, `prisma db push`, no migrations folder), Zod, Vitest 4 + fast-check, Tailwind v4 tokens from `app-shell-kit`, `@dnd-kit/core` (new).

**Spec:** `docs/superpowers/specs/2026-10-04-schedule-foundation-dnd-design.md`

## Global Constraints

- **Law 1:** nothing in this feature changes a set count, rep target, RIR or muscle volume. Prescriptions are read only to build fatigue footprints.
- **Law 2:** every warning and suggestion shown to the athlete is phrased from a `DecisionFact` the engine emitted. No model calls in this slice.
- **Engine purity:** `src/engine/schedule.ts` has no I/O, no `Date.now()`, no randomness. Same input, same output.
- **Vocabulary:** time unit is a **daypart** (`AM` | `PM`); a session's position is a **placement** `{ day, daypart }`; a week's placements are a **layout**. Never call these "slot" (that word already means a split position: `slotId`, `splitSlot`). "Reschedule" keeps meaning set redistribution.
- **Day numbering:** `day` / `dayOfWeek` is always `0 = Mon … 6 = Sun`.
- **Weeks are rolling:** week N covers the athlete's local calendar dates `start + 7(N−1)` to `start + 7(N−1) + 6`. A week's first column is the block's start weekday, not Monday.
- **Athlete drags are recorded, not gated.** Engine suggestions are applied only when the athlete presses Accept.
- **Preference changes never move a session's day.**
- **Package manager:** `pnpm`. Tests: `pnpm vitest run <path>`. Types and lint: `pnpm check`.
- **Database:** schema changes go through `pnpm db:push` (additive only in this plan), which also regenerates the client into `generated/prisma`.
- **Branch:** `freddy/feat/schedule-foundation`, branched from `freddy/experimental`. Do not push. Merge happens after the athlete's visual sign-off.
- **Commits:** one per task, `feat(schedule): …` / `test(schedule): …` / `docs: …`.
- **Visual work:** read `DESIGN.md` before touching UI. Flat surfaces, accent (`#0092ff`) only at decision moments, `zone-*` colours are for training data only and never for status chrome.

## Refinements to the spec made while planning

These are already written back into the spec; they are listed so reviewers know they are deliberate.

1. **Swaps.** Dropping a session on an occupied placement swaps the two sessions. `suggestMoves` considers swaps as well as moves. Without this, a 7-day athlete in Day mode has no empty cell and can never rearrange.
2. **`placeWeek` algorithm.** Greedy construction followed by local search over the same move/swap neighbourhood `suggestMoves` uses, instead of branch-and-bound. It is deterministic, fast enough to run in the browser, and guarantees by construction that a freshly placed week yields no suggestion.
3. **Timezone.** `AthleteProfile.timezone` (IANA name, default `"UTC"`). Availability is keyed by weekday, so the server must know which weekday the athlete's dates fall on.
4. **`firstOpenDay`.** The "not in the past" rule works on whole days (today is open), named `firstOpenDay` rather than `firstOpenPosition`.
5. **Day → AM/PM switch.** A session gets PM when only PM is Preferred, or when AM is Blocked and PM is not; otherwise AM.
6. **Keyboard.** The keyboard path is each chip's "Move to…" menu. The dnd-kit keyboard sensor is not used (its free-pixel movement is poor on a grid).

## Review Focus

1. **Athlete outside UTC.** Someone in Sydney opening the board at 09:00 Wednesday local must see Wednesday as today, with Wednesday's availability. Pinned in Task 5 (`local-day.test.ts`, `schedule-adapters.test.ts`).
2. **A full week.** Seven sessions in Day mode leaves no empty cell; rearranging must still work through swaps. Pinned in Task 4 (`suggestMoves` swap test) and Task 11 (`draft.test.ts`).
3. **Availability that leaves too few open cells.** Onboarding must still create the block, with those weeks unplaced, and the board must offer the Unplaced tray. Pinned in Task 4 (infeasible), Task 5 (`placePlanWeeks` returns `null`), Task 6 (persist writes `null`).
4. **A week that starts mid-week.** In a Wed…Tue week, Tuesday and Wednesday are six days apart, not adjacent. Pinned in Task 3.
5. **Locked sessions left in an old shape.** A completed session with no daypart after switching to AM/PM, or two completed sessions on one day after switching to Day, must not make every later move in that week fail. Pinned in Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | New enums, `AvailabilityCell`, `TrainingSession.daypart`, `AthleteProfile.scheduleMode` + `timezone`, `DecisionType.SCHEDULE`. |
| `src/schema/enums.ts`, `src/schema/schedule.ts` | Zod enums and input contracts for placements, availability, prefs, apply. |
| `src/domain/local-day.ts` | Pure timezone-aware calendar-day maths. |
| `src/engine/schedule.ts` | Types, positions, footprints, hard rules, scoring, placement, suggestions. |
| `src/engine/constants.ts`, `src/engine/facts.ts` | Scoring weights; new `DecisionFact` variants. |
| `src/server/mesocycle/schedule-adapters.ts` | DB ⇄ engine: `scheduleInputFromDb`, `applyLayoutToDb`, `placePlanWeeks`, week dates. |
| `src/server/mesocycle/persist.ts` | Places sessions at block creation. |
| `src/server/api/routers/schedule.ts` | Reads, the single placement write, dismissals, prefs. |
| `src/views/schedule.ts` | View types and deterministic phrasing of schedule facts. |
| `src/views/types.ts`, `src/server/views/to-mesocycle-view.ts`, `src/views/next-session.ts` | Placement on `SessionView`, placement ordering, week dates. |
| `src/components/schedule/draft.ts` | Pure drop/swap/diff logic for the board. |
| `src/components/schedule/availability.ts` | Pure availability-grid cycling. |
| `src/components/schedule/*.tsx` | Board, chip, draft bar, suggestion card, availability grid, prefs form. |
| `prisma/backfill-schedule.ts` | One-off placement of existing blocks. |

---

### Task 1: Schema, enums and input contracts

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/schema/enums.ts`, `src/schema/index.ts`, `src/schema/prisma-parity.test.ts`
- Create: `src/domain/local-day.ts` (only `isValidTimeZone` in this task)
- Create: `src/schema/schedule.ts`
- Test: `src/schema/schedule.test.ts`

**Interfaces:**
- Produces (from `~/schema`): `ScheduleModeEnum`, `DaypartEnum`, `AvailabilityStateEnum`, types `ScheduleMode = "DAY" | "HALF_DAY"`, `Daypart = "AM" | "PM"`, `AvailabilityState = "PREFERRED" | "BLOCKED"`; `PlacementSchema`, `AvailabilityInputSchema`, `TimezoneSchema`, `SchedulePrefsInputSchema`, `ApplyLayoutInputSchema`.
- Produces (from `~/domain/local-day`): `isValidTimeZone(tz: string): boolean`.

- [ ] **Step 1: Create the branch**

```bash
git checkout freddy/experimental && git checkout -b freddy/feat/schedule-foundation
```

- [ ] **Step 2: Edit `prisma/schema.prisma`**

Add after `enum DecisionStatus { … }`:

```prisma
enum ScheduleMode {
  DAY
  HALF_DAY
}

enum Daypart {
  AM
  PM
}

enum AvailabilityState {
  PREFERRED
  BLOCKED
}
```

In `enum DecisionType`, add `SCHEDULE` after `MANUAL_ADJUST`.

In `model AthleteProfile`, after the `experience` line add:

```prisma
  scheduleMode  ScheduleMode    @default(DAY)
  timezone      String          @default("UTC") // IANA name, e.g. "Australia/Sydney"
```

and in its relation list add `availability AvailabilityCell[]`.

In `model TrainingSession`, after the `dayOfWeek` line add:

```prisma
  daypart           Daypart? // null = placed in DAY mode (or not placed)
```

Add after `model MuscleLandmark { … }`:

```prisma
/// One cell of the athlete's standing weekly availability. Sparse: no row = Available.
/// Always stored at AM/PM resolution, whatever the schedule mode.
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

- [ ] **Step 3: Push the schema and regenerate the client**

Run: `pnpm db:push`
Expected: "Your database is now in sync with your Prisma schema" and "Generated Prisma Client". All changes are additive (new enums, a new table, two defaulted columns, one nullable column); if Prisma warns about data loss, stop and report.

- [ ] **Step 4: Write the failing tests**

In `src/schema/prisma-parity.test.ts` add three rows to `PAIRS` after the `DecisionStatus` row:

```ts
  ["ScheduleMode", Prisma.ScheduleMode, Domain.ScheduleModeEnum.options],
  ["Daypart", Prisma.Daypart, Domain.DaypartEnum.options],
  ["AvailabilityState", Prisma.AvailabilityState, Domain.AvailabilityStateEnum.options],
```

Create `src/schema/schedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ApplyLayoutInputSchema,
  AvailabilityInputSchema,
  PlacementSchema,
  SchedulePrefsInputSchema,
  TimezoneSchema,
} from "./schedule";

describe("schedule schemas", () => {
  it("accepts a day-only and a half-day placement", () => {
    expect(PlacementSchema.parse({ day: 0, daypart: null })).toEqual({ day: 0, daypart: null });
    expect(PlacementSchema.parse({ day: 6, daypart: "PM" })).toEqual({ day: 6, daypart: "PM" });
  });

  it("rejects a day outside 0–6", () => {
    expect(PlacementSchema.safeParse({ day: 7, daypart: null }).success).toBe(false);
    expect(PlacementSchema.safeParse({ day: -1, daypart: null }).success).toBe(false);
  });

  it("rejects duplicate availability cells", () => {
    const dup = [
      { day: 1, daypart: "AM", state: "BLOCKED" },
      { day: 1, daypart: "AM", state: "PREFERRED" },
    ];
    expect(AvailabilityInputSchema.safeParse(dup).success).toBe(false);
  });

  it("accepts real timezones and rejects invented ones", () => {
    expect(TimezoneSchema.safeParse("Australia/Sydney").success).toBe(true);
    expect(TimezoneSchema.safeParse("UTC").success).toBe(true);
    expect(TimezoneSchema.safeParse("Mars/Olympus").success).toBe(false);
    expect(TimezoneSchema.safeParse("").success).toBe(false);
  });

  it("prefs default availability to empty", () => {
    expect(SchedulePrefsInputSchema.parse({ scheduleMode: "DAY" }).availability).toEqual([]);
  });

  it("apply input defaults carryForward to false", () => {
    const parsed = ApplyLayoutInputSchema.parse({
      weekIndex: 1,
      placements: [{ sessionId: "s1", day: 2, daypart: null }],
      expected: [{ sessionId: "s1", placement: null }],
      origin: "athlete",
    });
    expect(parsed.carryForward).toBe(false);
  });

  it("apply input rejects an unknown origin", () => {
    expect(
      ApplyLayoutInputSchema.safeParse({ weekIndex: 1, placements: [], expected: [], origin: "coach" }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `pnpm vitest run src/schema/schedule.test.ts src/schema/prisma-parity.test.ts`
Expected: FAIL. `schedule.test.ts` cannot resolve `./schedule`; parity fails on `Domain.ScheduleModeEnum` being undefined.

- [ ] **Step 6: Implement**

Append to `src/schema/enums.ts`, and add `"SCHEDULE"` to the end of `DecisionTypeEnum`'s array:

```ts
export const ScheduleModeEnum = z.enum(["DAY", "HALF_DAY"]);
export type ScheduleMode = z.infer<typeof ScheduleModeEnum>;

export const DaypartEnum = z.enum(["AM", "PM"]);
export type Daypart = z.infer<typeof DaypartEnum>;

export const AvailabilityStateEnum = z.enum(["PREFERRED", "BLOCKED"]);
export type AvailabilityState = z.infer<typeof AvailabilityStateEnum>;
```

Create `src/domain/local-day.ts`:

```ts
/** True when `tz` is an IANA timezone this runtime knows. */
export function isValidTimeZone(tz: string): boolean {
  if (tz.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
```

Create `src/schema/schedule.ts`:

```ts
import { z } from "zod";
import { isValidTimeZone } from "~/domain/local-day";
import { AvailabilityStateEnum, DaypartEnum, ScheduleModeEnum } from "./enums";

const DaySchema = z.number().int().min(0).max(6); // 0 = Mon … 6 = Sun

/** Where a session sits. `daypart` is null in DAY mode. */
export const PlacementSchema = z.object({ day: DaySchema, daypart: DaypartEnum.nullable() });

export const AvailabilityCellSchema = z.object({
  day: DaySchema,
  daypart: DaypartEnum,
  state: AvailabilityStateEnum,
});

/** Sparse grid: a cell that is absent is Available. At most one entry per cell. */
export const AvailabilityInputSchema = z
  .array(AvailabilityCellSchema)
  .max(14)
  .refine((cells) => new Set(cells.map((c) => `${c.day}:${c.daypart}`)).size === cells.length, {
    message: "Each availability cell may appear only once.",
  });

export const TimezoneSchema = z.string().max(64).refine(isValidTimeZone, { message: "Unknown timezone." });

export const SchedulePrefsInputSchema = z.object({
  scheduleMode: ScheduleModeEnum,
  availability: AvailabilityInputSchema.default([]),
});
export type SchedulePrefsInput = z.infer<typeof SchedulePrefsInputSchema>;

export const ApplyLayoutInputSchema = z.object({
  weekIndex: z.number().int().min(1),
  /** The placements the athlete wants. Sessions left out keep their saved placement. */
  placements: z.array(z.object({ sessionId: z.string(), day: DaySchema, daypart: DaypartEnum.nullable() })).max(14),
  /** The saved placements the client started from, one entry per session in the week. */
  expected: z.array(z.object({ sessionId: z.string(), placement: PlacementSchema.nullable() })).max(14),
  carryForward: z.boolean().default(false),
  origin: z.enum(["athlete", "suggestion"]),
});
export type ApplyLayoutInput = z.infer<typeof ApplyLayoutInputSchema>;
```

Add to `src/schema/index.ts`:

```ts
export * from "./schedule";
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm vitest run src/schema`
Expected: PASS, including "covers every domain enum exported".

- [ ] **Step 8: Typecheck and fix fixtures**

Run: `pnpm typecheck`
Expected: errors only in test fixtures that build a `TrainingSession` literal typed against a Prisma payload (likely `src/server/views/to-mesocycle-view.test.ts` and `src/server/mesocycle/reschedule-adapters.test.ts`). In each flagged session literal add `daypart: null,` next to `dayOfWeek`. Re-run until clean.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma src/schema src/domain/local-day.ts src/server
git commit -m "feat(schedule): schema, enums and input contracts for placements and availability"
```

---

### Task 2: Engine types, positions, footprints and hard rules

**Files:**
- Create: `src/engine/schedule.ts`, `src/engine/_fixtures/schedule.ts`
- Test: `src/engine/schedule.test.ts`

**Interfaces:**
- Consumes: `Daypart`, `ScheduleMode`, `MuscleGroup` from `~/schema`; `computeVolume`, `round1`, `ALL_MUSCLES` from `./util`; `ExerciseDef` from `~/domain/exercise-library`.
- Produces (all exported from `~/engine/schedule`):

```ts
interface Placement { day: number; daypart: Daypart | null }
type Layout = Record<string, Placement>;                 // sessionId → placement
type Footprint = Partial<Record<MuscleGroup, number>>;   // stimulus sets per muscle
interface ScheduleSession { id: string; order: number; footprint: Footprint; locked: boolean; placement: Placement | null }
interface AvailabilityCellInput { day: number; daypart: Daypart; state: "PREFERRED" | "BLOCKED" }
interface CarryIn { footprint: Footprint; halfDaysBeforeWeekStart: number }
interface ScheduleInput { mode: ScheduleMode; weekStartDay: number; sessions: ScheduleSession[]; availability: AvailabilityCellInput[]; carryIn: CarryIn[]; firstOpenDay: number }
type HardViolationKind = "blocked_cell" | "occupied" | "day_limit" | "in_past" | "locked" | "mode_mismatch" | "unknown_session";
interface HardViolation { kind: HardViolationKind; sessionId: string }

dayIndex(day: number, weekStartDay: number): number                 // 0..6 within the rolling week
placementPosition(p: Placement, weekStartDay: number): number       // 0..13, half-days from week start
samePlacement(a: Placement | null | undefined, b: Placement | null | undefined): boolean
allCells(mode: ScheduleMode): Placement[]
cellKey(p: Placement, mode: ScheduleMode): string
cellState(availability: AvailabilityCellInput[], mode: ScheduleMode, p: Placement): "PREFERRED" | "AVAILABLE" | "BLOCKED"
openCells(input: ScheduleInput): Placement[]                        // not Blocked, not past, in position order
daypartForDay(availability: AvailabilityCellInput[], day: number): Daypart
footprintOf(prescriptions: { exerciseName: string; sets: number }[], library: ExerciseDef[]): Footprint
savedLayout(input: ScheduleInput): Layout
layoutKey(layout: Layout): string
checkLayout(input: ScheduleInput, layout: Layout): HardViolation[]
```

`ScheduleSession.placement` is the placement currently saved in the database. `checkLayout` treats a session as *moved* when its placement in `layout` differs from that.

- [ ] **Step 1: Write the shared fixture and the failing tests**

Create `src/engine/_fixtures/schedule.ts` (helpers live here, not in a test file, so importing them never re-registers another file's tests):

```ts
// src/engine/_fixtures/schedule.ts
import type { Footprint, Placement, ScheduleInput, ScheduleSession } from "../schedule";

export const sess = (
  id: string,
  order: number,
  footprint: Footprint,
  placement: Placement | null = null,
  locked = false,
): ScheduleSession => ({ id, order, footprint, locked, placement });

export const makeInput = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
  mode: "DAY",
  weekStartDay: 0,
  sessions: [],
  availability: [],
  carryIn: [],
  firstOpenDay: 0,
  ...over,
});

/** The same input, with `layout` recorded as the saved placements. */
export function withSaved(input: ScheduleInput, layout: Record<string, Placement>): ScheduleInput {
  return { ...input, sessions: input.sessions.map((s) => ({ ...s, placement: layout[s.id] ?? null })) };
}
```

Create `src/engine/schedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import {
  allCells,
  cellState,
  checkLayout,
  dayIndex,
  daypartForDay,
  footprintOf,
  layoutKey,
  openCells,
  placementPosition,
  savedLayout,
  type Placement,
} from "./schedule";
import { makeInput, sess } from "./_fixtures/schedule";

const day = (d: number): Placement => ({ day: d, daypart: null });

describe("positions", () => {
  it("counts days from the week's first day, wrapping", () => {
    expect(dayIndex(2, 2)).toBe(0); // Wed in a Wed-start week
    expect(dayIndex(1, 2)).toBe(6); // Tue is the last day of that week
  });

  it("measures position in half-days", () => {
    expect(placementPosition({ day: 0, daypart: null }, 0)).toBe(0);
    expect(placementPosition({ day: 0, daypart: "PM" }, 0)).toBe(1);
    expect(placementPosition({ day: 1, daypart: "AM" }, 0)).toBe(2);
    expect(placementPosition({ day: 1, daypart: null }, 2)).toBe(12);
  });

  it("lists 7 cells in DAY mode and 14 in HALF_DAY", () => {
    expect(allCells("DAY")).toHaveLength(7);
    expect(allCells("HALF_DAY")).toHaveLength(14);
  });
});

describe("cellState", () => {
  const availability = [
    { day: 1, daypart: "AM" as const, state: "BLOCKED" as const },
    { day: 1, daypart: "PM" as const, state: "BLOCKED" as const },
    { day: 2, daypart: "AM" as const, state: "BLOCKED" as const },
    { day: 3, daypart: "PM" as const, state: "PREFERRED" as const },
  ];

  it("reads the exact cell in HALF_DAY mode", () => {
    expect(cellState(availability, "HALF_DAY", { day: 2, daypart: "AM" })).toBe("BLOCKED");
    expect(cellState(availability, "HALF_DAY", { day: 2, daypart: "PM" })).toBe("AVAILABLE");
  });

  it("collapses halves in DAY mode: blocked only when both are, preferred when either is", () => {
    expect(cellState(availability, "DAY", day(1))).toBe("BLOCKED");
    expect(cellState(availability, "DAY", day(2))).toBe("AVAILABLE");
    expect(cellState(availability, "DAY", day(3))).toBe("PREFERRED");
    expect(cellState(availability, "DAY", day(4))).toBe("AVAILABLE");
  });
});

describe("openCells", () => {
  it("drops blocked and past cells and keeps position order", () => {
    const input = makeInput({
      weekStartDay: 2, // Wed … Tue
      firstOpenDay: 1, // Wed is past
      availability: [
        { day: 4, daypart: "AM", state: "BLOCKED" },
        { day: 4, daypart: "PM", state: "BLOCKED" },
      ],
    });
    expect(openCells(input).map((c) => c.day)).toEqual([3, 5, 6, 0, 1]);
  });
});

describe("daypartForDay", () => {
  it("defaults to AM", () => {
    expect(daypartForDay([], 0)).toBe("AM");
  });
  it("takes PM when only PM is preferred", () => {
    expect(daypartForDay([{ day: 0, daypart: "PM", state: "PREFERRED" }], 0)).toBe("PM");
  });
  it("takes PM when AM is blocked and PM is not", () => {
    expect(daypartForDay([{ day: 0, daypart: "AM", state: "BLOCKED" }], 0)).toBe("PM");
  });
  it("stays AM when both halves are preferred", () => {
    expect(
      daypartForDay(
        [
          { day: 0, daypart: "AM", state: "PREFERRED" },
          { day: 0, daypart: "PM", state: "PREFERRED" },
        ],
        0,
      ),
    ).toBe("AM");
  });
});

describe("footprintOf", () => {
  it("credits primary and secondary muscles and omits untouched ones", () => {
    const fp = footprintOf([{ exerciseName: "Barbell Bench Press", sets: 4 }], EXERCISE_LIBRARY);
    expect(fp.CHEST).toBe(4);
    expect(fp.QUADS).toBeUndefined();
  });

  it("ignores exercises missing from the library", () => {
    expect(footprintOf([{ exerciseName: "Not A Lift", sets: 3 }], EXERCISE_LIBRARY)).toEqual({});
  });
});

describe("layout helpers", () => {
  it("savedLayout collects placed sessions only", () => {
    const input = makeInput({ sessions: [sess("a", 0, {}, day(1)), sess("b", 1, {})] });
    expect(savedLayout(input)).toEqual({ a: day(1) });
  });

  it("layoutKey is order-independent", () => {
    expect(layoutKey({ b: day(2), a: { day: 1, daypart: "PM" } })).toBe("a:1:PM|b:2:-");
  });
});

describe("checkLayout", () => {
  it("accepts a legal layout", () => {
    const input = makeInput({ sessions: [sess("a", 0, {}), sess("b", 1, {})] });
    expect(checkLayout(input, { a: day(0), b: day(2) })).toEqual([]);
  });

  it("refuses a move into a blocked cell", () => {
    const input = makeInput({
      sessions: [sess("a", 0, {}, day(0))],
      availability: [
        { day: 3, daypart: "AM", state: "BLOCKED" },
        { day: 3, daypart: "PM", state: "BLOCKED" },
      ],
    });
    expect(checkLayout(input, { a: day(3) })).toEqual([{ kind: "blocked_cell", sessionId: "a" }]);
  });

  it("does not refuse a session that merely stands on a newly blocked cell", () => {
    const input = makeInput({
      sessions: [sess("a", 0, {}, day(3))],
      availability: [
        { day: 3, daypart: "AM", state: "BLOCKED" },
        { day: 3, daypart: "PM", state: "BLOCKED" },
      ],
    });
    expect(checkLayout(input, { a: day(3) })).toEqual([]);
  });

  it("refuses a move into the past but lets a session stay there", () => {
    const input = makeInput({ firstOpenDay: 2, sessions: [sess("a", 0, {}, day(0)), sess("b", 1, {}, day(4))] });
    expect(checkLayout(input, { a: day(0), b: day(1) })).toEqual([{ kind: "in_past", sessionId: "b" }]);
  });

  it("refuses moving a locked session", () => {
    const input = makeInput({ sessions: [sess("a", 0, {}, day(0), true)] });
    expect(checkLayout(input, { a: day(2) })).toEqual([{ kind: "locked", sessionId: "a" }]);
  });

  it("refuses two sessions on one day in DAY mode", () => {
    const input = makeInput({ sessions: [sess("a", 0, {}), sess("b", 1, {})] });
    expect(checkLayout(input, { a: day(1), b: day(1) })).toEqual([{ kind: "day_limit", sessionId: "b" }]);
  });

  it("allows AM and PM on one day in HALF_DAY mode but not the same half", () => {
    const input = makeInput({ mode: "HALF_DAY", sessions: [sess("a", 0, {}), sess("b", 1, {})] });
    expect(checkLayout(input, { a: { day: 1, daypart: "AM" }, b: { day: 1, daypart: "PM" } })).toEqual([]);
    expect(checkLayout(input, { a: { day: 1, daypart: "AM" }, b: { day: 1, daypart: "AM" } })).toEqual([
      { kind: "occupied", sessionId: "b" },
    ]);
  });

  it("refuses a daypart in DAY mode and a missing one in HALF_DAY mode", () => {
    const dayInput = makeInput({ sessions: [sess("a", 0, {})] });
    expect(checkLayout(dayInput, { a: { day: 1, daypart: "AM" } })).toEqual([{ kind: "mode_mismatch", sessionId: "a" }]);
    const halfInput = makeInput({ mode: "HALF_DAY", sessions: [sess("a", 0, {})] });
    expect(checkLayout(halfInput, { a: day(1) })).toEqual([{ kind: "mode_mismatch", sessionId: "a" }]);
  });

  it("refuses a session id that is not in the week", () => {
    const input = makeInput({ sessions: [sess("a", 0, {})] });
    expect(checkLayout(input, { a: day(0), ghost: day(1) })).toEqual([{ kind: "unknown_session", sessionId: "ghost" }]);
  });

  // Review Focus 5: locked sessions left in an old shape must not poison the week.
  it("ignores a locked session with no daypart in HALF_DAY mode", () => {
    const input = makeInput({
      mode: "HALF_DAY",
      sessions: [sess("done", 0, {}, day(0), true), sess("a", 1, {}, { day: 2, daypart: "AM" })],
    });
    expect(checkLayout(input, { done: day(0), a: { day: 3, daypart: "AM" } })).toEqual([]);
  });

  it("ignores two locked sessions sharing a day in DAY mode", () => {
    const input = makeInput({
      sessions: [
        sess("d1", 0, {}, { day: 0, daypart: "AM" }, true),
        sess("d2", 1, {}, { day: 0, daypart: "PM" }, true),
        sess("a", 2, {}, day(2)),
      ],
    });
    expect(
      checkLayout(input, { d1: { day: 0, daypart: "AM" }, d2: { day: 0, daypart: "PM" }, a: day(4) }),
    ).toEqual([]);
  });

  it("still refuses an unlocked session joining a locked one's day in DAY mode", () => {
    const input = makeInput({ sessions: [sess("done", 0, {}, day(0), true), sess("a", 1, {}, day(2))] });
    expect(checkLayout(input, { done: day(0), a: day(0) })).toEqual([{ kind: "day_limit", sessionId: "a" }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/engine/schedule.test.ts`
Expected: FAIL, cannot resolve `./schedule`.

- [ ] **Step 3: Implement**

Create `src/engine/schedule.ts`:

```ts
// src/engine/schedule.ts
import type { ExerciseDef } from "~/domain/exercise-library";
import type { Daypart, MuscleGroup, ScheduleMode } from "~/schema";
import { ALL_MUSCLES, computeVolume, round1 } from "./util";

/** Where a session sits. `day` is 0=Mon…6=Sun; `daypart` is null in DAY mode. */
export interface Placement {
  day: number;
  daypart: Daypart | null;
}

/** A week's placements, keyed by session id. A session that is absent is unplaced. */
export type Layout = Record<string, Placement>;

/** Stimulus sets per muscle for one session. The discipline-agnostic input to scoring. */
export type Footprint = Partial<Record<MuscleGroup, number>>;

export interface ScheduleSession {
  id: string;
  order: number;
  footprint: Footprint;
  /** COMPLETED or MISSED: cannot be moved. */
  locked: boolean;
  /** The placement currently saved; `checkLayout` treats any difference as a move. */
  placement: Placement | null;
}

export interface AvailabilityCellInput {
  day: number;
  daypart: Daypart;
  state: "PREFERRED" | "BLOCKED";
}

/** A session from the end of the previous week, for rest across the week boundary. */
export interface CarryIn {
  footprint: Footprint;
  halfDaysBeforeWeekStart: number; // ≥ 1
}

export interface ScheduleInput {
  mode: ScheduleMode;
  /** Weekday (0=Mon) of the rolling week's first day. */
  weekStartDay: number;
  sessions: ScheduleSession[];
  availability: AvailabilityCellInput[];
  carryIn: CarryIn[];
  /** Index (0..7) of the first day in the week that is not in the past. 7 = whole week past. */
  firstOpenDay: number;
}

export type HardViolationKind =
  | "blocked_cell"
  | "occupied"
  | "day_limit"
  | "in_past"
  | "locked"
  | "mode_mismatch"
  | "unknown_session";

export interface HardViolation {
  kind: HardViolationKind;
  sessionId: string;
}

/** A weekday's index (0..6) within a rolling week that starts on `weekStartDay`. */
export function dayIndex(day: number, weekStartDay: number): number {
  return (day - weekStartDay + 7) % 7;
}

/** Half-days from the start of the rolling week (0..13). A null daypart counts as AM. */
export function placementPosition(p: Placement, weekStartDay: number): number {
  return dayIndex(p.day, weekStartDay) * 2 + (p.daypart === "PM" ? 1 : 0);
}

export function samePlacement(a: Placement | null | undefined, b: Placement | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.day === b.day && a.daypart === b.daypart;
}

/** Every cell a session could occupy in this mode, Monday first. */
export function allCells(mode: ScheduleMode): Placement[] {
  const out: Placement[] = [];
  for (let day = 0; day < 7; day++) {
    if (mode === "DAY") out.push({ day, daypart: null });
    else out.push({ day, daypart: "AM" }, { day, daypart: "PM" });
  }
  return out;
}

/** Identity of the cell a placement occupies: the day in DAY mode, the half-day otherwise. */
export function cellKey(p: Placement, mode: ScheduleMode): string {
  return mode === "DAY" ? String(p.day) : `${p.day}:${p.daypart ?? "AM"}`;
}

/** Availability of a cell. In DAY mode a day is Blocked only when both halves are,
 * and Preferred when either half is. */
export function cellState(
  availability: AvailabilityCellInput[],
  mode: ScheduleMode,
  p: Placement,
): "PREFERRED" | "AVAILABLE" | "BLOCKED" {
  const of = (dp: Daypart) => availability.find((c) => c.day === p.day && c.daypart === dp)?.state ?? "AVAILABLE";
  if (mode === "HALF_DAY") return of(p.daypart ?? "AM");
  const am = of("AM");
  const pm = of("PM");
  if (am === "BLOCKED" && pm === "BLOCKED") return "BLOCKED";
  if (am === "PREFERRED" || pm === "PREFERRED") return "PREFERRED";
  return "AVAILABLE";
}

function isOpenTarget(input: ScheduleInput, p: Placement): boolean {
  return (
    cellState(input.availability, input.mode, p) !== "BLOCKED" &&
    dayIndex(p.day, input.weekStartDay) >= input.firstOpenDay
  );
}

/** Cells a session may be moved into: not Blocked, not in the past. Position order. */
export function openCells(input: ScheduleInput): Placement[] {
  return allCells(input.mode)
    .filter((c) => isOpenTarget(input, c))
    .sort((a, b) => placementPosition(a, input.weekStartDay) - placementPosition(b, input.weekStartDay));
}

/** The half a session takes when a day-only placement becomes AM/PM. */
export function daypartForDay(availability: AvailabilityCellInput[], day: number): Daypart {
  const of = (dp: Daypart) => availability.find((c) => c.day === day && c.daypart === dp)?.state ?? "AVAILABLE";
  const am = of("AM");
  const pm = of("PM");
  if (pm === "PREFERRED" && am !== "PREFERRED") return "PM";
  if (am === "BLOCKED" && pm !== "BLOCKED") return "PM";
  return "AM";
}

/** Stimulus sets per muscle for a session, using the library's fractional credit. */
export function footprintOf(
  prescriptions: { exerciseName: string; sets: number }[],
  library: ExerciseDef[],
): Footprint {
  const vol = computeVolume(prescriptions, library);
  const out: Footprint = {};
  for (const m of ALL_MUSCLES) {
    if (vol[m] > 0) out[m] = round1(vol[m]);
  }
  return out;
}

/** The layout currently saved, read off the sessions. */
export function savedLayout(input: ScheduleInput): Layout {
  const out: Layout = {};
  for (const s of input.sessions) {
    if (s.placement) out[s.id] = s.placement;
  }
  return out;
}

/** A stable identity for a layout, independent of key order. */
export function layoutKey(layout: Layout): string {
  return Object.keys(layout)
    .sort()
    .map((id) => `${id}:${layout[id]!.day}:${layout[id]!.daypart ?? "-"}`)
    .join("|");
}

/**
 * Hard rules. These judge MOVES, not standing state: a session already sitting on a
 * Blocked or past cell is not a violation until someone tries to put it there. Two
 * locked sessions are never reported against each other, so history left in an older
 * shape (after a mode switch) cannot make every later move in the week fail.
 */
export function checkLayout(input: ScheduleInput, layout: Layout): HardViolation[] {
  const out: HardViolation[] = [];
  const known = new Set(input.sessions.map((s) => s.id));
  const placed = [...input.sessions].sort((a, b) => a.order - b.order).filter((s) => layout[s.id] !== undefined);

  for (const s of placed) {
    const p = layout[s.id]!;
    const moved = !samePlacement(s.placement, p);
    if (s.locked) {
      if (moved) out.push({ kind: "locked", sessionId: s.id });
      continue;
    }
    if ((p.daypart !== null) !== (input.mode === "HALF_DAY")) {
      out.push({ kind: "mode_mismatch", sessionId: s.id });
    }
    if (moved) {
      if (cellState(input.availability, input.mode, p) === "BLOCKED") {
        out.push({ kind: "blocked_cell", sessionId: s.id });
      }
      if (dayIndex(p.day, input.weekStartDay) < input.firstOpenDay) {
        out.push({ kind: "in_past", sessionId: s.id });
      }
    }
  }

  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      if (a.locked && b.locked) continue;
      const pa = layout[a.id]!;
      const pb = layout[b.id]!;
      if (pa.day !== pb.day) continue;
      const offender = b.locked ? a : b;
      if (input.mode === "DAY") out.push({ kind: "day_limit", sessionId: offender.id });
      else if ((pa.daypart ?? "AM") === (pb.daypart ?? "AM")) out.push({ kind: "occupied", sessionId: offender.id });
    }
  }

  for (const id of Object.keys(layout)) {
    if (!known.has(id)) out.push({ kind: "unknown_session", sessionId: id });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/engine/schedule.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/schedule.ts src/engine/schedule.test.ts src/engine/_fixtures/schedule.ts
git commit -m "feat(schedule): engine placement types, positions and hard rules"
```

---

### Task 3: Scoring (`scoreLayout`), facts and weights

**Files:**
- Modify: `src/engine/facts.ts`, `src/engine/constants.ts`, `src/engine/schedule.ts`
- Test: `src/engine/schedule-score.test.ts`

**Interfaces:**
- Consumes: everything Task 2 produced.
- Produces:

```ts
interface LayoutScore { cost: number; facts: DecisionFact[] }
scoreLayout(input: ScheduleInput, layout: Layout): LayoutScore
```

New `DecisionFact` variants: `short_rest`, `load_streak`, `same_day_stack`, `off_preference`, `uneven_spread`, `on_blocked_cell`. The `infeasible` variant's `constraint` gains `"schedule_cells"`.

New constants: `REST_TARGET_HALF_DAYS`, `OVERLAP_MIN_SETS`, `W_SHORT_REST`, `MAX_STREAK_DAYS`, `W_LOAD_STREAK`, `W_SAME_DAY_STACK`, `W_OFF_PREFERENCE`, `W_UNEVEN_SPREAD`, `SPREAD_FACT_MIN_DAYS`, `W_ON_BLOCKED_CELL`, `SUGGESTION_MIN_GAIN`, `MAX_SUGGESTIONS`, `SCHEDULE_EPS`.

> **Learning-mode contribution (Freddy).** Step 3 below is yours to write. The values encode real training judgement: how bad is hitting the same muscles on consecutive days compared with missing a preferred time, or training four days straight? Starting values are provided so the tests pass; change them to match how you would coach, then re-run the tests. The tests assert relationships that must hold for any sensible values, not the numbers themselves.

- [ ] **Step 1: Add the fact variants**

In `src/engine/facts.ts`, change the `infeasible` line to:

```ts
  | { kind: "infeasible"; constraint: "session_time" | "weekly_volume" | "schedule_cells"; detail: Record<string, number | string> }
```

and append these variants before the final `;` of the `DecisionFact` union:

```ts
  | { kind: "short_rest"; sessionId: string; otherSessionId: string | null; muscle: MuscleGroup; gapHalfDays: number; targetHalfDays: number }
  | { kind: "load_streak"; days: number; limit: number }
  | { kind: "same_day_stack"; day: number; sessionIds: [string, string]; sharedSets: number }
  | { kind: "off_preference"; sessionId: string }
  | { kind: "uneven_spread"; longestGapDays: number; shortestGapDays: number }
  | { kind: "on_blocked_cell"; sessionId: string; day: number; daypart: "AM" | "PM" | null }
```

`otherSessionId: null` means the other session is in the previous week.

- [ ] **Step 2: Write the failing tests**

Create `src/engine/schedule-score.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_STREAK_DAYS,
  REST_TARGET_HALF_DAYS,
  SUGGESTION_MIN_GAIN,
  W_LOAD_STREAK,
  W_OFF_PREFERENCE,
  W_ON_BLOCKED_CELL,
  W_SAME_DAY_STACK,
  W_SHORT_REST,
  W_UNEVEN_SPREAD,
} from "./constants";
import { scoreLayout, type Footprint, type Placement } from "./schedule";
import { makeInput, sess } from "./_fixtures/schedule";

const day = (d: number): Placement => ({ day: d, daypart: null });
const LEGS: Footprint = { QUADS: 6, GLUTES: 4 };
const PUSH: Footprint = { CHEST: 6, TRICEPS: 3 };
const kinds = (facts: { kind: string }[]) => facts.map((f) => f.kind);

describe("schedule constants", () => {
  it("are all positive", () => {
    for (const w of [W_SHORT_REST, W_LOAD_STREAK, W_SAME_DAY_STACK, W_OFF_PREFERENCE, W_UNEVEN_SPREAD, W_ON_BLOCKED_CELL]) {
      expect(w).toBeGreaterThan(0);
    }
    expect(REST_TARGET_HALF_DAYS).toBeGreaterThanOrEqual(2);
    expect(MAX_STREAK_DAYS).toBeGreaterThanOrEqual(1);
  });

  it("make a blocked cell dominate every other term", () => {
    const others = W_SHORT_REST + W_LOAD_STREAK + W_SAME_DAY_STACK + W_OFF_PREFERENCE + W_UNEVEN_SPREAD;
    expect(W_ON_BLOCKED_CELL).toBeGreaterThan(50 * others);
  });

  it("keep the suggestion threshold above rounding noise", () => {
    expect(SUGGESTION_MIN_GAIN).toBeGreaterThanOrEqual(0.001);
  });
});

describe("scoreLayout — short_rest", () => {
  const input = makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] });

  it("fires for shared muscles on consecutive days and reports the gap", () => {
    const { facts } = scoreLayout(input, { a: day(0), b: day(1) });
    expect(facts).toContainEqual({
      kind: "short_rest",
      sessionId: "b",
      otherSessionId: "a",
      muscle: "QUADS",
      gapHalfDays: 2,
      targetHalfDays: REST_TARGET_HALF_DAYS,
    });
  });

  it("does not fire once the gap reaches the target, and costs less", () => {
    const near = scoreLayout(input, { a: day(0), b: day(1) });
    const far = scoreLayout(input, { a: day(0), b: day(3) });
    expect(kinds(far.facts)).not.toContain("short_rest");
    expect(far.cost).toBeLessThan(near.cost);
  });

  it("does not fire when the sessions share no muscle", () => {
    const mixed = makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, PUSH)] });
    expect(kinds(scoreLayout(mixed, { a: day(0), b: day(1) }).facts)).not.toContain("short_rest");
  });

  // Review Focus 4: a week that starts mid-week.
  it("treats Tue and Wed as far apart in a Wed-start week", () => {
    const wedStart = makeInput({ weekStartDay: 2, sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] });
    expect(kinds(scoreLayout(wedStart, { a: day(2), b: day(1) }).facts)).not.toContain("short_rest");
  });

  it("counts half-days in HALF_DAY mode", () => {
    const half = makeInput({ mode: "HALF_DAY", sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] });
    const { facts } = scoreLayout(half, { a: { day: 0, daypart: "PM" }, b: { day: 1, daypart: "AM" } });
    expect(facts.find((f) => f.kind === "short_rest")).toMatchObject({ gapHalfDays: 1 });
  });

  it("reaches back into the previous week through carryIn", () => {
    const withCarry = makeInput({
      sessions: [sess("a", 0, LEGS)],
      carryIn: [{ footprint: LEGS, halfDaysBeforeWeekStart: 2 }],
    });
    const { facts } = scoreLayout(withCarry, { a: day(0) });
    expect(facts).toContainEqual({
      kind: "short_rest",
      sessionId: "a",
      otherSessionId: null,
      muscle: "QUADS",
      gapHalfDays: 2,
      targetHalfDays: REST_TARGET_HALF_DAYS,
    });
  });
});

describe("scoreLayout — other terms", () => {
  it("reports a training streak longer than the limit", () => {
    const n = MAX_STREAK_DAYS + 1;
    const sessions = Array.from({ length: n }, (_, i) => sess(`s${i}`, i, {}));
    const layout = Object.fromEntries(sessions.map((s, i) => [s.id, day(i)]));
    const { facts } = scoreLayout(makeInput({ sessions }), layout);
    expect(facts).toContainEqual({ kind: "load_streak", days: n, limit: MAX_STREAK_DAYS });
  });

  it("reports two sessions stacked on one day in HALF_DAY mode", () => {
    const input = makeInput({ mode: "HALF_DAY", sessions: [sess("a", 0, LEGS), sess("b", 1, PUSH)] });
    const { facts } = scoreLayout(input, { a: { day: 2, daypart: "AM" }, b: { day: 2, daypart: "PM" } });
    expect(facts).toContainEqual({ kind: "same_day_stack", day: 2, sessionIds: ["a", "b"], sharedSets: 0 });
  });

  it("reports a session off a preferred cell only while a preferred cell is open", () => {
    const availability = [
      { day: 1, daypart: "AM" as const, state: "PREFERRED" as const },
      { day: 1, daypart: "PM" as const, state: "PREFERRED" as const },
    ];
    const input = makeInput({ sessions: [sess("a", 0, {})], availability });
    expect(scoreLayout(input, { a: day(0) }).facts).toContainEqual({ kind: "off_preference", sessionId: "a" });
    expect(kinds(scoreLayout(input, { a: day(1) }).facts)).not.toContain("off_preference");
  });

  it("reports a session standing on a blocked cell, at dominant cost", () => {
    const availability = [
      { day: 3, daypart: "AM" as const, state: "BLOCKED" as const },
      { day: 3, daypart: "PM" as const, state: "BLOCKED" as const },
    ];
    const input = makeInput({ sessions: [sess("a", 0, {}, day(3))], availability });
    const scored = scoreLayout(input, { a: day(3) });
    expect(scored.facts).toContainEqual({ kind: "on_blocked_cell", sessionId: "a", day: 3, daypart: null });
    expect(scored.cost).toBeGreaterThanOrEqual(W_ON_BLOCKED_CELL);
  });

  it("reports sessions bunched at one end and prefers them spread", () => {
    const input = makeInput({ sessions: [sess("a", 0, {}), sess("b", 1, {})] });
    const bunched = scoreLayout(input, { a: day(0), b: day(1) });
    const spread = scoreLayout(input, { a: day(0), b: day(3) });
    expect(bunched.facts).toContainEqual({ kind: "uneven_spread", longestGapDays: 6, shortestGapDays: 1 });
    expect(spread.cost).toBeLessThan(bunched.cost);
  });

  it("scores an empty layout at zero with no facts", () => {
    expect(scoreLayout(makeInput({ sessions: [sess("a", 0, LEGS)] }), {})).toEqual({ cost: 0, facts: [] });
  });
});
```

- [ ] **Step 3 (Freddy): Write the scoring constants**

Append to `src/engine/constants.ts`. The names and units are fixed (later tasks import them); the values are your call. The starting values below pass the tests.

```ts
// ─── Schedule scoring ───

/** Rest, in half-days, that two sessions sharing a muscle should have between them. 4 = 48h. */
export const REST_TARGET_HALF_DAYS = 4;
/** Shared stimulus sets below this don't count as "the same muscles". */
export const OVERLAP_MIN_SETS = 2;
/** Cost per shared set, per half-day short of the rest target. */
export const W_SHORT_REST = 1;
/** Consecutive training days allowed before a streak is a problem. */
export const MAX_STREAK_DAYS = 3;
/** Cost per day beyond the streak limit. */
export const W_LOAD_STREAK = 4;
/** Cost of two sessions on one day; multiplied by (1 + shared sets). */
export const W_SAME_DAY_STACK = 3;
/** Cost of a session sitting off a Preferred cell while one is open. */
export const W_OFF_PREFERENCE = 2;
/** Cost per day that the gaps between training days deviate from an even spread. */
export const W_UNEVEN_SPREAD = 1;
/** Longest gap minus shortest gap (days) at which bunching is worth telling the athlete. */
export const SPREAD_FACT_MIN_DAYS = 3;
/** Cost of a session standing on a Blocked cell. Must dominate everything else. */
export const W_ON_BLOCKED_CELL = 1000;
/** A move must lower the cost by more than this to be suggested. */
export const SUGGESTION_MIN_GAIN = 2;
/** Suggestions returned at most. */
export const MAX_SUGGESTIONS = 3;
/** Cost differences smaller than this are treated as equal. Not a tuning value. */
export const SCHEDULE_EPS = 1e-6;
```

Questions to answer for yourself as you tune: is 48 hours the right rest target for hypertrophy work, or should heavy overlap want 72 (6 half-days)? Should a missed preference ever outweigh a recovery problem? How many straight days is too many for your target athlete?

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm vitest run src/engine/schedule-score.test.ts`
Expected: FAIL, `scoreLayout` is not exported.

- [ ] **Step 5: Implement `scoreLayout`**

In `src/engine/schedule.ts`, add these imports at the top:

```ts
import {
  MAX_STREAK_DAYS,
  OVERLAP_MIN_SETS,
  REST_TARGET_HALF_DAYS,
  SPREAD_FACT_MIN_DAYS,
  W_LOAD_STREAK,
  W_OFF_PREFERENCE,
  W_ON_BLOCKED_CELL,
  W_SAME_DAY_STACK,
  W_SHORT_REST,
  W_UNEVEN_SPREAD,
} from "./constants";
import type { DecisionFact } from "./facts";
```

and append:

```ts
export interface LayoutScore {
  cost: number;
  facts: DecisionFact[];
}

/** Shared stimulus between two footprints, and the muscle that shares most. */
function overlapOf(a: Footprint, b: Footprint): { sets: number; muscle: MuscleGroup | null } {
  let sets = 0;
  let top: MuscleGroup | null = null;
  let topSets = 0;
  for (const m of ALL_MUSCLES) {
    const shared = Math.min(a[m] ?? 0, b[m] ?? 0);
    sets += shared;
    if (shared > topSets) {
      topSets = shared;
      top = m;
    }
  }
  return { sets: round1(sets), muscle: top };
}

/**
 * Cost of a layout plus the facts that explain it. Lower is better. Every term is
 * non-negative. Reads footprints and placements only: it never touches a set count
 * (Law 1) and every reason it gives is a fact (Law 2).
 */
export function scoreLayout(input: ScheduleInput, layout: Layout): LayoutScore {
  const facts: DecisionFact[] = [];
  let cost = 0;

  const placed = [...input.sessions]
    .sort((a, b) => a.order - b.order)
    .filter((s) => layout[s.id] !== undefined)
    .map((s) => {
      const p = layout[s.id]!;
      return { s, p, pos: placementPosition(p, input.weekStartDay) };
    });

  const rest = (sessionId: string, otherSessionId: string | null, a: Footprint, b: Footprint, gap: number) => {
    const o = overlapOf(a, b);
    if (o.muscle === null || o.sets < OVERLAP_MIN_SETS || gap >= REST_TARGET_HALF_DAYS) return;
    cost += W_SHORT_REST * o.sets * (REST_TARGET_HALF_DAYS - gap);
    facts.push({
      kind: "short_rest",
      sessionId,
      otherSessionId,
      muscle: o.muscle,
      gapHalfDays: gap,
      targetHalfDays: REST_TARGET_HALF_DAYS,
    });
  };

  // Rest between sessions in this week.
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      const [earlier, later] = a.pos <= b.pos ? [a, b] : [b, a];
      rest(later.s.id, earlier.s.id, a.s.footprint, b.s.footprint, Math.abs(a.pos - b.pos));
    }
  }

  // Rest across the week boundary.
  for (const c of input.carryIn) {
    for (const x of placed) {
      rest(x.s.id, null, c.footprint, x.s.footprint, c.halfDaysBeforeWeekStart + x.pos);
    }
  }

  const days = [...new Set(placed.map((x) => Math.floor(x.pos / 2)))].sort((a, b) => a - b);

  // Consecutive training days.
  let longest = 0;
  let run = 0;
  let prev = -2;
  for (const d of days) {
    run = d === prev + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  if (longest > MAX_STREAK_DAYS) {
    cost += W_LOAD_STREAK * (longest - MAX_STREAK_DAYS);
    facts.push({ kind: "load_streak", days: longest, limit: MAX_STREAK_DAYS });
  }

  // Two sessions on one day.
  if (input.mode === "HALF_DAY") {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        if (a.p.day !== b.p.day) continue;
        const shared = overlapOf(a.s.footprint, b.s.footprint).sets;
        cost += W_SAME_DAY_STACK * (1 + shared);
        facts.push({ kind: "same_day_stack", day: a.p.day, sessionIds: [a.s.id, b.s.id], sharedSets: shared });
      }
    }
  }

  // Preference and blocked cells.
  const occupied = new Set(placed.map((x) => cellKey(x.p, input.mode)));
  const preferredOpen = allCells(input.mode).some(
    (c) =>
      cellState(input.availability, input.mode, c) === "PREFERRED" &&
      dayIndex(c.day, input.weekStartDay) >= input.firstOpenDay &&
      !occupied.has(cellKey(c, input.mode)),
  );
  for (const x of placed) {
    if (x.s.locked) continue;
    const state = cellState(input.availability, input.mode, x.p);
    if (state === "BLOCKED") {
      cost += W_ON_BLOCKED_CELL;
      facts.push({ kind: "on_blocked_cell", sessionId: x.s.id, day: x.p.day, daypart: x.p.daypart });
    } else if (state !== "PREFERRED" && preferredOpen) {
      cost += W_OFF_PREFERENCE;
      facts.push({ kind: "off_preference", sessionId: x.s.id });
    }
  }

  // Spread across the week, treating the week as repeating.
  if (days.length >= 2) {
    const gaps = days.map((d, i) => (i === days.length - 1 ? days[0]! + 7 - d : days[i + 1]! - d));
    const ideal = 7 / days.length;
    cost += W_UNEVEN_SPREAD * gaps.reduce((sum, g) => sum + Math.abs(g - ideal), 0);
    const longestGap = Math.max(...gaps);
    const shortestGap = Math.min(...gaps);
    if (longestGap - shortestGap >= SPREAD_FACT_MIN_DAYS) {
      facts.push({ kind: "uneven_spread", longestGapDays: longestGap, shortestGapDays: shortestGap });
    }
  }

  return { cost: Math.round(cost * 1e6) / 1e6, facts };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run src/engine/schedule-score.test.ts src/engine/schedule.test.ts`
Expected: PASS. If you tuned the constants and a test now fails, the failure names the relationship your values broke; decide whether the value or the expectation is wrong.

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: clean. If a `switch` over `DecisionFact["kind"]` elsewhere reports a missing case, add the six new kinds to its default/ignored branch.

- [ ] **Step 8: Commit**

```bash
git add src/engine/facts.ts src/engine/constants.ts src/engine/schedule.ts src/engine/schedule-score.test.ts
git commit -m "feat(schedule): layout scoring with explainable facts"
```

---

### Task 4: Auto-placement (`placeWeek`) and suggestions (`suggestMoves`)

**Files:**
- Modify: `src/engine/schedule.ts`, `src/engine/index.ts`
- Test: `src/engine/schedule-place.test.ts`, `src/engine/schedule.properties.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3.
- Produces:

```ts
type PlaceResult = { kind: "placed"; layout: Layout } | { kind: "infeasible"; facts: DecisionFact[] };
interface MoveSuggestion {
  sessionId: string;
  from: Placement;
  to: Placement;
  swapWithSessionId: string | null;   // set when the move is a swap
  gain: number;                        // cost reduction
  resolves: DecisionFact[];            // facts present before, gone after
}
placeWeek(input: ScheduleInput): PlaceResult
suggestMoves(input: ScheduleInput, layout: Layout): MoveSuggestion[]
applySuggestion(layout: Layout, s: Pick<MoveSuggestion, "sessionId" | "from" | "to" | "swapWithSessionId">): Layout
```

`placeWeek` keeps locked sessions where they are and (re)places every unlocked session. To place only some sessions, the caller marks the others `locked: true` in the input it passes.

- [ ] **Step 1: Write the failing unit tests**

Create `src/engine/schedule-place.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  applySuggestion,
  checkLayout,
  placeWeek,
  scoreLayout,
  suggestMoves,
  type Footprint,
  type Layout,
  type Placement,
} from "./schedule";
import { makeInput, sess, withSaved } from "./_fixtures/schedule";

const day = (d: number): Placement => ({ day: d, daypart: null });
const LEGS: Footprint = { QUADS: 6, GLUTES: 4 };
const PUSH: Footprint = { CHEST: 6, TRICEPS: 3 };

describe("placeWeek", () => {
  it("places every unlocked session legally", () => {
    const input = makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, PUSH), sess("c", 2, LEGS), sess("d", 3, PUSH)] });
    const res = placeWeek(input);
    expect(res.kind).toBe("placed");
    if (res.kind !== "placed") return;
    expect(Object.keys(res.layout).sort()).toEqual(["a", "b", "c", "d"]);
    expect(checkLayout(input, res.layout)).toEqual([]);
  });

  it("separates sessions that share muscles", () => {
    const input = makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] });
    const res = placeWeek(input);
    if (res.kind !== "placed") throw new Error("expected placed");
    expect(scoreLayout(input, res.layout).facts.map((f) => f.kind)).not.toContain("short_rest");
  });

  it("leaves locked sessions where they are", () => {
    const input = makeInput({ sessions: [sess("done", 0, LEGS, day(0), true), sess("a", 1, LEGS)] });
    const res = placeWeek(input);
    if (res.kind !== "placed") throw new Error("expected placed");
    expect(res.layout.done).toEqual(day(0));
  });

  it("never uses a blocked or past cell", () => {
    const input = makeInput({
      firstOpenDay: 2,
      availability: [
        { day: 3, daypart: "AM", state: "BLOCKED" },
        { day: 3, daypart: "PM", state: "BLOCKED" },
      ],
      sessions: [sess("a", 0, LEGS), sess("b", 1, PUSH), sess("c", 2, LEGS)],
    });
    const res = placeWeek(input);
    if (res.kind !== "placed") throw new Error("expected placed");
    for (const p of Object.values(res.layout)) {
      expect(p.day).toBeGreaterThanOrEqual(2);
      expect(p.day).not.toBe(3);
    }
  });

  it("uses preferred cells when nothing else distinguishes them", () => {
    const input = makeInput({
      availability: [
        { day: 4, daypart: "AM", state: "PREFERRED" },
        { day: 4, daypart: "PM", state: "PREFERRED" },
      ],
      sessions: [sess("a", 0, LEGS)],
    });
    const res = placeWeek(input);
    if (res.kind !== "placed") throw new Error("expected placed");
    expect(res.layout.a).toEqual(day(4));
  });

  // Review Focus 3: too few open cells.
  it("reports infeasible instead of a partial layout", () => {
    const input = makeInput({ firstOpenDay: 6, sessions: [sess("a", 0, LEGS), sess("b", 1, PUSH)] });
    const res = placeWeek(input);
    expect(res).toEqual({
      kind: "infeasible",
      facts: [{ kind: "infeasible", constraint: "schedule_cells", detail: { needed: 2, open: 1 } }],
    });
  });

  it("gives a layout no suggestion can improve", () => {
    const input = makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, PUSH), sess("c", 2, LEGS), sess("d", 3, PUSH)] });
    const res = placeWeek(input);
    if (res.kind !== "placed") throw new Error("expected placed");
    expect(suggestMoves(withSaved(input, res.layout), res.layout)).toEqual([]);
  });
});

describe("suggestMoves", () => {
  it("suggests separating back-to-back sessions that share muscles", () => {
    const layout = { a: day(0), b: day(1) };
    const input = withSaved(makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] }), layout);
    const [top] = suggestMoves(input, layout);
    expect(top).toBeDefined();
    expect(top!.gain).toBeGreaterThan(0);
    expect(top!.resolves.map((f) => f.kind)).toContain("short_rest");
    const after = applySuggestion(layout, top!);
    expect(scoreLayout(input, after).cost).toBeLessThan(scoreLayout(input, layout).cost);
    expect(checkLayout(input, after)).toEqual([]);
  });

  it("stays quiet for a layout that is already good", () => {
    const layout = { a: day(0), b: day(3) };
    const input = withSaved(makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] }), layout);
    expect(suggestMoves(input, layout)).toEqual([]);
  });

  it("never moves a locked session", () => {
    const layout = { done: day(0), b: day(1) };
    const input = withSaved(
      makeInput({ sessions: [sess("done", 0, LEGS, day(0), true), sess("b", 1, LEGS)] }),
      layout,
    );
    for (const s of suggestMoves(input, layout)) {
      expect(s.sessionId).toBe("b");
      expect(s.swapWithSessionId).toBeNull();
    }
  });

  it("always suggests getting off a blocked cell", () => {
    const layout = { a: day(3) };
    const input = withSaved(
      makeInput({
        sessions: [sess("a", 0, LEGS)],
        availability: [
          { day: 3, daypart: "AM", state: "BLOCKED" },
          { day: 3, daypart: "PM", state: "BLOCKED" },
        ],
      }),
      layout,
    );
    const [top] = suggestMoves(input, layout);
    expect(top!.resolves.map((f) => f.kind)).toContain("on_blocked_cell");
    expect(top!.to.day).not.toBe(3);
  });

  // Review Focus 2: a full week has no empty cell, so only swaps can help.
  it("suggests a swap when every day is taken", () => {
    const footprints: Footprint[] = [LEGS, LEGS, PUSH, PUSH, { BACK: 6 }, { BACK: 6 }, { ABS: 4 }];
    const sessions = footprints.map((f, i) => sess(`s${i}`, i, f));
    const layout: Layout = Object.fromEntries(sessions.map((s, i) => [s.id, day(i)]));
    const input = withSaved(makeInput({ sessions }), layout);
    const suggestions = suggestMoves(input, layout);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) expect(s.swapWithSessionId).not.toBeNull();
    expect(checkLayout(input, applySuggestion(layout, suggestions[0]!))).toEqual([]);
  });

  it("returns at most three suggestions, best first", () => {
    const layout = { a: day(0), b: day(1), c: day(2) };
    const input = withSaved(
      makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS), sess("c", 2, LEGS)] }),
      layout,
    );
    const out = suggestMoves(input, layout);
    expect(out.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < out.length; i++) expect(out[i - 1]!.gain).toBeGreaterThanOrEqual(out[i]!.gain);
  });
});
```

- [ ] **Step 2: Write the failing property tests**

Create `src/engine/schedule.properties.test.ts`:

```ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Daypart, ScheduleMode } from "~/schema";
import {
  applySuggestion,
  cellKey,
  checkLayout,
  openCells,
  placeWeek,
  scoreLayout,
  suggestMoves,
  type Footprint,
  type Layout,
  type ScheduleInput,
} from "./schedule";
import { withSaved } from "./_fixtures/schedule";
import { ALL_MUSCLES } from "./util";

const arbFootprint = fc.dictionary(fc.constantFrom(...ALL_MUSCLES), fc.integer({ min: 1, max: 8 }), {
  maxKeys: 5,
}) as fc.Arbitrary<Footprint>;

function arbInput(): fc.Arbitrary<ScheduleInput> {
  return fc
    .record({
      mode: fc.constantFrom<ScheduleMode>("DAY", "HALF_DAY"),
      weekStartDay: fc.integer({ min: 0, max: 6 }),
      firstOpenDay: fc.integer({ min: 0, max: 2 }),
      footprints: fc.array(arbFootprint, { minLength: 1, maxLength: 5 }),
      availability: fc.uniqueArray(
        fc.record({
          day: fc.integer({ min: 0, max: 6 }),
          daypart: fc.constantFrom<Daypart>("AM", "PM"),
          state: fc.constantFrom<"PREFERRED" | "BLOCKED">("PREFERRED", "BLOCKED"),
        }),
        { selector: (c) => `${c.day}:${c.daypart}`, maxLength: 6 },
      ),
    })
    .map((r) => ({
      mode: r.mode,
      weekStartDay: r.weekStartDay,
      firstOpenDay: r.firstOpenDay,
      availability: r.availability,
      carryIn: [],
      sessions: r.footprints.map((footprint, i) => ({ id: `s${i}`, order: i, footprint, locked: false, placement: null })),
    }));
}

/** A legal but naive layout: sessions packed into the earliest open cells. */
function packedLayout(input: ScheduleInput): Layout | null {
  const cells = openCells(input);
  if (cells.length < input.sessions.length) return null;
  return Object.fromEntries(input.sessions.map((s, i) => [s.id, cells[i]!]));
}

describe("schedule properties", () => {
  it("placeWeek never breaks a hard rule", () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        const res = placeWeek(input);
        if (res.kind !== "placed") return;
        expect(checkLayout(input, res.layout)).toEqual([]);
        expect(Object.keys(res.layout)).toHaveLength(input.sessions.length);
      }),
    );
  });

  it("placeWeek is deterministic", () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        expect(placeWeek(input)).toEqual(placeWeek(structuredClone(input)));
      }),
    );
  });

  it("a freshly placed week yields no suggestion", () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        const res = placeWeek(input);
        if (res.kind !== "placed") return;
        expect(suggestMoves(withSaved(input, res.layout), res.layout)).toEqual([]);
      }),
    );
  });

  it("DAY mode never puts two sessions on one day", () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        const res = placeWeek({ ...input, mode: "DAY" });
        if (res.kind !== "placed") return;
        const days = Object.values(res.layout).map((p) => cellKey(p, "DAY"));
        expect(new Set(days).size).toBe(days.length);
      }),
    );
  });

  it("every suggestion is legal and strictly cheaper", () => {
    fc.assert(
      fc.property(arbInput(), (raw) => {
        const layout = packedLayout(raw);
        fc.pre(layout !== null);
        const input = withSaved(raw, layout!);
        const before = scoreLayout(input, layout!).cost;
        for (const s of suggestMoves(input, layout!)) {
          const after = applySuggestion(layout!, s);
          expect(checkLayout(input, after)).toEqual([]);
          expect(scoreLayout(input, after).cost).toBeLessThan(before);
        }
      }),
    );
  });

  it("LAW 1: no function changes a footprint or a saved placement", () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        const snapshot = structuredClone(input);
        const res = placeWeek(input);
        if (res.kind === "placed") {
          scoreLayout(input, res.layout);
          suggestMoves(input, res.layout);
          checkLayout(input, res.layout);
        }
        expect(input).toEqual(snapshot);
      }),
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/engine/schedule-place.test.ts src/engine/schedule.properties.test.ts`
Expected: FAIL, `placeWeek` / `suggestMoves` / `applySuggestion` are not exported.

- [ ] **Step 4: Implement**

In `src/engine/schedule.ts`, extend the constants import with `MAX_SUGGESTIONS, SCHEDULE_EPS, SUGGESTION_MIN_GAIN`, then append:

```ts
export type PlaceResult = { kind: "placed"; layout: Layout } | { kind: "infeasible"; facts: DecisionFact[] };

export interface MoveSuggestion {
  sessionId: string;
  from: Placement;
  to: Placement;
  /** Set when the move is a swap: this session takes `from`. */
  swapWithSessionId: string | null;
  gain: number;
  resolves: DecisionFact[];
}

interface Neighbour {
  layout: Layout;
  sessionId: string;
  from: Placement;
  to: Placement;
  swapWithSessionId: string | null;
}

/** Layout after a move or swap. */
export function applySuggestion(
  layout: Layout,
  s: Pick<MoveSuggestion, "sessionId" | "from" | "to" | "swapWithSessionId">,
): Layout {
  const next: Layout = { ...layout, [s.sessionId]: s.to };
  if (s.swapWithSessionId !== null) next[s.swapWithSessionId] = s.from;
  return next;
}

/**
 * Every legal single change to a layout: an unlocked session moving to an empty open
 * cell, or two unlocked sessions trading places. Generated in a fixed order (session
 * order, then cell position, then swaps) so ties always resolve the same way.
 */
function neighbours(input: ScheduleInput, layout: Layout): Neighbour[] {
  const movable = [...input.sessions]
    .sort((a, b) => a.order - b.order)
    .filter((s) => !s.locked && layout[s.id] !== undefined);
  const occupied = new Set(Object.values(layout).map((p) => cellKey(p, input.mode)));
  const cells = openCells(input);
  const out: Neighbour[] = [];

  for (const s of movable) {
    const from = layout[s.id]!;
    for (const to of cells) {
      if (occupied.has(cellKey(to, input.mode))) continue;
      out.push({ layout: { ...layout, [s.id]: to }, sessionId: s.id, from, to, swapWithSessionId: null });
    }
  }
  for (let i = 0; i < movable.length; i++) {
    for (let j = i + 1; j < movable.length; j++) {
      const a = movable[i]!;
      const b = movable[j]!;
      const pa = layout[a.id]!;
      const pb = layout[b.id]!;
      if (!isOpenTarget(input, pa) || !isOpenTarget(input, pb)) continue;
      out.push({ layout: { ...layout, [a.id]: pb, [b.id]: pa }, sessionId: a.id, from: pa, to: pb, swapWithSessionId: b.id });
    }
  }
  return out;
}

/** Guard against a runaway loop; each step strictly lowers cost, so this is never reached in practice. */
const LOCAL_SEARCH_MAX_STEPS = 200;

/**
 * Auto-place a week. Locked sessions stay put; every unlocked session is (re)placed.
 * Greedy construction in session order (each takes the open cell that costs least,
 * earliest on ties), then local search over `neighbours` until no single move or swap
 * lowers the cost. Deterministic. Because it stops at a local optimum of the same
 * neighbourhood `suggestMoves` searches, a freshly placed week has no suggestion.
 */
export function placeWeek(input: ScheduleInput): PlaceResult {
  let layout: Layout = {};
  for (const s of input.sessions) {
    if (s.locked && s.placement) layout[s.id] = s.placement;
  }
  const toPlace = [...input.sessions].sort((a, b) => a.order - b.order).filter((s) => !s.locked);
  const cells = openCells(input);

  for (const s of toPlace) {
    const occupied = new Set(Object.values(layout).map((p) => cellKey(p, input.mode)));
    let best: Placement | null = null;
    let bestCost = Infinity;
    for (const c of cells) {
      if (occupied.has(cellKey(c, input.mode))) continue;
      const cost = scoreLayout(input, { ...layout, [s.id]: c }).cost;
      if (cost < bestCost - SCHEDULE_EPS) {
        best = c;
        bestCost = cost;
      }
    }
    if (best === null) {
      const taken = new Set(
        input.sessions.filter((x) => x.locked && x.placement).map((x) => cellKey(x.placement!, input.mode)),
      );
      const open = cells.filter((c) => !taken.has(cellKey(c, input.mode))).length;
      return {
        kind: "infeasible",
        facts: [{ kind: "infeasible", constraint: "schedule_cells", detail: { needed: toPlace.length, open } }],
      };
    }
    layout = { ...layout, [s.id]: best };
  }

  for (let step = 0; step < LOCAL_SEARCH_MAX_STEPS; step++) {
    let bestCost = scoreLayout(input, layout).cost;
    let bestLayout: Layout | null = null;
    for (const n of neighbours(input, layout)) {
      const cost = scoreLayout(input, n.layout).cost;
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
 * The single moves or swaps that most improve a layout. Starts from the layout the
 * athlete chose rather than the engine's ideal, so each suggestion is a small tweak
 * with a reason. Empty when nothing clears the threshold.
 */
export function suggestMoves(input: ScheduleInput, layout: Layout): MoveSuggestion[] {
  const base = scoreLayout(input, layout);
  return neighbours(input, layout)
    .map((n, index) => {
      const after = scoreLayout(input, n.layout);
      return { n, index, after, gain: base.cost - after.cost };
    })
    .filter((x) => x.gain > SUGGESTION_MIN_GAIN)
    .sort((a, b) => b.gain - a.gain || a.index - b.index)
    .slice(0, MAX_SUGGESTIONS)
    .map((x) => {
      const remaining = new Set(x.after.facts.map((f) => JSON.stringify(f)));
      return {
        sessionId: x.n.sessionId,
        from: x.n.from,
        to: x.n.to,
        swapWithSessionId: x.n.swapWithSessionId,
        gain: Math.round(x.gain * 1e6) / 1e6,
        resolves: base.facts.filter((f) => !remaining.has(JSON.stringify(f))),
      };
    });
}
```

Add to `src/engine/index.ts`:

```ts
export {
  allCells,
  applySuggestion,
  cellKey,
  cellState,
  checkLayout,
  dayIndex,
  daypartForDay,
  footprintOf,
  layoutKey,
  openCells,
  placeWeek,
  placementPosition,
  samePlacement,
  savedLayout,
  scoreLayout,
  suggestMoves,
} from "./schedule";
export type {
  AvailabilityCellInput,
  CarryIn,
  Footprint,
  HardViolation,
  HardViolationKind,
  Layout,
  LayoutScore,
  MoveSuggestion,
  PlaceResult,
  Placement,
  ScheduleInput,
  ScheduleSession,
} from "./schedule";
```

Client components must import from `~/engine/schedule` directly, never from `~/engine`, so the browser bundle does not pull in the generator.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/engine`
Expected: PASS for all engine tests, old and new. If "suggests a swap when every day is taken" or "always suggests getting off a blocked cell" fails after constant tuning, `SUGGESTION_MIN_GAIN` is too high relative to the weights.

- [ ] **Step 6: Commit**

```bash
git add src/engine
git commit -m "feat(schedule): deterministic week placement and move suggestions"
```

---

### Task 5: Local-day maths and DB adapters

**Files:**
- Modify: `src/domain/local-day.ts`
- Create: `src/server/mesocycle/schedule-adapters.ts`
- Test: `src/domain/local-day.test.ts`, `src/server/mesocycle/schedule-adapters.test.ts`

**Interfaces:**
- Consumes: Task 2–4 engine exports; `MesocyclePlan` from `~/engine`; `EXERCISE_LIBRARY`.
- Produces (from `~/domain/local-day`):

```ts
localDayNumber(date: Date, tz: string): number       // whole days since 1970-01-01 of the LOCAL calendar date
localHour(date: Date, tz: string): number            // 0..23
weekdayOfDayNumber(n: number): number                // 0=Mon … 6=Sun
isoDateOfDayNumber(n: number): string                // "YYYY-MM-DD"
```

- Produces (from `~/server/mesocycle/schedule-adapters`):

```ts
interface WeekDay { date: string; weekday: number }
interface ScheduleSettings { mode: ScheduleMode; availability: AvailabilityCellInput[]; timezone: string }
const WEEK_FOR_SCHEDULE_INCLUDE
type WeekForSchedule
weekDays(startDate: Date, weekIndex: number, tz: string): WeekDay[]            // 7 entries
firstOpenDay(startDate: Date, weekIndex: number, tz: string, now: Date): number // 0..7
availabilityFromRows(rows: { dayOfWeek: number; daypart: Daypart; state: AvailabilityState }[]): AvailabilityCellInput[]
scheduleInputFromDb(args: { week: WeekForSchedule; prevWeek: WeekForSchedule | null; settings: ScheduleSettings; startDate: Date; now: Date }): ScheduleInput
applyLayoutToDb(tx: Prisma.TransactionClient, layout: Layout): Promise<void>
completedPlacement(completedAt: Date, tz: string, mode: ScheduleMode): Placement
placePlanWeeks(plan: MesocyclePlan, settings: ScheduleSettings, startDate: Date, now: Date): (Layout | null)[]
```

`placePlanWeeks` keys each returned layout by the session's index in `week.sessions` as a string (`"0"`, `"1"`, …), because sessions have no ids before they are persisted. `null` means that week could not be placed.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/local-day.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isoDateOfDayNumber, localDayNumber, localHour, weekdayOfDayNumber } from "./local-day";

describe("local-day", () => {
  // Review Focus 1: 2026-10-06 23:30 UTC is 10:30 on Wednesday 7 October in Sydney (UTC+11).
  const instant = new Date("2026-10-06T23:30:00Z");

  it("reads the local calendar date, not the UTC one", () => {
    const sydney = localDayNumber(instant, "Australia/Sydney");
    const utc = localDayNumber(instant, "UTC");
    expect(sydney - utc).toBe(1);
    expect(isoDateOfDayNumber(sydney)).toBe("2026-10-07");
    expect(isoDateOfDayNumber(utc)).toBe("2026-10-06");
  });

  it("maps day numbers to weekdays with Monday as 0", () => {
    expect(weekdayOfDayNumber(localDayNumber(instant, "Australia/Sydney"))).toBe(2); // Wed
    expect(weekdayOfDayNumber(localDayNumber(instant, "UTC"))).toBe(1); // Tue
    expect(weekdayOfDayNumber(0)).toBe(3); // 1970-01-01 was a Thursday
  });

  it("reads the local hour", () => {
    expect(localHour(instant, "Australia/Sydney")).toBe(10);
    expect(localHour(instant, "UTC")).toBe(23);
  });
});
```

Create `src/server/mesocycle/schedule-adapters.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../../generated/prisma";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { checkLayout, generateMesocycle, resolveConstraints, type MuscleVolumeMap, type ScheduleInput } from "~/engine";
import { applyWeekPlanToDb } from "./apply-week-plan";
import {
  applyLayoutToDb,
  availabilityFromRows,
  completedPlacement,
  firstOpenDay,
  placePlanWeeks,
  scheduleInputFromDb,
  weekDays,
  type ScheduleSettings,
  type WeekForSchedule,
} from "./schedule-adapters";

const UTC: ScheduleSettings = { mode: "DAY", availability: [], timezone: "UTC" };
const MON = new Date("2026-10-05T00:00:00Z"); // a Monday

function session(over: Partial<WeekForSchedule["sessions"][number]> & { id: string; order: number }) {
  return {
    weekId: "wk",
    splitSlot: "Upper A",
    dayOfWeek: null,
    daypart: null,
    targetDurationMin: 60,
    status: "SCHEDULED" as const,
    completedAt: null,
    prescriptions: [
      {
        id: `p-${over.id}`,
        trainingSessionId: over.id,
        exerciseId: "e1",
        order: 0,
        sets: 4,
        targetRepLow: 6,
        targetRepHigh: 10,
        targetRir: 2,
        exercise: {
          id: "e1",
          name: "Barbell Bench Press",
          movementPattern: "HORIZONTAL_PUSH" as const,
          equipment: "BARBELL" as const,
          contraindications: [],
          createdAt: new Date(),
        },
      },
    ],
    ...over,
  };
}

const week = (index: number, sessions: ReturnType<typeof session>[]): WeekForSchedule =>
  ({ id: `wk-${index}`, mesocycleId: "m", index, isDeload: false, sessions }) as WeekForSchedule;

describe("weekDays / firstOpenDay", () => {
  it("lists seven local dates starting on the block's start weekday", () => {
    const days = weekDays(MON, 2, "UTC");
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: "2026-10-12", weekday: 0 });
    expect(days[6]).toEqual({ date: "2026-10-18", weekday: 6 });
  });

  // Review Focus 1.
  it("starts the week on the athlete's local weekday", () => {
    const start = new Date("2026-10-06T23:30:00Z"); // Wed in Sydney, Tue in UTC
    expect(weekDays(start, 1, "Australia/Sydney")[0]).toEqual({ date: "2026-10-07", weekday: 2 });
    expect(weekDays(start, 1, "UTC")[0]).toEqual({ date: "2026-10-06", weekday: 1 });
  });

  it("counts elapsed local days into the week and clamps", () => {
    expect(firstOpenDay(MON, 1, "UTC", new Date("2026-10-05T10:00:00Z"))).toBe(0);
    expect(firstOpenDay(MON, 1, "UTC", new Date("2026-10-07T10:00:00Z"))).toBe(2);
    expect(firstOpenDay(MON, 2, "UTC", new Date("2026-10-07T10:00:00Z"))).toBe(0); // future week
    expect(firstOpenDay(MON, 1, "UTC", new Date("2026-11-01T10:00:00Z"))).toBe(7); // long past
  });
});

describe("scheduleInputFromDb", () => {
  const now = new Date("2026-10-07T10:00:00Z");

  it("builds sessions with footprints, placements and locks", () => {
    const w = week(1, [
      session({ id: "a", order: 0, dayOfWeek: 0, status: "COMPLETED", completedAt: MON }),
      session({ id: "b", order: 1 }),
    ]);
    const input = scheduleInputFromDb({ week: w, prevWeek: null, settings: UTC, startDate: MON, now });
    expect(input.mode).toBe("DAY");
    expect(input.weekStartDay).toBe(0);
    expect(input.firstOpenDay).toBe(2);
    expect(input.carryIn).toEqual([]);
    expect(input.sessions).toEqual([
      { id: "a", order: 0, footprint: expect.objectContaining({ CHEST: 4 }) as unknown, locked: true, placement: { day: 0, daypart: null } },
      { id: "b", order: 1, footprint: expect.objectContaining({ CHEST: 4 }) as unknown, locked: false, placement: null },
    ]);
  });

  it("carries in the previous week's placed sessions with their distance to the week start", () => {
    const prev = week(1, [session({ id: "p", order: 0, dayOfWeek: 6 }), session({ id: "q", order: 1 })]);
    const w = week(2, [session({ id: "a", order: 0 })]);
    const input: ScheduleInput = scheduleInputFromDb({ week: w, prevWeek: prev, settings: UTC, startDate: MON, now });
    expect(input.carryIn).toHaveLength(1);
    expect(input.carryIn[0]!.halfDaysBeforeWeekStart).toBe(2); // Sunday, one day before Monday
  });
});

describe("availabilityFromRows / completedPlacement", () => {
  it("renames dayOfWeek to day", () => {
    expect(availabilityFromRows([{ dayOfWeek: 3, daypart: "PM", state: "BLOCKED" }])).toEqual([
      { day: 3, daypart: "PM", state: "BLOCKED" },
    ]);
  });

  it("places a completed session on its local weekday and half", () => {
    const at = new Date("2026-10-06T23:30:00Z"); // Wed 10:30 in Sydney
    expect(completedPlacement(at, "Australia/Sydney", "HALF_DAY")).toEqual({ day: 2, daypart: "AM" });
    expect(completedPlacement(at, "Australia/Sydney", "DAY")).toEqual({ day: 2, daypart: null });
    expect(completedPlacement(at, "UTC", "HALF_DAY")).toEqual({ day: 1, daypart: "PM" });
  });
});

describe("applyLayoutToDb", () => {
  it("writes only the day and daypart of each session", async () => {
    const update = vi.fn().mockResolvedValue({});
    const tx = { trainingSession: { update } } as unknown as Prisma.TransactionClient;
    await applyLayoutToDb(tx, { a: { day: 2, daypart: "PM" }, b: { day: 4, daypart: null } });
    expect(update.mock.calls.map((c) => c[0] as unknown)).toEqual([
      { where: { id: "a" }, data: { dayOfWeek: 2, daypart: "PM" } },
      { where: { id: "b" }, data: { dayOfWeek: 4, daypart: null } },
    ]);
  });
});

describe("applyWeekPlanToDb (existing) keeps placements", () => {
  it("never writes dayOfWeek or daypart when prescriptions are rewritten", async () => {
    const update = vi.fn().mockResolvedValue({});
    const tx = {
      exercise: { findMany: vi.fn().mockResolvedValue([{ id: "e1", name: "Barbell Bench Press" }]) },
      exercisePrescription: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
      trainingSession: { update },
      weekMuscleVolume: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;
    await applyWeekPlanToDb(tx, "wk-1", {
      index: 1,
      isDeload: false,
      muscleVolume: {} as MuscleVolumeMap,
      sessions: [
        {
          slotId: "a",
          label: "Upper A",
          estimatedMinutes: 55,
          prescriptions: [{ exerciseName: "Barbell Bench Press", sets: 3, repRangeLow: 6, repRangeHigh: 10, targetRir: 2 }],
        },
      ],
    });
    for (const call of update.mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      expect(Object.keys(data)).toEqual(["targetDurationMin"]);
    }
  });
});

describe("placePlanWeeks", () => {
  const spec = resolveConstraints(
    {
      daysPerWeek: 4,
      splitType: "UPPER_LOWER",
      sessionLengthCapMin: 75,
      blockLengthWeeks: 4,
      checkInCadence: "WEEKLY",
      muscleTargets: [],
      excludedExerciseNames: [],
    },
    { experienceLevel: "INTERMEDIATE", phase: "MAINTAIN", landmarks: DEFAULT_LANDMARKS },
  );
  if (spec.kind !== "resolved") throw new Error("fixture constraint set must resolve");
  const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);

  it("places every session of every week, keyed by session index", () => {
    const layouts = placePlanWeeks(plan, UTC, MON, MON);
    expect(layouts).toHaveLength(plan.weeks.length);
    layouts.forEach((layout, i) => {
      expect(layout).not.toBeNull();
      expect(Object.keys(layout!).sort()).toEqual(plan.weeks[i]!.sessions.map((_, j) => String(j)));
      const days = Object.values(layout!).map((p) => p.day);
      expect(new Set(days).size).toBe(days.length);
    });
  });

  it("respects blocked days", () => {
    const blocked: ScheduleSettings = {
      ...UTC,
      availability: [
        { day: 5, daypart: "AM", state: "BLOCKED" },
        { day: 5, daypart: "PM", state: "BLOCKED" },
        { day: 6, daypart: "AM", state: "BLOCKED" },
        { day: 6, daypart: "PM", state: "BLOCKED" },
      ],
    };
    for (const layout of placePlanWeeks(plan, blocked, MON, MON)) {
      for (const p of Object.values(layout!)) expect(p.day).toBeLessThan(5);
    }
  });

  // Review Focus 3.
  it("returns null for a week that cannot be placed, without throwing", () => {
    const allBlocked: ScheduleSettings = {
      ...UTC,
      availability: [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
        { day, daypart: "AM" as const, state: "BLOCKED" as const },
        { day, daypart: "PM" as const, state: "BLOCKED" as const },
      ]),
    };
    expect(placePlanWeeks(plan, allBlocked, MON, MON).every((l) => l === null)).toBe(true);
  });

  it("produces layouts the hard rules accept", () => {
    const layouts = placePlanWeeks(plan, UTC, MON, MON);
    const first = layouts[0]!;
    const input: ScheduleInput = {
      mode: "DAY",
      weekStartDay: 0,
      firstOpenDay: 0,
      availability: [],
      carryIn: [],
      sessions: Object.keys(first).map((id, order) => ({ id, order, footprint: {}, locked: false, placement: null })),
    };
    expect(checkLayout(input, first)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/domain/local-day.test.ts src/server/mesocycle/schedule-adapters.test.ts`
Expected: FAIL, missing exports and missing module.

- [ ] **Step 3: Implement `local-day.ts`**

Append to `src/domain/local-day.ts`:

```ts
const DAY_MS = 24 * 60 * 60 * 1000;

function localParts(date: Date, tz: string): { y: number; m: number; d: number; h: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") };
}

/** Whole days since 1970-01-01 of the calendar date `date` falls on in `tz`. */
export function localDayNumber(date: Date, tz: string): number {
  const { y, m, d } = localParts(date, tz);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Hour of the day (0..23) in `tz`. */
export function localHour(date: Date, tz: string): number {
  return localParts(date, tz).h;
}

/** Weekday of a day number, 0 = Mon … 6 = Sun. Day 0 (1970-01-01) was a Thursday. */
export function weekdayOfDayNumber(n: number): number {
  return (((n + 3) % 7) + 7) % 7;
}

/** "YYYY-MM-DD" for a day number. */
export function isoDateOfDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Implement `schedule-adapters.ts`**

Create `src/server/mesocycle/schedule-adapters.ts`:

```ts
import type { Prisma } from "../../../generated/prisma";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { isoDateOfDayNumber, localDayNumber, localHour, weekdayOfDayNumber } from "~/domain/local-day";
import {
  footprintOf,
  placeWeek,
  placementPosition,
  type AvailabilityCellInput,
  type CarryIn,
  type Layout,
  type MesocyclePlan,
  type Placement,
  type ScheduleInput,
} from "~/engine";
import type { AvailabilityState, Daypart, ScheduleMode } from "~/schema";

export interface WeekDay {
  date: string; // "YYYY-MM-DD", the athlete's local date
  weekday: number; // 0 = Mon … 6 = Sun
}

/** The athlete's scheduling settings, as the engine needs them. */
export interface ScheduleSettings {
  mode: ScheduleMode;
  availability: AvailabilityCellInput[];
  timezone: string;
}

export const WEEK_FOR_SCHEDULE_INCLUDE = {
  sessions: { include: { prescriptions: { include: { exercise: true } } } },
} satisfies Prisma.WeekInclude;

export type WeekForSchedule = Prisma.WeekGetPayload<{ include: typeof WEEK_FOR_SCHEDULE_INCLUDE }>;

/** The seven local dates of a block week. Weeks are rolling: week 1 starts on the block's start date. */
export function weekDays(startDate: Date, weekIndex: number, tz: string): WeekDay[] {
  const first = localDayNumber(startDate, tz) + (weekIndex - 1) * 7;
  return Array.from({ length: 7 }, (_, i) => ({
    date: isoDateOfDayNumber(first + i),
    weekday: weekdayOfDayNumber(first + i),
  }));
}

/** Index (0..7) of today within a block week. 0 for a future week, 7 for a finished one. */
export function firstOpenDay(startDate: Date, weekIndex: number, tz: string, now: Date): number {
  const elapsed = localDayNumber(now, tz) - localDayNumber(startDate, tz) - (weekIndex - 1) * 7;
  return Math.min(Math.max(elapsed, 0), 7);
}

export function availabilityFromRows(
  rows: { dayOfWeek: number; daypart: Daypart; state: AvailabilityState }[],
): AvailabilityCellInput[] {
  return rows.map((r) => ({ day: r.dayOfWeek, daypart: r.daypart, state: r.state }));
}

function placementOf(s: { dayOfWeek: number | null; daypart: Daypart | null }): Placement | null {
  return s.dayOfWeek === null ? null : { day: s.dayOfWeek, daypart: s.daypart };
}

function footprintOfSession(s: WeekForSchedule["sessions"][number]) {
  return footprintOf(
    s.prescriptions.map((p) => ({ exerciseName: p.exercise.name, sets: p.sets })),
    EXERCISE_LIBRARY,
  );
}

/**
 * Persisted week → the engine's ScheduleInput. Session id = TrainingSession.id, so a
 * layout maps straight back to rows. A session is locked once it is no longer SCHEDULED.
 */
export function scheduleInputFromDb(args: {
  week: WeekForSchedule;
  prevWeek: WeekForSchedule | null;
  settings: ScheduleSettings;
  startDate: Date;
  now: Date;
}): ScheduleInput {
  const { week, prevWeek, settings, startDate, now } = args;
  const weekStartDay = weekDays(startDate, week.index, settings.timezone)[0]!.weekday;

  const carryIn: CarryIn[] = [];
  for (const s of prevWeek?.sessions ?? []) {
    const p = placementOf(s);
    if (!p) continue;
    carryIn.push({
      footprint: footprintOfSession(s),
      halfDaysBeforeWeekStart: 14 - placementPosition(p, weekStartDay),
    });
  }

  return {
    mode: settings.mode,
    weekStartDay,
    availability: settings.availability,
    carryIn,
    firstOpenDay: firstOpenDay(startDate, week.index, settings.timezone, now),
    sessions: [...week.sessions]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        id: s.id,
        order: s.order,
        footprint: footprintOfSession(s),
        locked: s.status !== "SCHEDULED",
        placement: placementOf(s),
      })),
  };
}

/** Write placements. Touches only `dayOfWeek` and `daypart`: never a prescription. */
export async function applyLayoutToDb(tx: Prisma.TransactionClient, layout: Layout): Promise<void> {
  for (const [id, p] of Object.entries(layout)) {
    await tx.trainingSession.update({ where: { id }, data: { dayOfWeek: p.day, daypart: p.daypart } });
  }
}

/** Where a session that was actually completed belongs: its local weekday and half. */
export function completedPlacement(completedAt: Date, tz: string, mode: ScheduleMode): Placement {
  const day = weekdayOfDayNumber(localDayNumber(completedAt, tz));
  if (mode === "DAY") return { day, daypart: null };
  return { day, daypart: localHour(completedAt, tz) < 12 ? "AM" : "PM" };
}

/**
 * Place every week of a freshly generated plan. Sessions have no ids yet, so each
 * layout is keyed by the session's index in `week.sessions`. A week that cannot be
 * placed yields null and the block is still created (the board offers an Unplaced tray).
 */
export function placePlanWeeks(
  plan: MesocyclePlan,
  settings: ScheduleSettings,
  startDate: Date,
  now: Date,
): (Layout | null)[] {
  const out: (Layout | null)[] = [];
  let prev: { layout: Layout; footprints: ReturnType<typeof footprintOf>[] } | null = null;

  for (const week of [...plan.weeks].sort((a, b) => a.index - b.index)) {
    const weekStartDay = weekDays(startDate, week.index, settings.timezone)[0]!.weekday;
    const footprints = week.sessions.map((s) =>
      footprintOf(
        s.prescriptions.map((p) => ({ exerciseName: p.exerciseName, sets: p.sets })),
        EXERCISE_LIBRARY,
      ),
    );
    const carryIn: CarryIn[] = prev
      ? Object.entries(prev.layout).map(([id, p]) => ({
          footprint: prev!.footprints[Number(id)] ?? {},
          halfDaysBeforeWeekStart: 14 - placementPosition(p, weekStartDay),
        }))
      : [];

    const res = placeWeek({
      mode: settings.mode,
      weekStartDay,
      availability: settings.availability,
      carryIn,
      firstOpenDay: firstOpenDay(startDate, week.index, settings.timezone, now),
      sessions: week.sessions.map((_, i) => ({
        id: String(i),
        order: i,
        footprint: footprints[i]!,
        locked: false,
        placement: null,
      })),
    });

    if (res.kind === "placed") {
      out.push(res.layout);
      prev = { layout: res.layout, footprints };
    } else {
      out.push(null);
      prev = null;
    }
  }
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/domain/local-day.test.ts src/server/mesocycle/schedule-adapters.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/local-day.ts src/domain/local-day.test.ts src/server/mesocycle/schedule-adapters.ts src/server/mesocycle/schedule-adapters.test.ts
git commit -m "feat(schedule): timezone-aware week dates and DB adapters"
```

---

### Task 6: Place sessions at block creation (persist + onboarding)

**Files:**
- Modify: `src/server/mesocycle/persist.ts`, `src/schema/onboarding.ts`, `src/server/api/routers/onboarding.ts`
- Test: `src/server/mesocycle/persist.test.ts` (new), `src/schema/onboarding.test.ts`

**Interfaces:**
- Consumes: `placePlanWeeks`, `ScheduleSettings` (Task 5); `ScheduleModeEnum`, `AvailabilityInputSchema`, `TimezoneSchema` (Task 1).
- Produces: `PersistMesocycleArgs.schedule?: ScheduleSettings` (defaults to `{ mode: "DAY", availability: [], timezone: "UTC" }`, which keeps the seed working unchanged). `OnboardingInput` gains `scheduleMode`, `availability`, `timezone`.

- [ ] **Step 1: Write the failing tests**

Create `src/server/mesocycle/persist.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../../generated/prisma";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import { generateMesocycle, resolveConstraints } from "~/engine";
import { persistMesocyclePlan } from "./persist";

const spec = resolveConstraints(
  {
    daysPerWeek: 4,
    splitType: "UPPER_LOWER",
    sessionLengthCapMin: 75,
    blockLengthWeeks: 4,
    checkInCadence: "WEEKLY",
    muscleTargets: [],
    excludedExerciseNames: [],
  },
  { experienceLevel: "INTERMEDIATE", phase: "MAINTAIN", landmarks: DEFAULT_LANDMARKS },
);
if (spec.kind !== "resolved") throw new Error("fixture constraint set must resolve");
const plan = generateMesocycle(spec, EXERCISE_LIBRARY, DEFAULT_LANDMARKS);

type SessionCreate = { order: number; dayOfWeek: number | null; daypart: "AM" | "PM" | null; prescriptions: unknown };

function fakeTx() {
  const weekCreate = vi.fn().mockResolvedValue({});
  const logCreateMany = vi.fn().mockResolvedValue({});
  const tx = {
    exercise: { findMany: vi.fn().mockResolvedValue(EXERCISE_LIBRARY.map((e, i) => ({ id: `e${i}`, name: e.name }))) },
    mesocycle: { create: vi.fn().mockResolvedValue({ id: "meso-1" }) },
    week: { create: weekCreate },
    decisionLog: { createMany: logCreateMany },
  } as unknown as Prisma.TransactionClient;
  const sessionsOf = (call: number): SessionCreate[] =>
    (weekCreate.mock.calls[call]![0] as { data: { sessions: { create: SessionCreate[] } } }).data.sessions.create;
  return { tx, weekCreate, logCreateMany, sessionsOf };
}

const base = { athleteProfileId: "ap", constraintSetId: "cs", plan, startDate: new Date("2026-10-05T00:00:00Z"), name: "Block 1" };

describe("persistMesocyclePlan — placement", () => {
  it("writes a distinct day for every session with default settings", async () => {
    const { tx, sessionsOf } = fakeTx();
    await persistMesocyclePlan(tx, base);
    const sessions = sessionsOf(0);
    expect(sessions.every((s) => s.dayOfWeek !== null && s.daypart === null)).toBe(true);
    expect(new Set(sessions.map((s) => s.dayOfWeek)).size).toBe(sessions.length);
  });

  it("writes dayparts in HALF_DAY mode", async () => {
    const { tx, sessionsOf } = fakeTx();
    await persistMesocyclePlan(tx, { ...base, schedule: { mode: "HALF_DAY", availability: [], timezone: "UTC" } });
    expect(sessionsOf(0).every((s) => s.daypart === "AM" || s.daypart === "PM")).toBe(true);
  });

  it("leaves prescriptions exactly as the plan has them (Law 1)", async () => {
    const { tx, sessionsOf } = fakeTx();
    await persistMesocyclePlan(tx, base);
    const written = sessionsOf(0).map(
      (s) => (s.prescriptions as { create: { sets: number }[] }).create.map((p) => p.sets),
    );
    expect(written).toEqual(plan.weeks[0]!.sessions.map((s) => s.prescriptions.map((p) => p.sets)));
  });

  // Review Focus 3.
  it("still creates the block, unplaced, when availability leaves no open cell", async () => {
    const { tx, sessionsOf, logCreateMany } = fakeTx();
    const availability = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
      { day, daypart: "AM" as const, state: "BLOCKED" as const },
      { day, daypart: "PM" as const, state: "BLOCKED" as const },
    ]);
    const res = await persistMesocyclePlan(tx, { ...base, schedule: { mode: "DAY", availability, timezone: "UTC" } });
    expect(res.weeks).toBe(plan.weeks.length);
    expect(sessionsOf(0).every((s) => s.dayOfWeek === null)).toBe(true);
    const logged = logCreateMany.mock.calls.flatMap((c) => (c[0] as { data: { type: string }[] }).data);
    expect(logged.some((d) => d.type === "SCHEDULE")).toBe(true);
  });
});
```

Add to `src/schema/onboarding.test.ts` inside the `describe`:

```ts
  it("defaults the schedule fields", () => {
    const parsed = OnboardingInputSchema.parse(valid);
    expect(parsed.scheduleMode).toBe("DAY");
    expect(parsed.availability).toEqual([]);
    expect(parsed.timezone).toBe("UTC");
  });

  it("accepts schedule fields and rejects an unknown timezone", () => {
    const ok = OnboardingInputSchema.parse({
      ...valid,
      scheduleMode: "HALF_DAY",
      availability: [{ day: 6, daypart: "AM", state: "BLOCKED" }],
      timezone: "Australia/Sydney",
    });
    expect(ok.scheduleMode).toBe("HALF_DAY");
    expect(OnboardingInputSchema.safeParse({ ...valid, timezone: "Nowhere/Land" }).success).toBe(false);
  });
```

If the existing "accepts a valid payload" test uses `toMatchObject(valid)` it still passes; do not change it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/server/mesocycle/persist.test.ts src/schema/onboarding.test.ts`
Expected: FAIL. Persist writes `dayOfWeek: null` everywhere; schema has no schedule fields.

- [ ] **Step 3: Implement the schema**

In `src/schema/onboarding.ts`, import the new pieces and add three fields to `OnboardingInputSchema` after `priorityMuscles`:

```ts
import {
  ExperienceLevelEnum,
  MuscleGroupEnum,
  ScheduleModeEnum,
  SexEnum,
  SplitTypeEnum,
} from "./enums";
import { AvailabilityInputSchema, TimezoneSchema } from "./schedule";
```

```ts
  scheduleMode: ScheduleModeEnum.default("DAY"),
  availability: AvailabilityInputSchema.default([]),
  timezone: TimezoneSchema.default("UTC"),
```

- [ ] **Step 4: Implement persist**

In `src/server/mesocycle/persist.ts`:

Add imports:

```ts
import { placePlanWeeks, type ScheduleSettings } from "./schedule-adapters";
```

Add to `PersistMesocycleArgs`:

```ts
  /** Athlete scheduling settings. Omitted = one-a-day, everything available, UTC. */
  schedule?: ScheduleSettings;
```

In `persistMesocyclePlan`, destructure `schedule` from `args`, and before the `for (const week of plan.weeks)` loop add:

```ts
  const settings: ScheduleSettings = schedule ?? { mode: "DAY", availability: [], timezone: "UTC" };
  const sortedIndexes = [...plan.weeks].sort((a, b) => a.index - b.index).map((w) => w.index);
  const layouts = placePlanWeeks(plan, settings, startDate, startDate);
  const layoutFor = (weekIndex: number) => layouts[sortedIndexes.indexOf(weekIndex)] ?? null;
```

Inside the session `create` map, replace `dayOfWeek: null,` with:

```ts
            dayOfWeek: layoutFor(week.index)?.[String(order)]?.day ?? null,
            daypart: layoutFor(week.index)?.[String(order)]?.daypart ?? null,
```

After the existing `if (plan.facts.length > 0) { … }` block add:

```ts
  const unplaced = sortedIndexes.filter((i) => layoutFor(i) === null);
  if (unplaced.length > 0) {
    await tx.decisionLog.createMany({
      data: unplaced.map((weekIndex) => ({
        mesocycleId: meso.id,
        weekIndex,
        type: "SCHEDULE" as const,
        status: "APPLIED" as const,
        summary: "Week left unplaced",
        reasoning: "infeasible",
        payload: { origin: "auto", facts: [{ kind: "infeasible", constraint: "schedule_cells", detail: {} }] },
      })),
    });
  }
```

Update the doc comment above the function to mention that sessions are placed against the athlete's schedule settings, and that a week which cannot be placed is persisted unplaced.

- [ ] **Step 5: Implement the onboarding router**

In `src/server/api/routers/onboarding.ts`, inside the transaction:

Add `scheduleMode: input.scheduleMode, timezone: input.timezone,` to BOTH the `update` and `create` objects of the `athleteProfile.upsert`.

Immediately after the upsert, replace the athlete's availability:

```ts
          await tx.availabilityCell.deleteMany({ where: { athleteProfileId: profile.id } });
          if (input.availability.length > 0) {
            await tx.availabilityCell.createMany({
              data: input.availability.map((c) => ({
                athleteProfileId: profile.id,
                dayOfWeek: c.day,
                daypart: c.daypart,
                state: c.state,
              })),
            });
          }
```

Pass the settings to persist by adding this property to the `persistMesocyclePlan` argument object:

```ts
            schedule: { mode: input.scheduleMode, availability: input.availability, timezone: input.timezone },
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run src/server/mesocycle src/schema && pnpm typecheck`
Expected: PASS and clean. If `tsc` flags an `OnboardingInput` literal in a test (for example `src/domain/onboarding-template.test.ts`), add `scheduleMode: "DAY", availability: [], timezone: "UTC",` to it.

- [ ] **Step 7: Commit**

```bash
git add src/server/mesocycle/persist.ts src/server/mesocycle/persist.test.ts src/schema/onboarding.ts src/schema/onboarding.test.ts src/server/api/routers/onboarding.ts
git commit -m "feat(schedule): place sessions when a block is created"
```

---

### Task 7: Views — placement on sessions, placement order, week dates, phrasing

**Files:**
- Modify: `src/views/types.ts`, `src/server/views/to-mesocycle-view.ts`, `src/views/next-session.ts`, `src/views/_fixtures/mock-block.ts`
- Create: `src/views/schedule.ts`
- Test: `src/views/schedule.test.ts`, `src/server/views/to-mesocycle-view.test.ts`, `src/views/next-session.test.ts`

**Interfaces:**
- Consumes: `weekDays` (Task 5); `placementPosition`, `savedLayout`, `scoreLayout`, `Layout`, `Placement`, `ScheduleInput`, `MoveSuggestion`, `DecisionFact`.
- Produces (from `~/views/types`): `PlacementView { day: number; daypart: "AM" | "PM" | null }`, `WeekDayView { date: string; weekday: number }`, `SessionView.placement?: PlacementView`, `WeekView.days: WeekDayView[]`.
- Produces (from `~/views/schedule`):

```ts
const DAY_NAMES: readonly ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
placementLabel(p: Placement): string                                   // "Tue" or "Tue PM"
phraseScheduleFact(fact: DecisionFact, label: (id: string) => string): string | null
toWarnings(facts: DecisionFact[], label: (id: string) => string): string[]
interface ScheduleSessionView { id: string; label: string; estimatedMinutes: number; status: SessionStatus; locked: boolean }
interface ScheduleWeekView { weekIndex: number; readOnly: boolean; mode: ScheduleMode; timezone: string; days: WeekDayView[]; sessions: ScheduleSessionView[]; input: ScheduleInput; layout: Layout; warnings: string[] }
interface MoveSuggestionView { sessionId: string; swapWithSessionId: string | null; from: Placement; to: Placement; headline: string; reasons: string[] }
toScheduleWeekView(args: Omit<ScheduleWeekView, "layout" | "warnings" | "sessions"> & { sessions: Omit<ScheduleSessionView, "locked">[] }): ScheduleWeekView
toMoveSuggestionView(s: MoveSuggestion, label: (id: string) => string): MoveSuggestionView
```

`~/views/schedule` is imported by client components, so its runtime imports must come from `~/engine/schedule`, never `~/engine`.

- [ ] **Step 1: Write the failing tests**

Create `src/views/schedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DecisionFact } from "~/engine";
import {
  phraseScheduleFact,
  placementLabel,
  toMoveSuggestionView,
  toScheduleWeekView,
  toWarnings,
} from "./schedule";

const label = (id: string) => ({ a: "Upper A", b: "Lower A" })[id] ?? "Session";

describe("placementLabel", () => {
  it("names the day, and the half when there is one", () => {
    expect(placementLabel({ day: 1, daypart: null })).toBe("Tue");
    expect(placementLabel({ day: 1, daypart: "PM" })).toBe("Tue PM");
  });
});

describe("phraseScheduleFact", () => {
  it("phrases short rest between two sessions in whole days", () => {
    const fact: DecisionFact = { kind: "short_rest", sessionId: "b", otherSessionId: "a", muscle: "QUADS", gapHalfDays: 2, targetHalfDays: 4 };
    expect(phraseScheduleFact(fact, label)).toBe("Lower A is only 1 day after Upper A, and both train quads.");
  });

  it("phrases odd gaps in half-days", () => {
    const fact: DecisionFact = { kind: "short_rest", sessionId: "b", otherSessionId: "a", muscle: "SIDE_DELTS", gapHalfDays: 3, targetHalfDays: 4 };
    expect(phraseScheduleFact(fact, label)).toBe("Lower A is only 3 half-days after Upper A, and both train side delts.");
  });

  it("phrases short rest against last week", () => {
    const fact: DecisionFact = { kind: "short_rest", sessionId: "a", otherSessionId: null, muscle: "CHEST", gapHalfDays: 2, targetHalfDays: 4 };
    expect(phraseScheduleFact(fact, label)).toBe("Upper A is only 1 day after last week's chest work.");
  });

  it("phrases the remaining schedule facts", () => {
    expect(phraseScheduleFact({ kind: "load_streak", days: 5, limit: 3 }, label)).toBe("5 training days in a row.");
    expect(phraseScheduleFact({ kind: "same_day_stack", day: 2, sessionIds: ["a", "b"], sharedSets: 0 }, label)).toBe(
      "Upper A and Lower A are both on Wed.",
    );
    expect(phraseScheduleFact({ kind: "off_preference", sessionId: "a" }, label)).toBe(
      "Upper A isn't in one of your preferred times.",
    );
    expect(phraseScheduleFact({ kind: "uneven_spread", longestGapDays: 5, shortestGapDays: 1 }, label)).toBe(
      "Sessions are bunched together, leaving a 5-day gap.",
    );
    expect(phraseScheduleFact({ kind: "on_blocked_cell", sessionId: "a", day: 3, daypart: "AM" }, label)).toBe(
      "Upper A is on Thu AM, which you've blocked.",
    );
  });

  it("returns null for facts that are not about scheduling", () => {
    expect(phraseScheduleFact({ kind: "deload_scheduled", atWeek: 6 }, label)).toBeNull();
  });
});

describe("toWarnings", () => {
  it("keeps only schedule facts, in order", () => {
    const facts: DecisionFact[] = [
      { kind: "deload_scheduled", atWeek: 6 },
      { kind: "load_streak", days: 4, limit: 3 },
    ];
    expect(toWarnings(facts, label)).toEqual(["4 training days in a row."]);
  });
});

describe("toMoveSuggestionView", () => {
  it("describes a move", () => {
    const view = toMoveSuggestionView(
      {
        sessionId: "b",
        from: { day: 1, daypart: null },
        to: { day: 3, daypart: null },
        swapWithSessionId: null,
        gain: 12,
        resolves: [{ kind: "short_rest", sessionId: "b", otherSessionId: "a", muscle: "QUADS", gapHalfDays: 2, targetHalfDays: 4 }],
      },
      label,
    );
    expect(view.headline).toBe("Move Lower A from Tue to Thu.");
    expect(view.reasons).toEqual(["Lower A is only 1 day after Upper A, and both train quads."]);
  });

  it("describes a swap", () => {
    const view = toMoveSuggestionView(
      { sessionId: "a", from: { day: 0, daypart: null }, to: { day: 1, daypart: null }, swapWithSessionId: "b", gain: 5, resolves: [] },
      label,
    );
    expect(view.headline).toBe("Swap Upper A (Mon) with Lower A (Tue).");
  });
});

describe("toScheduleWeekView", () => {
  it("derives the saved layout, locks and warnings from the input", () => {
    const view = toScheduleWeekView({
      weekIndex: 1,
      readOnly: false,
      mode: "DAY",
      timezone: "UTC",
      days: [],
      sessions: [
        { id: "a", label: "Upper A", estimatedMinutes: 60, status: "COMPLETED" },
        { id: "b", label: "Lower A", estimatedMinutes: 50, status: "SCHEDULED" },
      ],
      input: {
        mode: "DAY",
        weekStartDay: 0,
        firstOpenDay: 0,
        availability: [],
        carryIn: [],
        sessions: [
          { id: "a", order: 0, footprint: { QUADS: 6 }, locked: true, placement: { day: 0, daypart: null } },
          { id: "b", order: 1, footprint: { QUADS: 6 }, locked: false, placement: { day: 1, daypart: null } },
        ],
      },
    });
    expect(view.layout).toEqual({ a: { day: 0, daypart: null }, b: { day: 1, daypart: null } });
    expect(view.sessions.map((s) => s.locked)).toEqual([true, false]);
    expect(view.warnings).toContain("Lower A is only 1 day after Upper A, and both train quads.");
  });
});
```

Replace the body of `src/views/next-session.test.ts`'s `weekWith` and `session` helpers and add two tests:

```ts
function weekWith(sessions: SessionView[]): WeekView {
  return { index: 1, isDeload: false, isCurrent: true, totalSets: 0, sessions, cells: [], days: [] };
}

const session = (slotId: string, status: SessionView["status"] = "SCHEDULED"): SessionView => ({
  slotId,
  label: slotId,
  estimatedMinutes: 40,
  status,
  prescriptions: [],
});
```

```ts
  it("skips sessions that are already completed or missed", () => {
    const week = weekWith([session("upper-a", "COMPLETED"), session("lower-a", "MISSED"), session("upper-b")]);
    expect(nextSession(week)?.slotId).toBe("upper-b");
  });

  it("returns undefined when nothing is left to train", () => {
    expect(nextSession(weekWith([session("upper-a", "COMPLETED")]))).toBeUndefined();
  });
```

In `src/server/views/to-mesocycle-view.test.ts`:

1. In `makeMesocycle`'s returned object add `athleteProfile: { timezone: "UTC" },` next to `constraintSet`.
2. Add these tests in the main `describe`:

```ts
  it("orders sessions by their position in the rolling week, unplaced last", () => {
    // Block starts on a Wednesday, so the week runs Wed … Tue.
    const m = makeMesocycle({ startDate: new Date("2026-10-07T00:00:00Z") });
    const sessions = m.weeks[0]!.sessions;
    const lower = sessions.find((s) => s.splitSlot === "Lower A")!;
    const upper = sessions.find((s) => s.splitSlot === "Upper A")!;
    lower.dayOfWeek = 3; // Thu, second day of the week
    upper.dayOfWeek = 0; // Mon, sixth day of the week
    const week = toMesocycleView(m).weeks[0]!;
    expect(week.sessions.map((s) => s.label)).toEqual(["Lower A", "Upper A"]);
    expect(week.sessions[0]!.placement).toEqual({ day: 3, daypart: null });

    lower.dayOfWeek = null;
    expect(toMesocycleView(m).weeks[0]!.sessions.map((s) => s.label)).toEqual(["Upper A", "Lower A"]);
  });

  it("gives each week seven local dates starting on the block's start weekday", () => {
    const m = makeMesocycle({ startDate: new Date("2026-10-07T00:00:00Z") });
    const view = toMesocycleView(m);
    expect(view.weeks[0]!.days).toHaveLength(7);
    expect(view.weeks[0]!.days[0]).toEqual({ date: "2026-10-07", weekday: 2 });
    expect(view.weeks[1]!.days[0]).toEqual({ date: "2026-10-14", weekday: 2 });
  });

  it("gives a block with no start date no dates", () => {
    expect(toMesocycleView(makeMesocycle({ startDate: null })).weeks[0]!.days).toEqual([]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/views src/server/views`
Expected: FAIL. `./schedule` missing, `days` missing, completed sessions returned by `nextSession`.

- [ ] **Step 3: Implement the type and mapper changes**

In `src/views/types.ts` add before `SessionView`:

```ts
export interface PlacementView {
  day: number; // 0 = Mon … 6 = Sun
  daypart: "AM" | "PM" | null;
}

export interface WeekDayView {
  date: string; // "YYYY-MM-DD", the athlete's local date
  weekday: number; // 0 = Mon … 6 = Sun
}
```

Add `placement?: PlacementView; // undefined = not placed yet` to `SessionView` after `dayTag`, and `days: WeekDayView[]; // seven local dates, or [] when the block has no start date` to `WeekView` after `cells`.

In `src/views/_fixtures/mock-block.ts`, add `days: [],` to the object `week()` returns.

In `src/views/next-session.ts`:

```ts
import type { SessionView, WeekView } from "~/views/types";

/** The next session to train in a week: the first still-scheduled one, in the order
 * the week lays them out (placement order). Undefined when nothing is left. */
export function nextSession(week: WeekView): SessionView | undefined {
  return week.sessions.find((s) => s.status === "SCHEDULED");
}
```

Then open `src/app/app/page.tsx` and confirm every use of the `session` it gets from `nextSession` already handles `undefined` (it is typed `SessionView | undefined` today). If a component receives it unguarded, guard it there.

In `src/server/views/to-mesocycle-view.ts`:

Add imports:

```ts
import { placementPosition } from "~/engine";
import { weekDays } from "~/server/mesocycle/schedule-adapters";
```

and add `WeekDayView` to the `~/views/types` import list.

Add to `MESOCYCLE_INCLUDE`, before `constraintSet`:

```ts
  athleteProfile: { select: { timezone: true } },
```

In `toSessionView`, after the `dayTag` line add:

```ts
    placement: s.dayOfWeek == null ? undefined : { day: s.dayOfWeek, daypart: s.daypart },
```

Change `toWeekView`'s signature and its first line:

```ts
function toWeekView(
  w: WeekWithRelations,
  curIdx: number,
  muscles: readonly MuscleGroup[],
  days: WeekDayView[],
): WeekView {
  // Placement order within the rolling week; unplaced sessions keep plan order at the end.
  const startDay = days[0]?.weekday ?? 0;
  const position = (s: SessionWithRelations) =>
    s.dayOfWeek == null
      ? Number.POSITIVE_INFINITY
      : placementPosition({ day: s.dayOfWeek, daypart: s.daypart }, startDay);
  const sessions = [...w.sessions]
    .sort((a, b) => {
      const pa = position(a);
      const pb = position(b);
      return pa === pb ? a.order - b.order : pa - pb;
    })
    .map(toSessionView);
```

Add `days,` to the object `toWeekView` returns.

In `toMesocycleView`, replace the `const weeks = …` line with:

```ts
  const tz = m.athleteProfile.timezone;
  const weeks = [...m.weeks]
    .sort((a, b) => a.index - b.index)
    .map((w) => toWeekView(w, curIdx, muscles, m.startDate ? weekDays(m.startDate, w.index, tz) : []));
```

- [ ] **Step 4: Implement `src/views/schedule.ts`**

```ts
import type { DecisionFact } from "~/engine/facts";
import {
  savedLayout,
  scoreLayout,
  type Layout,
  type MoveSuggestion,
  type Placement,
  type ScheduleInput,
} from "~/engine/schedule";
import type { ScheduleMode } from "~/schema";
import type { SessionStatus, WeekDayView } from "~/views/types";

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface ScheduleSessionView {
  id: string;
  label: string;
  estimatedMinutes: number;
  status: SessionStatus;
  locked: boolean;
}

export interface ScheduleWeekView {
  weekIndex: number;
  /** A past week: shown, not editable. */
  readOnly: boolean;
  mode: ScheduleMode;
  timezone: string;
  days: WeekDayView[];
  sessions: ScheduleSessionView[];
  /** Shipped so the browser can score drafts with the same engine code. */
  input: ScheduleInput;
  layout: Layout;
  warnings: string[];
}

export interface MoveSuggestionView {
  sessionId: string;
  swapWithSessionId: string | null;
  from: Placement;
  to: Placement;
  headline: string;
  reasons: string[];
}

export function placementLabel(p: Placement): string {
  const name = DAY_NAMES[p.day] ?? "?";
  return p.daypart ? `${name} ${p.daypart}` : name;
}

function muscleName(m: string): string {
  return m.replace(/_/g, " ").toLowerCase();
}

function restText(halfDays: number): string {
  if (halfDays % 2 === 0) {
    const days = halfDays / 2;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${halfDays} half-day${halfDays === 1 ? "" : "s"}`;
}

/** One schedule fact → one sentence. Deterministic: the engine supplies every number
 * (Law 2). Returns null for facts that are not about scheduling. */
export function phraseScheduleFact(fact: DecisionFact, label: (id: string) => string): string | null {
  switch (fact.kind) {
    case "short_rest":
      return fact.otherSessionId === null
        ? `${label(fact.sessionId)} is only ${restText(fact.gapHalfDays)} after last week's ${muscleName(fact.muscle)} work.`
        : `${label(fact.sessionId)} is only ${restText(fact.gapHalfDays)} after ${label(fact.otherSessionId)}, and both train ${muscleName(fact.muscle)}.`;
    case "load_streak":
      return `${fact.days} training days in a row.`;
    case "same_day_stack":
      return `${label(fact.sessionIds[0])} and ${label(fact.sessionIds[1])} are both on ${DAY_NAMES[fact.day] ?? "?"}.`;
    case "off_preference":
      return `${label(fact.sessionId)} isn't in one of your preferred times.`;
    case "uneven_spread":
      return `Sessions are bunched together, leaving a ${fact.longestGapDays}-day gap.`;
    case "on_blocked_cell":
      return `${label(fact.sessionId)} is on ${placementLabel({ day: fact.day, daypart: fact.daypart })}, which you've blocked.`;
    default:
      return null;
  }
}

export function toWarnings(facts: DecisionFact[], label: (id: string) => string): string[] {
  return facts.map((f) => phraseScheduleFact(f, label)).filter((t): t is string => t !== null);
}

export function toMoveSuggestionView(s: MoveSuggestion, label: (id: string) => string): MoveSuggestionView {
  const headline =
    s.swapWithSessionId === null
      ? `Move ${label(s.sessionId)} from ${placementLabel(s.from)} to ${placementLabel(s.to)}.`
      : `Swap ${label(s.sessionId)} (${placementLabel(s.from)}) with ${label(s.swapWithSessionId)} (${placementLabel(s.to)}).`;
  return {
    sessionId: s.sessionId,
    swapWithSessionId: s.swapWithSessionId,
    from: s.from,
    to: s.to,
    headline,
    reasons: toWarnings(s.resolves, label),
  };
}

export function toScheduleWeekView(
  args: Omit<ScheduleWeekView, "layout" | "warnings" | "sessions"> & {
    sessions: Omit<ScheduleSessionView, "locked">[];
  },
): ScheduleWeekView {
  const layout = savedLayout(args.input);
  const label = (id: string) => args.sessions.find((s) => s.id === id)?.label ?? "Session";
  return {
    ...args,
    sessions: args.sessions.map((s) => ({ ...s, locked: s.status !== "SCHEDULED" })),
    layout,
    warnings: toWarnings(scoreLayout(args.input, layout).facts, label),
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/views src/server/views && pnpm typecheck`
Expected: PASS and clean. If `tsc` flags another hand-built `WeekView` literal, add `days: []` to it.

- [ ] **Step 6: Commit**

```bash
git add src/views src/server/views src/app/app/page.tsx
git commit -m "feat(schedule): placement-ordered views, week dates and fact phrasing"
```

---

### Task 8: `schedule` router — read, apply, suggest, dismiss

**Files:**
- Create: `src/server/api/routers/schedule.ts`
- Modify: `src/server/api/root.ts`
- Test: `src/server/api/routers/schedule.test.ts`

**Interfaces:**
- Consumes: `ApplyLayoutInputSchema` (Task 1); engine `checkLayout`, `layoutKey`, `samePlacement`, `savedLayout`, `scoreLayout`, `suggestMoves`; adapters `scheduleInputFromDb`, `applyLayoutToDb`, `availabilityFromRows`, `weekDays`, `WEEK_FOR_SCHEDULE_INCLUDE` (Task 5); `currentWeekIndex` from `~/server/views/to-mesocycle-view`; views (Task 7).
- Produces (tRPC, all `protectedProcedure`):

```ts
schedule.getWeekSchedule({ weekIndex }) → ScheduleWeekView
schedule.getSuggestions({ weekIndex }) → MoveSuggestionView[]
schedule.applyLayout(ApplyLayoutInput) → { weekIndex: number; applied: number[]; skipped: { weekIndex: number; reason: "already_started" | "different_sessions" | "not_allowed" }[] }
schedule.dismissSuggestion({ weekIndex }) → { ok: true }
```

`applied` lists the *later* weeks the layout was carried to. `DecisionLog.payload` for a `SCHEDULE` row is `{ origin: "athlete" | "suggestion" | "carry_forward" | "auto", before: Layout, after: Layout, facts: DecisionFact[] }`; a dismissal's payload is `{ layoutKey: string }`.

- [ ] **Step 1: Write the failing tests**

Create `src/server/api/routers/schedule.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCallerFactory } from "~/server/api/trpc";
import { scheduleRouter } from "./schedule";

const createCaller = createCallerFactory(scheduleRouter);

// Wednesday 7 Oct 2026 (UTC). The block started Monday 5 Oct, so week 1 runs Mon…Sun
// and Monday and Tuesday are already in the past (firstOpenDay = 2).
const NOW = new Date("2026-10-07T02:00:00Z");
const START = new Date("2026-10-05T00:00:00Z");

// Fake only Date: tRPC's dev timing middleware awaits a real setTimeout.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

type Status = "SCHEDULED" | "COMPLETED" | "MISSED";

function sessionRow(id: string, weekId: string, order: number, label: string, dayOfWeek: number | null, status: Status = "SCHEDULED") {
  return {
    id,
    weekId,
    order,
    splitSlot: label,
    dayOfWeek,
    daypart: null,
    targetDurationMin: 60,
    status,
    completedAt: status === "COMPLETED" ? START : null,
    prescriptions: [
      {
        id: `p-${id}`,
        trainingSessionId: id,
        exerciseId: "e1",
        order: 0,
        sets: 4,
        targetRepLow: 6,
        targetRepHigh: 10,
        targetRir: 2,
        exercise: { id: "e1", name: "Barbell Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "BARBELL", contraindications: [] },
      },
    ],
  };
}

function weekRow(index: number, sessions: ReturnType<typeof sessionRow>[]) {
  return { id: `wk-${index}`, mesocycleId: "meso-1", index, isDeload: false, sessions };
}

interface Opts {
  noBlock?: boolean;
  week1?: ReturnType<typeof sessionRow>[];
  laterWeeks?: ReturnType<typeof weekRow>[];
  availability?: { dayOfWeek: number; daypart: "AM" | "PM"; state: "PREFERRED" | "BLOCKED" }[];
  dismissed?: { payload: unknown }[];
  stillScheduled?: number;
}

function makeCaller(opts: Opts = {}) {
  const week1 = opts.week1 ?? [sessionRow("s1", "wk-1", 0, "Upper A", 3), sessionRow("s2", "wk-1", 1, "Upper B", 5)];
  const meso = {
    id: "meso-1",
    startDate: START,
    lengthWeeks: 4,
    athleteProfile: { scheduleMode: "DAY", timezone: "UTC", availability: opts.availability ?? [] },
    weeks: [weekRow(1, week1)],
  };
  const db = {
    mesocycle: { findFirst: vi.fn().mockResolvedValue(opts.noBlock ? null : meso) },
    week: { findMany: vi.fn().mockResolvedValue(opts.laterWeeks ?? []) },
    trainingSession: {
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockImplementation((args: { where: { id: { in: string[] } } }) =>
        Promise.resolve(opts.stillScheduled ?? args.where.id.in.length),
      ),
    },
    decisionLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue(opts.dismissed ?? []),
    },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  const caller = createCaller({ db, session: { user: { id: "user-1" } } } as unknown as Parameters<typeof createCaller>[0]);
  return { caller, db };
}

const expectedOf = (rows: { sessionId: string; day: number | null }[]) =>
  rows.map((r) => ({ sessionId: r.sessionId, placement: r.day === null ? null : { day: r.day, daypart: null } }));
const SAVED = expectedOf([
  { sessionId: "s1", day: 3 },
  { sessionId: "s2", day: 5 },
]);

describe("getWeekSchedule", () => {
  it("returns the saved layout, dates and engine input, scoped to the signed-in athlete", async () => {
    const { caller, db } = makeCaller();
    const view = await caller.getWeekSchedule({ weekIndex: 1 });
    expect(view.layout).toEqual({ s1: { day: 3, daypart: null }, s2: { day: 5, daypart: null } });
    expect(view.days[0]).toEqual({ date: "2026-10-05", weekday: 0 });
    expect(view.input.firstOpenDay).toBe(2);
    expect(view.readOnly).toBe(false);
    expect(view.sessions.map((s) => s.label)).toEqual(["Upper A", "Upper B"]);
    const where = (db.mesocycle.findFirst.mock.calls[0]![0] as { where: unknown }).where;
    expect(where).toEqual({ status: "ACTIVE", athleteProfile: { userId: "user-1" } });
  });

  it("is NOT_FOUND without an active block", async () => {
    const { caller } = makeCaller({ noBlock: true });
    await expect(caller.getWeekSchedule({ weekIndex: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is NOT_FOUND for a week the block does not have", async () => {
    const { caller } = makeCaller();
    await expect(caller.getWeekSchedule({ weekIndex: 9 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("applyLayout", () => {
  const move = (day: number) => ({
    weekIndex: 1,
    placements: [{ sessionId: "s2", day, daypart: null }],
    expected: SAVED,
    origin: "athlete" as const,
  });

  it("writes only the moved session and records a SCHEDULE decision", async () => {
    const { caller, db } = makeCaller();
    const res = await caller.applyLayout(move(6));
    expect(res).toEqual({ weekIndex: 1, applied: [], skipped: [] });
    expect(db.trainingSession.update).toHaveBeenCalledTimes(1);
    expect(db.trainingSession.update).toHaveBeenCalledWith({ where: { id: "s2" }, data: { dayOfWeek: 6, daypart: null } });
    const log = (db.decisionLog.create.mock.calls[0]![0] as { data: { type: string; status: string; weekIndex: number; payload: { origin: string; before: unknown; after: unknown } } }).data;
    expect(log.type).toBe("SCHEDULE");
    expect(log.status).toBe("APPLIED");
    expect(log.weekIndex).toBe(1);
    expect(log.payload.origin).toBe("athlete");
    expect(log.payload.before).toEqual({ s1: { day: 3, daypart: null }, s2: { day: 5, daypart: null } });
    expect(log.payload.after).toEqual({ s1: { day: 3, daypart: null }, s2: { day: 6, daypart: null } });
  });

  it("writes nothing when nothing moved", async () => {
    const { caller, db } = makeCaller();
    await caller.applyLayout(move(5));
    expect(db.trainingSession.update).not.toHaveBeenCalled();
    expect(db.decisionLog.create).not.toHaveBeenCalled();
  });

  it("is CONFLICT when the client's starting point is stale (second tab, double submit)", async () => {
    const { caller, db } = makeCaller();
    const stale = { ...move(6), expected: expectedOf([{ sessionId: "s1", day: 3 }, { sessionId: "s2", day: 4 }]) };
    await expect(caller.applyLayout(stale)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.trainingSession.update).not.toHaveBeenCalled();
  });

  it("is CONFLICT when expected does not cover every session in the week", async () => {
    const { caller } = makeCaller();
    const partial = { ...move(6), expected: expectedOf([{ sessionId: "s2", day: 5 }]) };
    await expect(caller.applyLayout(partial)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("is CONFLICT when a moved session stopped being SCHEDULED mid-flight", async () => {
    const { caller, db } = makeCaller({ stillScheduled: 0 });
    await expect(caller.applyLayout(move(6))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.trainingSession.update).not.toHaveBeenCalled();
  });

  it("refuses to move a completed session", async () => {
    const { caller } = makeCaller({
      week1: [sessionRow("s1", "wk-1", 0, "Upper A", 3), sessionRow("s2", "wk-1", 1, "Upper B", 5, "COMPLETED")],
    });
    await expect(caller.applyLayout(move(6))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a day that has already passed", async () => {
    const { caller } = makeCaller();
    await expect(caller.applyLayout(move(0))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a blocked day", async () => {
    const { caller } = makeCaller({
      availability: [
        { dayOfWeek: 6, daypart: "AM", state: "BLOCKED" },
        { dayOfWeek: 6, daypart: "PM", state: "BLOCKED" },
      ],
    });
    await expect(caller.applyLayout(move(6))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses two sessions on one day", async () => {
    const { caller } = makeCaller();
    await expect(caller.applyLayout(move(3))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a session id from outside the week", async () => {
    const { caller } = makeCaller();
    const foreign = { ...move(6), placements: [{ sessionId: "elsewhere", day: 6, daypart: null }] };
    await expect(caller.applyLayout(foreign)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("carries the layout forward to untouched weeks and reports the ones it skipped", async () => {
    const laterWeeks = [
      weekRow(2, [sessionRow("a1", "wk-2", 0, "Upper A", 3), sessionRow("a2", "wk-2", 1, "Upper B", 5)]),
      weekRow(3, [sessionRow("b1", "wk-3", 0, "Upper A", 3, "COMPLETED"), sessionRow("b2", "wk-3", 1, "Upper B", 5)]),
      weekRow(4, [sessionRow("c1", "wk-4", 0, "Upper A", 3)]),
    ];
    const { caller, db } = makeCaller({ laterWeeks });
    const res = await caller.applyLayout({ ...move(6), carryForward: true });
    expect(res.applied).toEqual([2]);
    expect(res.skipped).toEqual([
      { weekIndex: 3, reason: "already_started" },
      { weekIndex: 4, reason: "different_sessions" },
    ]);
    expect(db.trainingSession.update).toHaveBeenCalledWith({ where: { id: "a2" }, data: { dayOfWeek: 6, daypart: null } });
    expect(db.trainingSession.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: "b2" } }));
  });
});

describe("getSuggestions / dismissSuggestion", () => {
  // Two chest sessions on consecutive days: the engine should want them apart.
  const tight = [sessionRow("s1", "wk-1", 0, "Upper A", 3), sessionRow("s2", "wk-1", 1, "Upper B", 4)];

  it("suggests a move for a layout with a recovery problem", async () => {
    const { caller } = makeCaller({ week1: tight });
    const out = await caller.getSuggestions({ weekIndex: 1 });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]!.headline).toMatch(/^(Move|Swap) /);
    expect(out[0]!.reasons.length).toBeGreaterThan(0);
  });

  it("returns nothing once that exact layout was dismissed", async () => {
    const { caller } = makeCaller({ week1: tight, dismissed: [{ payload: { layoutKey: "s1:3:-|s2:4:-" } }] });
    expect(await caller.getSuggestions({ weekIndex: 1 })).toEqual([]);
  });

  it("suggests again when the dismissed layout was a different one", async () => {
    const { caller } = makeCaller({ week1: tight, dismissed: [{ payload: { layoutKey: "s1:3:-|s2:6:-" } }] });
    expect((await caller.getSuggestions({ weekIndex: 1 })).length).toBeGreaterThan(0);
  });

  it("records a dismissal against the current layout", async () => {
    const { caller, db } = makeCaller({ week1: tight });
    await caller.dismissSuggestion({ weekIndex: 1 });
    const log = (db.decisionLog.create.mock.calls[0]![0] as { data: { type: string; status: string; payload: unknown } }).data;
    expect(log.type).toBe("SCHEDULE");
    expect(log.status).toBe("REJECTED");
    expect(log.payload).toEqual({ layoutKey: "s1:3:-|s2:4:-" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/server/api/routers/schedule.test.ts`
Expected: FAIL, cannot resolve `./schedule`.

- [ ] **Step 3: Implement the router**

Create `src/server/api/routers/schedule.ts`:

```ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "../../../../generated/prisma";
import {
  checkLayout,
  layoutKey,
  samePlacement,
  savedLayout,
  scoreLayout,
  suggestMoves,
  type HardViolationKind,
  type Layout,
} from "~/engine";
import { ApplyLayoutInputSchema } from "~/schema";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  applyLayoutToDb,
  availabilityFromRows,
  scheduleInputFromDb,
  weekDays,
  WEEK_FOR_SCHEDULE_INCLUDE,
  type ScheduleSettings,
} from "~/server/mesocycle/schedule-adapters";
import { currentWeekIndex } from "~/server/views/to-mesocycle-view";
import {
  toMoveSuggestionView,
  toScheduleWeekView,
  type MoveSuggestionView,
  type ScheduleWeekView,
} from "~/views/schedule";

type Tx = Prisma.TransactionClient;
type SkipReason = "already_started" | "different_sessions" | "not_allowed";

const WeekInput = z.object({ weekIndex: z.number().int().min(1) });

const VIOLATION_MESSAGE: Record<HardViolationKind, string> = {
  blocked_cell: "That time is blocked in your availability.",
  occupied: "Two sessions can't share the same time.",
  day_limit: "You're set to one session a day.",
  in_past: "That day has already passed.",
  locked: "A completed or missed session can't be moved.",
  mode_mismatch: "That placement doesn't match your schedule mode.",
  unknown_session: "That session isn't in this week.",
};

/** Everything about one week of the signed-in athlete's ACTIVE block that scheduling
 * needs. Throws NOT_FOUND when the block or the week isn't theirs. */
async function loadWeekContext(db: Pick<Tx, "mesocycle">, userId: string, weekIndex: number, now: Date) {
  const meso = await db.mesocycle.findFirst({
    where: { status: "ACTIVE", athleteProfile: { userId } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      startDate: true,
      lengthWeeks: true,
      athleteProfile: { select: { scheduleMode: true, timezone: true, availability: true } },
      weeks: { where: { index: { in: [weekIndex - 1, weekIndex] } }, include: WEEK_FOR_SCHEDULE_INCLUDE },
    },
  });
  if (!meso) throw new TRPCError({ code: "NOT_FOUND" });
  const week = meso.weeks.find((w) => w.index === weekIndex);
  if (!week) throw new TRPCError({ code: "NOT_FOUND" });

  const startDate = meso.startDate ?? now;
  const settings: ScheduleSettings = {
    mode: meso.athleteProfile.scheduleMode,
    availability: availabilityFromRows(meso.athleteProfile.availability),
    timezone: meso.athleteProfile.timezone,
  };
  const input = scheduleInputFromDb({
    week,
    prevWeek: meso.weeks.find((w) => w.index === weekIndex - 1) ?? null,
    settings,
    startDate,
    now,
  });
  return {
    mesocycleId: meso.id,
    week,
    settings,
    startDate,
    input,
    readOnly: weekIndex < currentWeekIndex(meso.startDate, meso.lengthWeeks, now),
    days: weekDays(startDate, weekIndex, settings.timezone),
    label: (id: string) => week.sessions.find((s) => s.id === id)?.splitSlot ?? "Session",
  };
}

export const scheduleRouter = createTRPCRouter({
  // Read: the week's layout plus the engine input, so the browser can score drafts.
  getWeekSchedule: protectedProcedure.input(WeekInput).query(async ({ ctx, input }): Promise<ScheduleWeekView> => {
    const c = await loadWeekContext(ctx.db, ctx.session.user.id, input.weekIndex, new Date());
    return toScheduleWeekView({
      weekIndex: input.weekIndex,
      readOnly: c.readOnly,
      mode: c.settings.mode,
      timezone: c.settings.timezone,
      days: c.days,
      sessions: [...c.week.sessions]
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ id: s.id, label: s.splitSlot, estimatedMinutes: s.targetDurationMin ?? 0, status: s.status })),
      input: c.input,
    });
  }),

  // Read: the engine's best single tweaks to the saved layout. Mutates nothing.
  getSuggestions: protectedProcedure.input(WeekInput).query(async ({ ctx, input }): Promise<MoveSuggestionView[]> => {
    const c = await loadWeekContext(ctx.db, ctx.session.user.id, input.weekIndex, new Date());
    if (c.readOnly) return [];
    const layout = savedLayout(c.input);
    const key = layoutKey(layout);
    const dismissed = await ctx.db.decisionLog.findMany({
      where: { mesocycleId: c.mesocycleId, weekIndex: input.weekIndex, type: "SCHEDULE", status: "REJECTED" },
      select: { payload: true },
    });
    const wasDismissed = dismissed.some(
      (d) => typeof d.payload === "object" && d.payload !== null && (d.payload as { layoutKey?: unknown }).layoutKey === key,
    );
    if (wasDismissed) return [];
    return suggestMoves(c.input, layout).map((s) => toMoveSuggestionView(s, c.label));
  }),

  // The only placement write. An athlete's own move is recorded, not gated; a
  // suggestion only arrives here because the athlete pressed Accept.
  applyLayout: protectedProcedure.input(ApplyLayoutInputSchema).mutation(
    async ({ ctx, input }): Promise<{ weekIndex: number; applied: number[]; skipped: { weekIndex: number; reason: SkipReason }[] }> => {
      const userId = ctx.session.user.id;
      const now = new Date();
      return ctx.db.$transaction(
        async (tx) => {
          const c = await loadWeekContext(tx, userId, input.weekIndex, now);
          if (c.readOnly) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "That week has already finished." });
          }
          const saved = savedLayout(c.input);
          const ids = new Set(c.input.sessions.map((s) => s.id));

          // Optimistic concurrency: the client must have started from what is saved now.
          const stale =
            input.expected.length !== ids.size ||
            new Set(input.expected.map((e) => e.sessionId)).size !== ids.size ||
            input.expected.some((e) => !ids.has(e.sessionId) || !samePlacement(saved[e.sessionId] ?? null, e.placement));
          if (stale) {
            throw new TRPCError({ code: "CONFLICT", message: "This week changed somewhere else. We've reloaded it." });
          }

          const proposed: Layout = { ...saved };
          for (const p of input.placements) {
            if (!ids.has(p.sessionId)) {
              throw new TRPCError({ code: "BAD_REQUEST", message: VIOLATION_MESSAGE.unknown_session });
            }
            proposed[p.sessionId] = { day: p.day, daypart: p.daypart };
          }

          const violations = checkLayout(c.input, proposed);
          if (violations.length > 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: VIOLATION_MESSAGE[violations[0]!.kind] });
          }

          const movedIds = [...ids].filter((id) => !samePlacement(saved[id] ?? null, proposed[id] ?? null));
          if (movedIds.length === 0) return { weekIndex: input.weekIndex, applied: [], skipped: [] };

          // Statuses were read a moment ago; a session logged concurrently must not be moved.
          const stillScheduled = await tx.trainingSession.count({
            where: { id: { in: movedIds }, status: "SCHEDULED" },
          });
          if (stillScheduled !== movedIds.length) {
            throw new TRPCError({ code: "CONFLICT", message: "A session changed while you were moving it. Please try again." });
          }

          await applyLayoutToDb(tx, Object.fromEntries(movedIds.map((id) => [id, proposed[id]!])));
          await tx.decisionLog.create({
            data: {
              mesocycleId: c.mesocycleId,
              weekIndex: input.weekIndex,
              type: "SCHEDULE",
              status: "APPLIED",
              summary: input.origin === "suggestion" ? "Accepted a suggested move" : "Sessions moved",
              reasoning: input.origin,
              payload: { origin: input.origin, before: saved, after: proposed, facts: scoreLayout(c.input, proposed).facts },
            },
          });

          const applied: number[] = [];
          const skipped: { weekIndex: number; reason: SkipReason }[] = [];
          if (input.carryForward) {
            const byOrder = new Map(c.week.sessions.map((s) => [s.order, proposed[s.id]]));
            const later = await tx.week.findMany({
              where: { mesocycleId: c.mesocycleId, index: { gt: input.weekIndex } },
              orderBy: { index: "asc" },
              include: WEEK_FOR_SCHEDULE_INCLUDE,
            });
            for (const w of later) {
              if (w.sessions.some((s) => s.status !== "SCHEDULED")) {
                skipped.push({ weekIndex: w.index, reason: "already_started" });
                continue;
              }
              if (w.sessions.length !== c.week.sessions.length || w.sessions.some((s) => !byOrder.get(s.order))) {
                skipped.push({ weekIndex: w.index, reason: "different_sessions" });
                continue;
              }
              const wInput = scheduleInputFromDb({ week: w, prevWeek: null, settings: c.settings, startDate: c.startDate, now });
              const target: Layout = Object.fromEntries(w.sessions.map((s) => [s.id, byOrder.get(s.order)!]));
              if (checkLayout(wInput, target).length > 0) {
                skipped.push({ weekIndex: w.index, reason: "not_allowed" });
                continue;
              }
              const before = savedLayout(wInput);
              const changed = Object.fromEntries(
                Object.entries(target).filter(([id, p]) => !samePlacement(before[id] ?? null, p)),
              );
              await applyLayoutToDb(tx, changed);
              await tx.decisionLog.create({
                data: {
                  mesocycleId: c.mesocycleId,
                  weekIndex: w.index,
                  type: "SCHEDULE",
                  status: "APPLIED",
                  summary: `Layout carried forward from week ${input.weekIndex}`,
                  reasoning: "carry_forward",
                  payload: { origin: "carry_forward", before, after: target, facts: scoreLayout(wInput, target).facts },
                },
              });
              applied.push(w.index);
            }
          }
          return { weekIndex: input.weekIndex, applied, skipped };
        },
        { timeout: 15000 },
      );
    },
  ),

  // Remember that the athlete declined the suggestion for this exact layout.
  dismissSuggestion: protectedProcedure.input(WeekInput).mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
    const c = await loadWeekContext(ctx.db, ctx.session.user.id, input.weekIndex, new Date());
    await ctx.db.decisionLog.create({
      data: {
        mesocycleId: c.mesocycleId,
        weekIndex: input.weekIndex,
        type: "SCHEDULE",
        status: "REJECTED",
        summary: "Suggested move dismissed",
        reasoning: "dismissed",
        payload: { layoutKey: layoutKey(savedLayout(c.input)) },
        respondedAt: new Date(),
      },
    });
    return { ok: true };
  }),
});
```

In `src/server/api/root.ts` import `scheduleRouter` from `~/server/api/routers/schedule` and add `schedule: scheduleRouter,` to `appRouter`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/server/api/routers/schedule.test.ts && pnpm typecheck`
Expected: PASS and clean. If `tsc` rejects a `payload` object as not assignable to `InputJsonValue`, wrap that payload in `JSON.parse(JSON.stringify(…)) as Prisma.InputJsonValue` (the facts are plain data).

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/schedule.ts src/server/api/routers/schedule.test.ts src/server/api/root.ts
git commit -m "feat(schedule): schedule router with a single guarded placement write"
```

---

### Task 9: Schedule preferences — mode, availability, timezone

**Files:**
- Modify: `src/server/api/routers/schedule.ts`
- Test: `src/server/api/routers/schedule-prefs.test.ts`

**Interfaces:**
- Consumes: `SchedulePrefsInputSchema`, `TimezoneSchema` (Task 1); `daypartForDay` (Task 2); `DAY_NAMES` (Task 7).
- Produces:

```ts
schedule.getPrefs() → { scheduleMode: ScheduleMode; timezone: string; availability: AvailabilityCellInput[] }
schedule.updatePrefs(SchedulePrefsInput) → { scheduleMode: ScheduleMode }
schedule.setTimezone({ timezone: string }) → { timezone: string }
```

- [ ] **Step 1: Write the failing tests**

Create `src/server/api/routers/schedule-prefs.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createCallerFactory } from "~/server/api/trpc";
import { scheduleRouter } from "./schedule";

const createCaller = createCallerFactory(scheduleRouter);

interface Opts {
  mode?: "DAY" | "HALF_DAY";
  noProfile?: boolean;
  scheduled?: { id: string; weekId: string; dayOfWeek: number; week: { index: number } }[];
}

function makeCaller(opts: Opts = {}) {
  const profile = opts.noProfile
    ? null
    : { id: "ap-1", scheduleMode: opts.mode ?? "DAY", timezone: "UTC", availability: [{ dayOfWeek: 6, daypart: "AM", state: "BLOCKED" }] };
  const db = {
    athleteProfile: {
      findUnique: vi.fn().mockResolvedValue(profile),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    availabilityCell: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
    trainingSession: {
      findMany: vi.fn().mockResolvedValue(opts.scheduled ?? []),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  const caller = createCaller({ db, session: { user: { id: "user-1" } } } as unknown as Parameters<typeof createCaller>[0]);
  return { caller, db };
}

describe("getPrefs", () => {
  it("returns the stored settings in engine shape", async () => {
    const { caller } = makeCaller({ mode: "HALF_DAY" });
    expect(await caller.getPrefs()).toEqual({
      scheduleMode: "HALF_DAY",
      timezone: "UTC",
      availability: [{ day: 6, daypart: "AM", state: "BLOCKED" }],
    });
  });

  it("returns defaults before the athlete has a profile", async () => {
    const { caller } = makeCaller({ noProfile: true });
    expect(await caller.getPrefs()).toEqual({ scheduleMode: "DAY", timezone: "UTC", availability: [] });
  });
});

describe("updatePrefs", () => {
  it("replaces the availability grid and never touches a session when the mode is unchanged", async () => {
    const { caller, db } = makeCaller();
    await caller.updatePrefs({ scheduleMode: "DAY", availability: [{ day: 2, daypart: "PM", state: "PREFERRED" }] });
    expect(db.availabilityCell.deleteMany).toHaveBeenCalledWith({ where: { athleteProfileId: "ap-1" } });
    expect(db.availabilityCell.createMany).toHaveBeenCalledWith({
      data: [{ athleteProfileId: "ap-1", dayOfWeek: 2, daypart: "PM", state: "PREFERRED" }],
    });
    expect(db.trainingSession.update).not.toHaveBeenCalled();
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  it("refuses AM/PM → one-a-day while a day holds two scheduled sessions, naming it", async () => {
    const { caller, db } = makeCaller({
      mode: "HALF_DAY",
      scheduled: [
        { id: "a", weekId: "wk-2", dayOfWeek: 1, week: { index: 2 } },
        { id: "b", weekId: "wk-2", dayOfWeek: 1, week: { index: 2 } },
        { id: "c", weekId: "wk-2", dayOfWeek: 3, week: { index: 2 } },
      ],
    });
    await expect(caller.updatePrefs({ scheduleMode: "DAY", availability: [] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Tue in week 2") as unknown,
    });
    expect(db.athleteProfile.update).not.toHaveBeenCalled();
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  it("clears dayparts on AM/PM → one-a-day without changing any day", async () => {
    const { caller, db } = makeCaller({
      mode: "HALF_DAY",
      scheduled: [{ id: "a", weekId: "wk-2", dayOfWeek: 1, week: { index: 2 } }],
    });
    await caller.updatePrefs({ scheduleMode: "DAY", availability: [] });
    const call = db.trainingSession.updateMany.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(call.data).toEqual({ daypart: null });
    expect(db.athleteProfile.update).toHaveBeenCalledWith({ where: { id: "ap-1" }, data: { scheduleMode: "DAY" } });
  });

  it("assigns a daypart on one-a-day → AM/PM from the new availability, without changing any day", async () => {
    const { caller, db } = makeCaller({
      mode: "DAY",
      scheduled: [
        { id: "a", weekId: "wk-2", dayOfWeek: 1, week: { index: 2 } },
        { id: "b", weekId: "wk-2", dayOfWeek: 3, week: { index: 2 } },
      ],
    });
    await caller.updatePrefs({ scheduleMode: "HALF_DAY", availability: [{ day: 3, daypart: "PM", state: "PREFERRED" }] });
    expect(db.trainingSession.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { daypart: "AM" } });
    expect(db.trainingSession.update).toHaveBeenCalledWith({ where: { id: "b" }, data: { daypart: "PM" } });
  });

  it("is NOT_FOUND without a profile", async () => {
    const { caller } = makeCaller({ noProfile: true });
    await expect(caller.updatePrefs({ scheduleMode: "DAY", availability: [] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("setTimezone", () => {
  it("stores a valid timezone for the signed-in athlete only", async () => {
    const { caller, db } = makeCaller();
    expect(await caller.setTimezone({ timezone: "Australia/Sydney" })).toEqual({ timezone: "Australia/Sydney" });
    expect(db.athleteProfile.updateMany).toHaveBeenCalledWith({ where: { userId: "user-1" }, data: { timezone: "Australia/Sydney" } });
  });

  it("rejects an invented timezone", async () => {
    const { caller } = makeCaller();
    await expect(caller.setTimezone({ timezone: "Mars/Olympus" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/server/api/routers/schedule-prefs.test.ts`
Expected: FAIL, `caller.getPrefs is not a function`.

- [ ] **Step 3: Implement**

In `src/server/api/routers/schedule.ts`:

Extend imports:

```ts
import { daypartForDay, type AvailabilityCellInput } from "~/engine";
import { ApplyLayoutInputSchema, SchedulePrefsInputSchema, TimezoneSchema, type ScheduleMode } from "~/schema";
import { DAY_NAMES } from "~/views/schedule";
```

(merge these into the existing import statements from the same modules).

Add these procedures to `scheduleRouter`:

```ts
  getPrefs: protectedProcedure.query(
    async ({ ctx }): Promise<{ scheduleMode: ScheduleMode; timezone: string; availability: AvailabilityCellInput[] }> => {
      const profile = await ctx.db.athleteProfile.findUnique({
        where: { userId: ctx.session.user.id },
        select: { scheduleMode: true, timezone: true, availability: true },
      });
      if (!profile) return { scheduleMode: "DAY", timezone: "UTC", availability: [] };
      return {
        scheduleMode: profile.scheduleMode,
        timezone: profile.timezone,
        availability: availabilityFromRows(profile.availability),
      };
    },
  ),

  // Preferences never move a session's day. A mode switch only adds or clears dayparts,
  // and is refused when it would leave two sessions on one day in one-a-day mode.
  updatePrefs: protectedProcedure
    .input(SchedulePrefsInputSchema)
    .mutation(async ({ ctx, input }): Promise<{ scheduleMode: ScheduleMode }> => {
      const userId = ctx.session.user.id;
      await ctx.db.$transaction(
        async (tx) => {
          const profile = await tx.athleteProfile.findUnique({
            where: { userId },
            select: { id: true, scheduleMode: true },
          });
          if (!profile) throw new TRPCError({ code: "NOT_FOUND" });

          if (profile.scheduleMode !== input.scheduleMode) {
            const scheduled = {
              status: "SCHEDULED" as const,
              dayOfWeek: { not: null },
              week: { mesocycle: { status: "ACTIVE" as const, athleteProfileId: profile.id } },
            };
            const sessions = await tx.trainingSession.findMany({
              where: scheduled,
              select: { id: true, weekId: true, dayOfWeek: true, week: { select: { index: true } } },
            });
            if (input.scheduleMode === "DAY") {
              const seen = new Map<string, number>();
              const clashes: string[] = [];
              for (const s of sessions) {
                const key = `${s.weekId}:${s.dayOfWeek}`;
                const n = (seen.get(key) ?? 0) + 1;
                seen.set(key, n);
                if (n === 2) clashes.push(`${DAY_NAMES[s.dayOfWeek ?? 0]} in week ${s.week.index}`);
              }
              if (clashes.length > 0) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: `Two sessions share ${clashes.join(", ")}. Move one of each pair to another day, then switch to one session a day.`,
                });
              }
              await tx.trainingSession.updateMany({ where: scheduled, data: { daypart: null } });
            } else {
              for (const s of sessions) {
                await tx.trainingSession.update({
                  where: { id: s.id },
                  data: { daypart: daypartForDay(input.availability, s.dayOfWeek ?? 0) },
                });
              }
            }
          }

          await tx.availabilityCell.deleteMany({ where: { athleteProfileId: profile.id } });
          if (input.availability.length > 0) {
            await tx.availabilityCell.createMany({
              data: input.availability.map((c) => ({
                athleteProfileId: profile.id,
                dayOfWeek: c.day,
                daypart: c.daypart,
                state: c.state,
              })),
            });
          }
          await tx.athleteProfile.update({ where: { id: profile.id }, data: { scheduleMode: input.scheduleMode } });
        },
        { timeout: 15000 },
      );
      return { scheduleMode: input.scheduleMode };
    }),

  setTimezone: protectedProcedure
    .input(z.object({ timezone: TimezoneSchema }))
    .mutation(async ({ ctx, input }): Promise<{ timezone: string }> => {
      await ctx.db.athleteProfile.updateMany({
        where: { userId: ctx.session.user.id },
        data: { timezone: input.timezone },
      });
      return { timezone: input.timezone };
    }),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/server/api/routers && pnpm typecheck`
Expected: PASS and clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/schedule.ts src/server/api/routers/schedule-prefs.test.ts
git commit -m "feat(schedule): schedule mode, availability and timezone preferences"
```

---

### Task 10: Backfill existing blocks

**Files:**
- Create: `prisma/backfill-schedule.ts`
- Modify: `package.json` (one script)

**Interfaces:**
- Consumes: `scheduleInputFromDb`, `applyLayoutToDb`, `completedPlacement`, `availabilityFromRows`, `WEEK_FOR_SCHEDULE_INCLUDE` (Task 5, all unit-tested there); `placeWeek`.
- Produces: `pnpm db:backfill-schedule`. Idempotent: it only touches sessions whose `dayOfWeek` is null.

The script is glue over tested functions, so it has no unit test of its own; Step 3 verifies it against the dev database.

- [ ] **Step 1: Write the script**

Create `prisma/backfill-schedule.ts`:

```ts
/**
 * One-off: give every unplaced session in ACTIVE blocks a placement.
 *
 *   pnpm db:backfill-schedule                                  # keep each profile's timezone
 *   BACKFILL_TZ=Australia/Sydney pnpm db:backfill-schedule     # also set it where still "UTC"
 *
 * Completed sessions go on the weekday they were actually done. Scheduled sessions in
 * current and future weeks are placed by the engine around whatever is already placed.
 * Safe to re-run: a session that already has a day is never moved.
 */
import { isValidTimeZone } from "~/domain/local-day";
import { placeWeek, type Layout } from "~/engine";
import { db } from "~/server/db";
import {
  applyLayoutToDb,
  availabilityFromRows,
  completedPlacement,
  scheduleInputFromDb,
  WEEK_FOR_SCHEDULE_INCLUDE,
  type ScheduleSettings,
} from "~/server/mesocycle/schedule-adapters";

async function main() {
  const tzOverride = process.env.BACKFILL_TZ;
  if (tzOverride && !isValidTimeZone(tzOverride)) throw new Error(`BACKFILL_TZ "${tzOverride}" is not a timezone.`);
  const now = new Date();

  const blocks = await db.mesocycle.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      startDate: true,
      athleteProfile: { select: { id: true, scheduleMode: true, timezone: true, availability: true } },
      weeks: { orderBy: { index: "asc" }, include: WEEK_FOR_SCHEDULE_INCLUDE },
    },
  });

  for (const block of blocks) {
    if (!block.startDate) {
      console.log(`block ${block.id}: no start date, skipped`);
      continue;
    }
    const startDate = block.startDate;
    let timezone = block.athleteProfile.timezone;
    if (tzOverride && timezone === "UTC") {
      await db.athleteProfile.update({ where: { id: block.athleteProfile.id }, data: { timezone: tzOverride } });
      timezone = tzOverride;
    }
    const settings: ScheduleSettings = {
      mode: block.athleteProfile.scheduleMode,
      availability: availabilityFromRows(block.athleteProfile.availability),
      timezone,
    };

    const placed = await db.$transaction(
      async (tx) => {
        let count = 0;
        let prev: (typeof block.weeks)[number] | null = null;
        for (const week of block.weeks) {
          // 1. Sessions that were actually done go where they were done.
          const done: Layout = {};
          for (const s of week.sessions) {
            if (s.dayOfWeek !== null || !s.completedAt) continue;
            const p = completedPlacement(s.completedAt, timezone, settings.mode);
            done[s.id] = p;
            s.dayOfWeek = p.day;
            s.daypart = p.daypart;
          }
          await applyLayoutToDb(tx, done);
          count += Object.keys(done).length;

          // 2. Still-scheduled, unplaced sessions are placed around everything else.
          const unplaced = week.sessions.filter((s) => s.status === "SCHEDULED" && s.dayOfWeek === null);
          if (unplaced.length > 0) {
            const input = scheduleInputFromDb({ week, prevWeek: prev, settings, startDate, now });
            const res = placeWeek({
              ...input,
              sessions: input.sessions.map((s) => (s.placement ? { ...s, locked: true } : s)),
            });
            if (res.kind === "placed") {
              const add: Layout = Object.fromEntries(unplaced.map((s) => [s.id, res.layout[s.id]!]));
              await applyLayoutToDb(tx, add);
              for (const s of unplaced) {
                s.dayOfWeek = add[s.id]!.day;
                s.daypart = add[s.id]!.daypart;
              }
              count += unplaced.length;
            } else {
              console.log(`block ${block.id} week ${week.index}: no room, left unplaced`);
            }
          }
          prev = week;
        }
        if (count > 0) {
          await tx.decisionLog.create({
            data: {
              mesocycleId: block.id,
              type: "SCHEDULE",
              status: "APPLIED",
              summary: `Placed ${count} sessions`,
              reasoning: "backfill",
              payload: { origin: "auto", placed: count },
            },
          });
        }
        return count;
      },
      { timeout: 60000 },
    );
    console.log(`block ${block.id}: placed ${placed} sessions (${timezone})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
```

Add to `package.json` scripts, after `"db:seed"`:

```json
    "db:backfill-schedule": "tsx --env-file=.env prisma/backfill-schedule.ts",
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Run it against the dev database, twice**

Run: `BACKFILL_TZ=<the athlete's IANA timezone> pnpm db:backfill-schedule`
Expected first run: one line per ACTIVE block, `placed N sessions`, N > 0 for a block created before this feature.
Run it again.
Expected second run: `placed 0 sessions` for every block.

Ask the athlete for their timezone before running if it is not already known; do not guess.

- [ ] **Step 4: Commit**

```bash
git add prisma/backfill-schedule.ts package.json
git commit -m "feat(schedule): one-off backfill placing sessions in existing blocks"
```

---

### Task 11: The week board — drafts, drag-and-drop, suggestions

**Files:**
- Modify: `package.json` (dependency), `src/app/app/block/week/[n]/page.tsx`
- Create: `src/components/schedule/draft.ts`, `src/components/schedule/schedule-board.tsx`, `src/components/schedule/session-chip.tsx`, `src/components/schedule/draft-bar.tsx`, `src/components/schedule/suggestion-card.tsx`
- Test: `src/components/schedule/draft.test.ts`

**Interfaces:**
- Consumes: `schedule.getWeekSchedule`, `schedule.getSuggestions`, `schedule.applyLayout`, `schedule.dismissSuggestion`, `schedule.setTimezone`; `~/engine/schedule` (`allCells`, `applySuggestion`, `cellKey`, `checkLayout`, `placeWeek`, `samePlacement`, `scoreLayout`); `~/views/schedule`.
- Produces (from `./draft`):

```ts
applyDrop(input: ScheduleInput, layout: Layout, sessionId: string, target: Placement): Layout   // returns the SAME object when the drop is refused
changedIds(saved: Layout, draft: Layout): string[]
type TargetKind = "current" | "ok" | "warn" | "refused"
dropTargets(input: ScheduleInput, layout: Layout, sessionId: string): { placement: Placement; kind: TargetKind }[]
cellId(p: Placement): string            // "3:PM" or "3:-"
parseCellId(id: string): Placement
```

- Produces: `<ScheduleBoard weekIndex={number} />`.

The repo has no component-test setup (Vitest runs in `node`, `*.test.ts` only). All board behaviour that can be wrong lives in `draft.ts`, which is unit-tested; the components are verified in the browser in Task 13. Read `DESIGN.md` before writing the components.

- [ ] **Step 1: Install the drag library**

Run: `pnpm add @dnd-kit/core`
Expected: `@dnd-kit/core` appears under `dependencies`.

- [ ] **Step 2: Write the failing tests**

Create `src/components/schedule/draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeInput, sess, withSaved } from "~/engine/_fixtures/schedule";
import type { Footprint, Layout, Placement } from "~/engine/schedule";
import { applyDrop, cellId, changedIds, dropTargets, parseCellId } from "./draft";

const day = (d: number): Placement => ({ day: d, daypart: null });
const LEGS: Footprint = { QUADS: 6, GLUTES: 4 };

describe("cellId / parseCellId", () => {
  it("round-trip both kinds of placement", () => {
    expect(parseCellId(cellId(day(3)))).toEqual(day(3));
    expect(parseCellId(cellId({ day: 3, daypart: "PM" }))).toEqual({ day: 3, daypart: "PM" });
  });
});

describe("applyDrop", () => {
  const layout: Layout = { a: day(0), b: day(2) };
  const input = withSaved(makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] }), layout);

  it("moves a session to an empty day", () => {
    expect(applyDrop(input, layout, "a", day(4))).toEqual({ a: day(4), b: day(2) });
  });

  it("swaps when the target is taken", () => {
    expect(applyDrop(input, layout, "a", day(2))).toEqual({ a: day(2), b: day(0) });
  });

  it("returns the same object when dropped where it already is", () => {
    expect(applyDrop(input, layout, "a", day(0))).toBe(layout);
  });

  it("refuses a blocked day", () => {
    const blocked = { ...input, availability: [
      { day: 4, daypart: "AM" as const, state: "BLOCKED" as const },
      { day: 4, daypart: "PM" as const, state: "BLOCKED" as const },
    ] };
    expect(applyDrop(blocked, layout, "a", day(4))).toBe(layout);
  });

  it("refuses a day that has passed", () => {
    expect(applyDrop({ ...input, firstOpenDay: 3 }, layout, "a", day(1))).toBe(layout);
  });

  it("refuses to drag a locked session, or to swap with one", () => {
    const locked = withSaved(makeInput({ sessions: [sess("a", 0, LEGS, null, true), sess("b", 1, LEGS)] }), layout);
    expect(applyDrop(locked, layout, "a", day(4))).toBe(layout);
    expect(applyDrop(locked, layout, "b", day(0))).toBe(layout);
  });

  it("refuses a swap that would push the other session into the past", () => {
    const past = { ...input, firstOpenDay: 1 }; // Monday has passed; "a" is stranded there
    expect(applyDrop(past, layout, "b", day(0))).toBe(layout);
  });

  it("places an unplaced session on an empty day but will not swap it in", () => {
    const partial: Layout = { b: day(2) };
    const unplaced = withSaved(makeInput({ sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] }), partial);
    expect(applyDrop(unplaced, partial, "a", day(5))).toEqual({ a: day(5), b: day(2) });
    expect(applyDrop(unplaced, partial, "a", day(2))).toBe(partial);
  });

  it("lets a session return to its saved day even if that day is now blocked", () => {
    const blocked = { ...input, availability: [
      { day: 0, daypart: "AM" as const, state: "BLOCKED" as const },
      { day: 0, daypart: "PM" as const, state: "BLOCKED" as const },
    ] };
    const moved = applyDrop(blocked, layout, "a", day(4));
    expect(applyDrop(blocked, moved, "a", day(0))).toEqual(layout);
  });

  // Review Focus 2: a full week can still be rearranged.
  it("rearranges a seven-session week by swapping", () => {
    const sessions = Array.from({ length: 7 }, (_, i) => sess(`s${i}`, i, LEGS));
    const full: Layout = Object.fromEntries(sessions.map((s, i) => [s.id, day(i)]));
    const fullInput = withSaved(makeInput({ sessions }), full);
    const next = applyDrop(fullInput, full, "s0", day(6));
    expect(next.s0).toEqual(day(6));
    expect(next.s6).toEqual(day(0));
  });

  it("swaps within a day in HALF_DAY mode", () => {
    const half: Layout = { a: { day: 1, daypart: "AM" }, b: { day: 1, daypart: "PM" } };
    const halfInput = withSaved(makeInput({ mode: "HALF_DAY", sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)] }), half);
    expect(applyDrop(halfInput, half, "a", { day: 1, daypart: "PM" })).toEqual({
      a: { day: 1, daypart: "PM" },
      b: { day: 1, daypart: "AM" },
    });
  });
});

describe("changedIds", () => {
  it("lists sessions whose placement differs, including newly placed ones", () => {
    expect(changedIds({ a: day(0), b: day(2) }, { a: day(0), b: day(3), c: day(5) })).toEqual(["b", "c"]);
    expect(changedIds({ a: day(0) }, { a: day(0) })).toEqual([]);
  });
});

describe("dropTargets", () => {
  const layout: Layout = { a: day(0), b: day(3) };
  const input = withSaved(
    makeInput({
      firstOpenDay: 0,
      availability: [
        { day: 6, daypart: "AM", state: "BLOCKED" },
        { day: 6, daypart: "PM", state: "BLOCKED" },
      ],
      sessions: [sess("a", 0, LEGS), sess("b", 1, LEGS)],
    }),
    layout,
  );
  const kindOf = (d: number) => dropTargets(input, layout, "b").find((t) => t.placement.day === d)!.kind;

  it("marks the current cell, refused cells, and cells that make things worse", () => {
    expect(kindOf(3)).toBe("current");
    expect(kindOf(6)).toBe("refused");
    expect(kindOf(1)).toBe("warn"); // the day after the other leg session
  });

  it("has one entry per cell", () => {
    expect(dropTargets(input, layout, "b")).toHaveLength(7);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/components/schedule/draft.test.ts`
Expected: FAIL, cannot resolve `./draft`.

- [ ] **Step 4: Implement `draft.ts`**

Create `src/components/schedule/draft.ts`:

```ts
import { SCHEDULE_EPS } from "~/engine/constants";
import {
  allCells,
  cellKey,
  checkLayout,
  samePlacement,
  scoreLayout,
  type Layout,
  type Placement,
  type ScheduleInput,
} from "~/engine/schedule";

export type TargetKind = "current" | "ok" | "warn" | "refused";

export interface DropTarget {
  placement: Placement;
  kind: TargetKind;
}

/** DOM-safe id for a cell: "3:PM", or "3:-" for a whole day. */
export function cellId(p: Placement): string {
  return `${p.day}:${p.daypart ?? "-"}`;
}

export function parseCellId(id: string): Placement {
  const [day, part] = id.split(":");
  return { day: Number(day), daypart: part === "AM" || part === "PM" ? part : null };
}

/**
 * What a drop does to a draft layout. An empty cell takes the session; an occupied
 * cell swaps the two. Returns the SAME layout object when the drop is refused (locked
 * session, blocked or past cell, a swap the other session isn't allowed to make), so
 * callers can test `next === layout`. `input.sessions[].placement` must be the saved
 * placements: returning a session to where it is saved is always allowed.
 */
export function applyDrop(input: ScheduleInput, layout: Layout, sessionId: string, target: Placement): Layout {
  const session = input.sessions.find((s) => s.id === sessionId);
  if (!session || session.locked) return layout;
  const from = layout[sessionId];
  if (samePlacement(from, target)) return layout;

  const key = cellKey(target, input.mode);
  const occupantId = Object.keys(layout).find((id) => id !== sessionId && cellKey(layout[id]!, input.mode) === key);

  let next: Layout;
  if (occupantId === undefined) {
    next = { ...layout, [sessionId]: target };
  } else {
    const occupant = input.sessions.find((s) => s.id === occupantId);
    if (!occupant || occupant.locked || !from) return layout;
    next = { ...layout, [sessionId]: target, [occupantId]: from };
  }
  return checkLayout(input, next).length === 0 ? next : layout;
}

/** Sessions whose placement differs between the saved layout and a draft. */
export function changedIds(saved: Layout, draft: Layout): string[] {
  const ids = new Set([...Object.keys(saved), ...Object.keys(draft)]);
  return [...ids].filter((id) => !samePlacement(saved[id], draft[id])).sort();
}

/** Every cell, classified for one session: where it is, where it may go cleanly,
 * where it may go at a cost, and where it may not go. */
export function dropTargets(input: ScheduleInput, layout: Layout, sessionId: string): DropTarget[] {
  const placedNow = layout[sessionId] !== undefined;
  const base = scoreLayout(input, layout).cost;
  return allCells(input.mode).map((placement) => {
    if (samePlacement(layout[sessionId], placement)) return { placement, kind: "current" as const };
    const next = applyDrop(input, layout, sessionId, placement);
    if (next === layout) return { placement, kind: "refused" as const };
    // Placing a not-yet-placed session always adds cost, so only compare for moves.
    const worse = placedNow && scoreLayout(input, next).cost > base + SCHEDULE_EPS;
    return { placement, kind: worse ? ("warn" as const) : ("ok" as const) };
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/components/schedule/draft.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the chip, draft bar and suggestion card**

Create `src/components/schedule/session-chip.tsx`:

```tsx
"use client";

import { useDraggable } from "@dnd-kit/core";
import type { Placement } from "~/engine/schedule";
import type { ScheduleSessionView } from "~/views/schedule";
import { parseCellId } from "./draft";

export interface MoveOption {
  value: string; // cellId
  label: string;
}

/** One session on the board. Pointer and touch users drag the top half; keyboard and
 * screen-reader users use the "Move to…" menu, which offers the same legal targets. */
export function SessionChip({
  session,
  editable,
  changed,
  moveOptions,
  onMove,
}: {
  session: ScheduleSessionView;
  editable: boolean;
  changed: boolean;
  moveOptions: MoveOption[];
  onMove: (target: Placement) => void;
}) {
  const draggable = editable && !session.locked;
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({ id: session.id, disabled: !draggable });
  const status = session.status === "COMPLETED" ? "Done" : session.status === "MISSED" ? "Missed" : null;

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={
        "rounded-control border bg-surface-raised p-2 " +
        (changed ? "border-accent " : "border-border-subtle ") +
        (isDragging ? "relative z-10 opacity-80 " : "") +
        (session.locked ? "opacity-70" : "")
      }
    >
      <div {...(draggable ? listeners : {})} className={draggable ? "cursor-grab touch-none select-none" : undefined}>
        <div className="text-nav font-medium text-fg">{session.label}</div>
        <div className="text-[12px] text-fg-subtle">
          {session.estimatedMinutes} min{status ? ` · ${status}` : ""}
        </div>
      </div>
      {draggable && moveOptions.length > 0 ? (
        <select
          aria-label={`Move ${session.label} to another time`}
          value=""
          onChange={(e) => {
            if (e.target.value) onMove(parseCellId(e.target.value));
          }}
          className="mt-1.5 w-full rounded-control border border-border-subtle bg-canvas px-1 py-0.5 text-[12px] text-fg-muted"
        >
          <option value="">Move to…</option>
          {moveOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
```

Create `src/components/schedule/draft-bar.tsx`:

```tsx
"use client";

/** Shown while the athlete has unconfirmed moves. Nothing is saved until Confirm. */
export function DraftBar({
  changeCount,
  warnings,
  carryForward,
  onCarryForward,
  onDiscard,
  onConfirm,
  pending,
  error,
}: {
  changeCount: number;
  warnings: string[];
  carryForward: boolean;
  onCarryForward: (v: boolean) => void;
  onDiscard: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4" role="region" aria-label="Unsaved schedule changes">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-nav font-medium text-fg">
          {changeCount} unsaved {changeCount === 1 ? "change" : "changes"}
        </span>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onDiscard} disabled={pending} className="text-nav text-fg-muted transition-colors hover:text-fg disabled:opacity-60">
            Discard
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-control bg-accent px-4 py-2 text-nav font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
          >
            {pending ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
      {warnings.length > 0 ? (
        <ul className="flex flex-col gap-1 text-nav text-fg-soft">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : (
        <p className="text-nav text-fg-subtle">No recovery concerns with this layout.</p>
      )}
      <label className="flex items-center gap-2 text-nav text-fg-muted">
        <input type="checkbox" checked={carryForward} onChange={(e) => onCarryForward(e.target.checked)} disabled={pending} />
        Use this layout for the remaining weeks
      </label>
      {error ? <p className="rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">{error}</p> : null}
    </div>
  );
}
```

Create `src/components/schedule/suggestion-card.tsx`:

```tsx
"use client";

import { api } from "~/trpc/react";
import type { MoveSuggestionView } from "~/views/schedule";

/** The coach's one suggested tweak to the saved layout. Renders nothing when the
 * engine has nothing worth saying. Accepting is the athlete's call. */
export function SuggestionCard({
  weekIndex,
  pending,
  onAccept,
}: {
  weekIndex: number;
  pending: boolean;
  onAccept: (s: MoveSuggestionView) => void;
}) {
  const utils = api.useUtils();
  const suggestions = api.schedule.getSuggestions.useQuery({ weekIndex });
  const dismiss = api.schedule.dismissSuggestion.useMutation({
    onSuccess: () => void utils.schedule.getSuggestions.invalidate(),
  });
  const top = suggestions.data?.[0];
  if (!top) return null;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-accent bg-selection p-4" role="region" aria-label="Coach suggestion">
      <div>
        <div className="text-[12px] font-medium text-accent">Coach suggests</div>
        <div className="mt-1 text-card-title text-fg">{top.headline}</div>
      </div>
      {top.reasons.length > 0 ? (
        <ul className="flex flex-col gap-1 text-nav text-fg-soft">
          {top.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onAccept(top)}
          disabled={pending || dismiss.isPending}
          className="rounded-control bg-accent px-4 py-2 text-nav font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => dismiss.mutate({ weekIndex })}
          disabled={pending || dismiss.isPending}
          className="text-nav text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
        >
          Keep my layout
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write the board**

Create `src/components/schedule/schedule-board.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, PointerSensor, TouchSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { applySuggestion, cellKey, placeWeek, scoreLayout, type Layout, type Placement } from "~/engine/schedule";
import { api } from "~/trpc/react";
import { DAY_NAMES, placementLabel, toWarnings, type MoveSuggestionView } from "~/views/schedule";
import { applyDrop, cellId, changedIds, dropTargets, parseCellId, type DropTarget } from "./draft";
import { DraftBar } from "./draft-bar";
import { SessionChip, type MoveOption } from "./session-chip";
import { SuggestionCard } from "./suggestion-card";

function Cell({
  placement,
  target,
  showHalf,
  children,
}: {
  placement: Placement;
  target: DropTarget | undefined;
  showHalf: boolean;
  children: React.ReactNode;
}) {
  const refused = target?.kind === "refused";
  const { setNodeRef, isOver } = useDroppable({ id: cellId(placement), disabled: refused });
  const tone = !target
    ? "border-border-subtle"
    : refused
      ? "border-border-subtle opacity-40"
      : target.kind === "warn"
        ? "border-dashed border-border"
        : "border-accent/40 bg-selection";
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-20 flex-col gap-1.5 rounded-control border p-1.5 transition-colors ${tone} ${isOver && !refused ? "ring-1 ring-accent" : ""}`}
    >
      {showHalf ? <span className="text-[11px] text-fg-subtle">{placement.daypart}</span> : null}
      {children}
    </div>
  );
}

/** The week as a board: one column per date, sessions as chips. Moves are a local
 * draft scored in the browser by the same engine code the server re-runs on Confirm. */
export function ScheduleBoard({ weekIndex }: { weekIndex: number }) {
  const router = useRouter();
  const utils = api.useUtils();
  const query = api.schedule.getWeekSchedule.useQuery({ weekIndex });
  const [draft, setDraft] = useState<Layout | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [carryForward, setCarryForward] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const tzSynced = useRef(false);

  const refresh = () => {
    void utils.schedule.invalidate();
    router.refresh();
  };
  const setTimezone = api.schedule.setTimezone.useMutation({ onSuccess: refresh });
  const apply = api.schedule.applyLayout.useMutation({
    onSuccess: (res) => {
      setDraft(null);
      setCarryForward(false);
      setNotice(
        res.skipped.length > 0
          ? `Saved. Week ${res.skipped.map((s) => s.weekIndex).join(", ")} kept its own layout.`
          : null,
      );
      refresh();
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") refresh();
    },
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  // Profiles created before scheduling existed are on "UTC". Adopt the browser's
  // timezone once so dates and "today" match the athlete's calendar.
  const storedTz = query.data?.timezone;
  useEffect(() => {
    if (storedTz !== "UTC" || tzSynced.current) return;
    tzSynced.current = true;
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTz && browserTz !== "UTC") setTimezone.mutate({ timezone: browserTz });
  }, [storedTz, setTimezone]);

  if (query.isLoading) return <p className="text-nav text-fg-subtle">Loading your week…</p>;
  if (query.isError || !query.data) {
    return (
      <div className="rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">
        <p>Couldn’t load your schedule.</p>
        <button type="button" onClick={() => void query.refetch()} className="mt-1 font-medium text-accent hover:text-accent-strong">
          Try again
        </button>
      </div>
    );
  }

  const data = query.data;
  const saved = data.layout;
  const layout = draft ?? saved;
  const editable = !data.readOnly && !apply.isPending;
  const labelOf = (id: string) => data.sessions.find((s) => s.id === id)?.label ?? "Session";
  const changed = changedIds(saved, layout);
  const warnings = draft ? toWarnings(scoreLayout(data.input, layout).facts, labelOf) : data.warnings;
  const targets = dragging ? dropTargets(data.input, layout, dragging) : null;
  const unplaced = data.sessions.filter((s) => layout[s.id] === undefined);
  const rows: ("AM" | "PM" | null)[] = data.mode === "HALF_DAY" ? ["AM", "PM"] : [null];

  const moveOptionsFor = (sessionId: string): MoveOption[] =>
    dropTargets(data.input, layout, sessionId)
      .filter((t) => t.kind === "ok" || t.kind === "warn")
      .map((t) => ({
        value: cellId(t.placement),
        label: placementLabel(t.placement) + (t.kind === "warn" ? " (less rest)" : ""),
      }));

  function move(sessionId: string, target: Placement) {
    const next = applyDrop(data.input, layout, sessionId, target);
    if (next === layout) return;
    setNotice(null);
    setDraft(changedIds(saved, next).length === 0 ? null : next);
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (e.over) move(String(e.active.id), parseCellId(String(e.over.id)));
  }

  function placeForMe() {
    const res = placeWeek({
      ...data.input,
      sessions: data.input.sessions.map((s) =>
        layout[s.id] ? { ...s, locked: true, placement: layout[s.id]! } : s,
      ),
    });
    if (res.kind === "placed") setDraft(res.layout);
    else setNotice("Your availability doesn’t leave enough open times for this week.");
  }

  function confirm(next: Layout, origin: "athlete" | "suggestion") {
    apply.mutate({
      weekIndex,
      placements: Object.entries(next).map(([sessionId, p]) => ({ sessionId, day: p.day, daypart: p.daypart })),
      expected: data.sessions.map((s) => ({ sessionId: s.id, placement: saved[s.id] ?? null })),
      carryForward: origin === "athlete" && carryForward,
      origin,
    });
  }

  const chip = (id: string) => {
    const session = data.sessions.find((s) => s.id === id)!;
    return (
      <SessionChip
        key={id}
        session={session}
        editable={editable}
        changed={changed.includes(id)}
        moveOptions={editable && !session.locked ? moveOptionsFor(id) : []}
        onMove={(target) => move(id, target)}
      />
    );
  };

  return (
    <section aria-label="Week schedule" className="flex flex-col gap-4">
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setDragging(String(e.active.id))}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <div className="overflow-x-auto">
          <div className="grid min-w-[680px] grid-cols-7 gap-2">
            {data.days.map((d) => (
              <div key={d.date} className="px-1 text-[12px] text-fg-subtle">
                <span className="font-medium text-fg-soft">{DAY_NAMES[d.weekday]}</span> {Number(d.date.slice(8))}
              </div>
            ))}
            {rows.map((daypart) =>
              data.days.map((d) => {
                const placement: Placement = { day: d.weekday, daypart };
                const key = cellKey(placement, data.mode);
                const here = data.sessions.filter(
                  (s) => layout[s.id] !== undefined && cellKey(layout[s.id]!, data.mode) === key,
                );
                return (
                  <Cell
                    key={`${d.date}:${daypart ?? "-"}`}
                    placement={placement}
                    target={targets?.find((t) => cellId(t.placement) === cellId(placement))}
                    showHalf={daypart !== null}
                  >
                    {here.map((s) => chip(s.id))}
                  </Cell>
                );
              }),
            )}
          </div>
        </div>

        {unplaced.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-card border border-border-subtle p-3">
            <div className="flex items-center justify-between">
              <span className="text-nav text-fg-muted">Not placed yet</span>
              {editable ? (
                <button type="button" onClick={placeForMe} className="text-nav font-medium text-accent hover:text-accent-strong">
                  Place for me
                </button>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">{unplaced.map((s) => chip(s.id))}</div>
          </div>
        ) : null}
      </DndContext>

      {notice ? (
        <p className="rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">
          {notice}{" "}
          <Link href="/app/settings" className="font-medium text-accent hover:text-accent-strong">
            Availability
          </Link>
        </p>
      ) : null}

      {draft ? (
        <DraftBar
          changeCount={changed.length}
          warnings={warnings}
          carryForward={carryForward}
          onCarryForward={setCarryForward}
          onDiscard={() => {
            setDraft(null);
            apply.reset();
          }}
          onConfirm={() => confirm(layout, "athlete")}
          pending={apply.isPending}
          error={apply.isError ? apply.error.message : null}
        />
      ) : (
        <>
          {warnings.length > 0 ? (
            <ul className="flex flex-col gap-1 text-nav text-fg-muted">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {!data.readOnly ? (
            <SuggestionCard
              weekIndex={weekIndex}
              pending={apply.isPending}
              onAccept={(s: MoveSuggestionView) => confirm(applySuggestion(saved, s), "suggestion")}
            />
          ) : null}
          {apply.isError ? (
            <p className="rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">{apply.error.message}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 8: Put the board on the week page**

In `src/app/app/block/week/[n]/page.tsx`, import the board:

```tsx
import { ScheduleBoard } from "~/components/schedule/schedule-board";
```

and insert this block between the `WeeklyCheckInFlow` wrapper and the session-panel grid:

```tsx
      <div className="px-6 pt-6">
        <ScheduleBoard weekIndex={week.index} />
      </div>
```

The session panels below already follow placement order, because `week.sessions` is sorted by the mapper (Task 7).

- [ ] **Step 9: Check**

Run: `pnpm check && pnpm vitest run src/components`
Expected: lint and types clean, tests PASS. Fix any `react-hooks` or unused-import findings in the new files.

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/schedule "src/app/app/block/week/[n]/page.tsx"
git commit -m "feat(schedule): week board with drag-and-drop drafts and coach suggestions"
```

---

### Task 12: Settings page and onboarding step

**Files:**
- Create: `src/components/schedule/availability.ts`, `src/components/schedule/availability-grid.tsx`, `src/components/schedule/schedule-prefs-form.tsx`
- Modify: `src/app/app/settings/page.tsx`, `src/components/onboarding/onboarding-wizard.tsx`
- Test: `src/components/schedule/availability.test.ts`

**Interfaces:**
- Consumes: `schedule.getPrefs`, `schedule.updatePrefs`; `cellState`, `AvailabilityCellInput` from `~/engine/schedule`; `DAY_NAMES`.
- Produces (from `./availability`):

```ts
cycleCell(value: AvailabilityCellInput[], mode: ScheduleMode, day: number, daypart: Daypart | null): AvailabilityCellInput[]   // Available → Preferred → Blocked → Available
openDayCount(value: AvailabilityCellInput[]): number    // days with at least one half not Blocked
```

- Produces: `<AvailabilityGrid mode value onChange />` (controlled), `<SchedulePrefsForm />`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/schedule/availability.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cellState } from "~/engine/schedule";
import { cycleCell, openDayCount } from "./availability";

describe("cycleCell", () => {
  it("cycles one half in HALF_DAY mode: available → preferred → blocked → available", () => {
    const a = cycleCell([], "HALF_DAY", 2, "PM");
    expect(a).toEqual([{ day: 2, daypart: "PM", state: "PREFERRED" }]);
    const b = cycleCell(a, "HALF_DAY", 2, "PM");
    expect(b).toEqual([{ day: 2, daypart: "PM", state: "BLOCKED" }]);
    expect(cycleCell(b, "HALF_DAY", 2, "PM")).toEqual([]);
  });

  it("leaves the other half alone in HALF_DAY mode", () => {
    const start = [{ day: 2, daypart: "AM" as const, state: "BLOCKED" as const }];
    expect(cycleCell(start, "HALF_DAY", 2, "PM")).toEqual([
      { day: 2, daypart: "AM", state: "BLOCKED" },
      { day: 2, daypart: "PM", state: "PREFERRED" },
    ]);
  });

  it("sets both halves together in DAY mode", () => {
    const a = cycleCell([], "DAY", 5, null);
    expect(cellState(a, "DAY", { day: 5, daypart: null })).toBe("PREFERRED");
    expect(a).toHaveLength(2);
    const b = cycleCell(a, "DAY", 5, null);
    expect(cellState(b, "DAY", { day: 5, daypart: null })).toBe("BLOCKED");
    expect(cycleCell(b, "DAY", 5, null)).toEqual([]);
  });

  it("normalises a half-set day when cycled in DAY mode", () => {
    const start = [{ day: 5, daypart: "AM" as const, state: "BLOCKED" as const }]; // reads as Available in DAY mode
    const next = cycleCell(start, "DAY", 5, null);
    expect(next).toEqual([
      { day: 5, daypart: "AM", state: "PREFERRED" },
      { day: 5, daypart: "PM", state: "PREFERRED" },
    ]);
  });
});

describe("openDayCount", () => {
  it("counts days that still have an open half", () => {
    expect(openDayCount([])).toBe(7);
    expect(
      openDayCount([
        { day: 0, daypart: "AM", state: "BLOCKED" },
        { day: 0, daypart: "PM", state: "BLOCKED" },
        { day: 1, daypart: "AM", state: "BLOCKED" },
      ]),
    ).toBe(6);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/components/schedule/availability.test.ts`
Expected: FAIL, cannot resolve `./availability`.

- [ ] **Step 3: Implement the pure helpers**

Create `src/components/schedule/availability.ts`:

```ts
import { cellState, type AvailabilityCellInput } from "~/engine/schedule";
import type { Daypart, ScheduleMode } from "~/schema";

/** Tap a cell: Available → Preferred → Blocked → Available. In DAY mode (or when
 * `daypart` is null) both halves of the day are set together. */
export function cycleCell(
  value: AvailabilityCellInput[],
  mode: ScheduleMode,
  day: number,
  daypart: Daypart | null,
): AvailabilityCellInput[] {
  const current = cellState(value, mode, { day, daypart });
  const next = current === "AVAILABLE" ? "PREFERRED" : current === "PREFERRED" ? "BLOCKED" : "AVAILABLE";
  const halves: Daypart[] = mode === "DAY" || daypart === null ? ["AM", "PM"] : [daypart];
  const rest = value.filter((c) => !(c.day === day && halves.includes(c.daypart)));
  if (next === "AVAILABLE") return rest;
  return [...rest, ...halves.map((dp) => ({ day, daypart: dp, state: next }))].sort(
    (a, b) => a.day - b.day || a.daypart.localeCompare(b.daypart),
  );
}

/** Days of the week that still have at least one half not Blocked. */
export function openDayCount(value: AvailabilityCellInput[]): number {
  let open = 0;
  for (let day = 0; day < 7; day++) {
    if (cellState(value, "DAY", { day, daypart: null }) !== "BLOCKED") open++;
  }
  return open;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/components/schedule/availability.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the grid and the form**

Create `src/components/schedule/availability-grid.tsx`:

```tsx
"use client";

import { cellState, type AvailabilityCellInput } from "~/engine/schedule";
import type { Daypart, ScheduleMode } from "~/schema";
import { DAY_NAMES } from "~/views/schedule";
import { cycleCell } from "./availability";

const STATE_LABEL = { AVAILABLE: "Available", PREFERRED: "Preferred", BLOCKED: "Blocked" } as const;
const STATE_MARK = { AVAILABLE: "·", PREFERRED: "★", BLOCKED: "✕" } as const;

/** The athlete's standing week. Tap a cell to cycle Available → Preferred → Blocked.
 * State is carried by the mark and the label, not by colour alone. */
export function AvailabilityGrid({
  mode,
  value,
  onChange,
  disabled = false,
}: {
  mode: ScheduleMode;
  value: AvailabilityCellInput[];
  onChange: (next: AvailabilityCellInput[]) => void;
  disabled?: boolean;
}) {
  const rows: (Daypart | null)[] = mode === "HALF_DAY" ? ["AM", "PM"] : [null];
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <div className="grid min-w-[420px] grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] gap-1.5">
          <span />
          {DAY_NAMES.map((d) => (
            <span key={d} className="text-center text-[12px] text-fg-subtle">
              {d}
            </span>
          ))}
          {rows.map((daypart) => (
            <div key={daypart ?? "day"} className="contents">
              <span className="self-center text-[12px] text-fg-subtle">{daypart ?? ""}</span>
              {DAY_NAMES.map((name, day) => {
                const state = cellState(value, mode, { day, daypart });
                return (
                  <button
                    key={name}
                    type="button"
                    disabled={disabled}
                    aria-label={`${name}${daypart ? ` ${daypart}` : ""}: ${STATE_LABEL[state]}`}
                    onClick={() => onChange(cycleCell(value, mode, day, daypart))}
                    className={
                      "h-10 rounded-control border text-nav transition-colors disabled:opacity-60 " +
                      (state === "PREFERRED"
                        ? "border-accent bg-selection text-accent"
                        : state === "BLOCKED"
                          ? "border-border-subtle bg-canvas text-fg-subtle"
                          : "border-border-subtle text-fg-muted hover:border-border")
                    }
                  >
                    {STATE_MARK[state]}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[12px] text-fg-subtle">★ preferred · · available · ✕ blocked. Tap a cell to change it.</p>
    </div>
  );
}
```

Create `src/components/schedule/schedule-prefs-form.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AvailabilityCellInput } from "~/engine/schedule";
import type { ScheduleMode } from "~/schema";
import { api } from "~/trpc/react";
import { AvailabilityGrid } from "./availability-grid";

const MODES: { value: ScheduleMode; label: string; hint: string }[] = [
  { value: "DAY", label: "One session a day", hint: "Plan by day. The simplest view." },
  { value: "HALF_DAY", label: "AM / PM", hint: "Plan by morning and afternoon, with room for two-a-days." },
];

export function SchedulePrefsForm() {
  const router = useRouter();
  const utils = api.useUtils();
  const prefs = api.schedule.getPrefs.useQuery();
  const [mode, setMode] = useState<ScheduleMode>("DAY");
  const [availability, setAvailability] = useState<AvailabilityCellInput[]>([]);
  const [saved, setSaved] = useState(false);
  const update = api.schedule.updatePrefs.useMutation({
    onSuccess: () => {
      setSaved(true);
      void utils.schedule.invalidate();
      router.refresh();
    },
  });

  // Load the stored settings into the form once they arrive.
  useEffect(() => {
    if (!prefs.data) return;
    setMode(prefs.data.scheduleMode);
    setAvailability(prefs.data.availability);
  }, [prefs.data]);

  if (prefs.isLoading) return <p className="text-nav text-fg-subtle">Loading…</p>;
  if (prefs.isError) return <p className="text-nav text-fg-soft">Couldn’t load your schedule settings.</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-nav font-medium text-fg">How you plan your week</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mode === m.value}
              onClick={() => {
                setMode(m.value);
                setSaved(false);
              }}
              className={
                "flex-1 rounded-control border p-3 text-left transition-colors " +
                (mode === m.value ? "border-accent bg-selection" : "border-border-subtle hover:border-border")
              }
            >
              <div className={"text-nav font-medium " + (mode === m.value ? "text-accent" : "text-fg")}>{m.label}</div>
              <div className="text-[12px] text-fg-muted">{m.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-nav font-medium text-fg">When you can train</span>
        <AvailabilityGrid
          mode={mode}
          value={availability}
          onChange={(next) => {
            setAvailability(next);
            setSaved(false);
          }}
          disabled={update.isPending}
        />
        <p className="text-[12px] text-fg-subtle">
          Changing this never moves a session on its own. If a session ends up on a blocked time, your coach will suggest a move.
        </p>
      </div>

      {update.isError ? (
        <p className="rounded-control border border-border bg-callout px-3 py-2 text-nav text-fg-soft">{update.error.message}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => update.mutate({ scheduleMode: mode, availability })}
          disabled={update.isPending}
          className="rounded-control bg-accent px-4 py-2 text-nav font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {update.isPending ? "Saving…" : "Save"}
        </button>
        {saved ? <span className="text-nav text-fg-muted">Saved.</span> : null}
        {prefs.data ? <span className="text-[12px] text-fg-subtle">Timezone: {prefs.data.timezone}</span> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Replace the Settings stub**

Replace `src/app/app/settings/page.tsx` with:

```tsx
import { PageHeader, SectionHeading } from "~/components/ui-kit/app-shell-kit";
import { SchedulePrefsForm } from "~/components/schedule/schedule-prefs-form";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <SectionHeading title="Schedule" />
      <div className="mt-4 max-w-2xl">
        <SchedulePrefsForm />
      </div>
    </>
  );
}
```

`SectionHeading` takes a `title` prop and brings its own 42px top margin (`src/components/ui-kit/app-shell-kit/components/section-heading.tsx`).

- [ ] **Step 7: Add the onboarding step**

In `src/components/onboarding/onboarding-wizard.tsx`:

Add imports:

```tsx
import type { AvailabilityCellInput } from "~/engine/schedule";
import { AvailabilityGrid } from "~/components/schedule/availability-grid";
import { openDayCount } from "~/components/schedule/availability";
```

and add `type ScheduleMode` to the existing `~/schema` import.

Append a fifth entry to `STEPS`:

```tsx
  { title: "Your week", subtitle: "When you can train. You can change this any time in Settings." },
```

Add state after `priorityMuscles`:

```tsx
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("DAY");
  const [availability, setAvailability] = useState<AvailabilityCellInput[]>([]);
```

Change the comment on the final `return true;` in `stepValid` to `// steps 2–4 always have a valid default selection`.

In `submit()`, add to the `createPlan.mutate({ … })` object:

```tsx
      scheduleMode,
      availability,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
```

Add the step's fields immediately after the closing `)}` of the `{step === 3 && ( … )}` block:

```tsx
        {step === 4 && (
          <>
            <Field label="How you plan your week">
              <div className="flex flex-col gap-2">
                <CardChoice
                  selected={scheduleMode === "DAY"}
                  onClick={() => setScheduleMode("DAY")}
                  title="One session a day"
                  hint="Plan by day. The simplest view."
                />
                <CardChoice
                  selected={scheduleMode === "HALF_DAY"}
                  onClick={() => setScheduleMode("HALF_DAY")}
                  title="AM / PM"
                  hint="Plan by morning and afternoon, with room for two-a-days."
                />
              </div>
            </Field>
            <Field label="When you can train — optional">
              <AvailabilityGrid mode={scheduleMode} value={availability} onChange={setAvailability} />
            </Field>
            {openDayCount(availability) < daysPerWeek ? (
              <p className="rounded-control border border-border-subtle bg-canvas px-3 py-2.5 text-nav text-fg-subtle">
                You train {daysPerWeek} days a week but have left {openDayCount(availability)} open
                {scheduleMode === "HALF_DAY" ? ", so some days will have two sessions or stay unplaced" : ", so some sessions will start unplaced"}.
                You can place them yourself afterwards.
              </p>
            ) : null}
          </>
        )}
```

`Field` and `CardChoice` are the wizard's existing local components; use them as they are defined in the file.

- [ ] **Step 8: Check**

Run: `pnpm check && pnpm vitest run src/components`
Expected: clean, PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/schedule src/app/app/settings/page.tsx src/components/onboarding/onboarding-wizard.tsx
git commit -m "feat(schedule): schedule settings page and onboarding step"
```

---

### Task 13: Product doc, full verification, browser check

**Files:**
- Modify: `PRODUCT.md`

- [ ] **Step 1: Update `PRODUCT.md`**

On the line beginning `**Deferred (do not fabricate as present):**` (currently line 48), remove `AM/PM two-a-day scheduling; ` from the list. Directly below that line add:

```md
**Scheduling (present):** every session has a placement (weekday, optional AM/PM). Athletes choose one-a-day or AM/PM, set a standing availability grid (Preferred / Available / Blocked), and drag sessions on the week board. The engine warns about recovery problems and suggests single moves; it never moves a session on its own. Deferred: one-off availability exceptions, conversational rescheduling, situational coach cues.
```

- [ ] **Step 2: Run everything**

Run: `pnpm test && pnpm check`
Expected: every test passes (the pre-existing suites included), lint and types clean. Record the totals for the hand-off.

- [ ] **Step 3: Browser verification**

Restart the dev server first (`pnpm dev`): a long-running `next dev --turbo` serves a stale module graph after new exports. Then verify each of these on `/app/block/week/<current week>` and report what you saw for each, including any that fail:

1. The board shows seven date-labelled columns starting on the block's start weekday; today's column matches the real date.
2. Every session of the current week is on the board after the backfill; the session panels below are in the same order.
3. Dragging a session to an empty day moves it, the chip gains an accent border, and the draft bar appears with a change count.
4. While dragging, past days and blocked days are dimmed and refuse the drop; a day adjacent to a session sharing its muscles shows a dashed border.
5. Dropping onto an occupied day swaps the two sessions.
6. "Move to…" on a chip offers the same targets and moves the session without a pointer.
7. Putting two sessions that share muscles on consecutive days lists a warning in the draft bar naming both sessions and the muscle.
8. Discard restores the saved layout. Confirm saves it; a reload shows it persisted.
9. Confirm with "Use this layout for the remaining weeks" ticked changes later untouched weeks and reports any week it skipped.
10. After confirming a layout with a recovery problem, a "Coach suggests" card appears; Accept applies the move; on a fresh problem layout, "Keep my layout" hides it and it stays hidden after reload.
11. A completed session's chip cannot be dragged and has no "Move to…" menu.
12. A past week's board is read-only.
13. `/app/settings`: switching to AM/PM gives the board two rows; blocking a day that holds a session leaves the session in place, shows a warning, and produces a suggestion; switching back to one-a-day is refused with a named day while a day holds two sessions.
14. `/app` (Now home) shows the next scheduled session in placement order.
15. Phone width (375px): the board scrolls sideways inside its own container, the page does not.

- [ ] **Step 4: Commit**

```bash
git add PRODUCT.md
git commit -m "docs: record scheduling as present in PRODUCT.md"
```

- [ ] **Step 5: Hand off**

Do not merge. Report the test totals, the browser checklist results, and the scoring constants in effect, and ask the athlete for visual sign-off. After "lgtm", merge `freddy/feat/schedule-foundation` into `freddy/experimental` with a merge commit. Nothing is pushed unless asked.
