# Situational Coach Cues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Short engine-derived coach cues for today and tomorrow (fuelling, recovery), triggered by lifting sessions and by simple outside activities the athlete marks on the week board.

**Architecture:**
- A new date-keyed `OutsideActivity` table, with an `activity` router used by the board.
- A pure engine module (`src/engine/cues.ts`) turns one day's lifts and activities into typed cue facts, with numbers from bodyweight and phase. A pure view module (`src/views/cues.ts`) phrases them.
- A `cue.upcoming` query serves today and tomorrow to a home-page card and to board markers. The scheduler never reads activities.

**Tech Stack:** Next.js 15 App Router, React 19, tRPC 11 + React Query, Prisma 6 (Neon Postgres, `prisma db push`), Zod, Vitest 4 + fast-check, Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-10-20-coach-cues-design.md`

## Global Constraints

- Branch: `freddy/feat/coach-cues`. Never push. Never merge; the controller merges after the athlete's visual lgtm.
- Schema changes are applied with `pnpm db:push` (`prisma db push`). Never `--accept-data-loss` and never `--force-reset`. If push asks for either, stop and report.
- Never print `.env` values.
- Law 1: every number a cue shows comes from `src/engine/cues.ts` using the constants in `src/engine/constants.ts`. Templates contain no digits except through fact fields.
- Law 2: every athlete-facing sentence is built in `src/views/cues.ts` or `src/views/activity.ts` from fact fields.
- **Activities are cues only.** `ScheduleInput`, `WeekContext` (`loadWeekContext`), `CoachWeek` and every schedule and coach procedure stay free of activity data. Don't import anything activity-related into `src/engine/schedule.ts`, `src/server/schedule/`, `src/server/coach/` or `src/domain/coach/`.
- The engine is pure: no I/O, no `Date.now()`, no randomness.
- `rankCues`'s body is reserved for the product owner. It ships as the working placeholder below with its `TODO(product owner)` comment intact. Don't "improve" it.
- `MAX_ACTIVITIES_PER_DAY = 3`. `durationMin` is 5–600 or null.
- **Copy:**
  - No "glycogen", "macros", "optimal", "medical" or "diet".
  - Use "carbs" and "protein".
  - Use an en dash in ranges: "80–95 g".
- Footer copy, verbatim: `Based on your bodyweight and phase. A guide, not a meal plan.`
- Match the surrounding code: 2-space indent, double quotes, `~/` imports, doc comments in full sentences, the token classes already used in `src/components/home/coach-card.tsx`.
- Each task ends with `pnpm test`, `pnpm typecheck` and `pnpm lint` all green.

## Review Focus

1. **Tomorrow is in the next block week, or past the block's end** (Sunday evening, last day of a block). Expected: tomorrow's lifts come from the next week's saved layout, and past the block there are no lifts and no crash. Pinned in Task 4 (`upcomingCueInputs` tests).
2. **Previous-day lifts that never happened.** Yesterday's still-`SCHEDULED` session didn't happen, so it must not trigger "legs yesterday". Tomorrow's "previous day" is today, where a `SCHEDULED` lift is the plan and does count. Pinned in Task 4.
3. **"Yesterday" relative to a tomorrow cue.** A cue for tomorrow about today's activity must say "today", not "yesterday". Pinned in Task 3.
4. **An athlete in a non-UTC timezone near midnight.** "Today" is their local date. Pinned in Task 4 (an `Australia/Sydney` case).
5. **Storage unavailable or throwing** (private mode). Cues still render; dismissing simply doesn't persist. Pinned in Task 5.

---

### Task 1: Activity data, schemas and cue constants

**Files:**
- Modify: `prisma/schema.prisma` (two enums, the `OutsideActivity` model, a relation on `AthleteProfile`)
- Modify: `src/schema/enums.ts`, `src/schema/prisma-parity.test.ts`
- Create: `src/schema/activity.ts`, `src/schema/activity.test.ts`
- Modify: `src/schema/index.ts`
- Modify: `src/engine/constants.ts` (a new "Coach cues" section)

**Interfaces:**
- Produces:
  - `ActivityKindEnum`, `ActivityKind`, `ActivityIntensityEnum`, `ActivityIntensity` (from `~/schema`).
  - `MAX_ACTIVITIES_PER_DAY`, `ActivityListInputSchema`, `ActivityAddInputSchema`, `ActivityRemoveInputSchema` and their inferred types `ActivityAddInput`, `ActivityRemoveInput`.
  - The `CUE_*` constants.
  - Prisma `db.outsideActivity`.

- [ ] **Step 1: Prisma schema.** Add after `enum Daypart` (keep the existing enum order otherwise):

```prisma
enum ActivityKind {
  RUN
  RIDE
  SWIM
  SPORT
  OTHER
}

enum ActivityIntensity {
  EASY
  MODERATE
  HARD
}
```

Add after `model AvailabilityException`:

```prisma
/// Something the athlete does outside their lifting plan (a run, a ride, a game). Keyed by
/// the athlete's local date, like AvailabilityException, so re-planning a block never
/// touches it. Cues read it; scheduling never does.
model OutsideActivity {
  id               String            @id @default(cuid())
  athleteProfileId String
  athleteProfile   AthleteProfile    @relation(fields: [athleteProfileId], references: [id], onDelete: Cascade)
  date             DateTime          @db.Date
  daypart          Daypart?
  kind             ActivityKind
  intensity        ActivityIntensity
  durationMin      Int?
  createdAt        DateTime          @default(now())

  @@index([athleteProfileId, date])
  @@map("outside_activity")
}
```

In `model AthleteProfile`, after `coachMessages CoachMessage[]`, add `outsideActivities OutsideActivity[]`.

- [ ] **Step 2: Apply.** Run `pnpm db:push`, which also regenerates the client. Expected: "Your database is now in sync". If it asks to accept data loss or to reset, STOP and report.

- [ ] **Step 3: Domain enums.** In `src/schema/enums.ts`, after `DaypartEnum`'s block:

```ts
export const ActivityKindEnum = z.enum(["RUN", "RIDE", "SWIM", "SPORT", "OTHER"]);
export type ActivityKind = z.infer<typeof ActivityKindEnum>;

export const ActivityIntensityEnum = z.enum(["EASY", "MODERATE", "HARD"]);
export type ActivityIntensity = z.infer<typeof ActivityIntensityEnum>;
```

In `src/schema/prisma-parity.test.ts`, add two rows next to the `Daypart` row, in the same shape:

```ts
  ["ActivityKind", Prisma.ActivityKind, Domain.ActivityKindEnum.options],
  ["ActivityIntensity", Prisma.ActivityIntensity, Domain.ActivityIntensityEnum.options],
```

- [ ] **Step 4: Write the failing input-schema tests** (`src/schema/activity.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { ActivityAddInputSchema, ActivityRemoveInputSchema, MAX_ACTIVITIES_PER_DAY } from "./activity";

const base = { weekIndex: 1, date: "2026-10-20", daypart: "AM", kind: "RUN", intensity: "HARD", durationMin: 45 } as const;

describe("ActivityAddInputSchema", () => {
  it("accepts a full activity and one with no daypart or duration", () => {
    expect(ActivityAddInputSchema.safeParse(base).success).toBe(true);
    expect(ActivityAddInputSchema.safeParse({ ...base, daypart: null, durationMin: null }).success).toBe(true);
  });
  it("bounds the duration to 5–600 whole minutes", () => {
    for (const durationMin of [4, 601, 30.5]) {
      expect(ActivityAddInputSchema.safeParse({ ...base, durationMin }).success).toBe(false);
    }
    for (const durationMin of [5, 600]) {
      expect(ActivityAddInputSchema.safeParse({ ...base, durationMin }).success).toBe(true);
    }
  });
  it("refuses an unknown kind or intensity and a malformed date", () => {
    expect(ActivityAddInputSchema.safeParse({ ...base, kind: "HIKE" }).success).toBe(false);
    expect(ActivityAddInputSchema.safeParse({ ...base, intensity: "MAX" }).success).toBe(false);
    expect(ActivityAddInputSchema.safeParse({ ...base, date: "20-10-2026" }).success).toBe(false);
  });
});

describe("ActivityRemoveInputSchema", () => {
  it("needs a week and an id", () => {
    expect(ActivityRemoveInputSchema.safeParse({ weekIndex: 1, id: "a1" }).success).toBe(true);
    expect(ActivityRemoveInputSchema.safeParse({ weekIndex: 1, id: "" }).success).toBe(false);
  });
});

it("caps a day at three activities", () => {
  expect(MAX_ACTIVITIES_PER_DAY).toBe(3);
});
```

Run `pnpm vitest run src/schema/activity.test.ts`. Expected: FAIL, because the module doesn't exist.

- [ ] **Step 5: Input schemas** (`src/schema/activity.ts`):

```ts
import { z } from "zod";
import { ActivityIntensityEnum, ActivityKindEnum, DaypartEnum } from "./enums";
import { IsoDateSchema } from "./schedule";

/** Outside activities a single date may hold. */
export const MAX_ACTIVITIES_PER_DAY = 3;

const WeekIndexSchema = z.number().int().min(1);

export const ActivityListInputSchema = z.object({ weekIndex: WeekIndexSchema });

/** `date` must fall in the viewed week; the router checks that against the block. */
export const ActivityAddInputSchema = z.object({
  weekIndex: WeekIndexSchema,
  date: IsoDateSchema,
  daypart: DaypartEnum.nullable(),
  kind: ActivityKindEnum,
  intensity: ActivityIntensityEnum,
  durationMin: z.number().int().min(5).max(600).nullable(),
});
export type ActivityAddInput = z.infer<typeof ActivityAddInputSchema>;

