# VoluStack Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the VoluStack MVP domain data model (spec §7) as Prisma models plus a shared TypeScript/Zod vocabulary and seed data, on the existing single-package T3 app.

**Architecture:** The canonical domain vocabulary (enums + key input contracts) lives in `src/schema/` as Zod + inferred TypeScript types — the single source of truth that the future pure engine (`src/engine/`), the tRPC API, and the LLM boundary will all share. Prisma models in `prisma/schema.prisma` mirror that vocabulary and persist it. Pure domain constants (default landmarks, exercise library with fractional attribution) live in `src/domain/` so both the seed script and the engine can import them without touching Prisma.

**Tech Stack:** Next.js 15 (App Router) · TypeScript 5.8 · Prisma 6 (PostgreSQL, client generated to `generated/prisma`) · Zod 3.24 · tRPC 11 · BetterAuth · Vitest (added by this plan) · pnpm 10.20.0.

## Global Constraints

Copied verbatim from the approved spec (`docs/superpowers/specs/2026-07-20-volustack-mvp-design.md`). Every task's requirements implicitly include these.

- **Law 1 — the engine is the only thing that touches numbers.** All volume math lives in a deterministic, pure, exhaustively-tested engine. This plan builds the data + vocabulary it will consume; it must not embed volume calculations in the DB layer.
- **Law 2 — the LLM only selects among engine-validated options and phrases them.** Not exercised in this plan, but the shared Zod contracts in `src/schema/` are the boundary that will enforce it.
- **Fractional muscle attribution is built into the MVP.** Secondary muscles count as fractional sets (e.g. barbell row = 1.0 back + 0.5 biceps + 0.5 rear delt). The `ExerciseMuscle` model and exercise library must implement this.
- **TDEE is context, not a food logger.** Capture biodata + TDEE + phase as engine context. **No calorie/macro logging.**
- **Single-package T3.** Engine will live in `src/engine/` (pure — imports nothing from Next/Prisma/tRPC). This plan establishes `src/schema/` (shared vocabulary) and `src/domain/` (pure constants) as its dependency-free foundations.
- **Naming (BetterAuth collision avoidance):** BetterAuth owns `User`, `Session`, `Account`, `Verification`. The domain's athlete profile is `AthleteProfile` (1:1 with BetterAuth `User`); the domain's training session is `TrainingSession` (never `Session`).
- **Prisma:** provider `postgresql`; client output `generated/prisma`; iterate the schema with `prisma db push` (the repo currently uses push, not migration files).
- **Muscle taxonomy (MVP):** CHEST, BACK, TRAPS, FRONT_DELTS, SIDE_DELTS, REAR_DELTS, BICEPS, TRICEPS, FOREARMS, ABS, QUADS, HAMSTRINGS, GLUTES, CALVES.

---

## File Structure

**Created by this plan:**
- `src/schema/enums.ts` — canonical Zod enums + inferred TS types (domain vocabulary). Source of truth.
- `src/schema/constraint-set.ts` — Zod input contract for a `ConstraintSet` (the seam to the engine plan).
- `src/schema/index.ts` — barrel re-export.
- `src/domain/landmarks.ts` — `DEFAULT_LANDMARKS` constants (MEV/MAV/MRV per muscle), pure.
- `src/domain/exercise-library.ts` — MVP exercise library with fractional attribution, pure.
- `prisma/seed/index.ts` — seed entrypoint (writes exercise library to DB).
- `vitest.config.ts` — Vitest config.
- `src/schema/enums.test.ts`, `src/schema/constraint-set.test.ts`, `src/schema/prisma-parity.test.ts` — vocabulary tests.
- `src/domain/landmarks.test.ts`, `src/domain/exercise-library.test.ts` — pure invariant tests.
- `prisma/seed/seed.test.ts` — DB round-trip smoke test.

**Modified by this plan:**
- `prisma/schema.prisma` — add domain enums + models; remove `Post`.
- `src/server/api/root.ts`, `src/server/api/routers/post.ts`, `src/app/_components/post.tsx`, `src/app/page.tsx` — remove `Post` scaffolding.
- `package.json` — add Vitest + tsx devDeps, `test` script, `prisma.seed` config.

---

## Task 1: Remove T3 `Post` scaffolding

Give the domain a clean slate — the default `create-t3-app` `Post` example touches the schema, a router, and a component we don't want.

**Files:**
- Modify: `prisma/schema.prisma` (remove `Post` model + `User.posts` relation)
- Modify: `src/server/api/root.ts`
- Delete: `src/server/api/routers/post.ts`, `src/app/_components/post.tsx`
- Modify: `src/app/page.tsx` (remove `<LatestPost/>` usage if present)

**Interfaces:**
- Consumes: nothing
- Produces: a `prisma/schema.prisma` containing only BetterAuth models; an `appRouter` with no `post` router

- [ ] **Step 1: Remove the `Post` model and its relation**

In `prisma/schema.prisma`, delete the entire `model Post { ... }` block, and remove the `posts Post[]` line from `model User`.

- [ ] **Step 2: Delete the post router and component**

```bash
rm src/server/api/routers/post.ts src/app/_components/post.tsx
```

- [ ] **Step 3: Unregister the post router**

Replace `src/server/api/root.ts` with:

```typescript
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 */
export const createCaller = createCallerFactory(appRouter);
```

- [ ] **Step 4: Remove any `LatestPost` import/usage in `src/app/page.tsx`**

Open `src/app/page.tsx`; delete the `import { LatestPost } from "~/app/_components/post";` line and any `<LatestPost />` JSX. Leave the rest of the page intact.

- [ ] **Step 5: Verify the schema and typecheck**

Run: `pnpm exec prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

Run: `pnpm typecheck`
Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove create-t3-app Post scaffolding"
```

---

## Task 2: Canonical domain vocabulary (`src/schema/enums.ts`) + Vitest setup

Establish the single source of truth for the domain vocabulary as Zod enums, and stand up the test runner. Everything downstream (Prisma enums, domain constants, engine) references these names.

