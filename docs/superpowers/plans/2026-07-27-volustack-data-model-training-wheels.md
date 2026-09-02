# VoluStack Data Model — Training Wheels Implementation Plan

> **For the implementer:** This is a hand-implementation plan. Work through it top-to-bottom in your editor. Every command, file path, and code block is copy-pastable and has been verified against this repo as of 2026-07-27. Commit at the end of each task before starting the next.

**Goal:** Implement the VoluStack MVP domain data model (spec §7) as Prisma models plus a shared TypeScript/Zod vocabulary and seed data, on the existing single-package T3 app.

**Architecture:** The canonical domain vocabulary (enums + key input contracts) lives in `src/schema/` as Zod + inferred TypeScript types — the single source of truth that the future pure engine (`src/engine/`), the tRPC API, and the LLM boundary will all share. Prisma models in `prisma/schema.prisma` mirror that vocabulary and persist it. Pure domain constants (default landmarks, exercise library with fractional attribution) live in `src/domain/` so both the seed script and the engine can import them without touching Prisma.

**Tech Stack (verified from `package.json`):** Next.js 15.2.3 (App Router) · TypeScript 5.8.2 · Prisma 6.6.0 (client generated to `generated/prisma`) · **Neon serverless Postgres** via the Vercel integration · Zod 3.25.76 · tRPC 11 · BetterAuth 1.3 · Vitest (added by this plan) · pnpm 10.20.0.

**Database:** all work happens on the Neon branch `preview/freddy/feat/db-design` (auto-created by Vercel for this git branch), never production. Set this up in the Prerequisite section below before Task 1 — it is the first thing you do, and Task 1 drops a table.

---

## Read this first: you know Drizzle, here's what's different

You have Drizzle + PostgreSQL experience, so the SQL-level concepts (foreign keys, unique constraints, cascade deletes, enums) will feel familiar. The friction will be in Prisma's workflow, which is genuinely different. Four differences account for almost every mistake:

> **Concept: Prisma's schema is a source file, not TypeScript**
>
> In Drizzle you write `pgTable(...)` in a `.ts` file and your types come out of that
> file directly. In Prisma you write a `.prisma` DSL file and run a **code generator**
> that emits a TypeScript client into `generated/prisma`. Nothing you write in
> `schema.prisma` is visible to TypeScript until you run `pnpm exec prisma generate`.
> This repo generates to `generated/prisma` (set by `output` in the `generator client`
> block), not to `node_modules/.prisma`, and `generated/prisma/` is gitignored.
> Docs: https://www.prisma.io/docs/orm/prisma-schema/overview

> **Concept: relation fields are virtual and must be declared on both sides**
>
> In Drizzle, `relations()` is a separate declaration you can add whenever you like —
> the table definition stands alone. In Prisma, a relation is declared _inside_ both
> models, and `prisma validate` fails if either side is missing or points at a model
> that doesn't exist yet. Only the side holding `@relation(fields: [...])` produces an
> actual FK column; the other side (`landmarks MuscleLandmark[]`) is purely virtual —
> no column, no SQL. **This is why Tasks 4–10 below add back-relation lines to earlier
> models as later models are created.** Do not add a relation field before its target
> model exists.
> Docs: https://www.prisma.io/docs/orm/prisma-schema/data-model/relations

> **Concept: `db push` vs migrations**
>
> Drizzle has `drizzle-kit push` and `drizzle-kit generate`; Prisma has the same split.
> `prisma db push` diffs your schema against the live database and applies the change
> directly, with **no migration file**. `prisma migrate dev` generates SQL migration
> files. This repo has **no `prisma/migrations/` directory** and uses push. Every task
> below uses `pnpm exec prisma db push`. Note that `package.json` defines a script
> `db:generate` that runs `prisma migrate dev` — **do not run it**, it would start a
> migration history mid-plan. On Neon, both commands additionally require the
> unpooled connection string; the Prerequisite section configures that as `directUrl`.
> Docs: https://www.prisma.io/docs/orm/prisma-migrate/workflows/prototyping-your-schema

> **Concept: `@@map` and `@map`**
>
> Prisma model names are PascalCase in the schema and become the client property
> (`db.athleteProfile`). `@@map("athlete_profile")` sets the actual SQL table name —
> equivalent to the first argument of Drizzle's `pgTable("athlete_profile", ...)`.
> BetterAuth's models already use this (`@@map("user")`), which is why the SQL tables
> are snake_case while the client API is camelCase.

One more repo-specific gotcha that will bite you in every file you create:

> **Concept: `verbatimModuleSyntax` (this repo's `tsconfig.json`)**
>
> `tsconfig.json` sets `"verbatimModuleSyntax": true`. Under this flag TypeScript will
> **not** silently erase an import that turns out to be type-only — you must mark it
> yourself, or the emitted import stays at runtime and crashes. So when you import
> something that is only a type, write `import { type MuscleGroup } from "~/schema";`
> or `import type { MuscleGroup } from "~/schema";`. This repo's ESLint rule
> `@typescript-eslint/consistent-type-imports` is configured with
> `fixStyle: "inline-type-imports"`, so the inline `{ type X }` form is what
> `pnpm lint:fix` will produce. The code blocks below already use the correct form.
> Docs: https://www.typescriptlang.org/tsconfig/#verbatimModuleSyntax

---

## Global Constraints

Copied verbatim from the approved spec (`docs/superpowers/specs/2026-07-20-volustack-mvp-design.md`). Every task's requirements implicitly include these.

- **Law 1 — the engine is the only thing that touches numbers.** All volume math lives in a deterministic, pure, exhaustively-tested engine. This plan builds the data + vocabulary it will consume; it must not embed volume calculations in the DB layer.
- **Law 2 — the LLM only selects among engine-validated options and phrases them.** Not exercised in this plan, but the shared Zod contracts in `src/schema/` are the boundary that will enforce it.
- **Fractional muscle attribution is built into the MVP.** Secondary muscles count as fractional sets (e.g. barbell row = 1.0 back + 0.5 biceps + 0.5 rear delt). The `ExerciseMuscle` model and exercise library must implement this.
- **TDEE is context, not a food logger.** Capture biodata + TDEE + phase as engine context. **No calorie/macro logging.**
- **Single-package T3.** Engine will live in `src/engine/` (pure — imports nothing from Next/Prisma/tRPC). This plan establishes `src/schema/` (shared vocabulary) and `src/domain/` (pure constants) as its dependency-free foundations.
- **Naming (BetterAuth collision avoidance):** BetterAuth owns `User`, `Session`, `Account`, `Verification`. The domain's athlete profile is `AthleteProfile` (1:1 with BetterAuth `User`); the domain's training session is `TrainingSession` (**never** `Session`).
- **Prisma:** provider `postgresql`; client output `generated/prisma`; iterate with `prisma db push` against the Neon `preview/freddy/feat/db-design` branch, with `directUrl` set to the unpooled endpoint.
- **Muscle taxonomy (MVP):** CHEST, BACK, TRAPS, FRONT_DELTS, SIDE_DELTS, REAR_DELTS, BICEPS, TRICEPS, FOREARMS, ABS, QUADS, HAMSTRINGS, GLUTES, CALVES.

---

## Prerequisite: point local development at your Neon preview branch

This project's database is Neon, provisioned through Vercel. Your `.env` currently points `DATABASE_URL` at the **production** branch — the same database your deployed app serves from. This plan runs `prisma db push` eleven times and seeds twelve rows, so it must not run against production. Ignore `./start-database.sh` entirely; it starts a local Docker Postgres this project no longer uses.

> **Concept: Neon branches**
>
> A Neon branch is a copy-on-write clone of your database with its own connection
> string — schema and data included, created in about a second, billed only for what
> diverges. It's the managed-Postgres answer to "give me a scratch database that
> behaves exactly like prod." Unlike a local Docker container, a Neon branch has the
> same Postgres version, extensions, SSL requirements, and pooler behaviour as
> production, so nothing can drift between local and deploy. You can reset a branch
> from its parent at any time, which is what makes the recovery advice in this plan's
> Troubleshooting sections safe to follow.
> Docs: https://neon.com/docs/introduction/branching

- [x] **Step 1: Use the existing `preview/freddy/feat/db-design` branch**

Nothing to create. The Vercel/Neon integration already made a branch matching this git branch — it appears in the Neon console as `preview/freddy/feat/db-design`, parent `main`, created by Vercel. That's the branch this plan runs against.

> **Concept: Vercel-managed preview branches**
>
> The integration creates a Neon branch per git branch and points that git branch's
> Vercel preview deployments at it. Two consequences worth knowing. First, it's parented
> on `main`, so it starts as a copy-on-write clone of production's data — your existing
> BetterAuth `user`/`session`/`account` rows come along, and local sign-in works with
> your real Google account. Second, **Vercel deletes the Neon branch when the git branch
> is deleted or its PR merges.** Your schema is safe (it lives in `schema.prisma`), but
> your local `.env` will then point at a branch that no longer exists, and the failure
> looks like a credentials error rather than a missing database. When you merge, repoint
> `.env` at `preview/dev` or a branch you create by hand.
> Docs: https://neon.com/docs/guides/vercel-managed-integration

- [x] **Step 2: Copy both connection strings**

In the Neon console, select the `preview/freddy/feat/db-design` branch and open **Connect**. You need two strings:

- The **pooled** one — hostname contains `-pooler`. This is `DATABASE_URL`.
- The **direct** one — same hostname without `-pooler` (toggle "Connection pooling" off). This is `DATABASE_URL_UNPOOLED`.

Alternatively, pull them from Vercel — but pull to a _separate_ file, never straight into `.env`:

```bash
vercel env pull --environment=preview --git-branch=freddy/feat/db-design .env.preview
```

Then hand-copy only the two `DATABASE_URL*` lines across. A wholesale pull into `.env` would also overwrite `BETTER_AUTH_URL` with the preview deployment's URL, which breaks the Google OAuth callback on `localhost`. If you use this route, delete `.env.preview` afterwards — it contains live credentials and is not covered by `.gitignore`'s `.env` entry (it matches `.env*.local` only if you name it that way).

- [x] **Step 3: Repoint `.env` at the preview branch**

`.env` is gitignored, so this change stays on your machine — Vercel's own environment variables are unaffected, and production keeps pointing at `main`.

Replace the values on lines 19 and 22 of `.env`. Keep the variable names exactly as they are:

```bash
DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-YOUR-PREVIEW-BRANCH-pooler.ap-southeast-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require&connect_timeout=15
DATABASE_URL_UNPOOLED=postgresql://neondb_owner:PASSWORD@ep-YOUR-PREVIEW-BRANCH.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&connect_timeout=15
```

The `ep-...` prefix differs from production's `ep-mute-king-a7z8xaf3`. If it doesn't, you copied the wrong branch's string.

The `&connect_timeout=15` is worth adding to both. Neon scales idle computes to zero, and the first connection after a quiet period has to wait for the compute to wake — Prisma's default timeout is short enough to fail on a cold start. Vercel's own `POSTGRES_PRISMA_URL` on line 39 already includes it, for the same reason.

Leave the other `POSTGRES_*` and `PG*` variables on lines 26–39 alone. They're written by the Vercel/Neon integration, and nothing in this project reads them — the app reads `DATABASE_URL` via `src/env.js`, and the Prisma CLI reads `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.

- [ ] **Step 4: Add `directUrl` to the Prisma datasource**

This is required, not optional. In `prisma/schema.prisma`, replace the `datasource db` block with:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_UNPOOLED")
}
```

> **Concept: why `directUrl` is mandatory on Neon**
>
> The `-pooler` hostname is PgBouncer in transaction mode. It multiplexes many clients
> onto few Postgres connections, which is exactly what you want for a serverless app —
> and exactly wrong for schema commands. `prisma db push` and `prisma migrate` need
> session-level state (advisory locks to prevent concurrent migrations, DDL inside a
> transaction), and PgBouncer's transaction mode doesn't preserve it. Symptoms range
> from a clear error to a silent hang. `directUrl` tells Prisma to use the unpooled
> endpoint for schema work while your application keeps using the pooled `url` for
> queries. Note that `src/env.js` needs no change — the Prisma CLI loads `.env` itself
> and never goes through `@t3-oss/env-nextjs`; only the Next.js runtime does, and it
> only ever touches `url`.
> Docs: https://www.prisma.io/docs/orm/reference/prisma-schema-reference#fields-1

- [ ] **Step 5: Verify you're connected to the preview branch, not production**

```bash
pnpm exec prisma db execute --stdin <<< "SELECT current_database(), inet_server_addr();"
```

Expected: `Script executed successfully.`

Then confirm the endpoint ID in your `.env` matches `preview/freddy/feat/db-design` in the Neon console — the `ep-...` prefix differs per branch, and it is the only thing distinguishing preview from production in the connection string. **Check this before running Task 1**, which drops a table.

- [ ] **Step 6: Confirm the rest of `.env` is intact**

`src/env.js` validates `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_GOOGLE_CLIENT_ID`, and `BETTER_AUTH_GOOGLE_CLIENT_SECRET` at import time — all four are required even though this plan only uses the first, because the schema validates as a unit. They're already in your `.env`; just don't delete them while editing.

**Troubleshooting**

- _`prisma db push` hangs with no output_ — you're pushing through the pooler. Do Step 4; the `-pooler` endpoint cannot serve DDL reliably.
- _`Error: P1001: Can't reach database server at ep-....neon.tech:5432`_ — usually a cold start rather than a real failure. Add `&connect_timeout=15` to both URLs (Step 3) and retry. If it persists, check the Neon console shows the branch's compute as **Idle** or **Active** rather than suspended by a billing issue.
- _`Error: P1013: The provided database string is invalid`_ — the password contains characters that need percent-encoding, or you dropped the `?sslmode=require` query string. Copy the string from the Neon console verbatim rather than hand-assembling it.
- _`FATAL: password authentication failed for user 'neondb_owner'`_ — you copied the pooled password onto the direct URL or vice versa. They're the same on Neon, so this usually means a truncated paste; re-copy both.
- _You realise mid-plan that you pushed to production_ — reset the production branch from the Neon console only if it holds nothing you need. Otherwise, note that Tasks 4–10 are purely additive (new tables, new enums) and harmless; the only destructive step is Task 1's drop of the `Post` table, which nothing in the deployed app uses now that its router and component are gone.
- _You want to start the branch over_ — Neon console → Branches → `preview/freddy/feat/db-design` → **Reset from parent**. This is why the plan uses a branch: reset is a button, not a `--force-reset` that could hit the wrong database.