export const ActivityRemoveInputSchema = z.object({ weekIndex: WeekIndexSchema, id: z.string().min(1).max(64) });
export type ActivityRemoveInput = z.infer<typeof ActivityRemoveInputSchema>;
```

Add `export * from "./activity";` to `src/schema/index.ts`, after `./coach`.

- [ ] **Step 6: Cue constants.** Append to `src/engine/constants.ts`:

```ts
// ─── Coach cues ───
// Starting values, to be tuned by the product owner. The g/kg ranges follow published
// sports-nutrition guidance; the rest are product judgement.

/** Carbs in the meal between two demanding sessions on one day, g per kg (ACSM/ISSN refuelling). */
export const CUE_CARBS_BETWEEN_G_PER_KG: readonly [number, number] = [1.0, 1.2];
/** Carbs in the meal before a big lower-body session, g per kg (low end of ACSM's 1–4 g/kg). */
export const CUE_CARBS_BEFORE_G_PER_KG: readonly [number, number] = [1.0, 1.5];
/** Protein in the meal after a session, g per kg (ISSN, per meal). */
export const CUE_PROTEIN_G_PER_KG: readonly [number, number] = [0.3, 0.4];
/** Carb ranges scale with the training phase; protein does not. */
export const CUE_PHASE_CARB_FACTOR = { CUT: 0.8, MAINTAIN: 1, BULK: 1.2 } as const;
/** When the pre-session meal should be eaten, hours before. */
export const CUE_PRE_MEAL_HOURS: readonly [number, number] = [2, 3];
/** Quad + hamstring + glute sets at which a session counts as a big lower-body day. */
export const CUE_HEAVY_LOWER_SETS = 10;
/** An easy activity this long or longer still counts as demanding, minutes. */
export const CUE_LONG_EASY_MIN = 60;
/** Bodyweights outside this range give words, not numbers, kg. */
export const CUE_WEIGHT_MIN_KG = 30;
export const CUE_WEIGHT_MAX_KG = 250;
/** Gram ranges are rounded to this step, and the high end is at least one step above the low. */
export const CUE_ROUND_G = 5;
/** Cues shown per day at most. */
export const CUE_MAX_PER_DAY = 2;
```

- [ ] **Step 7: Verify.** Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: all pass. The parity test now covers the two new enums.

- [ ] **Step 8: Commit.**

```bash
git add prisma/schema.prisma src/schema src/engine/constants.ts
git commit -m "feat(activity): an outside-activity table, its input schemas, and coach cue constants"
```

---

### Task 2: Cue rules in the engine

**Files:**
- Create: `src/engine/cues.ts`, `src/engine/cues.test.ts`, `src/engine/cues.properties.test.ts`
- Modify: `src/engine/index.ts`

**Interfaces:**
- Consumes:
  - `Footprint` from `./schedule`;
  - `ActivityKind`, `ActivityIntensity`, `Daypart`, `TrainingPhase` from `~/schema`;
  - the `CUE_*` constants (Task 1).
- Produces (exported from `~/engine`):
  - types `CueLift`, `CueActivity`, `CueDayInput`, `CueSubject`, `GramRange`, `CueFact`, `CueKind`;
  - `deriveCues(input: CueDayInput): CueFact[]`;
  - `rankCues(facts: CueFact[]): CueFact[]`;
  - `cueId(fact: CueFact): string`;
  - `lowerSets(footprint: Footprint): number`;
  - `gramRange(perKg: readonly [number, number], weightKg: number | null, factor: number): GramRange | null`.

- [ ] **Step 1: Write the failing unit tests** (`src/engine/cues.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { cueId, deriveCues, gramRange, lowerSets, rankCues, type CueActivity, type CueDayInput, type CueLift } from "./cues";

const legs = (over: Partial<CueLift> = {}): CueLift => ({
  id: "L",
  label: "Legs",
  daypart: "PM",
  footprint: { QUADS: 6, HAMSTRINGS: 4, GLUTES: 2, CALVES: 4 },
  ...over,
});
const upper = (over: Partial<CueLift> = {}): CueLift => ({
  id: "U",
  label: "Upper A",
  daypart: "AM",
  footprint: { CHEST: 8, BACK: 8 },
  ...over,
});
const run = (over: Partial<CueActivity> = {}): CueActivity => ({
  id: "R",
  kind: "RUN",
  intensity: "HARD",
  daypart: "AM",
  durationMin: null,
  ...over,
});
const day = (over: Partial<CueDayInput> = {}): CueDayInput => ({
  date: "2026-10-20",
  lifts: [],
  activities: [],
  previous: { lifts: [], activities: [] },
  weightKg: 80,
  phase: "MAINTAIN",
  ...over,
});
const kinds = (input: CueDayInput) => deriveCues(input).map((f) => f.kind);

describe("lowerSets", () => {
  it("counts quads, hamstrings and glutes, not calves", () => {
    expect(lowerSets({ QUADS: 6, HAMSTRINGS: 4, GLUTES: 2, CALVES: 4 })).toBe(12);
    expect(lowerSets({ CHEST: 10 })).toBe(0);
  });
});

describe("gramRange", () => {
  it("multiplies by weight and factor, rounds to 5 g", () => {
    expect(gramRange([1.0, 1.2], 80, 1)).toEqual([80, 95]);
    expect(gramRange([0.3, 0.4], 80, 1)).toEqual([25, 30]);
    expect(gramRange([1.0, 1.2], 80, 0.8)).toEqual([65, 75]);
  });
  it("keeps the high end at least 5 g above the low end", () => {
    expect(gramRange([0.3, 0.31], 40, 1)).toEqual([10, 15]);
  });
  it("gives no number without a plausible bodyweight", () => {
    expect(gramRange([1, 1.2], null, 1)).toBeNull();
    expect(gramRange([1, 1.2], 29.9, 1)).toBeNull();
    expect(gramRange([1, 1.2], 250.1, 1)).toBeNull();
    expect(gramRange([1, 1.2], Number.NaN, 1)).toBeNull();
    expect(gramRange([1, 1.2], 30, 1)).not.toBeNull();
    expect(gramRange([1, 1.2], 250, 1)).not.toBeNull();
  });
});

describe("fuel_between", () => {
  it("fires for a hard AM run and PM legs, in the known order", () => {
    const [f] = deriveCues(day({ lifts: [legs()], activities: [run()] }));
    expect(f).toMatchObject({
      kind: "fuel_between",
      order: "known",
      first: { type: "activity", id: "R" },
      second: { type: "lift", id: "L" },
      carbsG: [80, 95],
    });
  });
  it("puts the lift first when it is the morning one", () => {
    const [f] = deriveCues(day({ lifts: [legs({ daypart: "AM" })], activities: [run({ daypart: "PM" })] }));
    expect(f).toMatchObject({ first: { id: "L" }, second: { id: "R" }, order: "known" });
  });
  it("says the order is unknown when either side has no daypart or both share one", () => {
    expect(deriveCues(day({ lifts: [legs({ daypart: null })], activities: [run()] }))[0]).toMatchObject({ order: "unknown" });
    expect(deriveCues(day({ lifts: [legs({ daypart: "AM" })], activities: [run()] }))[0]).toMatchObject({ order: "unknown" });
  });
  it("fires for two lifts on one day", () => {
    const [f] = deriveCues(day({ lifts: [upper(), legs()] }));
    expect(f).toMatchObject({ kind: "fuel_between", first: { id: "U" }, second: { id: "L" }, order: "known" });
  });
  it("needs a demanding activity: easy under 60 min is not, easy at 60 is", () => {
    expect(kinds(day({ lifts: [upper()], activities: [run({ intensity: "EASY", durationMin: 59 })] }))).toEqual([]);
    expect(kinds(day({ lifts: [upper()], activities: [run({ intensity: "EASY", durationMin: null })] }))).toEqual([]);
    expect(kinds(day({ lifts: [upper()], activities: [run({ intensity: "EASY", durationMin: 60 })] }))).toEqual(["fuel_between"]);
    expect(kinds(day({ lifts: [upper()], activities: [run({ intensity: "MODERATE" })] }))).toEqual(["fuel_between"]);
  });
  it("scales carbs with phase and drops the number without a bodyweight", () => {
    expect(deriveCues(day({ lifts: [legs()], activities: [run()], phase: "BULK" }))[0]).toMatchObject({ carbsG: [95, 115] });
    expect(deriveCues(day({ lifts: [legs()], activities: [run()], weightKg: null }))[0]).toMatchObject({ carbsG: null });
  });
  it("suppresses heavy_lower for a lift it already names", () => {
    expect(kinds(day({ lifts: [legs()], activities: [run()] }))).toEqual(["fuel_between"]);
  });
  it("says nothing about an activity alone", () => {
    expect(kinds(day({ activities: [run()] }))).toEqual([]);
  });
});

describe("heavy_lower", () => {
  const withLower = (n: number) => legs({ footprint: { QUADS: n } });
  it("fires at 10 lower-body sets, not 9", () => {
    expect(kinds(day({ lifts: [withLower(9)] }))).toEqual([]);
    expect(kinds(day({ lifts: [withLower(10)] }))).toEqual(["heavy_lower"]);
    expect(deriveCues(day({ lifts: [withLower(11)] }))[0]).toMatchObject({ lowerSets: 11, carbsG: [80, 120], mealHoursBefore: [2, 3] });
  });
});