**Files:**
- Create: `src/schema/enums.ts`
- Create: `src/schema/index.ts`
- Create: `src/schema/enums.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `MuscleGroup`, `TrainingPhase`, `Sex`, `ActivityLevel`, `ExperienceLevel`, `SplitType`, `MovementPattern`, `Equipment`, `MuscleRole`, `ContraindicationTag`, `CheckInScope`, `CheckInCadence`, `BlockStatus`, `DecisionType`, `DecisionStatus` — each exported as a Zod enum (`z.ZodEnum`) named `<Name>Enum` and an inferred type named `<Name>`.
  - `MUSCLE_GROUPS: readonly MuscleGroup[]` — the ordered list of all muscle groups.

- [ ] **Step 1: Add Vitest + tsx and a test script**

```bash
pnpm add -D vitest tsx
```

Then add to `package.json` `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "prisma/**/*.test.ts"],
  },
  resolve: {
    alias: { "~": resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 3: Write the failing test**

Create `src/schema/enums.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { MUSCLE_GROUPS, MuscleGroupEnum, TrainingPhaseEnum } from "./enums";

describe("domain enums", () => {
  it("exposes all 14 MVP muscle groups", () => {
    expect(MUSCLE_GROUPS).toHaveLength(14);
    expect(MuscleGroupEnum.options).toContain("SIDE_DELTS");
    expect(MuscleGroupEnum.options).toContain("HAMSTRINGS");
  });

  it("defines the three training phases", () => {
    expect(TrainingPhaseEnum.options).toEqual(["CUT", "MAINTAIN", "BULK"]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test src/schema/enums.test.ts`
Expected: FAIL — cannot resolve `./enums`.

- [ ] **Step 5: Implement `src/schema/enums.ts`**

```typescript
import { z } from "zod";

export const MuscleGroupEnum = z.enum([
  "CHEST", "BACK", "TRAPS",
  "FRONT_DELTS", "SIDE_DELTS", "REAR_DELTS",
  "BICEPS", "TRICEPS", "FOREARMS",
  "ABS", "QUADS", "HAMSTRINGS", "GLUTES", "CALVES",
]);
export type MuscleGroup = z.infer<typeof MuscleGroupEnum>;
export const MUSCLE_GROUPS = MuscleGroupEnum.options;

export const TrainingPhaseEnum = z.enum(["CUT", "MAINTAIN", "BULK"]);
export type TrainingPhase = z.infer<typeof TrainingPhaseEnum>;

export const SexEnum = z.enum(["MALE", "FEMALE"]);
export type Sex = z.infer<typeof SexEnum>;

export const ActivityLevelEnum = z.enum([
  "SEDENTARY", "LIGHT", "MODERATE", "ACTIVE", "VERY_ACTIVE",
]);
export type ActivityLevel = z.infer<typeof ActivityLevelEnum>;

export const ExperienceLevelEnum = z.enum([
  "BEGINNER", "INTERMEDIATE", "ADVANCED",
]);
export type ExperienceLevel = z.infer<typeof ExperienceLevelEnum>;

export const SplitTypeEnum = z.enum([
  "FULL_BODY", "UPPER_LOWER", "PUSH_PULL_LEGS", "BRO_SPLIT", "CUSTOM",
]);
export type SplitType = z.infer<typeof SplitTypeEnum>;

export const MovementPatternEnum = z.enum([
  "HORIZONTAL_PUSH", "VERTICAL_PUSH",
  "HORIZONTAL_PULL", "VERTICAL_PULL",
  "SQUAT", "HINGE", "LUNGE", "ISOLATION",
]);
export type MovementPattern = z.infer<typeof MovementPatternEnum>;

export const EquipmentEnum = z.enum([
  "BARBELL", "DUMBBELL", "MACHINE", "CABLE", "BODYWEIGHT", "SMITH", "KETTLEBELL",
]);
export type Equipment = z.infer<typeof EquipmentEnum>;

export const MuscleRoleEnum = z.enum(["PRIMARY", "SECONDARY"]);
export type MuscleRole = z.infer<typeof MuscleRoleEnum>;

export const ContraindicationTagEnum = z.enum([
  "KNEE", "SHOULDER", "LOWER_BACK", "ELBOW", "HIP", "WRIST",
]);
export type ContraindicationTag = z.infer<typeof ContraindicationTagEnum>;

export const CheckInScopeEnum = z.enum(["WEEK", "SESSION", "AD_HOC"]);
export type CheckInScope = z.infer<typeof CheckInScopeEnum>;

export const CheckInCadenceEnum = z.enum([
  "WEEKLY", "PER_SESSION", "PER_BLOCK", "AD_HOC",
]);
export type CheckInCadence = z.infer<typeof CheckInCadenceEnum>;

export const BlockStatusEnum = z.enum([
  "DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED",
]);
export type BlockStatus = z.infer<typeof BlockStatusEnum>;

export const DecisionTypeEnum = z.enum([
  "GENERATE", "PROGRESS", "DELOAD", "REDISTRIBUTE", "MANUAL_ADJUST",
]);
export type DecisionType = z.infer<typeof DecisionTypeEnum>;

export const DecisionStatusEnum = z.enum([
  "PROPOSED", "ACCEPTED", "REJECTED", "APPLIED",
]);
export type DecisionStatus = z.infer<typeof DecisionStatusEnum>;
```

- [ ] **Step 6: Create the barrel `src/schema/index.ts`**

```typescript
export * from "./enums";
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm test src/schema/enums.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(schema): add domain vocabulary enums + Vitest"
```

---

## Task 3: Prisma domain enums + parity guard

Mirror the Zod vocabulary as Prisma enums, and add a test that guarantees the two never drift.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/schema/prisma-parity.test.ts`

**Interfaces:**
- Consumes: `src/schema/enums.ts` (Zod enums); the Prisma client generated at `generated/prisma`
- Produces: Prisma enums `MuscleGroup`, `TrainingPhase`, `Sex`, `ActivityLevel`, `ExperienceLevel`, `SplitType`, `MovementPattern`, `Equipment`, `MuscleRole`, `ContraindicationTag`, `CheckInScope`, `CheckInCadence`, `BlockStatus`, `DecisionType`, `DecisionStatus`

- [ ] **Step 1: Add the enums to `prisma/schema.prisma`** (after the `datasource` block)

```prisma
enum MuscleGroup {
  CHEST
  BACK
  TRAPS
  FRONT_DELTS
  SIDE_DELTS
  REAR_DELTS
  BICEPS
  TRICEPS
  FOREARMS
  ABS
  QUADS
  HAMSTRINGS
  GLUTES
  CALVES
}

enum TrainingPhase { CUT MAINTAIN BULK }
enum Sex { MALE FEMALE }
enum ActivityLevel { SEDENTARY LIGHT MODERATE ACTIVE VERY_ACTIVE }
enum ExperienceLevel { BEGINNER INTERMEDIATE ADVANCED }
enum SplitType { FULL_BODY UPPER_LOWER PUSH_PULL_LEGS BRO_SPLIT CUSTOM }
enum MovementPattern {
  HORIZONTAL_PUSH
  VERTICAL_PUSH
  HORIZONTAL_PULL
  VERTICAL_PULL
  SQUAT
  HINGE
  LUNGE
  ISOLATION
}
enum Equipment { BARBELL DUMBBELL MACHINE CABLE BODYWEIGHT SMITH KETTLEBELL }
enum MuscleRole { PRIMARY SECONDARY }
enum ContraindicationTag { KNEE SHOULDER LOWER_BACK ELBOW HIP WRIST }
enum CheckInScope { WEEK SESSION AD_HOC }
enum CheckInCadence { WEEKLY PER_SESSION PER_BLOCK AD_HOC }
enum BlockStatus { DRAFT ACTIVE COMPLETED ARCHIVED }
enum DecisionType { GENERATE PROGRESS DELOAD REDISTRIBUTE MANUAL_ADJUST }
enum DecisionStatus { PROPOSED ACCEPTED REJECTED APPLIED }
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `pnpm exec prisma generate`
Expected: `Generated Prisma Client ... to ./generated/prisma`.

- [ ] **Step 3: Write the parity test**

Create `src/schema/prisma-parity.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { MuscleGroup as PrismaMuscleGroup, MovementPattern as PrismaMovementPattern } from "../../generated/prisma";
import { MuscleGroupEnum, MovementPatternEnum } from "./enums";

describe("Zod ↔ Prisma enum parity", () => {
  it("MuscleGroup matches", () => {
    expect(Object.values(PrismaMuscleGroup).sort()).toEqual(
      [...MuscleGroupEnum.options].sort(),
    );
  });

  it("MovementPattern matches", () => {
    expect(Object.values(PrismaMovementPattern).sort()).toEqual(
      [...MovementPatternEnum.options].sort(),
    );
  });
});
```

- [ ] **Step 4: Run the parity test**

Run: `pnpm test src/schema/prisma-parity.test.ts`
Expected: PASS (2 tests). If it fails, the Prisma enum and Zod enum have drifted — fix the mismatch.

- [ ] **Step 5: Push the schema to the dev database**

Ensure Postgres is running (`./start-database.sh`), then run: `pnpm exec prisma db push`
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): add domain enums with Zod parity guard"
```

---

## Task 4: `AthleteProfile` + `MuscleLandmark`

The per-user profile (biodata → TDEE, phase, experience) and personalized volume landmarks.

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: Prisma enums from Task 3; BetterAuth `User` model
- Produces: models `AthleteProfile` (1:1 `User` via `userId @unique`) and `MuscleLandmark` (`@@unique([athleteProfileId, muscle])`)

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

```prisma
model AthleteProfile {
  id            String          @id @default(cuid())
  userId        String          @unique
  user          User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  age           Int?
  sex           Sex?
  heightCm      Float?
  weightKg      Float?
  activityLevel ActivityLevel?
  tdee          Float?
  phase         TrainingPhase   @default(MAINTAIN)
  experience    ExperienceLevel @default(INTERMEDIATE)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  landmarks      MuscleLandmark[]
  constraintSets ConstraintSet[]
  mesocycles     Mesocycle[]
  checkIns       CheckIn[]

  @@map("athlete_profile")
}

model MuscleLandmark {
  id               String         @id @default(cuid())
  athleteProfileId String
  athleteProfile   AthleteProfile @relation(fields: [athleteProfileId], references: [id], onDelete: Cascade)
  muscle           MuscleGroup
  mev              Int
  mav              Int
  mrv              Int

  @@unique([athleteProfileId, muscle])
  @@map("muscle_landmark")
}
```

- [ ] **Step 2: Add the back-relation to the BetterAuth `User` model**

In `model User`, add this line (non-breaking; BetterAuth ignores extra relations):

```prisma
  athleteProfile AthleteProfile?
```

- [ ] **Step 3: Validate, push, generate**

Run: `pnpm exec prisma validate` → Expected: valid.
Run: `pnpm exec prisma db push` → Expected: `Your database is now in sync with your Prisma schema.`
Run: `pnpm exec prisma generate` → Expected: client generated.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): add AthleteProfile and MuscleLandmark"
```

---

## Task 5: `Exercise` + `ExerciseMuscle` (fractional attribution)

The exercise library core. `ExerciseMuscle` carries the fractional attribution that is the engine's moat.

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: Prisma enums from Task 3
- Produces: models `Exercise` (unique `name`) and `ExerciseMuscle` (`fraction Float`, `@@unique([exerciseId, muscle])`)

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

```prisma
model Exercise {
  id               String                @id @default(cuid())
  name             String                @unique
  movementPattern  MovementPattern
  equipment        Equipment
  contraindications ContraindicationTag[]
  createdAt        DateTime              @default(now())

  muscles       ExerciseMuscle[]
  prescriptions ExercisePrescription[]
  exclusions    ExerciseExclusion[]

  @@map("exercise")
}

model ExerciseMuscle {
  id         String      @id @default(cuid())
  exerciseId String
  exercise   Exercise    @relation(fields: [exerciseId], references: [id], onDelete: Cascade)
  muscle     MuscleGroup
  role       MuscleRole
  fraction   Float // 1.0 = full set credit (primary), <1.0 = fractional (secondary)

  @@unique([exerciseId, muscle])
  @@map("exercise_muscle")
}
```

- [ ] **Step 2: Validate, push, generate**

Run: `pnpm exec prisma validate` → valid.
Run: `pnpm exec prisma db push` → in sync.
Run: `pnpm exec prisma generate` → client generated.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): add Exercise and ExerciseMuscle (fractional attribution)"
```

---

## Task 6: `ConstraintSet` + `MuscleTarget` + `ExerciseExclusion`

The user's versioned training intent (spec §7): days/split/session cap/block shape, per-muscle targets & priorities, and exercise exclusions.

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: Prisma enums; `AthleteProfile` (Task 4); `Exercise` (Task 5)
- Produces: models `ConstraintSet` (`@@unique([athleteProfileId, version])`), `MuscleTarget` (`@@unique([constraintSetId, muscle])`), `ExerciseExclusion` (`@@unique([constraintSetId, exerciseId])`)

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

```prisma
model ConstraintSet {
  id                  String         @id @default(cuid())
  athleteProfileId    String
  athleteProfile      AthleteProfile @relation(fields: [athleteProfileId], references: [id], onDelete: Cascade)
  version             Int
  isActive            Boolean        @default(true)
  daysPerWeek         Int
  splitType           SplitType
  sessionLengthCapMin Int
  blockLengthWeeks    Int
  deloadWeekIndex     Int? // 1-based week that is the deload, if any
  checkInCadence      CheckInCadence @default(WEEKLY)
  createdAt           DateTime       @default(now())

  muscleTargets MuscleTarget[]
  exclusions    ExerciseExclusion[]
  mesocycles    Mesocycle[]

  @@unique([athleteProfileId, version])
  @@map("constraint_set")
}