---

## File Structure

**Created by this plan:**

- `src/schema/enums.ts` — canonical Zod enums + inferred TS types (domain vocabulary). Source of truth.
- `src/schema/constraint-set.ts` — Zod input contract for a `ConstraintSet` (the seam to the engine plan).
- `src/schema/index.ts` — barrel re-export.
- `src/domain/landmarks.ts` — `DEFAULT_LANDMARKS` constants (MEV/MAV/MRV per muscle), pure.
- `src/domain/exercise-library.ts` — MVP exercise library with fractional attribution, pure.
- `prisma/seed/index.ts` — seed entrypoint (writes exercise library to DB).
- `vitest.config.ts`, `vitest.setup.ts` — Vitest config + `.env` loading.
- `src/schema/enums.test.ts`, `src/schema/constraint-set.test.ts`, `src/schema/prisma-parity.test.ts` — vocabulary tests.
- `src/domain/landmarks.test.ts`, `src/domain/exercise-library.test.ts` — pure invariant tests.
- `prisma/seed/seed.test.ts` — DB round-trip smoke test.

**Modified by this plan:**

- `prisma/schema.prisma` — add `directUrl` to the datasource; add domain enums + models; remove `Post`.
- `src/server/api/root.ts` — remove `Post` scaffolding.
- `package.json` — add Vitest + tsx + dotenv devDeps, `test` scripts, `prisma.seed` config.
- `.env` — repoint `DATABASE_URL` / `DATABASE_URL_UNPOOLED` at the Neon `preview/freddy/feat/db-design` branch (local only; gitignored, so Vercel is unaffected).

**Deliberately not touched:**

- `start-database.sh` — the local Docker Postgres script, unused now that the project runs on Neon. Left in place; delete it in a later cleanup if you like.
- `src/env.js` — no change needed. The Prisma CLI reads `.env` directly and never goes through `@t3-oss/env-nextjs`, so `DATABASE_URL_UNPOOLED` does not need to be declared there.
- Vercel environment variables — production keeps pointing at the `main` Neon branch throughout.

**Deleted by this plan:**

- `src/server/api/routers/post.ts`, `src/app/_components/post.tsx`

---

## Task 1: Remove T3 `Post` scaffolding

_Why this matters: the default `create-t3-app` `Post` example owns a Prisma model, a tRPC router, and a React component. Leaving it means a stray table in your database and a router in your public API surface that nothing should call. Clearing it now gives the domain models a clean schema file to grow into._

**Files:**

- Modify: `prisma/schema.prisma`
- Modify: `src/server/api/root.ts`
- Delete: `src/server/api/routers/post.ts`, `src/app/_components/post.tsx`

- [ ] **Step 1: Remove the `Post` model from `prisma/schema.prisma`**

Delete this entire block (it sits between the `datasource db` block and `model User`):

```prisma
model Post {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  createdBy   User   @relation(fields: [createdById], references: [id])
  createdById String

  @@index([name])
}
```

- [ ] **Step 2: Remove the back-relation from `model User`**

In the same file, inside `model User`, delete this line:

```prisma
  posts         Post[]
```

Leave `sessions Session[]` and `accounts Account[]` alone — those are BetterAuth's.

- [ ] **Step 3: Delete the post router and component**

```bash
rm src/server/api/routers/post.ts src/app/_components/post.tsx
```

- [ ] **Step 4: Unregister the post router**

Replace the entire contents of `src/server/api/root.ts` with:

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

- [ ] **Step 5: Push the schema and regenerate the client**

```bash
pnpm exec prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid 🚀`

```bash
pnpm exec prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.` It will also print a warning that the `Post` table will be dropped and ask you to confirm — type `y`. Dropping it is intended.

```bash
pnpm exec prisma generate
```

Expected: `Generated Prisma Client (v6.x.x) to ./generated/prisma`

- [ ] **Step 6: Verify types compile**

```bash
pnpm typecheck
```

Expected: exits with no output and status 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove create-t3-app Post scaffolding

The Post example owns a model, a router, and a component that the
VoluStack domain does not use. Clearing it before adding domain models
keeps the schema and the tRPC surface honest."
```

**Troubleshooting**

- _`Error validating: Type "Post" is neither a built-in type, nor refers to another model`_ — you deleted the `Post` model but left `posts Post[]` on `User`. Do Step 2.
- _`pnpm typecheck` reports `Cannot find module '~/server/api/routers/post'`_ — Step 4 wasn't saved, or your editor is showing a stale file. Re-open `src/server/api/root.ts` and confirm it matches the block above exactly.
- _`prisma db push` hangs, or reports `P1001: Can't reach database server at ep-....neon.tech`_ — either `directUrl` is missing (see the Prerequisite, Step 4) or the Neon compute is cold-starting. Add `&connect_timeout=15` to both URLs and retry.
- _Prisma prompts `We need to reset the ... database` instead of a simple drop_ — you're not on an empty-history push setup. Answer `n` and check that `prisma/migrations/` does not exist; if someone created it, delete the directory and re-run `pnpm exec prisma db push`.
- _The drop prompt names tables you don't recognise, like `user` or `account`_ — **answer `n` immediately.** Those are BetterAuth's, and you are probably connected to the production branch. Re-check the `ep-...` endpoint in `DATABASE_URL` against the preview branch in the Neon console before retrying.

---

## Task 2: Canonical domain vocabulary + Vitest setup

_Why this matters: this is the single source of truth for every name in the domain. Prisma enums (Task 3), the pure domain constants (Tasks 11–12), the engine, and the LLM boundary all derive from this one file. Defining it in Zod rather than plain TypeScript means the same definition both types your code and validates untrusted input at runtime — which is exactly what Law 2 needs at the LLM boundary._

**Files:**

- Create: `src/schema/enums.ts`, `src/schema/index.ts`, `src/schema/enums.test.ts`
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Modify: `package.json`

> **Concept: Zod enums as the source of truth**
>
> `z.enum(["CUT", "MAINTAIN", "BULK"])` gives you three things from one declaration:
> a runtime validator (`.parse(x)`), a TypeScript union type (via `z.infer`), and the
> ordered list of values (via `.options`). That third property is what makes it a
> viable source of truth — you can iterate `.options` in tests and at runtime, which
> a bare `type Phase = "CUT" | ...` cannot do. The naming convention in this plan is
> `XxxEnum` for the Zod value and `Xxx` for the inferred type.
> Docs: https://zod.dev/api?id=enums

