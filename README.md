# Mesodapt

Mesodapt is a training-management app for self-coached hypertrophy lifters. A deterministic engine
generates a mesocycle, sets weekly volume against per-muscle landmarks, places sessions on the week
and reflows them when sessions are missed or time is blocked. Every change to the plan is a proposal
the athlete accepts. Language models only parse text and break close calls between options the
engine has already built. They never produce a number. See [PRODUCT.md](PRODUCT.md) for the product
and [DESIGN.md](DESIGN.md) for the visual system.

## Stack

- Next.js 15 (App Router), React 19, TypeScript
- tRPC 11 with TanStack Query and superjson
- Prisma 6 on PostgreSQL. The client is generated into `generated/prisma`.
- better-auth with Google OAuth (`src/server/better-auth`)
- Tailwind CSS v4, lucide-react icons, dnd-kit for the week board
- Zod for input schemas, validated env via `@t3-oss/env-nextjs` (`src/env.js`)
- `@anthropic-ai/sdk`: the coach box on the week board turns a message into a fixed intent form
- `@typesafe-ai/sdk` (the Jev model): optional tie-breaks for reschedule, progression and
  replacement-option ordering
- Vitest 4 (with fast-check property tests), pnpm 10

## Repo layout

```
src/
  engine/      Pure training logic: constraint resolution, block generation, volume distribution,
               progression, deload, readiness, redistribution, schedule placement. Imports only
               ~/schema and ~/domain. No DB, network or clock.
  domain/      Static domain data and helpers: exercise library, volume landmarks, onboarding
               template, local-day/timezone math, coach intent resolution (domain/coach).
  schema/      Zod schemas and enums for every input (onboarding, logging, check-in, schedule,
               coach), with a parity test against the Prisma enums.
  views/       Pure view-model builders the UI renders (schedule, next session, readiness,
               progression, deload, reschedule, coach replies), plus fixtures.
  server/
    api/         tRPC routers: mesocycle, onboarding, session, schedule, checkin, readiness,
                 coach, health
    better-auth/ Auth config (Google plus email/password) and the client
    coach/       Anthropic interpreter, the model context it is sent, and the prompt
    judgement/   Jev client and the get-or-ask cache in the `judgement` table
    mesocycle/   Adapters between Prisma rows and engine inputs, and plan persistence
    schedule/    Loads one week's scheduling context
    views/       Maps Prisma rows to the mesocycle view model
    db.ts        Prisma client singleton
  trpc/        tRPC client provider (react.tsx), RSC caller (server.ts), query client
  app/         Routes: / (sign-in), /onboarding, /app (home, block, block/week/[n], analysis,
               readiness, settings; coach and library are stubs), /api/auth, /api/trpc
  components/  UI grouped by surface (block, schedule, coach, checkin, home, readiness, viz, nav,
               onboarding), plus ui-kit/app-shell-kit
  styles/      globals.css (Tailwind v4 theme)
prisma/
  schema.prisma, seed/ (exercise library and a demo block), backfill-schedule.ts
```

## Local setup

Prerequisites: Node 20+, pnpm 10, and Docker or Podman (only for the local database script), plus a
Google OAuth client whose redirect URI is `http://localhost:3000/api/auth/callback/google`.

```bash
pnpm install                # also runs `prisma generate`
cp .env.example .env        # then fill in the Google OAuth values
./start-database.sh         # starts a Postgres container named from DATABASE_URL
pnpm db:migrate             # applies prisma/migrations (prisma migrate deploy)
pnpm db:seed                # loads the exercise library (see note below)
pnpm dev                    # http://localhost:3000
```

- `start-database.sh` reads `DATABASE_URL` from `.env` and uses Docker, or Podman if Docker is
  not installed. If the password is still `password` it offers to generate one and writes it
  back into `.env`. It reuses an existing container with the same name.
- `DATABASE_URL_UNPOOLED` is Prisma's `directUrl`, and Prisma will not run without it. For a
  local database, set it to the same value as `DATABASE_URL`.
- Run `pnpm db:seed` before you sign in for the first time. Onboarding saves its plan against
  the exercise rows, so it needs them. On a database with no users, the seed writes the
  exercises and then stops with "no User found". That error is expected at this point.
- Running `pnpm db:seed` again after you sign in also writes a demo 6-week block for your user,
  with a start date two weeks back. **It deletes that athlete's existing blocks first.** To pick a
  user other than the first one, set `SEED_USER_EMAIL`.