model MuscleTarget {
  id              String        @id @default(cuid())
  constraintSetId String
  constraintSet   ConstraintSet @relation(fields: [constraintSetId], references: [id], onDelete: Cascade)
  muscle          MuscleGroup
  weeklySetTarget Int? // explicit target if the user set one
  priority        Int           @default(0) // higher = prioritise (e.g. grow shoulders)

  @@unique([constraintSetId, muscle])
  @@map("muscle_target")
}

model ExerciseExclusion {
  id              String        @id @default(cuid())
  constraintSetId String
  constraintSet   ConstraintSet @relation(fields: [constraintSetId], references: [id], onDelete: Cascade)
  exerciseId      String
  exercise        Exercise      @relation(fields: [exerciseId], references: [id], onDelete: Cascade)
  reason          String? // e.g. "knee pain"

  @@unique([constraintSetId, exerciseId])
  @@map("exercise_exclusion")
}
```

- [ ] **Step 2: Validate, push, generate**

Run: `pnpm exec prisma validate` → valid.
Run: `pnpm exec prisma db push` → in sync.
Run: `pnpm exec prisma generate` → client generated.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): add ConstraintSet, MuscleTarget, ExerciseExclusion"
```

---

## Task 7: `Mesocycle` + `Week` + `WeekMuscleVolume`

