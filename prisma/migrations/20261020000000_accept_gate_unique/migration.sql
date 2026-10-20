-- Accept-gate hardening: close the two concurrent-write races parked in ④-A / ④-C-1.
--
-- Both indexes are UNIQUE and will FAIL to create if duplicate rows already
-- exist. Run the pre-flight dedupe SELECTs in prisma/migrations/README.md first.

-- (1) At most one WEEK/SESSION check-in per week.
-- `week_id` is nullable; Postgres treats NULLs as distinct, so non-week-scoped
-- check-ins (week_id IS NULL) are never over-constrained. This index name
-- matches Prisma's default for `@@unique([weekId, scope])`, so it round-trips
-- cleanly against the schema.
CREATE UNIQUE INDEX "check_in_weekId_scope_key"
  ON "check_in"("weekId", "scope");

-- (2) At most one PROPOSED decision per (mesocycle, week), while still allowing
-- many REJECTED/APPLIED rows (the decision history). This requires a PARTIAL
-- unique index, which the Prisma schema DSL cannot express — so it lives here,
-- in the migration, and is intentionally absent from schema.prisma. See
-- prisma/migrations/README.md for the `migrate dev` drift caveat.
CREATE UNIQUE INDEX "decision_log_proposed_unique"
  ON "decision_log"("mesocycleId", "weekIndex")
  WHERE "status" = 'PROPOSED'::"DecisionStatus";