- `pnpm db:backfill-schedule` is a one-off for databases with ACTIVE blocks created before
  session placement existed. It places every session that has no day, and it is safe to run
  again. Optional: `BACKFILL_TZ=<IANA zone>` sets the timezone on profiles still on `UTC`. A
  fresh database does not need it.

The schema is managed with Prisma migrations. Do not use `db push`: it drops the partial unique
index on `decision_log`, which `schema.prisma` cannot express. Change the schema with
`pnpm db:generate` (`prisma migrate dev`) locally, and if it offers a migration that drops that
partial index, discard it. See [prisma/migrations/README.md](prisma/migrations/README.md).

## Environment

Validated in `src/env.js`. Run with `SKIP_ENV_VALIDATION=1` to skip validation, for example in a
Docker build.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection URL |
| `DATABASE_URL_UNPOOLED` | yes (Prisma) | `directUrl` in `schema.prisma`. Not in `env.js`, but Prisma needs it. |
| `BETTER_AUTH_GOOGLE_CLIENT_ID` / `_SECRET` | yes | Google OAuth client |
| `BETTER_AUTH_SECRET` | production only | Optional in development |
| `BETTER_AUTH_URL` | no | Read by better-auth itself, not `env.js`. Sets the base URL. |
| `ANTHROPIC_API_KEY` | no | Turns on the coach box. Without it the box is not rendered and the board works as before. |
| `COACH_MODEL` | no | Defaults to `claude-haiku-4-5-20251001` |
| `TYPESAFE_API_KEY` | no | Turns on Jev judgement. Without it every judgement returns nothing and the engine's own pick stands. |
| `JEV_MODEL` | no | Defaults to `jev-1.13.0`. Must be a pinned `jev-X.Y.Z`; `jev-latest` and `jev-preview` are rejected. |

Script-only: `SEED_USER_EMAIL` (`db:seed`), `BACKFILL_TZ` (`db:backfill-schedule`).

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Next dev server with Turbopack |
| `pnpm build` / `pnpm start` | Production build / serve it |
| `pnpm preview` | Build, then start |
| `pnpm test` | Vitest, all `src/**/*.test.ts` and `prisma/**/*.test.ts` except the two contract tests |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:contract` | Live, billed call to the Jev service. Needs `TYPESAFE_API_KEY` and is skipped without it. Rewrites `src/server/judgement/__fixtures__/reschedule-response.json`. |
| `pnpm test:coach-contract` | Live, billed Anthropic calls that check how a set of phrasings parse. Needs `ANTHROPIC_API_KEY` and is skipped without it. |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` / `pnpm lint:fix` | `next lint` |
| `pnpm check` | Lint, then typecheck |
| `pnpm format:check` / `pnpm format:write` | Prettier on ts/tsx/js/jsx/mdx. Markdown is not covered. |
| `pnpm db:push` | `prisma db push`. Do not use: it drops the partial index (see above) |
| `pnpm db:seed` | `prisma db seed`, which runs `prisma/seed/index.ts` |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:backfill-schedule` | One-off placement backfill (see above) |
| `pnpm db:generate` | `prisma migrate dev`. Despite the name, this creates migrations rather than running `prisma generate`. |
| `pnpm db:migrate` | `prisma migrate deploy`: apply pending migrations |
| `postinstall` | `prisma generate` |

Notes on tests:

- `vitest.setup.ts` loads `.env` before every run, and `src/env.js` validates at import. `pnpm
  test` therefore needs a filled-in `.env`.
- `prisma/seed/seed.test.ts` is an integration test. It upserts exercise rows into whatever
  database `DATABASE_URL` points at.
- The contract tests are excluded in `vitest.config.ts`. `vitest.contract.config.ts` collects only
  `src/server/**/contract.test.ts`, and each script names a single file.

## Docs

- [docs/README.md](docs/README.md): index of the docs
- [docs/superpowers/specs/](docs/superpowers/specs/): design specs, one per feature, dated
- [docs/superpowers/plans/](docs/superpowers/plans/): implementation plans that match the specs
- [docs/design/](docs/design/): design references (UI library shortlist)
- [PRODUCT.md](PRODUCT.md): users, positioning, capabilities, terminology
- [DESIGN.md](DESIGN.md): visual system and tokens

## Deployment

Not deployed yet. It is a standard Next.js app, so any Next.js host (Vercel or similar) works
with a Postgres database and the variables above.