> **Concept: Vitest, and why `~` needs configuring twice**
>
> Vitest is a Vite-powered test runner — same role as Jest, but it reads TypeScript
> natively with no transform config. It does **not** read `tsconfig.json`'s `paths`,
> so the `~/*` → `src/*` alias that TypeScript and Next.js both understand is invisible
> to it. You must repeat the alias in `vitest.config.ts`. If you skip this, imports of
> `~/schema` fail at runtime while `pnpm typecheck` stays green — a confusing split.
> Docs: https://vitest.dev/config/

- [ ] **Step 1: Install Vitest, tsx, and dotenv**

```bash
pnpm add -D vitest tsx dotenv
```

`tsx` runs TypeScript files directly under Node (Task 13's seed script needs it). `dotenv` loads `.env` into `process.env` for tests — Vitest does not do this for you, and `src/server/db` imports `src/env.js`, which throws at import time if the variables are missing.

- [ ] **Step 2: Add the test scripts to `package.json`**

In the `"scripts"` object, add these two entries (alphabetical order fits the existing style — put them after `"start"`):

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```typescript
import { config } from "dotenv";

// Vitest does not read .env. src/env.js validates DATABASE_URL and the
// BetterAuth keys at import time, so load them before any test file imports
// anything from ~/server.
config({ path: ".env" });
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "prisma/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

> **Concept: why `fileURLToPath(new URL(...))` and not `__dirname`**
>
> `package.json` declares `"type": "module"`, so every `.ts`/`.js` file in this repo is
> an ES module. `__dirname` and `__filename` are CommonJS-only globals and are simply
> undefined here — using them throws `ReferenceError: __dirname is not defined`.
> `import.meta.url` is the ESM equivalent (a `file://` URL string), and
> `fileURLToPath` converts it to a real filesystem path.

- [ ] **Step 5: Write the failing test**

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

  it("defines the three training phases in order", () => {
    expect(TrainingPhaseEnum.options).toEqual(["CUT", "MAINTAIN", "BULK"]);
  });
});
```

- [ ] **Step 6: Run the test and watch it fail**

```bash
pnpm test src/schema/enums.test.ts
```

Expected: `FAIL` with `Failed to resolve import "./enums"`. This confirms Vitest is wired up and running the right file — a passing run here would mean the file already exists and you'd learn nothing.

- [ ] **Step 7: Implement `src/schema/enums.ts`**

```typescript
import { z } from "zod";

export const MuscleGroupEnum = z.enum([
  "CHEST",
  "BACK",
  "TRAPS",
  "FRONT_DELTS",
  "SIDE_DELTS",
  "REAR_DELTS",
  "BICEPS",
  "TRICEPS",
  "FOREARMS",
  "ABS",
  "QUADS",
  "HAMSTRINGS",
  "GLUTES",
  "CALVES",
]);
export type MuscleGroup = z.infer<typeof MuscleGroupEnum>;
export const MUSCLE_GROUPS: readonly MuscleGroup[] = MuscleGroupEnum.options;

export const TrainingPhaseEnum = z.enum(["CUT", "MAINTAIN", "BULK"]);
export type TrainingPhase = z.infer<typeof TrainingPhaseEnum>;

export const SexEnum = z.enum(["MALE", "FEMALE"]);
export type Sex = z.infer<typeof SexEnum>;

export const ActivityLevelEnum = z.enum([
  "SEDENTARY",
  "LIGHT",
  "MODERATE",
  "ACTIVE",
  "VERY_ACTIVE",
]);
export type ActivityLevel = z.infer<typeof ActivityLevelEnum>;

export const ExperienceLevelEnum = z.enum([
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
]);
export type ExperienceLevel = z.infer<typeof ExperienceLevelEnum>;

export const SplitTypeEnum = z.enum([
  "FULL_BODY",
  "UPPER_LOWER",
  "PUSH_PULL_LEGS",
  "BRO_SPLIT",
  "CUSTOM",
]);
export type SplitType = z.infer<typeof SplitTypeEnum>;

export const MovementPatternEnum = z.enum([
  "HORIZONTAL_PUSH",
  "VERTICAL_PUSH",
  "HORIZONTAL_PULL",
  "VERTICAL_PULL",
  "SQUAT",
  "HINGE",
  "LUNGE",
  "ISOLATION",
]);
export type MovementPattern = z.infer<typeof MovementPatternEnum>;

export const EquipmentEnum = z.enum([
  "BARBELL",
  "DUMBBELL",
  "MACHINE",
  "CABLE",
  "BODYWEIGHT",
  "SMITH",
  "KETTLEBELL",
]);
export type Equipment = z.infer<typeof EquipmentEnum>;

export const MuscleRoleEnum = z.enum(["PRIMARY", "SECONDARY"]);
export type MuscleRole = z.infer<typeof MuscleRoleEnum>;

export const ContraindicationTagEnum = z.enum([
  "KNEE",
  "SHOULDER",
  "LOWER_BACK",
  "ELBOW",
  "HIP",
  "WRIST",
]);
export type ContraindicationTag = z.infer<typeof ContraindicationTagEnum>;

export const CheckInScopeEnum = z.enum(["WEEK", "SESSION", "AD_HOC"]);
export type CheckInScope = z.infer<typeof CheckInScopeEnum>;

export const CheckInCadenceEnum = z.enum([
  "WEEKLY",
  "PER_SESSION",
  "PER_BLOCK",
  "AD_HOC",
]);
export type CheckInCadence = z.infer<typeof CheckInCadenceEnum>;

export const BlockStatusEnum = z.enum([
  "DRAFT",
  "ACTIVE",
  "COMPLETED",
  "ARCHIVED",
]);
export type BlockStatus = z.infer<typeof BlockStatusEnum>;

export const DecisionTypeEnum = z.enum([
  "GENERATE",
  "PROGRESS",
  "DELOAD",
  "REDISTRIBUTE",
  "MANUAL_ADJUST",
]);
export type DecisionType = z.infer<typeof DecisionTypeEnum>;

export const DecisionStatusEnum = z.enum([
  "PROPOSED",
  "ACCEPTED",
  "REJECTED",
  "APPLIED",
]);
export type DecisionStatus = z.infer<typeof DecisionStatusEnum>;
```

- [ ] **Step 8: Create the barrel `src/schema/index.ts`**

```typescript
export * from "./enums";
```

- [ ] **Step 9: Run the test and watch it pass**

```bash
pnpm test src/schema/enums.test.ts
```

Expected: `Test Files  1 passed (1)` / `Tests  2 passed (2)`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(schema): add domain vocabulary enums + Vitest

src/schema is the single source of truth for domain names. Prisma enums,
domain constants, and the future engine all derive from these Zod enums
rather than redeclaring string unions."
```

**Troubleshooting**

- _`Failed to resolve import "~/schema"` in a later task's test, while `pnpm typecheck` passes_ — the `resolve.alias` block in `vitest.config.ts` is missing or misspelled. It is a separate config from `tsconfig.json`'s `paths`; both must exist.
- _`ReferenceError: __dirname is not defined in ES module scope`_ — you used `__dirname` in `vitest.config.ts`. Use the `fileURLToPath(new URL(...))` form from Step 4.
- _`No test files found`_ — you ran `pnpm test` with a path that doesn't match `include`. The patterns are `src/**/*.test.ts` and `prisma/**/*.test.ts`; a file named `enums.spec.ts` will not be picked up.
- _`Cannot find package 'dotenv'`_ — Step 1 didn't complete. Re-run `pnpm add -D vitest tsx dotenv` and check `package.json` `devDependencies`.

---

## Task 3: Prisma domain enums + parity guard

_Why this matters: the same vocabulary now has to exist twice — once in Zod, once in the Prisma schema — because they're different languages. Two hand-maintained copies always drift. The parity test in this task turns that drift into a red test instead of a production bug, and it is the reason the duplication is acceptable at all._

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `src/schema/prisma-parity.test.ts`

> **Concept: Postgres enums under Prisma**
>
> A Prisma `enum` compiles to a real `CREATE TYPE ... AS ENUM` in Postgres — the same
> thing `pgEnum` gives you in Drizzle. The practical consequence is that **removing or
> renaming a value is a destructive change**: `prisma db push` will refuse, or offer to
> reset, if existing rows use the value you're dropping. Adding values is always safe.
> While the schema is empty (now) changes are free; after you seed data they are not.
> Docs: https://www.prisma.io/docs/orm/prisma-schema/data-model/models#defining-enums

- [ ] **Step 1: Add the enums to `prisma/schema.prisma`**

Paste this block immediately after the `datasource db { ... }` block, before `model User`:

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

enum TrainingPhase {
  CUT
  MAINTAIN
  BULK
}

enum Sex {
  MALE
  FEMALE
}

enum ActivityLevel {
  SEDENTARY
  LIGHT
  MODERATE
  ACTIVE
  VERY_ACTIVE
}

enum ExperienceLevel {
  BEGINNER
  INTERMEDIATE
  ADVANCED
}

enum SplitType {
  FULL_BODY
  UPPER_LOWER
  PUSH_PULL_LEGS
  BRO_SPLIT
  CUSTOM
}

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

enum Equipment {
  BARBELL
  DUMBBELL
  MACHINE
  CABLE
  BODYWEIGHT
  SMITH
  KETTLEBELL
}

enum MuscleRole {
  PRIMARY
  SECONDARY
}

enum ContraindicationTag {
  KNEE
  SHOULDER
  LOWER_BACK
  ELBOW
  HIP
  WRIST
}

enum CheckInScope {
  WEEK
  SESSION
  AD_HOC
}

enum CheckInCadence {
  WEEKLY
  PER_SESSION
  PER_BLOCK
  AD_HOC
}

enum BlockStatus {
  DRAFT
  ACTIVE
  COMPLETED
  ARCHIVED
}

enum DecisionType {
  GENERATE
  PROGRESS
  DELOAD
  REDISTRIBUTE
  MANUAL_ADJUST
}