describe("recovery_overlap", () => {
  it("fires for heavy legs today after a leg-loading activity yesterday", () => {
    const [f] = deriveCues(day({ lifts: [legs()], previous: { lifts: [], activities: [run()] } }));
    expect(f).toMatchObject({ kind: "recovery_overlap", yesterday: { id: "R" }, today: { id: "L" }, proteinG: [25, 30] });
  });
  it("fires for a leg-loading activity today after heavy legs yesterday", () => {
    const [f] = deriveCues(day({ activities: [run({ kind: "RIDE" })], previous: { lifts: [legs()], activities: [] } }));
    expect(f).toMatchObject({ kind: "recovery_overlap", yesterday: { id: "L" }, today: { id: "R" } });
  });
  it("does not treat swims or other activities as leg-loading", () => {
    for (const kind of ["SWIM", "OTHER"] as const) {
      expect(kinds(day({ lifts: [legs({ footprint: { QUADS: 4 } })], previous: { lifts: [], activities: [run({ kind })] } }))).toEqual([]);
    }
  });
  it("protein does not scale with phase", () => {
    const f = deriveCues(day({ lifts: [legs()], phase: "CUT", previous: { lifts: [], activities: [run()] } }));
    expect(f.find((x) => x.kind === "recovery_overlap")).toMatchObject({ proteinG: [25, 30] });
  });
});

describe("cueId and rankCues", () => {
  it("builds a stable id from the date, kind and sorted ids", () => {
    const [f] = deriveCues(day({ lifts: [legs()], activities: [run()] }));
    expect(cueId(f!)).toBe("2026-10-20:fuel_between:L+R");
  });
  it("orders fuel_between, recovery_overlap, heavy_lower and keeps two", () => {
    const facts = deriveCues(
      day({
        lifts: [legs({ id: "L1", daypart: "PM" }), legs({ id: "L2", label: "Legs B", daypart: null })],
        activities: [run()],
        previous: { lifts: [], activities: [run({ id: "R0" })] },
      }),
    );
    const ranked = rankCues(facts);
    expect(ranked).toHaveLength(2);
    expect(ranked.map((f) => f.kind)).toEqual(["fuel_between", "fuel_between"]);
    expect(rankCues([...facts].reverse())).toEqual(ranked);
  });
});
```

Run `pnpm vitest run src/engine/cues.test.ts`. Expected: FAIL, because the module doesn't exist.

- [ ] **Step 2: Implement** (`src/engine/cues.ts`):

```ts
import type { ActivityIntensity, ActivityKind, Daypart, TrainingPhase } from "~/schema";
import {
  CUE_CARBS_BEFORE_G_PER_KG,
  CUE_CARBS_BETWEEN_G_PER_KG,
  CUE_HEAVY_LOWER_SETS,
  CUE_LONG_EASY_MIN,
  CUE_MAX_PER_DAY,
  CUE_PHASE_CARB_FACTOR,
  CUE_PRE_MEAL_HOURS,
  CUE_PROTEIN_G_PER_KG,
  CUE_ROUND_G,
  CUE_WEIGHT_MAX_KG,
  CUE_WEIGHT_MIN_KG,
} from "./constants";
import type { Footprint } from "./schedule";

/** A lifting session on the cue's day (or the day before), as placed. */
export interface CueLift {
  id: string;
  label: string;
  daypart: Daypart | null;
  footprint: Footprint;
}

/** Something the athlete does outside the plan. */
export interface CueActivity {
  id: string;
  kind: ActivityKind;
  intensity: ActivityIntensity;
  daypart: Daypart | null;
  durationMin: number | null;
}

/**
 * One day, as cues need it. `lifts` are the day's sessions still to train; `previous` is
 * what the day before held (sessions that were done, or are planned when that day has not
 * come yet).
 */
export interface CueDayInput {
  date: string; // "YYYY-MM-DD", the athlete's local date
  lifts: CueLift[];
  activities: CueActivity[];
  previous: { lifts: CueLift[]; activities: CueActivity[] };
  weightKg: number | null;
  phase: TrainingPhase;
}

export type CueSubject =
  | { type: "lift"; id: string; label: string }
  | { type: "activity"; id: string; kind: ActivityKind; intensity: ActivityIntensity };

/** A whole-gram range, low then high. */
export type GramRange = readonly [number, number];

export type CueFact =
  | { kind: "fuel_between"; date: string; first: CueSubject; second: CueSubject; order: "known" | "unknown"; carbsG: GramRange | null }
  | { kind: "recovery_overlap"; date: string; yesterday: CueSubject; today: CueSubject; proteinG: GramRange | null }
  | {
      kind: "heavy_lower";
      date: string;
      lift: Extract<CueSubject, { type: "lift" }>;
      lowerSets: number;
      carbsG: GramRange | null;
      mealHoursBefore: readonly [number, number];
    };

export type CueKind = CueFact["kind"];

/** Quad, hamstring and glute sets. Calves load the legs too little to count. */
export function lowerSets(footprint: Footprint): number {
  return (footprint.QUADS ?? 0) + (footprint.HAMSTRINGS ?? 0) + (footprint.GLUTES ?? 0);
}

/** A per-kg range for this athlete, rounded; null without a plausible bodyweight. */
export function gramRange(perKg: readonly [number, number], weightKg: number | null, factor: number): GramRange | null {
  if (weightKg === null || !(weightKg >= CUE_WEIGHT_MIN_KG && weightKg <= CUE_WEIGHT_MAX_KG)) return null;
  const round = (g: number) => Math.round(g / CUE_ROUND_G) * CUE_ROUND_G;
  const low = round(perKg[0] * weightKg * factor);
  return [low, Math.max(round(perKg[1] * weightKg * factor), low + CUE_ROUND_G)];
}

const demanding = (a: CueActivity) =>
  a.intensity !== "EASY" || (a.durationMin !== null && a.durationMin >= CUE_LONG_EASY_MIN);
const legLoading = (a: CueActivity) => demanding(a) && (a.kind === "RUN" || a.kind === "RIDE" || a.kind === "SPORT");
const heavyLower = (l: CueLift) => lowerSets(l.footprint) >= CUE_HEAVY_LOWER_SETS;

const liftSubject = (l: CueLift) => ({ type: "lift", id: l.id, label: l.label }) as const;
const activitySubject = (a: CueActivity): CueSubject => ({ type: "activity", id: a.id, kind: a.kind, intensity: a.intensity });

/** Every cue one day's facts support, before ranking. Deterministic for a given input order. */
export function deriveCues(input: CueDayInput): CueFact[] {
  const out: CueFact[] = [];
  const carbFactor = CUE_PHASE_CARB_FACTOR[input.phase];
  const between = gramRange(CUE_CARBS_BETWEEN_G_PER_KG, input.weightKg, carbFactor);
  const before = gramRange(CUE_CARBS_BEFORE_G_PER_KG, input.weightKg, carbFactor);
  const protein = gramRange(CUE_PROTEIN_G_PER_KG, input.weightKg, 1);

  // Two demanding things on one day: the meal between them matters.
  const fuelled = new Set<string>();
  const pair = (a: { s: CueSubject; daypart: Daypart | null }, b: { s: CueSubject; daypart: Daypart | null }) => {
    const known = a.daypart !== null && b.daypart !== null && a.daypart !== b.daypart;
    const [first, second] = known && a.daypart === "PM" ? [b, a] : [a, b];
    out.push({ kind: "fuel_between", date: input.date, first: first.s, second: second.s, order: known ? "known" : "unknown", carbsG: between });
    for (const s of [first.s, second.s]) if (s.type === "lift") fuelled.add(s.id);
  };
  for (const act of input.activities.filter(demanding)) {
    for (const lift of input.lifts) pair({ s: activitySubject(act), daypart: act.daypart }, { s: liftSubject(lift), daypart: lift.daypart });
  }
  input.lifts.forEach((a, i) => {
    for (const b of input.lifts.slice(i + 1)) pair({ s: liftSubject(a), daypart: a.daypart }, { s: liftSubject(b), daypart: b.daypart });
  });

  // Legs on consecutive days, one of them outside the gym.
  for (const lift of input.lifts.filter(heavyLower)) {
    for (const act of input.previous.activities.filter(legLoading)) {
      out.push({ kind: "recovery_overlap", date: input.date, yesterday: activitySubject(act), today: liftSubject(lift), proteinG: protein });
    }
  }
  for (const act of input.activities.filter(legLoading)) {
    for (const lift of input.previous.lifts.filter(heavyLower)) {
      out.push({ kind: "recovery_overlap", date: input.date, yesterday: liftSubject(lift), today: activitySubject(act), proteinG: protein });
    }
  }

  // A big lower-body session, unless a fuel cue already covers its meal.
  for (const lift of input.lifts.filter(heavyLower)) {
    if (fuelled.has(lift.id)) continue;
    out.push({
      kind: "heavy_lower",
      date: input.date,
      lift: liftSubject(lift),
      lowerSets: lowerSets(lift.footprint),
      carbsG: before,
      mealHoursBefore: CUE_PRE_MEAL_HOURS,
    });
  }
  return out;
}

const subjectsOf = (f: CueFact): CueSubject[] =>
  f.kind === "fuel_between" ? [f.first, f.second] : f.kind === "recovery_overlap" ? [f.yesterday, f.today] : [f.lift];

/** Stable identity: the date, the kind and the sorted ids it names. Dismissal keys on it. */
export function cueId(f: CueFact): string {
  const ids = subjectsOf(f)
    .map((s) => s.id)
    .sort()
    .join("+");
  return `${f.date}:${f.kind}:${ids}`;
}

const CUE_ORDER: Record<CueKind, number> = { fuel_between: 0, recovery_overlap: 1, heavy_lower: 2 };