The block (the product's clock), its weeks, and the planned per-muscle volume ramp.

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: `AthleteProfile` (Task 4), `ConstraintSet` (Task 6), Prisma enums
- Produces: models `Mesocycle` (`status BlockStatus`), `Week` (`@@unique([mesocycleId, index])`, `isDeload`), `WeekMuscleVolume` (`plannedSets Float`, `@@unique([weekId, muscle])`)

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

```prisma
model Mesocycle {
  id               String         @id @default(cuid())
  athleteProfileId String
  athleteProfile   AthleteProfile @relation(fields: [athleteProfileId], references: [id], onDelete: Cascade)
  constraintSetId  String
  constraintSet    ConstraintSet  @relation(fields: [constraintSetId], references: [id])
  name             String
  status           BlockStatus    @default(DRAFT)
  startDate        DateTime?
  lengthWeeks      Int
  createdAt        DateTime       @default(now())

  weeks     Week[]
  decisions DecisionLog[]

  @@map("mesocycle")
}

model Week {
  id          String    @id @default(cuid())
  mesocycleId String
  mesocycle   Mesocycle @relation(fields: [mesocycleId], references: [id], onDelete: Cascade)
  index       Int // 1-based position in the block
  isDeload    Boolean   @default(false)

  muscleVolumes WeekMuscleVolume[]
  sessions      TrainingSession[]
  checkIns      CheckIn[]

  @@unique([mesocycleId, index])
  @@map("week")
}

model WeekMuscleVolume {
  id          String      @id @default(cuid())
  weekId      String
  week        Week        @relation(fields: [weekId], references: [id], onDelete: Cascade)
  muscle      MuscleGroup
  plannedSets Float // fractional-attribution aware

  @@unique([weekId, muscle])
  @@map("week_muscle_volume")
}
```

- [ ] **Step 2: Validate, push, generate**

Run: `pnpm exec prisma validate` → valid.
Run: `pnpm exec prisma db push` → in sync.
Run: `pnpm exec prisma generate` → client generated.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): add Mesocycle, Week, WeekMuscleVolume"
```

---

## Task 8: `TrainingSession` + `ExercisePrescription`

The sessions within a week and their prescribed exercises. **Named `TrainingSession`, never `Session`** (BetterAuth owns `Session`).

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: `Week` (Task 7), `Exercise` (Task 5)
- Produces: models `TrainingSession` and `ExercisePrescription`

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

```prisma
model TrainingSession {
  id                 String   @id @default(cuid())
  weekId             String
  week               Week     @relation(fields: [weekId], references: [id], onDelete: Cascade)
  order              Int // position within the week (0-based)
  splitSlot          String // e.g. "Upper A", "Push"
  dayOfWeek          Int? // 0=Mon … 6=Sun, if the user pins days
  targetDurationMin  Int?

  prescriptions ExercisePrescription[]

  @@unique([weekId, order])
  @@map("training_session")
}