enum DecisionStatus {
  PROPOSED
  ACCEPTED
  REJECTED
  APPLIED
}
```

- [ ] **Step 2: Push and regenerate**

```bash
pnpm exec prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.`

```bash
pnpm exec prisma generate
```

Expected: `Generated Prisma Client (v6.x.x) to ./generated/prisma`

Run `generate` before writing the test — the test imports the enum objects from the generated client, and they don't exist until you generate.

- [ ] **Step 3: Write the parity test**

Create `src/schema/prisma-parity.test.ts`. This checks all fifteen enums with one table rather than a hand-written assertion per enum, so a future enum added to only one side gets caught the moment someone adds it to the table.

```typescript
import { describe, expect, it } from "vitest";
import * as Prisma from "../../generated/prisma";
import * as Domain from "./enums";

/**
 * Each row pairs a Prisma enum object with the Zod enum that is its source of
 * truth. Adding a domain enum means adding a row here.
 */
const PAIRS: ReadonlyArray<
  readonly [
    name: string,
    prisma: Record<string, string>,
    zod: readonly string[],
  ]
> = [
  ["MuscleGroup", Prisma.MuscleGroup, Domain.MuscleGroupEnum.options],
  ["TrainingPhase", Prisma.TrainingPhase, Domain.TrainingPhaseEnum.options],
  ["Sex", Prisma.Sex, Domain.SexEnum.options],
  ["ActivityLevel", Prisma.ActivityLevel, Domain.ActivityLevelEnum.options],
  [
    "ExperienceLevel",
    Prisma.ExperienceLevel,
    Domain.ExperienceLevelEnum.options,
  ],
  ["SplitType", Prisma.SplitType, Domain.SplitTypeEnum.options],
  [
    "MovementPattern",
    Prisma.MovementPattern,
    Domain.MovementPatternEnum.options,
  ],
  ["Equipment", Prisma.Equipment, Domain.EquipmentEnum.options],
  ["MuscleRole", Prisma.MuscleRole, Domain.MuscleRoleEnum.options],
  [
    "ContraindicationTag",
    Prisma.ContraindicationTag,
    Domain.ContraindicationTagEnum.options,
  ],
  ["CheckInScope", Prisma.CheckInScope, Domain.CheckInScopeEnum.options],
  ["CheckInCadence", Prisma.CheckInCadence, Domain.CheckInCadenceEnum.options],
  ["BlockStatus", Prisma.BlockStatus, Domain.BlockStatusEnum.options],
  ["DecisionType", Prisma.DecisionType, Domain.DecisionTypeEnum.options],
  ["DecisionStatus", Prisma.DecisionStatus, Domain.DecisionStatusEnum.options],
];

describe("Zod ↔ Prisma enum parity", () => {
  it.each(PAIRS)(
    "%s has identical members on both sides",
    (_name, prisma, zod) => {
      expect(Object.values(prisma).sort()).toEqual([...zod].sort());
    },
  );

  it("covers every domain enum exported from ~/schema/enums", () => {
    const exported = Object.keys(Domain).filter((k) => k.endsWith("Enum"));
    expect(exported).toHaveLength(PAIRS.length);
  });
});
```

The second test is the one that actually protects you: it fails if you add a new `XxxEnum` to `enums.ts` and forget to add a row to `PAIRS`.

- [ ] **Step 4: Run the parity test**

```bash
pnpm test src/schema/prisma-parity.test.ts
```

Expected: `Tests  16 passed (16)` — fifteen enum rows plus the coverage test.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): add domain enums with Zod parity guard

The vocabulary necessarily exists in two languages. The parity test makes
drift between them a failing test instead of a runtime surprise."
```

**Troubleshooting**

- _`Cannot find module '../../generated/prisma'`_ — you skipped `pnpm exec prisma generate`, or generation failed. Re-run it and confirm the terminal says it wrote to `./generated/prisma`.
- _A row fails with `expected [ 'A', 'B' ] to deeply equal [ 'A', 'B', 'C' ]`_ — that enum has a member on one side only. Compare the Prisma block against `src/schema/enums.ts` for that enum and fix whichever is wrong. Both sides use SCREAMING_SNAKE_CASE.
- _The coverage test fails with `expected 16 to be 15`_ — you added an enum to `enums.ts` without a `PAIRS` row (or vice versa). Add the missing row.
- _`prisma db push` warns about dropping enum values_ — you renamed or removed a value that already exists in the database. While the tables are still empty it's safe to accept; once seeded, prefer adding a new value.

---

## Task 4: `AthleteProfile` + `MuscleLandmark`

_Why this matters: `AthleteProfile` is the domain's root aggregate — every constraint set, mesocycle, and check-in hangs off it. Keeping it separate from BetterAuth's `User` means auth can be swapped or upgraded without touching domain data, and it satisfies the naming rule that avoids colliding with BetterAuth's owned models._

**Files:**

- Modify: `prisma/schema.prisma`

> **Concept: relations must be added incrementally**
>
> `AthleteProfile` will eventually have four child collections (`landmarks`,
> `constraintSets`, `mesocycles`, `checkIns`). You can only declare a relation field
> whose target model already exists — `prisma validate` errors otherwise. So this task
> adds `landmarks` only, and Tasks 6, 7, and 9 each come back and add one line to
> `AthleteProfile`. Every task in this plan therefore ends in a schema that validates.
> This is the main structural difference from Drizzle, where `relations()` lives apart
> from the table and can be written all at once at the end.

- [ ] **Step 1: Add both models to `prisma/schema.prisma`**

Append to the end of the file:

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

  landmarks MuscleLandmark[]

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

The biodata fields are all nullable because onboarding captures them progressively — a profile exists the moment a user signs in, before they've told you their weight. `phase` and `experience` have defaults instead, because the engine always needs a value for those.

`@@unique([athleteProfileId, muscle])` is the composite unique that makes "one landmark row per muscle per athlete" a database invariant rather than an application convention — the same thing you'd write as `unique().on(...)` in Drizzle.

- [ ] **Step 2: Add the back-relation to BetterAuth's `User` model**

Inside `model User`, add this line after `accounts Account[]`:

```prisma
  athleteProfile AthleteProfile?
```

This is a virtual field — it creates no column on `user`. The FK lives on `athlete_profile.userId`, and the `@unique` on it is what makes the relation 1:1 rather than 1:many. BetterAuth ignores extra relation fields on its models, so this is safe.

- [ ] **Step 3: Validate, push, generate**

```bash
pnpm exec prisma validate && pnpm exec prisma db push && pnpm exec prisma generate
```

Expected, in order: `The schema at prisma/schema.prisma is valid 🚀`, `Your database is now in sync with your Prisma schema.`, `Generated Prisma Client (v6.x.x) to ./generated/prisma`.

- [ ] **Step 4: Verify the parity test still passes**

```bash
pnpm test
```

Expected: all tests pass (enums: 2, parity: 16).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): add AthleteProfile and MuscleLandmark

AthleteProfile is the domain root, kept separate from BetterAuth's User so
auth and domain can evolve independently. Biodata is nullable because
onboarding fills it progressively."
```

**Troubleshooting**

- _`Error validating field 'athleteProfile' in model 'User': The relation field ... is missing an opposite relation field`_ — you added the line to `User` but the `AthleteProfile` model isn't in the file, or its `user` field is missing. Both sides are required.
- _`Error validating: Type "MuscleLandmark" is neither a built-in type, nor refers to another model`_ — you added `landmarks MuscleLandmark[]` but pasted only the `AthleteProfile` model. Paste both.
- _`The relation field 'athleteProfile' on model 'User' is not a valid 1:1 relation`_ — `userId` on `AthleteProfile` is missing `@unique`. Without it Prisma reads the relation as 1:many and requires `AthleteProfile[]` on `User`.
- _`prisma db push` asks to reset the database_ — a table with the same name exists with an incompatible shape. On your preview branch this is recoverable, but prefer the Neon console's **Reset from parent** over accepting Prisma's reset: it restores the branch to a known state rather than emptying whatever database you happen to be pointed at. Either way, re-seed in Task 13 afterwards. Confirm the `ep-...` endpoint is your preview branch before accepting anything destructive.

---

## Task 5: `Exercise` + `ExerciseMuscle` (fractional attribution)

_Why this matters: `ExerciseMuscle.fraction` is the single most important column in this schema. It's what lets the engine say "your barbell row gave your biceps half a set" instead of the binary primary/secondary counting every other app does. Every volume number the engine ever produces flows through this table._

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add both models to `prisma/schema.prisma`**

Append to the end of the file:

```prisma
model Exercise {
  id                String                @id @default(cuid())
  name              String                @unique
  movementPattern   MovementPattern
  equipment         Equipment
  contraindications ContraindicationTag[]
  createdAt         DateTime              @default(now())

  muscles ExerciseMuscle[]

  @@map("exercise")
}

model ExerciseMuscle {
  id         String      @id @default(cuid())
  exerciseId String
  exercise   Exercise    @relation(fields: [exerciseId], references: [id], onDelete: Cascade)
  muscle     MuscleGroup
  role       MuscleRole
  fraction   Float // 1.0 = full set credit (PRIMARY), <1.0 = fractional (SECONDARY)

  @@unique([exerciseId, muscle])
  @@map("exercise_muscle")
}
```

> **Concept: scalar list columns (`ContraindicationTag[]`)**
>
> `contraindications ContraindicationTag[]` is **not** a relation — it's a native
> Postgres array column of the enum type, the equivalent of Drizzle's
> `.array()` modifier. Prisma supports scalar lists only on PostgreSQL, CockroachDB,
> and MongoDB. Two behaviours to know: a scalar list can never be `null` (an absent
> value is `[]`), and in a Prisma `update` you replace the whole array with
> `{ set: [...] }` rather than mutating elements. You'll use that `set` syntax in
> Task 13's seed.
> Docs: https://www.prisma.io/docs/orm/prisma-schema/data-model/models#scalar-lists

`name String @unique` is deliberate: it's what makes the seed idempotent in Task 13, since `upsert` needs a unique field to match on.

- [ ] **Step 2: Validate, push, generate**

```bash
pnpm exec prisma validate && pnpm exec prisma db push && pnpm exec prisma generate
```

Expected: valid → in sync → client generated.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): add Exercise and ExerciseMuscle (fractional attribution)

ExerciseMuscle.fraction is the moat: secondary muscles earn partial set
credit rather than being counted or ignored wholesale."
```

**Troubleshooting**