/** The cues worth showing for one day, most important first. */
export function rankCues(facts: CueFact[]): CueFact[] {
  // TODO(product owner): which cue matters most on a busy day, and how many to show.
  // This placeholder ranks by kind, then by id, and keeps CUE_MAX_PER_DAY.
  return [...facts]
    .sort((a, b) => CUE_ORDER[a.kind] - CUE_ORDER[b.kind] || cueId(a).localeCompare(cueId(b)))
    .slice(0, CUE_MAX_PER_DAY);
}
```

Add to `src/engine/index.ts`, next to the schedule exports:

```ts
export { deriveCues, rankCues, cueId, lowerSets, gramRange } from "./cues";
export type { CueLift, CueActivity, CueDayInput, CueSubject, GramRange, CueFact, CueKind } from "./cues";
```

Run `pnpm vitest run src/engine/cues.test.ts`. Expected: PASS. If a hand-computed expectation disagrees with the implementation, recompute it by hand from the constants before changing either, and report the case.

- [ ] **Step 3: Write the property test** (`src/engine/cues.properties.test.ts`):

```ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CUE_PHASE_CARB_FACTOR, CUE_CARBS_BETWEEN_G_PER_KG, CUE_CARBS_BEFORE_G_PER_KG, CUE_PROTEIN_G_PER_KG, CUE_MAX_PER_DAY } from "./constants";
import { deriveCues, rankCues, type CueDayInput } from "./cues";

const daypart = fc.constantFrom("AM" as const, "PM" as const, null);
const lift = (id: string) =>
  fc.record({
    id: fc.constant(id),
    label: fc.constantFrom("Legs", "Upper A", "Push"),
    daypart,
    footprint: fc.record({ QUADS: fc.nat(10), HAMSTRINGS: fc.nat(8), GLUTES: fc.nat(6), CHEST: fc.nat(10) }),
  });
const activity = (id: string) =>
  fc.record({
    id: fc.constant(id),
    kind: fc.constantFrom("RUN" as const, "RIDE" as const, "SWIM" as const, "SPORT" as const, "OTHER" as const),
    intensity: fc.constantFrom("EASY" as const, "MODERATE" as const, "HARD" as const),
    daypart,
    durationMin: fc.option(fc.integer({ min: 5, max: 600 }), { nil: null }),
  });
const input: fc.Arbitrary<CueDayInput> = fc.record({
  date: fc.constant("2026-10-20"),
  lifts: fc.tuple(lift("L1"), lift("L2")).chain(([a, b]) => fc.constantFrom([], [a], [a, b])),
  activities: fc.tuple(activity("A1"), activity("A2")).chain(([a, b]) => fc.constantFrom([], [a], [a, b])),
  previous: fc.record({
    lifts: fc.tuple(lift("P1")).chain(([a]) => fc.constantFrom([], [a])),
    activities: fc.tuple(activity("PA1")).chain(([a]) => fc.constantFrom([], [a])),
  }),
  weightKg: fc.option(fc.double({ min: 20, max: 300, noNaN: true }), { nil: null }),
  phase: fc.constantFrom("CUT" as const, "MAINTAIN" as const, "BULK" as const),
});

const within = (r: readonly [number, number] | null, perKg: readonly [number, number], w: number | null, f: number) => {
  if (r === null) return true;
  if (w === null) return false;
  return r[0] >= perKg[0] * w * f - 2.5 && r[0] <= perKg[1] * w * f + 2.5 && r[1] >= r[0] + 5 && r[1] <= perKg[1] * w * f + 5;
};

describe("cue properties", () => {
  it("every number is inside its g/kg bounds, and every cue names only what the input holds", () => {
    fc.assert(
      fc.property(input, (d) => {
        const known = new Set([...d.lifts, ...d.activities, ...d.previous.lifts, ...d.previous.activities].map((x) => x.id));
        const f = CUE_PHASE_CARB_FACTOR[d.phase];
        for (const c of deriveCues(d)) {
          if (c.kind === "fuel_between") {
            expect(within(c.carbsG, CUE_CARBS_BETWEEN_G_PER_KG, d.weightKg, f)).toBe(true);
            expect(known.has(c.first.id) && known.has(c.second.id)).toBe(true);
          } else if (c.kind === "recovery_overlap") {
            expect(within(c.proteinG, CUE_PROTEIN_G_PER_KG, d.weightKg, 1)).toBe(true);
            expect(known.has(c.yesterday.id) && known.has(c.today.id)).toBe(true);
          } else {
            expect(within(c.carbsG, CUE_CARBS_BEFORE_G_PER_KG, d.weightKg, f)).toBe(true);
            expect(d.lifts.some((l) => l.id === c.lift.id)).toBe(true);
          }
        }
        expect(rankCues(deriveCues(d)).length).toBeLessThanOrEqual(CUE_MAX_PER_DAY);
      }),
    );
  });
});
```

Run it. Expected: PASS.

- [ ] **Step 4: Verify.** Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: all pass.

- [ ] **Step 5: Commit.**

```bash
git add src/engine/cues.ts src/engine/cues.test.ts src/engine/cues.properties.test.ts src/engine/index.ts
git commit -m "feat(engine): situational cue rules with bodyweight-based ranges"
```

---

### Task 3: Phrasing cues and activities

**Files:**
- Create: `src/views/cues.ts`, `src/views/cues.test.ts`
- Create: `src/views/activity.ts`, `src/views/activity.test.ts`

**Interfaces:**
- Consumes: `CueFact`, `CueSubject`, `cueId` (Task 2); `ActivityKind`, `ActivityIntensity`, `Daypart` from `~/schema`.
- Produces:
  - `CueWhen = "today" | "tomorrow"`.
  - `CueView { id: string; date: string; when: CueWhen; kind: CueKind; title: string; line: string; hasNumber: boolean }`.
  - `toCueView(fact: CueFact, when: CueWhen): CueView`.
  - `CUE_FOOTER: string`.
  - `ActivityView { id: string; date: string; daypart: Daypart | null; kind: ActivityKind; intensity: ActivityIntensity; durationMin: number | null }`.
  - `toActivityView(row: { id: string; date: Date; daypart: Daypart | null; kind: ActivityKind; intensity: ActivityIntensity; durationMin: number | null }): ActivityView`.
  - `activityChipText(a: ActivityView): string`.
  - `ACTIVITY_KIND_LABEL: Record<ActivityKind, string>`, `ACTIVITY_INTENSITY_LABEL: Record<ActivityIntensity, string>`.

- [ ] **Step 1: Write the failing tests** (`src/views/cues.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import type { CueFact } from "~/engine";
import { CUE_FOOTER, toCueView } from "./cues";

const run = { type: "activity", id: "R", kind: "RUN", intensity: "HARD" } as const;
const legs = { type: "lift", id: "L", label: "Legs" } as const;
const swim = { type: "activity", id: "S", kind: "SWIM", intensity: "EASY" } as const;

const fuel = (over: Partial<Extract<CueFact, { kind: "fuel_between" }>> = {}): CueFact => ({
  kind: "fuel_between", date: "2026-10-20", first: run, second: legs, order: "known", carbsG: [80, 95], ...over,
});
const overlap = (over: Partial<Extract<CueFact, { kind: "recovery_overlap" }>> = {}): CueFact => ({
  kind: "recovery_overlap", date: "2026-10-20", yesterday: run, today: legs, proteinG: [25, 30], ...over,
});
const heavy = (over: Partial<Extract<CueFact, { kind: "heavy_lower" }>> = {}): CueFact => ({
  kind: "heavy_lower", date: "2026-10-20", lift: legs, lowerSets: 14, carbsG: [80, 120], mealHoursBefore: [2, 3], ...over,
});

describe("toCueView", () => {
  it("names a known order as 'X, then Y' and gives the range", () => {
    const v = toCueView(fuel(), "today");
    expect(v.title).toBe("Hard run, then Legs");
    expect(v.line).toMatch(/80–95 g of carbs/);
    expect(v.hasNumber).toBe(true);
    expect(v.id).toBe("2026-10-20:fuel_between:L+R");
  });
  it("says 'on the same day' when the order is unknown", () => {
    expect(toCueView(fuel({ order: "unknown" }), "today").title).toBe("Hard run and Legs on the same day");
  });
  it("uses plain words with no number", () => {
    const v = toCueView(fuel({ carbsG: null }), "today");
    expect(v.line).not.toMatch(/\d/);
    expect(v.line.toLowerCase()).toContain("carb");
    expect(v.hasNumber).toBe(false);
  });
  it("words the previous day relative to the cue's day", () => {
    expect(toCueView(overlap(), "today").title).toBe("Hard run yesterday, Legs today");
    expect(toCueView(overlap(), "tomorrow").title).toBe("Hard run today, Legs tomorrow");
  });
  it("describes a long easy activity as such", () => {
    expect(toCueView(fuel({ first: { ...run, intensity: "EASY" } }), "today").title).toBe("Long easy run, then Legs");
  });
  it("gives protein for an overlap and carbs with timing for a heavy lower day", () => {
    expect(toCueView(overlap(), "today").line).toMatch(/25–30 g of protein/);
    const h = toCueView(heavy(), "today");
    expect(h.title).toBe("Big lower-body day");
    expect(h.line).toMatch(/14 lower-body sets/);
    expect(h.line).toMatch(/80–120 g of carbs/);
    expect(h.line).toMatch(/2–3 hours/);
  });
  it("picks the same variant for the same cue every time", () => {
    expect(toCueView(fuel(), "today").line).toBe(toCueView(fuel(), "today").line);
  });
  it("never leaves undefined, NaN or a hyphen range in any line", () => {
    const facts = [fuel(), fuel({ carbsG: null }), fuel({ order: "unknown", second: swim }), overlap(), overlap({ proteinG: null }), heavy(), heavy({ carbsG: null })];
    for (const f of facts)
      for (const when of ["today", "tomorrow"] as const) {
        const v = toCueView(f, when);
        expect(`${v.title} ${v.line}`).not.toMatch(/undefined|NaN|\d-\d|glycogen|macros/);
      }
  });
  it("keeps the footer verbatim", () => {
    expect(CUE_FOOTER).toBe("Based on your bodyweight and phase. A guide, not a meal plan.");
  });
});
```

`src/views/activity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { activityChipText, toActivityView } from "./activity";