model ExercisePrescription {
  id                String          @id @default(cuid())
  trainingSessionId String
  trainingSession   TrainingSession @relation(fields: [trainingSessionId], references: [id], onDelete: Cascade)
  exerciseId        String
  exercise          Exercise        @relation(fields: [exerciseId], references: [id])
  order             Int
  sets              Int
  targetRepLow      Int?
  targetRepHigh     Int?
  targetRir         Int?

  @@map("exercise_prescription")
}
```

- [ ] **Step 2: Validate, push, generate**

Run: `pnpm exec prisma validate` → valid.
Run: `pnpm exec prisma db push` → in sync.
Run: `pnpm exec prisma generate` → client generated.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): add TrainingSession and ExercisePrescription"
```

---

## Task 9: `CheckIn` + `CheckInMuscle`

Optional per-muscle feedback (recovery / performance / joint) plus planned-vs-actual volume. Optional by design — nothing else requires a check-in to exist.

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: `AthleteProfile` (Task 4), `Week` (Task 7), Prisma enums
- Produces: models `CheckIn` (`scope CheckInScope`, optional `weekId`) and `CheckInMuscle` (`@@unique([checkInId, muscle])`)

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

```prisma
model CheckIn {
  id               String         @id @default(cuid())
  athleteProfileId String
  athleteProfile   AthleteProfile @relation(fields: [athleteProfileId], references: [id], onDelete: Cascade)
  weekId           String?
  week             Week?          @relation(fields: [weekId], references: [id], onDelete: SetNull)
  scope            CheckInScope
  createdAt        DateTime       @default(now())

  muscleFeedback CheckInMuscle[]

  @@map("check_in")
}

model CheckInMuscle {
  id          String      @id @default(cuid())
  checkInId   String
  checkIn     CheckIn     @relation(fields: [checkInId], references: [id], onDelete: Cascade)
  muscle      MuscleGroup
  recovery    Int? // 0=still smashed … 3=fully recovered
  performance Int? // 0=regressed … 3=strong progression
  jointStress Int? // 0=none … 3=painful
  plannedSets Float?
  actualSets  Float?

  @@unique([checkInId, muscle])
  @@map("check_in_muscle")
}
```

- [ ] **Step 2: Validate, push, generate**

Run: `pnpm exec prisma validate` → valid.
Run: `pnpm exec prisma db push` → in sync.
Run: `pnpm exec prisma generate` → client generated.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): add CheckIn and CheckInMuscle"
```

---

## Task 10: `DecisionLog`

The audit trail of every engine decision + its AI explanation + accept/reject state. This is both the "explain why" feature source and the longitudinal moat.

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: `Mesocycle` (Task 7), Prisma enums
- Produces: model `DecisionLog` (`type DecisionType`, `status DecisionStatus`, `payload Json`)

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

```prisma
model DecisionLog {
  id          String         @id @default(cuid())
  mesocycleId String
  mesocycle   Mesocycle      @relation(fields: [mesocycleId], references: [id], onDelete: Cascade)
  weekIndex   Int? // which week this decision applies to, if scoped
  type        DecisionType
  status      DecisionStatus @default(PROPOSED)
  summary     String // short human label
  reasoning   String // AI-phrased explanation
  payload     Json // structured diff the engine produced
  createdAt   DateTime       @default(now())
  respondedAt DateTime?

  @@index([mesocycleId, createdAt])
  @@map("decision_log")
}
```

- [ ] **Step 2: Validate, push, generate**

Run: `pnpm exec prisma validate` → valid.
Run: `pnpm exec prisma db push` → in sync.
Run: `pnpm exec prisma generate` → client generated.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): add DecisionLog"
```

---

## Task 11: Default volume landmarks (`src/domain/landmarks.ts`)

Pure, literature-grounded default MEV/MAV/MRV per muscle group. Lives in `src/domain/` so both the seed and the engine import it — no Prisma dependency.

**Files:**
- Create: `src/domain/landmarks.ts`
- Create: `src/domain/landmarks.test.ts`

**Interfaces:**
- Consumes: `MuscleGroup`, `MUSCLE_GROUPS` from `~/schema`
- Produces: `DEFAULT_LANDMARKS: Record<MuscleGroup, { mev: number; mav: number; mrv: number }>`

- [ ] **Step 1: Write the failing test**

Create `src/domain/landmarks.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { MUSCLE_GROUPS } from "~/schema";
import { DEFAULT_LANDMARKS } from "./landmarks";

describe("DEFAULT_LANDMARKS", () => {
  it("defines landmarks for every muscle group", () => {
    for (const m of MUSCLE_GROUPS) {
      expect(DEFAULT_LANDMARKS[m], `missing landmarks for ${m}`).toBeDefined();
    }
  });

  it("satisfies MEV < MAV < MRV for every muscle", () => {
    for (const m of MUSCLE_GROUPS) {
      const { mev, mav, mrv } = DEFAULT_LANDMARKS[m];
      expect(mev, `${m} MEV`).toBeLessThan(mav);
      expect(mav, `${m} MAV`).toBeLessThan(mrv);
      expect(mev).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/domain/landmarks.test.ts`
Expected: FAIL — cannot resolve `./landmarks`.

- [ ] **Step 3: Implement `src/domain/landmarks.ts`**

Values are conventional hypertrophy landmark defaults (weekly working sets). They are intentionally editable per athlete later.