- _`Field "contraindications" in model "Exercise" can't be a list. The current connector does not support lists of primitive types.`_ — the datasource provider isn't `postgresql`. Check the `datasource db` block says `provider = "postgresql"`.
- _`Error validating: Type "ExerciseMuscle" is neither a built-in type, nor refers to another model`_ — you pasted only the first model. Both go in together.
- _You added `prescriptions ExercisePrescription[]` or `exclusions ExerciseExclusion[]` to `Exercise` and validate fails_ — those models don't exist yet; Tasks 6 and 8 add them along with these back-relations. Remove the lines for now.

---

## Task 6: `ConstraintSet` + `MuscleTarget` + `ExerciseExclusion`

_Why this matters: `ConstraintSet` is the user's training intent as data — days, split, session cap, block shape, per-muscle priorities, exercises they can't do. It's versioned rather than mutated, so when the engine later explains "why did my volume change?", the answer can point at a specific constraint-set version. That audit chain is the product._

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the three models to `prisma/schema.prisma`**

Append to the end of the file:

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

`@@unique([athleteProfileId, version])` enforces monotonic versioning per athlete. `weeklySetTarget` is nullable on purpose — most muscles won't have an explicit target, and the engine derives one from landmarks plus `priority` when it's absent. A nullable column and a `0` default mean different things here, and the engine depends on the distinction.

- [ ] **Step 2: Add the back-relation to `AthleteProfile`**

In `model AthleteProfile`, below the existing `landmarks` line, add:

```prisma
  constraintSets ConstraintSet[]
```

- [ ] **Step 3: Add the back-relation to `Exercise`**

In `model Exercise`, below the existing `muscles` line, add:

```prisma
  exclusions ExerciseExclusion[]
```

- [ ] **Step 4: Validate, push, generate**

```bash
pnpm exec prisma validate && pnpm exec prisma db push && pnpm exec prisma generate
```

Expected: valid → in sync → client generated.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): add ConstraintSet, MuscleTarget, ExerciseExclusion

ConstraintSet is versioned rather than mutated so that every engine
decision can be traced back to the exact intent that produced it."
```

**Troubleshooting**

- _`The relation field 'exclusions' on model 'ConstraintSet' is missing an opposite relation field on model 'ExerciseExclusion'`_ — you pasted `ConstraintSet` without `ExerciseExclusion`. All three models go in together.
- _`Error parsing attribute "@relation": The relation field 'exercise' on model 'ExerciseExclusion' is missing an opposite relation field on model 'Exercise'`_ — Step 3 wasn't done.
- _You get an ambiguous-relation error mentioning two relations between the same pair of models_ — you have a duplicated relation field. `ConstraintSet` should have exactly one `exclusions` line, `Exercise` exactly one.

---

## Task 7: `Mesocycle` + `Week` + `WeekMuscleVolume`

_Why this matters: the mesocycle is the product's clock — the unit the user thinks in and the unit the engine plans over. `WeekMuscleVolume.plannedSets` is `Float`, not `Int`, precisely because fractional attribution means a week can legitimately plan 13.5 sets for biceps._

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the three models to `prisma/schema.prisma`**

Append to the end of the file:

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

  weeks Week[]

  @@map("mesocycle")
}

model Week {
  id          String    @id @default(cuid())
  mesocycleId String
  mesocycle   Mesocycle @relation(fields: [mesocycleId], references: [id], onDelete: Cascade)
  index       Int // 1-based position in the block
  isDeload    Boolean   @default(false)

  muscleVolumes WeekMuscleVolume[]

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

> **Concept: Prisma's default referential action**
>
> `Mesocycle.athleteProfile` uses `onDelete: Cascade` — delete the athlete, delete their
> blocks. `Mesocycle.constraintSet` deliberately omits `onDelete`, which means Prisma
> applies its default of **`Restrict`** for a required relation: Postgres will refuse to
> delete a `ConstraintSet` that any mesocycle references. That's the behaviour you want —
> the constraint set is the historical record explaining why the block looks the way it
> does, so it must outlive nothing and be deleted by no one.
> Docs: https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/referential-actions

- [ ] **Step 2: Add the back-relations to `AthleteProfile` and `ConstraintSet`**

In `model AthleteProfile`, add below `constraintSets`:

```prisma
  mesocycles Mesocycle[]
```

In `model ConstraintSet`, add below `exclusions`:

```prisma
  mesocycles Mesocycle[]
```

- [ ] **Step 3: Validate, push, generate**

```bash
pnpm exec prisma validate && pnpm exec prisma db push && pnpm exec prisma generate
```

Expected: valid → in sync → client generated.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): add Mesocycle, Week, WeekMuscleVolume

plannedSets is Float because fractional attribution produces non-integer
weekly volume. Mesocycle -> ConstraintSet is Restrict on delete so the
intent behind a block can never be erased out from under it."
```

**Troubleshooting**

- _`Error validating field 'mesocycles' ... missing an opposite relation field`_ — both back-relations in Step 2 are needed, and `Mesocycle` must declare both `athleteProfile` and `constraintSet`. Two separate relations to two different models, two separate back-relation lines.
- _`Ambiguous relation detected` between `AthleteProfile` and `Mesocycle`_ — you added `mesocycles Mesocycle[]` twice to `AthleteProfile`, or added it to `ConstraintSet` and `AthleteProfile` while `Mesocycle` names only one of them. Each relation needs exactly one field on each side.
- _`prisma db push` reports `column "plannedSets" ... cannot be cast automatically to type double precision`_ — you previously pushed this column as `Int`. The domain tables hold no data yet, so the fix is to drop just that one table: `pnpm exec prisma db execute --stdin <<< 'DROP TABLE week_muscle_volume;'` then push again. Prefer that over a full reset, which would also clear the BetterAuth rows your preview branch cloned from `main`.

---

## Task 8: `TrainingSession` + `ExercisePrescription`

_Why this matters: this is where an abstract weekly volume target becomes something a person actually does in a gym. Note the name: `TrainingSession`, never `Session` — BetterAuth owns `Session` and a collision would silently break authentication._

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add both models to `prisma/schema.prisma`**

Append to the end of the file:

```prisma
model TrainingSession {
  id                String @id @default(cuid())
  weekId            String
  week              Week   @relation(fields: [weekId], references: [id], onDelete: Cascade)
  order             Int // position within the week (0-based)
  splitSlot         String // e.g. "Upper A", "Push"
  dayOfWeek         Int? // 0=Mon … 6=Sun, if the user pins days
  targetDurationMin Int?

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

`sets` is `Int` here, unlike `WeekMuscleVolume.plannedSets` — you prescribe whole sets to a human, and the fractional arithmetic happens when those sets are attributed back to muscles. That asymmetry is intentional and is the boundary where Law 1 applies.

- [ ] **Step 2: Add the back-relations to `Week` and `Exercise`**

In `model Week`, add below `muscleVolumes`:

```prisma
  sessions TrainingSession[]
```

In `model Exercise`, add below `exclusions`:

```prisma
  prescriptions ExercisePrescription[]
```

- [ ] **Step 3: Validate, push, generate**

```bash
pnpm exec prisma validate && pnpm exec prisma db push && pnpm exec prisma generate
```

Expected: valid → in sync → client generated.

- [ ] **Step 4: Confirm the BetterAuth `Session` model is untouched**

```bash
grep -n "^model Session\|^model TrainingSession\|@@map(\"session\")\|@@map(\"training_session\")" prisma/schema.prisma
```

Expected: four lines — `model Session`, its `@@map("session")`, `model TrainingSession`, and its `@@map("training_session")`. If `model Session` is missing you overwrote BetterAuth's model; restore it with `git diff prisma/schema.prisma` and re-add.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): add TrainingSession and ExercisePrescription

Named TrainingSession to avoid colliding with BetterAuth's Session. Sets
are Int at prescription level; fractional math happens on attribution."
```

**Troubleshooting**

- _`Error validating model "Session": A model cannot be defined twice`_ — you named the new model `Session`. Rename it to `TrainingSession` everywhere, including the `@relation` on `ExercisePrescription`.
- _Sign-in breaks after this task_ — same cause. BetterAuth queries the `session` table; if `@@map("session")` moved to your domain model, auth reads the wrong table. Check Step 4's grep.
- _`The relation field 'prescriptions' on model 'TrainingSession' is missing an opposite relation field`_ — you pasted `TrainingSession` without `ExercisePrescription`.

---

## Task 9: `CheckIn` + `CheckInMuscle`

_Why this matters: check-ins are the engine's only feedback signal — recovery, performance, and joint stress per muscle are what turn a static plan into auto-regulation. They're optional by design: nothing else in the schema requires a check-in to exist, so a user who never fills one in still gets a working block._

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add both models to `prisma/schema.prisma`**

Append to the end of the file:

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

`onDelete: SetNull` on `week` is why `weekId` must be nullable — Postgres can't null out a `NOT NULL` column, and Prisma will reject the combination at validate time. An AD_HOC check-in also legitimately has no week, so the nullability serves both purposes.

- [ ] **Step 2: Add the back-relations to `AthleteProfile` and `Week`**

In `model AthleteProfile`, add below `mesocycles`:

```prisma
  checkIns CheckIn[]
```

In `model Week`, add below `sessions`:

```prisma
  checkIns CheckIn[]
```

- [ ] **Step 3: Validate, push, generate**

```bash
pnpm exec prisma validate && pnpm exec prisma db push && pnpm exec prisma generate
```

Expected: valid → in sync → client generated.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): add CheckIn and CheckInMuscle