describe("activity views", () => {
  it("reads the date column as the local calendar date", () => {
    const v = toActivityView({ id: "a", date: new Date("2026-10-20T00:00:00Z"), daypart: "AM", kind: "RUN", intensity: "HARD", durationMin: 45 });
    expect(v.date).toBe("2026-10-20");
  });
  it("writes a chip as kind · intensity · time · minutes, leaving out what is not set", () => {
    const base = { id: "a", date: "2026-10-20", kind: "RUN", intensity: "HARD" } as const;
    expect(activityChipText({ ...base, daypart: "AM", durationMin: 45 })).toBe("Run · hard · AM · 45 min");
    expect(activityChipText({ ...base, daypart: null, durationMin: null })).toBe("Run · hard");
    expect(activityChipText({ ...base, kind: "SPORT", intensity: "EASY", daypart: "PM", durationMin: null })).toBe("Sport · easy · PM");
  });
});
```

Run both. Expected: FAIL, because the modules don't exist.

- [ ] **Step 2: Implement** `src/views/activity.ts`:

```ts
import type { ActivityIntensity, ActivityKind, Daypart } from "~/schema";

export interface ActivityView {
  id: string;
  date: string; // "YYYY-MM-DD"
  daypart: Daypart | null;
  kind: ActivityKind;
  intensity: ActivityIntensity;
  durationMin: number | null;
}

export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  RUN: "Run",
  RIDE: "Ride",
  SWIM: "Swim",
  SPORT: "Sport",
  OTHER: "Other",
};

export const ACTIVITY_INTENSITY_LABEL: Record<ActivityIntensity, string> = {
  EASY: "easy",
  MODERATE: "moderate",
  HARD: "hard",
};

/** A `@db.Date` column arrives as UTC midnight of the stored calendar date. */
export function toActivityView(row: {
  id: string;
  date: Date;
  daypart: Daypart | null;
  kind: ActivityKind;
  intensity: ActivityIntensity;
  durationMin: number | null;
}): ActivityView {
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    daypart: row.daypart,
    kind: row.kind,
    intensity: row.intensity,
    durationMin: row.durationMin,
  };
}

