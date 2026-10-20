# Prisma migrations

This project adopted Prisma **migrations** (replacing `prisma db push`) with the
`accept_gate_unique` change. The trigger was a partial unique index that `db push`
cannot carry — see below.

## Why migrations (and not `db push`)

`db push` makes the database match the schema *exactly*, so any index it can't
see in `schema.prisma` — such as a **partial** unique index — is treated as drift
and dropped on the next push. The accept-gate hardening needs a partial unique
index (`decision_log … WHERE status = 'PROPOSED'`), which the Prisma schema DSL
cannot express. Migrations keep that raw SQL version-controlled and durable.

## What these migrations do

- `0_init/` — **baseline**. The full schema as it already existed on Neon at the
  moment migrations were adopted. It is marked *already applied* (see below), not
  re-run, because the tables already exist.
- `20261020000000_accept_gate_unique/` — the actual change: two unique indexes
  closing the concurrent-write races parked in ④-A / ④-C-1:
  - `check_in (weekId, scope)` — one check-in per week+scope.
  - `decision_log (mesocycleId, weekIndex) WHERE status = 'PROPOSED'` — at most
    one live proposal per (mesocycle, week), while keeping full decision history.

## One-time adoption (run against Neon, in order)

These commands touch the shared database — run them when you're ready for the
whole repo to be on migrations, ideally right before merging this branch.

```bash
# 0. Sanity: schema and DB are already in sync (should report no changes).
#    If it wants to apply changes, the baseline won't match reality — stop.
pnpm prisma db push --accept-data-loss=false

# 1. PRE-FLIGHT DEDUPE — a UNIQUE index creation FAILS if duplicates exist.
#    Both queries must return ZERO rows. Clean any offenders first.
```

```sql
-- dup week-scoped check-ins
SELECT "weekId", "scope", COUNT(*)
FROM "check_in"
WHERE "weekId" IS NOT NULL
GROUP BY "weekId", "scope"
HAVING COUNT(*) > 1;

-- more than one live proposal per (mesocycle, week)
SELECT "mesocycleId", "weekIndex", COUNT(*)
FROM "decision_log"
WHERE "status" = 'PROPOSED'
GROUP BY "mesocycleId", "weekIndex"
HAVING COUNT(*) > 1;
```

```bash
# 2. Mark the baseline as already applied (tables already exist on Neon).
pnpm prisma migrate resolve --applied 0_init

# 3. Apply the index migration.
pnpm prisma migrate deploy

# 4. Regenerate the client.
pnpm prisma generate
```

From here on, schema changes go through `prisma migrate dev` locally →
`prisma migrate deploy` on deploy. **Stop using `prisma db push`.**

## Caveat: the partial index and `migrate dev`

The `decision_log` partial index is intentionally **not** in `schema.prisma`
(Prisma can't represent it). Apply migrations with `prisma migrate deploy`.

If you run `prisma migrate dev`, Prisma may report the partial index as **drift**
and offer to generate a migration that **drops** it. That drop is spurious —
**discard it** (delete the generated migration; do not apply). The `check_in`
unique index *is* in the schema and round-trips normally. Only the partial index
is affected.