Per-muscle recovery/performance/joint feedback is the engine's only input
signal for auto-regulation. Optional by design — a user who never checks
in still gets a valid block."
```

**Troubleshooting**

- _`Error parsing attribute "@relation": The `onDelete` referential action "SetNull" is not allowed on a required relation`_ — `weekId` is missing its `?`. It must be `weekId String?` and `week Week?`.
- _`The relation field 'checkIns' on model 'Week' is missing an opposite relation field on model 'CheckIn'`_ — you added the `Week` back-relation but not the `AthleteProfile` one, or vice versa; `CheckIn` declares two relations and both need their opposite side.
- _You're unsure whether `recovery` should be `Int?` or an enum_ — it stays `Int?` here deliberately: the engine does arithmetic on these values (averages, trends), and 0–3 integers are cheaper to reason about than enum-to-number mapping. The 0–3 semantics are documented in the inline comments.

---

## Task 10: `DecisionLog`

_Why this matters: this table is simultaneously the "explain why" feature and the long-term moat. Every engine decision, its AI-phrased reasoning, and the user's accept/reject response land here. In a year it's a dataset nobody else has._

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

Append to the end of the file:

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

> **Concept: `Json` columns in Prisma**
>
> `payload Json` maps to Postgres `jsonb` and comes back typed as `Prisma.JsonValue` —
> a recursive union, not `any`. TypeScript will not let you read `payload.sets` without
> narrowing, which is intentional friction. When the engine plan lands, the right move
> is a Zod schema in `src/schema/` that parses `payload` at the read boundary. Note also
> that `Json` and `Json?` differ subtly: a nullable JSON column can hold both SQL `NULL`
> and JSON `null`, which Prisma distinguishes with `Prisma.DbNull` and `Prisma.JsonNull`.
> `payload` here is non-nullable, so you sidestep that entirely.
> Docs: https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/working-with-json-fields

`@@index([mesocycleId, createdAt])` is a plain non-unique index — the decision feed is always read as "this block's decisions, newest first", and that composite covers it.

- [ ] **Step 2: Add the back-relation to `Mesocycle`**

In `model Mesocycle`, add below `weeks`:

```prisma
  decisions DecisionLog[]
```

- [ ] **Step 3: Validate, push, generate**

```bash
pnpm exec prisma validate && pnpm exec prisma db push && pnpm exec prisma generate
```

Expected: valid → in sync → client generated.

- [ ] **Step 4: Verify the whole schema at once**

```bash
pnpm exec prisma validate && pnpm typecheck && pnpm test
```

Expected: schema valid, zero type errors, all tests pass. This is the last schema task — from here the plan is TypeScript only.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): add DecisionLog

Every engine decision plus its AI explanation and the user's response.
Powers the 'explain why' feature now and is the longitudinal dataset later."
```

**Troubleshooting**

- _`Field "payload" in model "DecisionLog" can't be of type Json. The current connector does not support the Json type.`_ — provider isn't `postgresql`. Check the `datasource db` block.
- _`Error validating field 'decisions' ... missing an opposite relation field`_ — Step 2 wasn't done.
- _`pnpm typecheck` now errors inside `generated/prisma`_ — the client is stale or half-written. Run `pnpm exec prisma generate` again; if it persists, `rm -rf generated/prisma && pnpm exec prisma generate`.

---

## Task 11: Default volume landmarks (`src/domain/landmarks.ts`)

_Why this matters: MEV/MAV/MRV per muscle are the reference points the engine ramps volume between. They live in `src/domain/` — plain TypeScript with no Prisma import — so the future pure engine can consume them without dragging a database client into a unit test._

**Files:**

- Create: `src/domain/landmarks.ts`, `src/domain/landmarks.test.ts`

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
      expect(mev, `${m} MEV`).toBeGreaterThanOrEqual(0);
    }
  });
});
```

The second test is the load-bearing one. `MEV < MAV < MRV` isn't a style preference — the engine's ramp logic divides by `mrv - mev`, so an inverted or equal pair would produce a division by zero or a negative ramp. Encoding it as a test means a future typo in the table fails loudly.

- [ ] **Step 2: Run the test and watch it fail**

```bash
pnpm test src/domain/landmarks.test.ts
```

Expected: `FAIL` with `Failed to resolve import "./landmarks"`.

- [ ] **Step 3: Implement `src/domain/landmarks.ts`**

Values are conventional hypertrophy landmark defaults in weekly working sets. They're starting points, overridable per athlete via the `MuscleLandmark` table from Task 4.

```typescript
import { type MuscleGroup } from "~/schema";

export interface Landmarks {
  /** Minimum Effective Volume — weekly sets below which no growth stimulus. */
  mev: number;
  /** Maximum Adaptive Volume — the productive middle of the range. */
  mav: number;
  /** Maximum Recoverable Volume — weekly sets beyond which recovery fails. */
  mrv: number;
}

export const DEFAULT_LANDMARKS: Record<MuscleGroup, Landmarks> = {
  CHEST: { mev: 8, mav: 14, mrv: 22 },
  BACK: { mev: 10, mav: 16, mrv: 25 },
  TRAPS: { mev: 4, mav: 12, mrv: 26 },
  FRONT_DELTS: { mev: 0, mav: 8, mrv: 12 },
  SIDE_DELTS: { mev: 8, mav: 16, mrv: 26 },
  REAR_DELTS: { mev: 6, mav: 12, mrv: 24 },
  BICEPS: { mev: 6, mav: 14, mrv: 26 },
  TRICEPS: { mev: 6, mav: 12, mrv: 24 },
  FOREARMS: { mev: 2, mav: 8, mrv: 20 },
  ABS: { mev: 0, mav: 12, mrv: 25 },
  QUADS: { mev: 8, mav: 14, mrv: 20 },
  HAMSTRINGS: { mev: 4, mav: 10, mrv: 20 },
  GLUTES: { mev: 0, mav: 8, mrv: 16 },
  CALVES: { mev: 6, mav: 12, mrv: 22 },
};
```

> **Concept: `Record<Union, T>` as an exhaustiveness check**
>
> Typing this as `Record<MuscleGroup, Landmarks>` rather than
> `Record<string, Landmarks>` makes TypeScript _require_ all fourteen keys — omit one
> and you get a compile error naming the missing muscle. It also means indexing with a
> `MuscleGroup` returns `Landmarks`, not `Landmarks | undefined`, even though this repo
> sets `noUncheckedIndexedAccess: true` (that flag only applies to index _signatures_,
> not to finite mapped key sets). That's why the test can destructure directly without
> a null check. Add a fifteenth muscle to the Zod enum later and this file stops
> compiling until you give it landmarks — exactly the failure you want.

- [ ] **Step 4: Run the test and watch it pass**

```bash
pnpm test src/domain/landmarks.test.ts
```

Expected: `Tests  2 passed (2)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): add default MEV/MAV/MRV landmarks