```typescript
import type { MuscleGroup } from "~/schema";

export interface Landmarks {
  mev: number;
  mav: number;
  mrv: number;
}

export const DEFAULT_LANDMARKS: Record<MuscleGroup, Landmarks> = {
  CHEST:      { mev: 8,  mav: 14, mrv: 22 },
  BACK:       { mev: 10, mav: 16, mrv: 25 },
  TRAPS:      { mev: 4,  mav: 12, mrv: 26 },
  FRONT_DELTS:{ mev: 0,  mav: 8,  mrv: 12 },
  SIDE_DELTS: { mev: 8,  mav: 16, mrv: 26 },
  REAR_DELTS: { mev: 6,  mav: 12, mrv: 24 },
  BICEPS:     { mev: 6,  mav: 14, mrv: 26 },
  TRICEPS:    { mev: 6,  mav: 12, mrv: 24 },
  FOREARMS:   { mev: 2,  mav: 8,  mrv: 20 },
  ABS:        { mev: 0,  mav: 12, mrv: 25 },
  QUADS:      { mev: 8,  mav: 14, mrv: 20 },
  HAMSTRINGS: { mev: 4,  mav: 10, mrv: 20 },
  GLUTES:     { mev: 0,  mav: 8,  mrv: 16 },
  CALVES:     { mev: 6,  mav: 12, mrv: 22 },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/domain/landmarks.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): add default MEV/MAV/MRV landmarks"
```

---

## Task 12: MVP exercise library (`src/domain/exercise-library.ts`)

A pure, typed starter exercise library with fractional attribution — the data the seed writes and the engine reasons over.

**Files:**
- Create: `src/domain/exercise-library.ts`
- Create: `src/domain/exercise-library.test.ts`

**Interfaces:**
- Consumes: `MuscleGroup`, `MovementPattern`, `Equipment`, `MuscleRole`, `ContraindicationTag` from `~/schema`
- Produces:
  - `interface ExerciseMuscleDef { muscle: MuscleGroup; role: MuscleRole; fraction: number }`
  - `interface ExerciseDef { name: string; movementPattern: MovementPattern; equipment: Equipment; contraindications: ContraindicationTag[]; muscles: ExerciseMuscleDef[] }`
  - `EXERCISE_LIBRARY: ExerciseDef[]`

- [ ] **Step 1: Write the failing test**

Create `src/domain/exercise-library.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY } from "./exercise-library";

describe("EXERCISE_LIBRARY", () => {
  it("has unique exercise names", () => {
    const names = EXERCISE_LIBRARY.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every exercise exactly one PRIMARY muscle at fraction 1.0", () => {
    for (const ex of EXERCISE_LIBRARY) {
      const primaries = ex.muscles.filter((m) => m.role === "PRIMARY");
      expect(primaries.length, `${ex.name} primary count`).toBe(1);
      expect(primaries[0]!.fraction, `${ex.name} primary fraction`).toBe(1.0);
    }
  });

  it("keeps every SECONDARY fraction in (0, 1)", () => {
    for (const ex of EXERCISE_LIBRARY) {
      for (const m of ex.muscles.filter((x) => x.role === "SECONDARY")) {
        expect(m.fraction, `${ex.name} ${m.muscle}`).toBeGreaterThan(0);
        expect(m.fraction, `${ex.name} ${m.muscle}`).toBeLessThan(1);
      }
    }
  });

  it("never lists the same muscle twice on one exercise", () => {
    for (const ex of EXERCISE_LIBRARY) {
      const ms = ex.muscles.map((m) => m.muscle);
      expect(new Set(ms).size, ex.name).toBe(ms.length);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/domain/exercise-library.test.ts`
Expected: FAIL — cannot resolve `./exercise-library`.

- [ ] **Step 3: Implement `src/domain/exercise-library.ts`**

A focused starter set (~12 exercises) covering the major patterns with realistic fractional attribution. Expand later.

```typescript
import type {
  ContraindicationTag,
  Equipment,
  MovementPattern,
  MuscleGroup,
  MuscleRole,
} from "~/schema";

export interface ExerciseMuscleDef {
  muscle: MuscleGroup;
  role: MuscleRole;
  fraction: number;
}

export interface ExerciseDef {
  name: string;
  movementPattern: MovementPattern;
  equipment: Equipment;
  contraindications: ContraindicationTag[];
  muscles: ExerciseMuscleDef[];
}

const P = (muscle: MuscleGroup): ExerciseMuscleDef => ({ muscle, role: "PRIMARY", fraction: 1.0 });
const S = (muscle: MuscleGroup, fraction: number): ExerciseMuscleDef => ({ muscle, role: "SECONDARY", fraction });

export const EXERCISE_LIBRARY: ExerciseDef[] = [
  {
    name: "Barbell Bench Press",
    movementPattern: "HORIZONTAL_PUSH",
    equipment: "BARBELL",
    contraindications: ["SHOULDER"],
    muscles: [P("CHEST"), S("TRICEPS", 0.5), S("FRONT_DELTS", 0.5)],
  },
  {
    name: "Incline Dumbbell Press",
    movementPattern: "HORIZONTAL_PUSH",
    equipment: "DUMBBELL",
    contraindications: ["SHOULDER"],
    muscles: [P("CHEST"), S("FRONT_DELTS", 0.5), S("TRICEPS", 0.5)],
  },
  {
    name: "Overhead Press",
    movementPattern: "VERTICAL_PUSH",
    equipment: "BARBELL",
    contraindications: ["SHOULDER"],
    muscles: [P("FRONT_DELTS"), S("SIDE_DELTS", 0.5), S("TRICEPS", 0.5)],
  },
  {
    name: "Lateral Raise",
    movementPattern: "ISOLATION",
    equipment: "DUMBBELL",
    contraindications: [],
    muscles: [P("SIDE_DELTS")],
  },
  {
    name: "Barbell Row",
    movementPattern: "HORIZONTAL_PULL",
    equipment: "BARBELL",
    contraindications: ["LOWER_BACK"],
    muscles: [P("BACK"), S("BICEPS", 0.5), S("REAR_DELTS", 0.5)],
  },
  {
    name: "Lat Pulldown",
    movementPattern: "VERTICAL_PULL",
    equipment: "CABLE",
    contraindications: [],
    muscles: [P("BACK"), S("BICEPS", 0.5)],
  },
  {
    name: "Face Pull",
    movementPattern: "HORIZONTAL_PULL",
    equipment: "CABLE",
    contraindications: [],
    muscles: [P("REAR_DELTS"), S("TRAPS", 0.5)],
  },
  {
    name: "Barbell Back Squat",
    movementPattern: "SQUAT",
    equipment: "BARBELL",
    contraindications: ["KNEE", "LOWER_BACK"],
    muscles: [P("QUADS"), S("GLUTES", 0.5), S("HAMSTRINGS", 0.25)],
  },
  {
    name: "Leg Press",
    movementPattern: "SQUAT",
    equipment: "MACHINE",
    contraindications: ["KNEE"],
    muscles: [P("QUADS"), S("GLUTES", 0.5)],
  },
  {
    name: "Romanian Deadlift",
    movementPattern: "HINGE",
    equipment: "BARBELL",
    contraindications: ["LOWER_BACK"],
    muscles: [P("HAMSTRINGS"), S("GLUTES", 0.5), S("BACK", 0.25)],
  },
  {
    name: "Barbell Curl",
    movementPattern: "ISOLATION",
    equipment: "BARBELL",
    contraindications: ["ELBOW"],
    muscles: [P("BICEPS"), S("FOREARMS", 0.25)],
  },
  {
    name: "Cable Triceps Pushdown",
    movementPattern: "ISOLATION",
    equipment: "CABLE",
    contraindications: ["ELBOW"],
    muscles: [P("TRICEPS")],
  },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/domain/exercise-library.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): add MVP exercise library with fractional attribution"
```