/** "Run · hard · AM · 45 min". */
export function activityChipText(a: ActivityView): string {
  return [
    ACTIVITY_KIND_LABEL[a.kind],
    ACTIVITY_INTENSITY_LABEL[a.intensity],
    a.daypart,
    a.durationMin !== null ? `${a.durationMin} min` : null,
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");
}
```

`src/views/cues.ts`:

```ts
import { cueId, type CueFact, type CueKind, type CueSubject, type GramRange } from "~/engine";

export type CueWhen = "today" | "tomorrow";

export interface CueView {
  id: string;
  date: string;
  when: CueWhen;
  kind: CueKind;
  title: string;
  line: string;
  /** Whether the line carries a number; the card shows its footer only then. */
  hasNumber: boolean;
}

export const CUE_FOOTER = "Based on your bodyweight and phase. A guide, not a meal plan.";

const NOUN = { RUN: "run", RIDE: "ride", SWIM: "swim", SPORT: "game", OTHER: "activity" } as const;

/** How a subject is named mid-sentence: a session by its label, an activity by what it was.
 * An easy activity only reaches a cue when it was long, so it is called that. */
function named(s: CueSubject): string {
  if (s.type === "lift") return s.label;
  const adj = s.intensity === "HARD" ? "hard " : s.intensity === "EASY" ? "long easy " : "";
  return `${adj}${NOUN[s.kind]}`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const grams = (r: GramRange) => `${r[0]}–${r[1]} g`;

/** Two wordings per line, chosen by the cue's id so one cue always reads the same. */
function pick(id: string, options: readonly [string, string]): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return options[h % 2]!;
}

export function toCueView(fact: CueFact, when: CueWhen): CueView {
  const id = cueId(fact);
  const base = { id, date: fact.date, when, kind: fact.kind };
  switch (fact.kind) {
    case "fuel_between": {
      const title =
        fact.order === "known"
          ? `${cap(named(fact.first))}, then ${named(fact.second)}`
          : `${cap(named(fact.first))} and ${named(fact.second)} on the same day`;
      const line = fact.carbsG
        ? pick(id, [
            `Aim for roughly ${grams(fact.carbsG)} of carbs between them.`,
            `Get roughly ${grams(fact.carbsG)} of carbs in between the two.`,
          ])
        : pick(id, ["Fit a carb-rich meal between them.", "Make carbs a priority between the two."]);
      return { ...base, title, line, hasNumber: fact.carbsG !== null };
    }
    case "recovery_overlap": {
      const [before, day] = when === "today" ? ["yesterday", "today"] : ["today", "tomorrow"];
      const title = `${cap(named(fact.yesterday))} ${before}, ${named(fact.today)} ${day}`;
      const line = fact.proteinG
        ? pick(id, [
            `Give the warm-up extra time and get ${grams(fact.proteinG)} of protein afterwards.`,
            `Ease into the first sets and get ${grams(fact.proteinG)} of protein afterwards.`,
          ])
        : pick(id, [
            "Give the warm-up extra time and make the next meal protein-rich.",
            "Ease into the first sets and get a protein-rich meal afterwards.",
          ]);
      return { ...base, title, line, hasNumber: fact.proteinG !== null };
    }
    case "heavy_lower": {
      const hours = `${fact.mealHoursBefore[0]}–${fact.mealHoursBefore[1]} hours`;
      const sets = `${fact.lift.label} has ${fact.lowerSets} lower-body sets`;
      const line = fact.carbsG
        ? pick(id, [
            `${sets}: aim for roughly ${grams(fact.carbsG)} of carbs in the meal ${hours} before.`,
            `${sets}: get roughly ${grams(fact.carbsG)} of carbs in ${hours} beforehand.`,
          ])
        : pick(id, [`${sets}: make the meal ${hours} before carb-rich.`, `${sets}: get a carb-rich meal in ${hours} beforehand.`]);
      return { ...base, title: "Big lower-body day", line, hasNumber: fact.carbsG !== null };
    }
  }
}
```

Note: "Hard run, then Legs" keeps the session label's own capitalisation. Session labels are product strings such as "Upper A" or "Legs".

Run both test files. Expected: PASS.

- [ ] **Step 3: Verify.** Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: all pass.

- [ ] **Step 4: Commit.**

```bash
git add src/views/cues.ts src/views/cues.test.ts src/views/activity.ts src/views/activity.test.ts
git commit -m "feat(views): phrase coach cues and outside activities from engine facts"
```

---

### Task 4: Server: cue inputs, the `activity` and `cue` routers

**Files:**
- Create: `src/server/cues/day-input.ts`, `src/server/cues/day-input.test.ts`
- Create: `src/server/api/routers/activity.ts`, `src/server/api/routers/activity.test.ts`
- Create: `src/server/api/routers/cue.ts`
- Modify: `src/server/api/root.ts`

**Interfaces:**
- Consumes:
  - `loadWeekContext`, `WeekContext` (`~/server/schedule/week-context`);
  - `scheduleInputFromDb`, `availabilityFromRows`, `exceptionsFromRows`, `weekDays`, `WEEK_FOR_SCHEDULE_INCLUDE`, `ScheduleSettings` (`~/server/mesocycle/schedule-adapters`);
  - `savedLayout`, `deriveCues`, `rankCues`, `type CueDayInput`, `type CueLift`, `type CueActivity` (`~/engine`);
  - `localDayNumber`, `isoDateOfDayNumber`, `weekdayOfDayNumber`, `dayNumberOfIsoDate` (`~/domain/local-day`);
  - `toCueView`, `CueView`, `CueWhen` (`~/views/cues`);
  - `toActivityView`, `ActivityView` (`~/views/activity`);
  - the activity input schemas and `MAX_ACTIVITIES_PER_DAY` (`~/schema`).
- Produces:
  - `upcomingCueInputs(db, userId: string, now: Date): Promise<{ when: CueWhen; input: CueDayInput }[]>`.
  - tRPC procedures:
    - `activity.list({ weekIndex }) → ActivityView[]`;
    - `activity.add(ActivityAddInput) → ActivityView`;
    - `activity.remove(ActivityRemoveInput) → { removed: true }`;
    - `cue.upcoming() → { date: string; when: CueWhen; cues: CueView[] }[]`.

- [ ] **Step 1: Write the failing `upcomingCueInputs` tests** (`src/server/cues/day-input.test.ts`). Mock `db` the way `src/server/api/routers/schedule.test.ts` does: plain objects with `vi.fn()` methods. Reuse its `sessionRow` / `weekRow` row shapes, copied into this file, with a lower-body exercise so footprints are non-empty. To find a lower-body `movementPattern`, look up how `footprintOf` maps patterns to muscles in `src/engine` (`grep -n "footprintOf" -r src/engine`) and use a pattern that loads `QUADS`, e.g. `SQUAT`. Required cases:

```ts
// Block started Mon 5 Oct 2026 (UTC), 2 weeks long. Sessions are placed by dayOfWeek.
it("today's lifts are the day's SCHEDULED sessions only", ...)
  // NOW Tue 6 Oct 08:00Z; week 1 has s1 on Tue (SCHEDULED) and s2 on Tue (COMPLETED) → today's lifts = [s1].
it("tomorrow on the next block week's first day comes from that week's layout", ...)
  // NOW Sun 11 Oct 20:00Z; week 2 has a session on Mon → tomorrow (2026-10-12) lifts = [it].
it("a day past the block's end has no lifts and does not throw", ...)
  // NOW Sun 18 Oct 20:00Z (last day of a 2-week block) → tomorrow's lifts = [].
it("yesterday's lifts count only if done; today's planned lifts count as tomorrow's previous day", ...)
  // NOW Wed 7 Oct: Tue has one SCHEDULED (overdue) and one COMPLETED → today.previous.lifts = [the completed one];
  // Wed has a SCHEDULED session → tomorrow.previous.lifts includes it.
it("uses the athlete's local date", ...)
  // timezone "Australia/Sydney", NOW 2026-10-06T14:30:00Z (= Wed 7 Oct 01:30 local) → today.date = "2026-10-07".
it("reads activities for yesterday through tomorrow and maps them per date", ...)
  // outsideActivity.findMany returns rows on 6, 7, 8 Oct → each lands on its own day's `activities` / `previous.activities`;
  // assert the findMany `where.date` is { gte: 2026-10-06T00:00Z, lte: 2026-10-08T00:00Z }.
it("carries weightKg and phase from the profile", ...)
it("returns [] when there is no active block", ...)
```

Write these out in full in the same style as `schedule.test.ts` (fake only `Date` with `vi.useFakeTimers({ toFake: ["Date"] })` where a test needs it, or pass `now` explicitly; prefer passing `now`). Run: expected FAIL.

- [ ] **Step 2: Implement** `src/server/cues/day-input.ts`:

```ts
import "server-only";
import type { Prisma } from "../../../generated/prisma";
import { dayNumberOfIsoDate, isoDateOfDayNumber, localDayNumber, weekdayOfDayNumber } from "~/domain/local-day";
import { savedLayout, type CueActivity, type CueDayInput, type CueLift } from "~/engine";
import {
  availabilityFromRows,
  exceptionsFromRows,
  scheduleInputFromDb,
  WEEK_FOR_SCHEDULE_INCLUDE,
  type ScheduleSettings,
} from "~/server/mesocycle/schedule-adapters";
import type { CueWhen } from "~/views/cues";

type Tx = Prisma.TransactionClient;
type Status = "SCHEDULED" | "COMPLETED" | "MISSED";

/**
 * What cues need for today and tomorrow, in the athlete's timezone. Reads the active
 * block's weeks (blocks are short, so all of them) and the outside activities from the
 * day before today to tomorrow. Scheduling never calls this: activities stay out of it.
 */
export async function upcomingCueInputs(
  db: Pick<Tx, "mesocycle" | "outsideActivity">,
  userId: string,
  now: Date,
): Promise<{ when: CueWhen; input: CueDayInput }[]> {
  const meso = await db.mesocycle.findFirst({
    where: { status: "ACTIVE", athleteProfile: { userId } },
    orderBy: { createdAt: "desc" },
    select: {
      startDate: true,
      lengthWeeks: true,
      athleteProfile: {
        select: {
          id: true,
          scheduleMode: true,
          timezone: true,
          weightKg: true,
          phase: true,
          availability: true,
          availabilityExceptions: true,
        },
      },
      weeks: { include: WEEK_FOR_SCHEDULE_INCLUDE },
    },
  });
  if (!meso) return [];

  const profile = meso.athleteProfile;
  const tz = profile.timezone;
  const startDate = meso.startDate ?? now;
  const settings: ScheduleSettings = { mode: profile.scheduleMode, availability: availabilityFromRows(profile.availability), timezone: tz };
  const exceptions = exceptionsFromRows(profile.availabilityExceptions);
  const start = localDayNumber(startDate, tz);
  const today = localDayNumber(now, tz);

  const rows = await db.outsideActivity.findMany({
    where: {
      athleteProfileId: profile.id,
      date: { gte: new Date(`${isoDateOfDayNumber(today - 1)}T00:00:00Z`), lte: new Date(`${isoDateOfDayNumber(today + 1)}T00:00:00Z`) },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const activitiesOn = (n: number): CueActivity[] =>
    rows
      .filter((r) => dayNumberOfIsoDate(r.date.toISOString().slice(0, 10)) === n)
      .map((r) => ({ id: r.id, kind: r.kind, intensity: r.intensity, daypart: r.daypart, durationMin: r.durationMin }));

  const liftsOn = (n: number, statuses: Status[]): CueLift[] => {
    const weekIndex = Math.floor((n - start) / 7) + 1;
    if (n < start || weekIndex > meso.lengthWeeks) return [];
    const week = meso.weeks.find((w) => w.index === weekIndex);
    if (!week) return [];
    const input = scheduleInputFromDb({
      week,
      prevWeek: meso.weeks.find((w) => w.index === weekIndex - 1) ?? null,
      settings,
      startDate,
      exceptions,
      now,
    });
    const layout = savedLayout(input);
    const weekday = weekdayOfDayNumber(n);
    return [...week.sessions]
      .sort((a, b) => a.order - b.order)
      .filter((s) => statuses.includes(s.status) && layout[s.id]?.day === weekday)
      .map((s) => ({
        id: s.id,
        label: s.splitSlot,
        daypart: layout[s.id]!.daypart ?? null,
        footprint: input.sessions.find((x) => x.id === s.id)?.footprint ?? {},
      }));
  };

  const day = (n: number): CueDayInput => ({
    date: isoDateOfDayNumber(n),
    lifts: liftsOn(n, ["SCHEDULED"]),
    activities: activitiesOn(n),
    previous: {
      // A day that has passed counts only what was done; a day still to come counts its plan.
      lifts: liftsOn(n - 1, n - 1 < today ? ["COMPLETED"] : ["SCHEDULED", "COMPLETED"]),
      activities: activitiesOn(n - 1),
    },
    weightKg: profile.weightKg,
    phase: profile.phase,
  });
  return [
    { when: "today", input: day(today) },
    { when: "tomorrow", input: day(today + 1) },
  ];
}
```

If `scheduleInputFromDb`'s argument names differ from the above, follow its real signature in `src/server/mesocycle/schedule-adapters.ts:107`. `loadWeekContext` shows the call it makes.

Run the day-input tests. Expected: PASS.

- [ ] **Step 3: Write the failing `activity` router tests** (`src/server/api/routers/activity.test.ts`). Build the mocked `db` as `schedule.test.ts` does, with `mesocycle.findFirst` returning a block shaped for `loadWeekContext`. Add:

```ts
outsideActivity: {
  findMany: vi.fn().mockResolvedValue(opts.rows ?? []),
  findFirst: vi.fn(),
  count: vi.fn().mockResolvedValue(opts.count ?? 0),
  create: vi.fn().mockImplementation(({ data }) => ({ id: "new", createdAt: NOW, ...data })),
  delete: vi.fn().mockResolvedValue({}),
},
$transaction: vi.fn(),
```

Use `db.$transaction.mockImplementation((fn) => fn(db))`. The caller is `createCallerFactory(activityRouter)` with `{ db, session: { user: { id: "user-1" } }, headers: new Headers() }`; copy the exact context shape `schedule.test.ts` passes. Required cases:

```ts
it("list returns the week's activities as views", ...)
  // asserts findMany where { athleteProfileId: "profile-1", date: { gte: first day 00:00Z, lte: last day 00:00Z } }
it("add writes a row for a date in the viewed week", ...)
it("add refuses a date outside the viewed week with BAD_REQUEST", ...)
it("add refuses a finished week with BAD_REQUEST", ...)            // weekIndex 1 when NOW is in week 2
it("add refuses a fourth activity on the same date with BAD_REQUEST and does not create", ...)
it("add allows a past day of the current week", ...)               // NOW Wed, date = Mon of the same week
it("remove deletes only the athlete's own row in the viewed week", ...)
  // findFirst where includes { id, athleteProfileId: "profile-1" }; null → NOT_FOUND, delete not called
it("remove refuses a row outside the viewed week with BAD_REQUEST", ...)
```

Run: expected FAIL.

- [ ] **Step 4: Implement** `src/server/api/routers/activity.ts`:

```ts
import { TRPCError } from "@trpc/server";
import {
  ActivityAddInputSchema,
  ActivityListInputSchema,
  ActivityRemoveInputSchema,
  MAX_ACTIVITIES_PER_DAY,
} from "~/schema";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { loadWeekContext } from "~/server/schedule/week-context";
import { toActivityView, type ActivityView } from "~/views/activity";

const atMidnight = (iso: string) => new Date(`${iso}T00:00:00Z`);
const FINISHED = "This week is finished, so it can’t be changed.";

/** Outside activities: what the athlete does besides lifting. They feed coach cues only;
 * nothing in scheduling reads them, so writes here take no block lock. */
export const activityRouter = createTRPCRouter({
  list: protectedProcedure.input(ActivityListInputSchema).query(async ({ ctx, input }): Promise<ActivityView[]> => {
    const c = await loadWeekContext(ctx.db, ctx.session.user.id, input.weekIndex, new Date());
    const rows = await ctx.db.outsideActivity.findMany({
      where: { athleteProfileId: c.athleteProfileId, date: { gte: atMidnight(c.days[0]!.date), lte: atMidnight(c.days[6]!.date) } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toActivityView);
  }),

  add: protectedProcedure.input(ActivityAddInputSchema).mutation(async ({ ctx, input }): Promise<ActivityView> => {
    const c = await loadWeekContext(ctx.db, ctx.session.user.id, input.weekIndex, new Date());
    if (c.readOnly) throw new TRPCError({ code: "BAD_REQUEST", message: FINISHED });
    if (!c.days.some((d) => d.date === input.date)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That date isn’t in this week." });
    }
    // Count, then insert. Two racing adds can at worst leave one extra row: accepted.
    const row = await ctx.db.$transaction(async (tx) => {
      const already = await tx.outsideActivity.count({ where: { athleteProfileId: c.athleteProfileId, date: atMidnight(input.date) } });
      if (already >= MAX_ACTIVITIES_PER_DAY) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `A day can hold up to ${MAX_ACTIVITIES_PER_DAY} activities.` });
      }
      return tx.outsideActivity.create({
        data: {
          athleteProfileId: c.athleteProfileId,
          date: atMidnight(input.date),
          daypart: input.daypart,
          kind: input.kind,
          intensity: input.intensity,
          durationMin: input.durationMin,
        },
      });
    });
    return toActivityView(row);
  }),

  remove: protectedProcedure.input(ActivityRemoveInputSchema).mutation(async ({ ctx, input }): Promise<{ removed: true }> => {
    const c = await loadWeekContext(ctx.db, ctx.session.user.id, input.weekIndex, new Date());
    if (c.readOnly) throw new TRPCError({ code: "BAD_REQUEST", message: FINISHED });
    const row = await ctx.db.outsideActivity.findFirst({
      where: { id: input.id, athleteProfileId: c.athleteProfileId },
      select: { id: true, date: true },
    });
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    if (!c.days.some((d) => d.date === row.date.toISOString().slice(0, 10))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That activity isn’t in this week." });
    }
    await ctx.db.outsideActivity.delete({ where: { id: row.id } });
    return { removed: true };
  }),
});
```

`src/server/api/routers/cue.ts`:

```ts
import { deriveCues, rankCues } from "~/engine";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { upcomingCueInputs } from "~/server/cues/day-input";
import { toCueView, type CueView, type CueWhen } from "~/views/cues";

export const cueRouter = createTRPCRouter({
  // Today's and tomorrow's cues. Reads only; nothing here changes the plan.
  upcoming: protectedProcedure.query(async ({ ctx }): Promise<{ date: string; when: CueWhen; cues: CueView[] }[]> => {
    const days = await upcomingCueInputs(ctx.db, ctx.session.user.id, new Date());
    return days.map(({ when, input }) => ({
      date: input.date,
      when,
      cues: rankCues(deriveCues(input)).map((f) => toCueView(f, when)),
    }));
  }),
});
```

Register both in `src/server/api/root.ts`: import them in alphabetical position and add `activity: activityRouter,` and `cue: cueRouter,` after `coach: coachRouter,`.

- [ ] **Step 5: Isolation test.** Add one test to `src/server/api/routers/schedule.test.ts`: `getWeekSchedule` and `getReplacementOptions` never touch `outsideActivity`. Give the mocked `db` an `outsideActivity` object whose every method is a `vi.fn()` that throws. Call both procedures, assert they resolve, and assert none of those mocks were called. Place it next to the existing `getWeekSchedule` tests.

- [ ] **Step 6: Verify.** Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: all pass.

- [ ] **Step 7: Commit.**

```bash
git add src/server/cues src/server/api/routers/activity.ts src/server/api/routers/activity.test.ts src/server/api/routers/cue.ts src/server/api/root.ts src/server/api/routers/schedule.test.ts
git commit -m "feat(api): activity and cue routers; today's and tomorrow's cue inputs"
```

---

### Task 5: Home cue card

**Files:**
- Create: `src/components/home/cue-dismissal.ts`, `src/components/home/cue-dismissal.test.ts`
- Create: `src/components/home/cue-card.tsx`
- Modify: `src/app/app/page.tsx`

**Interfaces:**
- Consumes: `cue.upcoming` (Task 4), `CueView` and `CUE_FOOTER` (Task 3).
- Produces:
  - `readDismissed(storage: Pick<Storage, "getItem"> | null, today: string): Set<string>`;
  - `writeDismissed(storage: Pick<Storage, "setItem"> | null, ids: Set<string>, today: string): void`;
  - `CUE_DISMISSED_KEY = "mesodapt.cue.dismissed"`;
  - `<CueCard days={...} />` (client component).

- [ ] **Step 1: Write the failing tests** (`src/components/home/cue-dismissal.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { CUE_DISMISSED_KEY, readDismissed, writeDismissed } from "./cue-dismissal";

const store = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe("cue dismissal", () => {
  it("round-trips ids", () => {
    const s = store();
    writeDismissed(s, new Set(["2026-10-20:heavy_lower:L"]), "2026-10-20");
    expect(readDismissed(s, "2026-10-20")).toEqual(new Set(["2026-10-20:heavy_lower:L"]));
  });
  it("prunes ids whose date is more than 3 days before today", () => {
    const s = store({ [CUE_DISMISSED_KEY]: JSON.stringify(["2026-10-16:heavy_lower:L", "2026-10-17:heavy_lower:L"]) });
    expect(readDismissed(s, "2026-10-20")).toEqual(new Set(["2026-10-17:heavy_lower:L"]));
  });
  it("survives storage that is missing, throws, or holds junk", () => {
    expect(readDismissed(null, "2026-10-20").size).toBe(0);
    const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(readDismissed(throwing, "2026-10-20").size).toBe(0);
    expect(() => writeDismissed(throwing, new Set(["x"]), "2026-10-20")).not.toThrow();
    expect(readDismissed(store({ [CUE_DISMISSED_KEY]: "{not json" }), "2026-10-20").size).toBe(0);
    expect(readDismissed(store({ [CUE_DISMISSED_KEY]: JSON.stringify({ a: 1 }) }), "2026-10-20").size).toBe(0);
  });
});
```

Run: expected FAIL.

- [ ] **Step 2: Implement** `src/components/home/cue-dismissal.ts`:

```ts
import { dayNumberOfIsoDate } from "~/domain/local-day";

export const CUE_DISMISSED_KEY = "mesodapt.cue.dismissed";
const KEEP_DAYS = 3;

/** Cue ids start with their date ("YYYY-MM-DD:…"); ones older than KEEP_DAYS are dropped. */
function fresh(ids: Iterable<string>, today: string): string[] {
  const t = dayNumberOfIsoDate(today);
  return [...ids].filter((id) => {
    const n = dayNumberOfIsoDate(id.slice(0, 10));
    return Number.isFinite(n) && t - n <= KEEP_DAYS;
  });
}

/** Cues this viewer dismissed. Storage is a convenience: any failure reads as none. */
export function readDismissed(storage: Pick<Storage, "getItem"> | null, today: string): Set<string> {
  try {
    const raw = storage?.getItem(CUE_DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(fresh(parsed.filter((x): x is string => typeof x === "string"), today));
  } catch {
    return new Set();
  }
}

export function writeDismissed(storage: Pick<Storage, "setItem"> | null, ids: Set<string>, today: string): void {
  try {
    storage?.setItem(CUE_DISMISSED_KEY, JSON.stringify(fresh(ids, today)));
  } catch {
    // Not remembered on this device; the cue simply shows again next visit.
  }
}
```

Run the tests. Expected: PASS.

- [ ] **Step 3: The card** (`src/components/home/cue-card.tsx`), a client component:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { CUE_FOOTER, type CueView, type CueWhen } from "~/views/cues";
import { readDismissed, writeDismissed } from "./cue-dismissal";

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** Today's and tomorrow's coach cues. Renders nothing when there are none to show. */
export function CueCard({ days }: { days: { date: string; when: CueWhen; cues: CueView[] }[] }) {
  const today = days.find((d) => d.when === "today")?.date ?? days[0]?.date ?? "";
  // Read after mount: the server has no storage. Until then nothing renders, so a cue the
  // athlete dismissed never flashes back.
  const [dismissed, setDismissed] = useState<Set<string> | null>(null);
  useEffect(() => setDismissed(readDismissed(storage(), today)), [today]);

  if (dismissed === null) return null;
  const shown = days.flatMap((d) => d.cues).filter((c) => !dismissed.has(c.id));
  if (shown.length === 0) return null;

  function dismiss(id: string) {
    const next = new Set(dismissed ?? []).add(id);
    setDismissed(next);
    writeDismissed(storage(), next, today);
  }

  return (
    <section aria-label="Coach cues" className="rounded-card border border-border bg-surface p-6">
      <div className="text-eyebrow font-medium text-fg-soft">Coach</div>
      <ul className="mt-3 flex flex-col gap-4">
        {shown.map((c) => (
          <li key={c.id} className="flex items-start gap-2.5">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-fg-subtle">{c.when === "today" ? "Today" : "Tomorrow"}</div>
              <div className="text-card-desc text-fg">{c.title}</div>
              <div className="text-card-desc text-fg-muted">{c.line}</div>
            </div>
            <button
              type="button"
              aria-label={`Dismiss: ${c.title}`}
              onClick={() => dismiss(c.id)}
              className="rounded-control p-1 text-fg-subtle transition-colors hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {shown.some((c) => c.hasNumber) ? <p className="mt-4 text-[12px] text-fg-subtle">{CUE_FOOTER}</p> : null}
    </section>
  );
}
```

- [ ] **Step 4: Home page.** In `src/app/app/page.tsx`, add `import { api } from "~/trpc/server";` and `import { CueCard } from "~/components/home/cue-card";`. Load the cues best-effort before the return:

```tsx
  // Cues are a nudge: if they fail to load, the page renders without them.
  const cueDays = await api.cue.upcoming().catch(() => []);
```

Render `<CueCard days={cueDays} />` between `<NextSessionCard … />` and the `grid` div.

- [ ] **Step 5: Verify.** Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: all pass. Then `pnpm build`. Expected: success; this catches a server/client boundary mistake.

- [ ] **Step 6: Commit.**

```bash
git add src/components/home/cue-card.tsx src/components/home/cue-dismissal.ts src/components/home/cue-dismissal.test.ts src/app/app/page.tsx
git commit -m "feat(home): a dismissible coach cue card for today and tomorrow"
```

---

### Task 6: Board: activity strip, cue markers, docs

**Files:**
- Create: `src/components/schedule/activity-strip.tsx`
- Create: `src/components/schedule/activity-form.ts`, `src/components/schedule/activity-form.test.ts`
- Create: `src/components/schedule/cue-marker.tsx`
- Modify: `src/components/schedule/schedule-board.tsx`
- Modify: `PRODUCT.md`

**Interfaces:**
- Consumes:
  - `activity.list` / `add` / `remove`, `cue.upcoming` (Task 4);
  - `ActivityView`, `activityChipText`, `ACTIVITY_KIND_LABEL`, `ACTIVITY_INTENSITY_LABEL` (Task 3);
  - `confirmErrorText` (`~/components/coach/messages`).
- Produces:
  - `ActivityDraft` type;
  - `EMPTY_ACTIVITY_DRAFT`;
  - `toAddInput(draft: ActivityDraft, weekIndex: number, date: string): ActivityAddInput | string` (a string is the reason it can't be sent).

- [ ] **Step 1: Write the failing form-helper tests** (`src/components/schedule/activity-form.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { EMPTY_ACTIVITY_DRAFT, toAddInput } from "./activity-form";

describe("toAddInput", () => {
  it("builds an add input from a draft, with blank minutes as null", () => {
    expect(toAddInput({ ...EMPTY_ACTIVITY_DRAFT, kind: "RUN", intensity: "HARD", daypart: "AM", minutes: "" }, 2, "2026-10-20")).toEqual({
      weekIndex: 2, date: "2026-10-20", kind: "RUN", intensity: "HARD", daypart: "AM", durationMin: null,
    });
    expect(toAddInput({ ...EMPTY_ACTIVITY_DRAFT, minutes: " 45 " }, 1, "2026-10-20")).toMatchObject({ durationMin: 45 });
  });
  it("explains a duration it can't send", () => {
    for (const minutes of ["4", "601", "4.5", "abc"]) {
      expect(toAddInput({ ...EMPTY_ACTIVITY_DRAFT, minutes }, 1, "2026-10-20")).toBe("Minutes should be a whole number from 5 to 600.");
    }
  });
});
```

Run: expected FAIL.

- [ ] **Step 2: Implement** `src/components/schedule/activity-form.ts`:

```ts
import type { ActivityAddInput, ActivityIntensity, ActivityKind, Daypart } from "~/schema";

export interface ActivityDraft {
  kind: ActivityKind;
  intensity: ActivityIntensity;
  daypart: Daypart | null;
  /** As typed; blank means not said. */
  minutes: string;
}

export const EMPTY_ACTIVITY_DRAFT: ActivityDraft = { kind: "RUN", intensity: "MODERATE", daypart: null, minutes: "" };

/** The add request for a draft, or the sentence explaining why it can't be sent. */
export function toAddInput(draft: ActivityDraft, weekIndex: number, date: string): ActivityAddInput | string {
  const typed = draft.minutes.trim();
  let durationMin: number | null = null;
  if (typed !== "") {
    const n = Number(typed);
    if (!Number.isInteger(n) || n < 5 || n > 600) return "Minutes should be a whole number from 5 to 600.";
    durationMin = n;
  }
  return { weekIndex, date, kind: draft.kind, intensity: draft.intensity, daypart: draft.daypart, durationMin };
}
```

Run the tests. Expected: PASS.

- [ ] **Step 3: The strip** (`src/components/schedule/activity-strip.tsx`), a client component. One per day. Props:

```ts
{
  weekIndex: number;
  date: string;
  activities: ActivityView[]; // already filtered to this date
  readOnly: boolean;
  disabled: boolean;          // the board is saving
}
```

Behaviour:
- **Chips:** each activity is a muted chip (`rounded-control border border-border-subtle bg-surface px-2 py-1 text-[12px] text-fg-muted`) showing `activityChipText(a)`. Unless `readOnly`, a chip has a remove button (`aria-label={`Remove ${activityChipText(a)}`}`, `X` icon size-3) that calls `activity.remove.mutate({ weekIndex, id: a.id })`.
- **The add button:** unless `readOnly`, and the date holds fewer than `MAX_ACTIVITIES_PER_DAY` activities, a text button "+ activity" (`text-[12px] text-fg-subtle hover:text-fg`, `aria-expanded`) toggles an inline form below it. It is inline rather than a portal popover, which keeps it outside dnd-kit and testable.
- **The form:**
  - `<select>` Kind (`ACTIVITY_KIND_LABEL`), `<select>` Intensity (`ACTIVITY_INTENSITY_LABEL`, capitalised), `<select>` Time (Not said / AM / PM), and an `<input inputMode="numeric">` Minutes (optional), each with a visible `<label>`;
  - an "Add" submit and a "Cancel" button.
  - Submit calls `toAddInput`. A string result shows in a `role="alert"` line. Otherwise it calls `activity.add.mutate(input)`, then closes and resets the form.
  - A server error shows `confirmErrorText(add.error)` in the same alert line.
  - `Escape` inside the form cancels it, and focus returns to the "+ activity" button.
- **Writes:** both mutations' `onSuccess` call `utils.activity.list.invalidate({ weekIndex })` and `utils.cue.upcoming.invalidate()`. While either is pending, or while `disabled`, the controls are disabled.
- The strip never calls any `schedule.*` procedure.

- [ ] **Step 4: The marker** (`src/components/schedule/cue-marker.tsx`), a client component. Props: `{ cues: CueView[] }`; it renders nothing when empty.
- It is a `<button type="button">` with a `Lightbulb` icon (size-3.5, `text-fg-subtle`), `aria-label={`Coach cue: ${cues.map((c) => c.title).join("; ")}`}`, `aria-expanded`, and `title` set to the same titles.
- Activating it toggles a small absolutely-positioned panel (`rounded-control border border-border bg-surface-raised p-3 text-[12px] w-56 z-10`) listing each cue's title (`text-fg`) and line (`text-fg-muted`).
- `Escape` or a second click closes it.

- [ ] **Step 5: Wire the board** (`src/components/schedule/schedule-board.tsx`):
- **Queries:** near `const coach = api.coach.status.useQuery();`, add:

```tsx
  const activities = api.activity.list.useQuery({ weekIndex });
  const cues = api.cue.upcoming.useQuery(undefined, { staleTime: 60_000 });
```

- **The day header:** inside the header `<div>` (the one with `{DAY_NAMES[d.weekday]}` and the day number), after the day-number `<span>`, render:

```tsx
<CueMarker cues={cues.data?.find((c) => c.date === d.date)?.cues ?? []} />
```

  The header is `justify-between` and already holds `BlockToggle` on the right. Wrap the name span and the marker in one `<span className="flex items-baseline gap-1">` so the toggle stays right-aligned.
- **The activity row:** after the `rows.map(...)` cell rows and still inside the `grid-cols-7` grid, add one more row:

```tsx
{data.days.map((d) => (
  <ActivityStrip
    key={`act:${d.date}`}
    weekIndex={weekIndex}
    date={d.date}
    activities={(activities.data ?? []).filter((a) => a.date === d.date)}
    readOnly={data.readOnly}
    disabled={apply.isPending || blockPending}
  />
))}
```

  This row sits outside every droppable `Cell`, so drag targets are unchanged.
- **Leave alone:** don't change any draft, suggestion, replacement or coach logic, and don't add activities to anything passed to the engine.

- [ ] **Step 6: Docs.** In `PRODUCT.md`, after the "Scheduling (the coach box)" paragraph, add:

```markdown
**Scheduling (coach cues).** The athlete can mark simple outside activities on the week board: a run, a ride, a swim, a game, with an intensity and optionally a time of day and minutes. They never change where sessions go or how a week is scored. For today and tomorrow the engine looks at each day's sessions and activities and raises at most two cues: fuelling between two demanding things on one day, recovery when legs are loaded on consecutive days, and carbs before a big lower-body session. Numbers are ranges from the athlete's bodyweight and phase (published g/kg guidance, tunable in `src/engine/constants.ts`); without a bodyweight the cue uses words. Cues appear on the home page, can be dismissed on that device, and show as a marker on the board's day header.
```

- [ ] **Step 7: Verify.** Run `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build`. Expected: all pass.

- [ ] **Step 8: Commit.**

```bash
git add src/components/schedule/activity-strip.tsx src/components/schedule/activity-form.ts src/components/schedule/activity-form.test.ts src/components/schedule/cue-marker.tsx src/components/schedule/schedule-board.tsx PRODUCT.md
git commit -m "feat(board): mark outside activities on a day; cue markers on day headers"
```

- [ ] **Step 9: Browser checklist** (the controller runs this, signed in, with the dev server restarted after the branch switch):
  1. On the current week, add "Run · hard · AM" today. Its chip appears and no session moves.
  2. With a PM leg session today, the home page shows "Hard run, then Legs" with a gram range and the footer.
  3. Remove the activity. The cue disappears on the next home load.
  4. Dismiss a cue, then reload. It stays dismissed.
  5. On a finished week, chips show with no remove and no "+ activity".
  6. Add three activities to one day. "+ activity" disappears.
  7. The board's drag-and-drop, block toggles and coach box behave as before.
  8. Keyboard only: open the form, add, Escape, and the marker popover all work, with focus visible.