Pure constants with no Prisma dependency so the engine can unit-test
against them. MEV < MAV < MRV is enforced by test because the ramp math
divides by (mrv - mev)."
```

**Troubleshooting**

- _`Failed to resolve import "~/schema"`_ — the `resolve.alias` in `vitest.config.ts` is wrong. Confirm it matches Task 2 Step 4 exactly.
- _`Property 'CALVES' is missing in type ... but required in type 'Record<MuscleGroup, Landmarks>'`_ — you dropped a muscle while pasting. The error names the missing key; add it.
- _`'MuscleGroup' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled`_ — write `import { type MuscleGroup }`, not `import { MuscleGroup }`. See the concept sidebar at the top of this plan.
- _A `MEV < MAV < MRV` assertion fails and you believe the value is right_ — change the number, not the test. The invariant is a real constraint on the engine, not a formatting rule.

---

## Task 12: MVP exercise library (`src/domain/exercise-library.ts`)

_Why this matters: this is the fractional-attribution data itself — the concrete claim that a barbell row is 1.0 back plus 0.5 biceps plus 0.5 rear delt. The engine reads it, the seed writes it to the database, and the invariant tests here are what stop a typo from silently corrupting every volume number downstream._

**Files:**

- Create: `src/domain/exercise-library.ts`, `src/domain/exercise-library.test.ts`

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

  it("keeps every SECONDARY fraction strictly between 0 and 1", () => {
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

The last two tests mirror database constraints from Task 5: `@@unique([exerciseId, muscle])` would reject a duplicate muscle at insert time, and the name uniqueness mirrors `name String @unique`. Catching both here means the seed fails in a unit test in 200ms rather than against Postgres.

The `!` in `primaries[0]!.fraction` is required by this repo's `noUncheckedIndexedAccess: true` — array indexing yields `T | undefined`, and the preceding assertion has already proven there's exactly one element.

- [ ] **Step 2: Run the test and watch it fail**

```bash
pnpm test src/domain/exercise-library.test.ts
```

Expected: `FAIL` with `Failed to resolve import "./exercise-library"`.

- [ ] **Step 3: Implement `src/domain/exercise-library.ts`**

Twelve exercises covering every movement pattern that the MVP split types need. Expand it later; keep the invariants.

```typescript
import {
  type ContraindicationTag,
  type Equipment,
  type MovementPattern,
  type MuscleGroup,
  type MuscleRole,
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

/** Primary mover: full set credit. */
const P = (muscle: MuscleGroup): ExerciseMuscleDef => ({
  muscle,
  role: "PRIMARY",
  fraction: 1.0,
});

/** Secondary mover: fractional set credit. */
const S = (muscle: MuscleGroup, fraction: number): ExerciseMuscleDef => ({
  muscle,
  role: "SECONDARY",
  fraction,
});

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

- [ ] **Step 4: Run the test and watch it pass**

```bash
pnpm test src/domain/exercise-library.test.ts
```

Expected: `Tests  4 passed (4)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): add MVP exercise library with fractional attribution

Twelve exercises covering every movement pattern the MVP splits need.
Invariant tests mirror the DB constraints so a bad entry fails in a unit
test rather than against Postgres."
```

**Troubleshooting**

- _`Type '"REAR_DELT"' is not assignable to parameter of type 'MuscleGroup'`_ — a muscle name typo. The enum member is `REAR_DELTS` (plural); the same applies to `FRONT_DELTS` and `SIDE_DELTS`.
- _`Barbell Bench Press primary count: expected 2 to be 1`_ — you used `P()` twice on one exercise. Exactly one primary per exercise; everything else is `S()`.
- _`Barbell Curl FOREARMS: expected 1 to be less than 1`_ — you passed `1.0` to `S()`. A fraction of exactly 1.0 means it's a primary; use `P()` or lower the number.
- _`Object is possibly 'undefined'` on `primaries[0].fraction`_ — you dropped the `!`. Required under `noUncheckedIndexedAccess`.

---

## Task 13: Seed script + DB round-trip smoke test

_Why this matters: everything before this was schema and pure data with nothing proving they fit together. This task writes the exercise library through Prisma into real Postgres and reads it back, which is the first end-to-end proof that fractional attribution actually survives the round trip._

**Files:**

- Create: `prisma/seed/index.ts`, `prisma/seed/seed.test.ts`
- Modify: `package.json`

> **Concept: Prisma `upsert` with nested writes**
>
> Drizzle gives you `.onConflictDoUpdate()` over a single table. Prisma's `upsert` takes
> a `where` (which must target a unique field — that's why `Exercise.name` is `@unique`),
> plus separate `create` and `update` bodies, and each can nest writes into related
> tables in one transaction. The `deleteMany: {}` inside the nested `muscles` update is
> the standard replace-children idiom: Prisma runs nested deletes before nested creates,
> so the effect is "throw away this exercise's muscle rows and write the current ones."
> That's what makes re-running the seed idempotent instead of duplicating rows.
> Docs: https://www.prisma.io/docs/orm/prisma-client/queries/crud#update-or-create-records

- [ ] **Step 1: Implement `prisma/seed/index.ts`**

```typescript
import { EXERCISE_LIBRARY } from "~/domain/exercise-library";
import { db } from "~/server/db";

/**
 * Writes the MVP exercise library to the database. Idempotent: matches on the
 * unique exercise name and replaces the muscle attribution rows wholesale, so
 * re-running after editing the library converges rather than duplicating.
 *
 * @returns the number of exercises upserted
 */
export async function seedExercises(): Promise<number> {
  for (const ex of EXERCISE_LIBRARY) {
    const muscleRows = ex.muscles.map((m) => ({
      muscle: m.muscle,
      role: m.role,
      fraction: m.fraction,
    }));

    await db.exercise.upsert({
      where: { name: ex.name },
      update: {
        movementPattern: ex.movementPattern,
        equipment: ex.equipment,
        contraindications: { set: ex.contraindications },
        muscles: {
          deleteMany: {},
          create: muscleRows,
        },
      },
      create: {
        name: ex.name,
        movementPattern: ex.movementPattern,
        equipment: ex.equipment,
        contraindications: ex.contraindications,
        muscles: { create: muscleRows },
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
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());
```

Note the asymmetry in `contraindications`: `{ set: [...] }` in the `update` body (scalar lists are replaced, not merged) versus a bare array in `create`.

- [ ] **Step 2: Configure `prisma db seed` in `package.json`**

Add this as a new top-level key, a sibling of `"scripts"` (put it just after the `"scripts"` object):

```json
  "prisma": {
    "seed": "tsx prisma/seed/index.ts"
  },
```

`tsx` is what lets Prisma run a TypeScript entrypoint, and it reads the `paths` mapping out of `tsconfig.json`, which is how `~/domain/...` and `~/server/db` resolve at runtime.

- [ ] **Step 3: Run the seed**

```bash
pnpm exec prisma db seed
```

Expected output ends with:

```
Seeded 12 exercises.
🌱  The seed command has been executed.
```

- [ ] **Step 4: Run it a second time to prove idempotence**

```bash
pnpm exec prisma db seed
```

Expected: the same `Seeded 12 exercises.` — not 24. If a second run duplicated rows, the `where: { name }` match isn't working.

- [ ] **Step 5: Write the round-trip smoke test**

Create `prisma/seed/seed.test.ts`:

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

    const back = row!.muscles.find((m) => m.muscle === "BACK");
    expect(back?.role).toBe("PRIMARY");
    expect(back?.fraction).toBe(1.0);

    const biceps = row!.muscles.find((m) => m.muscle === "BICEPS");
    expect(biceps?.role).toBe("SECONDARY");
    expect(biceps?.fraction).toBe(0.5);
  });

  it("is idempotent — re-seeding does not duplicate muscle rows", async () => {
    await seedExercises();
    const row = await db.exercise.findUnique({
      where: { name: "Barbell Row" },
      include: { muscles: true },
    });
    expect(row!.muscles).toHaveLength(3);
  });
});
```

This test writes to whatever `DATABASE_URL` points at. That's deliberate — it's the only test in the plan that proves the Prisma layer actually works, and mocking it would prove nothing. It's safe because your `.env` points at the preview branch; the seed is idempotent, so repeated `pnpm test` runs converge on the same twelve rows rather than accumulating.

**Before running it, confirm one last time that `DATABASE_URL` is your preview branch endpoint.** This is the first test in the plan that writes, and CI or a teammate running `pnpm test` with production credentials would seed production. If you later add CI, point its `DATABASE_URL` at a dedicated Neon branch rather than at `main`.

- [ ] **Step 6: Run the smoke test**

```bash
pnpm test prisma/seed/seed.test.ts
```

Expected: `Tests  2 passed (2)`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): add exercise seed script + round-trip test

Seeding is idempotent via upsert on the unique exercise name, replacing
muscle attribution rows wholesale. The round-trip test is the first proof
that fractional attribution survives Prisma and Postgres."
```

**Troubleshooting**

- _`Invalid environment variables` when running `pnpm test prisma/seed/seed.test.ts`_ — `vitest.setup.ts` isn't loading, or `.env` is missing a key. Check `setupFiles: ["./vitest.setup.ts"]` is present in `vitest.config.ts` and that `.env` has all four variables listed in the Prerequisite section.
- _`Cannot find module '~/domain/exercise-library'` when running `pnpm exec prisma db seed`_ — `tsx` isn't resolving the `~` alias. Confirm `tsx` is in `devDependencies` and that `tsconfig.json` still has `"baseUrl": "."` with `"paths": { "~/*": ["./src/*"] }`.
- _`An operation failed because it depends on one or more records that were required but not found`_ — you're seeding against a database whose tables don't match the schema. Run `pnpm exec prisma db push` then `pnpm exec prisma generate`, and re-seed.
- _`Unique constraint failed on the fields: (exerciseId, muscle)`_ — an exercise in the library lists the same muscle twice. Task 12's fourth test catches this; run `pnpm test src/domain/exercise-library.test.ts`.
- _`Seeded 12 exercises.` but `pnpm db:studio` shows 24 rows_ — you ran the seed once before adding `@unique` to `Exercise.name`. Clear just the exercise tables and re-seed: `pnpm exec prisma db execute --stdin <<< 'TRUNCATE exercise, exercise_muscle CASCADE;'`. Do not reach for `prisma db push --force-reset` — it drops every table including BetterAuth's.
- _`prisma db seed` says `No seed command found`_ — the `"prisma"` key landed inside `"scripts"` instead of beside it. It must be a top-level key of the JSON object.

---

## Task 14: `ConstraintSet` Zod input contract (the engine seam)

_Why this matters: this is the typed door the engine and the tRPC layer will both knock on. Defining it now — with validation rules, not just types — means the engine plan starts from a contract that already rejects nonsense like `daysPerWeek: 9`, and Law 2's "the LLM only proposes engine-validated options" has an actual object to validate against._

**Files:**