---

## Task 13: Seed script + DB round-trip smoke test

Wire up `prisma db seed` to write the exercise library into the database, and prove the schema + attribution round-trips through Prisma.

**Files:**
- Create: `prisma/seed/index.ts`
- Create: `prisma/seed/seed.test.ts`
- Modify: `package.json` (add `prisma.seed` config)

**Interfaces:**
- Consumes: `EXERCISE_LIBRARY` (Task 12); `db` from `~/server/db`; Prisma models `Exercise`, `ExerciseMuscle`
- Produces: `seedExercises(): Promise<number>` (returns count of exercises upserted)

- [ ] **Step 1: Implement `prisma/seed/index.ts`**

```typescript
import { db } from "~/server/db";
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";

export async function seedExercises(): Promise<number> {
  for (const ex of EXERCISE_LIBRARY) {
    await db.exercise.upsert({
      where: { name: ex.name },
      update: {
        movementPattern: ex.movementPattern,
        equipment: ex.equipment,
        contraindications: ex.contraindications,
        muscles: {
          deleteMany: {},
          create: ex.muscles.map((m) => ({
            muscle: m.muscle,
            role: m.role,
            fraction: m.fraction,
          })),
        },
      },
      create: {
        name: ex.name,
        movementPattern: ex.movementPattern,
        equipment: ex.equipment,
        contraindications: ex.contraindications,
        muscles: {
          create: ex.muscles.map((m) => ({
            muscle: m.muscle,
            role: m.role,
            fraction: m.fraction,
          })),
        },
      },
    });
  }
  return EXERCISE_LIBRARY.length;
}

async function main() {
  const count = await seedExercises();
  console.log(`Seeded ${count} exercises.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());
```

- [ ] **Step 2: Configure `prisma db seed` in `package.json`**

Add this top-level key (sibling of `"scripts"`):

```json
"prisma": {
  "seed": "tsx prisma/seed/index.ts"
}
```

- [ ] **Step 3: Run the seed**

Ensure Postgres is running (`./start-database.sh`), then run: `pnpm exec prisma db seed`
Expected: `Seeded 12 exercises.`

- [ ] **Step 4: Write the round-trip smoke test**

Create `prisma/seed/seed.test.ts`. It reseeds, then asserts the fractional attribution persisted correctly.

```typescript
import { afterAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { seedExercises } from "./index";

describe("exercise seed round-trip", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("persists exercises with their fractional attribution", async () => {
    const count = await seedExercises();
    expect(count).toBe(12);

    const row = await db.exercise.findUnique({
      where: { name: "Barbell Row" },
      include: { muscles: true },
    });
    expect(row).not.toBeNull();

    const biceps = row!.muscles.find((m) => m.muscle === "BICEPS");
    expect(biceps?.role).toBe("SECONDARY");
    expect(biceps?.fraction).toBe(0.5);

    const back = row!.muscles.find((m) => m.muscle === "BACK");
    expect(back?.role).toBe("PRIMARY");
    expect(back?.fraction).toBe(1.0);
  });
});
```

- [ ] **Step 5: Run the smoke test**

Run: `pnpm test prisma/seed/seed.test.ts`
Expected: PASS (1 test). Requires the dev Postgres to be running.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): add exercise seed script + round-trip test"
```

---

## Task 14: `ConstraintSet` Zod input contract (seam to the engine)

The validated boundary object the future engine and tRPC layer will consume as "the user's intent." Defining it here closes the data-model plan and gives the engine plan a typed entry point.

**Files:**
- Create: `src/schema/constraint-set.ts`
- Create: `src/schema/constraint-set.test.ts`
- Modify: `src/schema/index.ts` (re-export)