- Create: `src/schema/constraint-set.ts`, `src/schema/constraint-set.test.ts`
- Modify: `src/schema/index.ts`

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
    expect(ConstraintSetInputSchema.parse(valid)).toMatchObject({
      daysPerWeek: 5,
    });
  });

  it("applies defaults for the optional collections", () => {
    const parsed = ConstraintSetInputSchema.parse({
      daysPerWeek: 3,
      splitType: "FULL_BODY",
      sessionLengthCapMin: 45,
      blockLengthWeeks: 4,
    });
    expect(parsed.checkInCadence).toBe("WEEKLY");
    expect(parsed.muscleTargets).toEqual([]);
    expect(parsed.excludedExerciseNames).toEqual([]);
  });

  it("rejects daysPerWeek outside 1..7", () => {
    expect(() =>
      ConstraintSetInputSchema.parse({ ...valid, daysPerWeek: 9 }),
    ).toThrow();
  });

  it("rejects a negative session length", () => {
    expect(() =>
      ConstraintSetInputSchema.parse({ ...valid, sessionLengthCapMin: -5 }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
pnpm test src/schema/constraint-set.test.ts
```

Expected: `FAIL` with `Failed to resolve import "./constraint-set"`.

- [ ] **Step 3: Implement `src/schema/constraint-set.ts`**

```typescript
import { z } from "zod";
import { CheckInCadenceEnum, MuscleGroupEnum, SplitTypeEnum } from "./enums";

export const MuscleTargetInputSchema = z.object({
  muscle: MuscleGroupEnum,
  weeklySetTarget: z.number().int().min(0).optional(),
  priority: z.number().int().min(0).max(5).default(0),
});
export type MuscleTargetInput = z.infer<typeof MuscleTargetInputSchema>;

/**
 * The user's training intent, validated. This is the engine's primary input
 * contract and the object the LLM boundary must produce.
 */
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

> **Concept: `z.infer` and `.default()`**
>
> `z.infer<T>` gives you the type of the **parsed output**, which is why
> `ConstraintSetInput["checkInCadence"]` is `CheckInCadence` and not
> `CheckInCadence | undefined` — after `.parse()` the default has been applied, so the
> field is always present. Zod also exposes `z.input<T>` for the _pre_-parse shape,
> where the defaulted fields are optional. Use `z.infer` for what your engine receives
> and `z.input` for what a form or an API caller may send. Getting these backwards is
> the single most common Zod confusion.
> Docs: https://zod.dev/api?id=type-inference

- [ ] **Step 4: Re-export from the barrel**

Append to `src/schema/index.ts`:

```typescript
export * from "./constraint-set";
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
pnpm test src/schema/constraint-set.test.ts
```

Expected: `Tests  4 passed (4)`.

- [ ] **Step 6: Full verification**

```bash
pnpm test && pnpm typecheck && pnpm exec prisma validate
```

Expected: all tests pass, zero type errors, schema valid.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(schema): add ConstraintSet input contract (engine seam)

The validated boundary object the engine and tRPC will both consume.
Validation lives here, not in the engine, so Law 2's 'LLM proposes only
engine-validated options' has a concrete gate."
```

**Troubleshooting**

- _The defaults test fails with `expected undefined to be 'WEEKLY'`_ — you wrote `.optional()` instead of `.default("WEEKLY")`. `.optional()` permits absence; `.default()` fills it in.
- _`Property 'muscle' is missing`_ on a `muscleTargets` entry in the test — the object literal is missing `muscle`, or you dropped the `as const` and TypeScript widened `"CHEST"` to `string`.
- _A `toThrow()` test passes but for the wrong reason_ — tighten it to `.toThrow(z.ZodError)` if you want to be certain the rejection came from validation rather than a typo in the property name.
- _`pnpm test` now fails on the parity test's coverage assertion_ — `src/schema/index.ts` re-exports `constraint-set.ts`, but the parity test imports from `./enums` directly, so schemas added here don't count. If it fails, you added an enum to `enums.ts`; add its `PAIRS` row.

---

## Verification (end-to-end)

Run all of these after Task 14. Each should produce exactly the stated output.

1. **Schema is valid and in sync**

   ```bash
   pnpm exec prisma validate && pnpm exec prisma db push
   ```

   → `The schema at prisma/schema.prisma is valid 🚀` then `The database is already in sync with the Prisma schema.`

2. **All tests pass**

   ```bash
   pnpm test
   ```

   → 7 test files, 30 tests passing: enums (2), prisma-parity (16), landmarks (2), exercise-library (4), constraint-set (4), seed (2).

3. **Types compile**

   ```bash
   pnpm typecheck
   ```

   → no output, exit 0.

4. **Lint is clean**

   ```bash
   pnpm lint
   ```

   → `✔ No ESLint warnings or errors`.

5. **Seed works against a real database**

   ```bash
   pnpm exec prisma db seed
   ```

   → `Seeded 12 exercises.`

6. **Inspect the attribution visually**
   ```bash
   pnpm db:studio
   ```
   Opens Prisma Studio at `http://localhost:5555`. Open the `exercise` table, find **Barbell Row**, and expand its `muscles` relation. You should see exactly three rows: `BACK / PRIMARY / 1`, `BICEPS / SECONDARY / 0.5`, `REAR_DELTS / SECONDARY / 0.5`. That is fractional attribution working end to end. Press `Ctrl+C` in the terminal to stop Studio.

---

## Promoting the schema to production

Only after the end-to-end verification above passes on your preview branch.

The domain changes are additive — fourteen new tables and fifteen new enums — with one exception: dropping `Post`. Nothing in the deployed app references `Post` once Task 1's router and component deletions ship, so the drop is safe, but sequence it so the code deploys first.

- [ ] **Step 1: Merge and deploy the code**

Push the branch and let Vercel deploy it. At this point production still has the old schema plus a `post` table nothing reads — harmless, because the new models don't exist yet and no code queries them.

- [ ] **Step 2: Push the schema to the production branch**

Temporarily point your shell at production without editing `.env`:

```bash
DATABASE_URL="<prod pooled URL>" DATABASE_URL_UNPOOLED="<prod direct URL>" pnpm exec prisma db push
```

Read the drop confirmation carefully. It should list exactly one table: `post`. If it names `user`, `session`, `account`, or `verification`, answer `n` — something is wrong with your schema file.

- [ ] **Step 3: Seed the exercise library into production**

```bash
DATABASE_URL="<prod pooled URL>" DATABASE_URL_UNPOOLED="<prod direct URL>" pnpm exec prisma db seed
```

Expected: `Seeded 12 exercises.` The seed is idempotent, so re-running it after you expand the library later is the normal way to update production's exercise table.

- [ ] **Step 4: Repoint `.env` before the branch disappears**

You don't delete `preview/freddy/feat/db-design` — Vercel does, automatically, when this git branch's PR merges and the branch is deleted. That's fine, but your local `.env` still names it, and the next time you run anything you'll get a connection failure that reads like bad credentials.

So immediately after merging, repoint `.env` lines 19 and 22 at either `preview/dev` or a branch you create by hand for the next plan. Neon bills a branch only for data that diverges from its parent, so keeping a long-lived personal dev branch is cheap; reset it from parent whenever you want production's current state.

**Troubleshooting**

- _The drop prompt lists tables beyond `post`_ — your local schema file has drifted from what you verified. Answer `n`, run `pnpm exec prisma validate`, and diff `prisma/schema.prisma` against the branch you tested.
- _`prisma db seed` runs against the wrong database_ — the inline `DATABASE_URL=` prefix only applies to that one command. Confirm with `pnpm exec prisma db execute --stdin <<< "SELECT current_database();"` using the same prefix before seeding.
- _You want this automated later_ — that's the point at which switching from `db push` to `prisma migrate` earns its keep: real migration files, reviewable in a PR, applied by `prisma migrate deploy` in Vercel's build step. Out of scope here, worth doing before the app has users whose data you can't lose.

---

## Roadmap — subsequent plans (not in this plan)

1. **Training Engine** (`src/engine/`, pure TS, TDD) — Constraint Resolver → Volume Distributor (fractional-aware) → Mesocycle Generator → Auto-Regulation Stepper → Deload Trigger → Redistribution Solver. Consumes `ConstraintSetInput` + `DEFAULT_LANDMARKS` + `EXERCISE_LIBRARY`; produces block/week/session plans. Add an ESLint boundary rule forbidding `next`/`@prisma`/`~/server` imports from `src/engine/`.
2. **tRPC API layer** — persist engine output via Prisma; routers for onboarding, block generation, check-in, decisions. The engine stays pure; routers do the DB I/O.
3. **Experience layer** — onboarding (biodata→TDEE, experience router), the Block hero screen, the muscle heat map + volume distribution, ambient decision cards.
4. **AI orchestration** — NL goal parser → `ConstraintSetInput`, LLM-as-tool-caller over engine functions, explanation generation, sidebar assistant + Coach tab. Zod-validated at every boundary (Law 2).

---

## Changes from the original plan

This training-wheels version differs from `2026-07-24-volustack-data-model.md` in six places, all because the original would have failed on this repo:

0. **The database is Neon, not a local Docker Postgres.** The original's `./start-database.sh` instructions describe a setup this project no longer uses — `.env` line 16 (localhost) is commented out and `DATABASE_URL` points at Neon's **pooled** endpoint. Three consequences: `prisma db push` needs `directUrl` set to the unpooled endpoint, because PgBouncer's transaction mode can't serve DDL; every `db push` and the Task 13 seed test would otherwise hit the live production database; and the original's "the tables are empty, accept the reset" advice would have dropped the real BetterAuth `user`/`session`/`account` rows. The Prerequisite now uses the Vercel-created Neon preview branch, and every destructive suggestion has been narrowed to a single table or replaced with the console's **Reset from parent**.

1. **Relation fields are added incrementally (Tasks 4–10).** The original declared `AthleteProfile.mesocycles`, `AthleteProfile.checkIns`, `AthleteProfile.constraintSets`, `Exercise.prescriptions`, `Exercise.exclusions`, `Week.sessions`, `Week.checkIns`, and `Mesocycle.decisions` before those models existed. `prisma validate` fails at the end of Task 4 as written. Each task here adds only relations whose targets exist, and later tasks add the back-relation lines.
2. **`vitest.config.ts` no longer uses `__dirname`.** `package.json` sets `"type": "module"`, so `__dirname` is undefined and the config throws. Replaced with `fileURLToPath(new URL("./src", import.meta.url))`.
3. **Added `vitest.setup.ts` + the `dotenv` dependency.** Vitest does not load `.env`, and `prisma/seed/seed.test.ts` imports `~/server/db` → `src/env.js`, which throws `Invalid environment variables` at import time. `vite`'s `loadEnv` is not an option here: `.npmrc` only public-hoists `*eslint*` and `*prettier*`, so `vite` (a transitive dependency of `vitest`) is not resolvable from the project root under pnpm.
4. **Dropped Task 1 Step 4.** `src/app/page.tsx` never imported `LatestPost` — it renders `SignInButton`/`SignOutButton`. There was nothing to remove.
5. **The parity test is table-driven over all 15 enums** instead of hand-checking 2, and includes a coverage test that fails when an enum is added to `enums.ts` without a corresponding row.

Two smaller corrections: `Exercise.contraindications` uses `{ set: [...] }` in the seed's `update` body (scalar list semantics), and Task 1 Step 2 explicitly names the `posts Post[]` line on `User` that must go with the `Post` model.

---

## Self-Review

**Spec coverage (§7 entities):** AthleteProfile ✓ (T4) · MuscleLandmark ✓ (T4) · ConstraintSet ✓ (T6) · MuscleTarget/priorities ✓ (T6) · ExerciseExclusion ✓ (T6) · Mesocycle ✓ (T7) · Week + per-muscle volume ✓ (T7) · TrainingSession ✓ (T8) · ExercisePrescription ✓ (T8) · Exercise + fractional attribution ✓ (T5, T12) · CheckIn/CheckInMuscle ✓ (T9) · DecisionLog ✓ (T10) · TDEE-as-context ✓ (T4, no food logging) · default landmarks ✓ (T11) · shared Zod vocabulary ✓ (T2, T3, T14).

**Placeholder scan:** No TBD/TODO; every code and test step contains complete, runnable content.

**Type consistency:** All fifteen enums are defined once in `src/schema/enums.ts` (T2), mirrored in Prisma (T3) with a table-driven parity test, and reused verbatim by domain constants (T11–12) and contracts (T14). `TrainingSession` used consistently (never `Session`). `AthleteProfile` used consistently (never `Athlete`). Seed count `12` matches the twelve-exercise library and both seed assertions. Test counts in the end-to-end verification (30 across 7 files) match the per-task expectations.

**Concept sidebars:** Prisma-as-codegen, relation fields, `db push` vs migrate, `@@map`, `verbatimModuleSyntax` (all in the preamble); Zod enums, Vitest aliasing, ESM `__dirname` (T2); Postgres enums (T3); incremental relations (T4); scalar lists (T5); referential actions (T7); `Json` columns (T10); `Record<Union, T>` exhaustiveness (T11); nested `upsert` (T13); `z.infer` vs `z.input` (T14). Each appears once, at first use.

**No-hedging:** Every command names one tool and one expected output. The one place with two valid options — `db push` vs `migrate dev` — names push as the plan's choice and puts the `db:generate` script trap in the preamble concept block.

**Verified against the repo:** `package.json` scripts and dependency versions, `tsconfig.json` compiler flags and path aliases, `.npmrc` hoist patterns, `eslint.config.js` type-import rule, `prisma/schema.prisma` current contents, `src/app/page.tsx` imports, `src/server/db.ts` import graph, `src/env.js` required variables, `.env` connection-string shape (Neon pooled `DATABASE_URL` on line 19, unpooled on line 22, localhost commented out on line 16), and the absence of `prisma/migrations/`.

**Destructive-operation audit:** every step that can lose data is (a) scoped to a named table rather than the whole database, (b) preceded by an instruction to confirm the `ep-...` endpoint is the preview branch, or (c) replaced by Neon's **Reset from parent**. `prisma db push --force-reset` appears once, as an explicit _don't_. The only intentional drop is `Post` in Task 1.