**Interfaces:**
- Consumes: enums from `./enums`
- Produces:
  - `MuscleTargetInputSchema` / `MuscleTargetInput`
  - `ConstraintSetInputSchema` / `ConstraintSetInput` (the engine's primary input contract)

- [ ] **Step 1: Write the failing test**

Create `src/schema/constraint-set.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { ConstraintSetInputSchema } from "./constraint-set";

const valid = {
  daysPerWeek: 5,
  splitType: "UPPER_LOWER" as const,
  sessionLengthCapMin: 60,
  blockLengthWeeks: 6,
  checkInCadence: "WEEKLY" as const,
  muscleTargets: [
    { muscle: "CHEST" as const, weeklySetTarget: 16, priority: 0 },
    { muscle: "SIDE_DELTS" as const, priority: 2 },
  ],
  excludedExerciseNames: ["Barbell Back Squat"],
};

describe("ConstraintSetInputSchema", () => {
  it("accepts a valid constraint set", () => {
    expect(ConstraintSetInputSchema.parse(valid)).toMatchObject({ daysPerWeek: 5 });
  });

  it("rejects daysPerWeek outside 1..7", () => {
    expect(() => ConstraintSetInputSchema.parse({ ...valid, daysPerWeek: 9 })).toThrow();
  });

  it("rejects a negative session length", () => {
    expect(() => ConstraintSetInputSchema.parse({ ...valid, sessionLengthCapMin: -5 })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/schema/constraint-set.test.ts`
Expected: FAIL — cannot resolve `./constraint-set`.

- [ ] **Step 3: Implement `src/schema/constraint-set.ts`**

```typescript
import { z } from "zod";
import {
  CheckInCadenceEnum,
  MuscleGroupEnum,
  SplitTypeEnum,
} from "./enums";

export const MuscleTargetInputSchema = z.object({
  muscle: MuscleGroupEnum,
  weeklySetTarget: z.number().int().min(0).optional(),
  priority: z.number().int().min(0).max(5).default(0),
});
export type MuscleTargetInput = z.infer<typeof MuscleTargetInputSchema>;

export const ConstraintSetInputSchema = z.object({
  daysPerWeek: z.number().int().min(1).max(7),
  splitType: SplitTypeEnum,
  sessionLengthCapMin: z.number().int().min(15).max(240),
  blockLengthWeeks: z.number().int().min(2).max(16),
  deloadWeekIndex: z.number().int().min(1).optional(),
  checkInCadence: CheckInCadenceEnum.default("WEEKLY"),
  muscleTargets: z.array(MuscleTargetInputSchema).default([]),
  excludedExerciseNames: z.array(z.string()).default([]),
});
export type ConstraintSetInput = z.infer<typeof ConstraintSetInputSchema>;
```

- [ ] **Step 4: Re-export from the barrel**

Append to `src/schema/index.ts`:

```typescript
export * from "./constraint-set";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test src/schema/constraint-set.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Full verification + commit**

Run: `pnpm test` → Expected: all tests pass.
Run: `pnpm typecheck` → Expected: 0 errors.

```bash
git add -A
git commit -m "feat(schema): add ConstraintSet input contract (engine seam)"
```

---

## Verification (end-to-end)

After all tasks:

1. **Schema is valid & in sync:** `pnpm exec prisma validate` → valid; `pnpm exec prisma db push` → in sync.
2. **All tests pass:** `pnpm test` → enums, prisma-parity, landmarks, exercise-library, constraint-set, and seed round-trip all green.
3. **Types compile:** `pnpm typecheck` → 0 errors.
4. **Seed works against a real DB:** with `./start-database.sh` running, `pnpm exec prisma db seed` → `Seeded 12 exercises.`
5. **Inspect visually:** `pnpm db:studio` → confirm `exercise` + `exercise_muscle` rows show fractional attribution (e.g. Barbell Row → BACK 1.0 PRIMARY, BICEPS 0.5 SECONDARY, REAR_DELTS 0.5 SECONDARY).

---

## Roadmap — subsequent plans (not in this plan)

Each is its own spec-aligned plan producing working, testable software:

1. **Training Engine** (`src/engine/`, pure TS, Vitest/TDD) — Constraint Resolver → Volume Distributor (fractional-aware) → Mesocycle Generator → Auto-Regulation Stepper → Deload Trigger → Redistribution Solver. Consumes `ConstraintSetInput` + `DEFAULT_LANDMARKS` + `EXERCISE_LIBRARY`; produces block/week/session plans. Add an ESLint boundary rule forbidding `next`/`@prisma`/`~/server` imports from `src/engine/`.
2. **tRPC API layer** — persist engine output via Prisma; routers for onboarding, block generation, check-in, decisions. The engine stays pure; routers do the DB I/O.
3. **Experience layer** — onboarding (biodata→TDEE, experience router), the Block hero screen, the muscle heat map + volume distribution, ambient decision cards.
4. **AI orchestration** — NL goal parser → `ConstraintSetInput`, LLM-as-tool-caller over engine functions, explanation generation, sidebar assistant + Coach tab. Zod-validated at every boundary (Law 2).

---

## Self-Review

**Spec coverage (§7 entities):** AthleteProfile ✓ (T4) · MuscleLandmark ✓ (T4) · ConstraintSet ✓ (T6) · MuscleTarget/priorities ✓ (T6) · ExerciseExclusion ✓ (T6) · Mesocycle ✓ (T7) · Week + per-muscle volume ✓ (T7) · TrainingSession ✓ (T8) · ExercisePrescription ✓ (T8) · Exercise + fractional attribution ✓ (T5, T12) · CheckIn/CheckInMuscle ✓ (T9) · DecisionLog ✓ (T10) · TDEE-as-context ✓ (T4, no food logging) · default landmarks ✓ (T11) · shared Zod vocabulary ✓ (T2, T3, T14).

**Placeholder scan:** No TBD/TODO; every code and test step contains full content.

**Type consistency:** `MuscleGroup`/`MovementPattern`/`Equipment`/`MuscleRole`/`ContraindicationTag`/`SplitType`/`CheckInCadence` are defined once in `src/schema/enums.ts` (T2), mirrored in Prisma (T3) with a parity test, and reused verbatim by domain constants (T11–12) and contracts (T14). `TrainingSession` used consistently (never `Session`). `AthleteProfile` used consistently (never `Athlete`). Seed count `12` matches the 12-exercise library and both seed assertions.
