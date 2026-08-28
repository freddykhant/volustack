# Mesodapt — Training Engine Design

**Date:** 2026-07-25
**Status:** Approved design, ready for implementation planning
**Parent spec:** `docs/superpowers/specs/2026-07-20-volustack-mvp-design.md` (§3 Laws, §8 Engine Modules)

---

## 1. Scope & Position

The deterministic training engine — the moat. This spec covers all six modules across both
paths:

- **Generation path:** Constraint Resolver → Volume Distributor → Mesocycle Generator
- **Adaptation path:** Auto-Regulation Stepper → Deload Trigger → Redistribution Solver

Implementation splits into **two plans** (generation first; it alone powers onboarding + the
Block UI). Design is unified here because adaptation constrains what generated plans must
carry.

**Dependencies:** consumes `ConstraintSetInput`, domain enums, `DEFAULT_LANDMARKS`, and
`EXERCISE_LIBRARY` from the data-model plan
(`docs/superpowers/plans/2026-07-24-volustack-data-model.md`, Tasks 2, 11, 12, 14) — those
tasks execute before the engine.

**Non-goals (this spec):** persistence (tRPC/Prisma layer maps engine output to DB), LLM
phrasing (AI layer consumes `facts`), per-set logging, wearables, fatigue modeling (ACWR etc.
is V2), nutrition.

---

## 2. Engine Shape

`src/engine/` — pure TypeScript, **zero runtime deps**, no imports from `next`, `@prisma`,
`react`, or `~/server`. Enforced by an ESLint boundary rule added with the first engine code.
Test-only exception: `fast-check` (dev-dep).

### Entry points (all pure functions)

```ts
resolveConstraints(input: ConstraintSetInput, athlete: AthleteContext)
    → ResolvedSpec | InfeasibilityReport

generateMesocycle(spec: ResolvedSpec, library: ExerciseDef[], landmarks: LandmarkMap)
    → MesocyclePlan

stepWeek(plan: MesocyclePlan, weekIndex: number, feedback: CheckInFeedback | null)
    → WeekAdjustment          // includes checkInValue signal

evaluateDeload(plan: MesocyclePlan, history: WeekOutcome[])
    → DeloadDecision

redistributeWeek(week: WeekPlan, missedSessionIds: string[])
    → RedistributionCandidate[]   // 1–3 complete valid plans
```

### The facts contract (Law 2's teeth)

Every output carries `facts: DecisionFact[]` — a typed discriminated union of structured
reasons. Examples:

```ts
{ kind: "moved_sets", muscle: "CHEST", from: "Upper A", to: "Upper B", count: 2,
  cause: "session_time_cap" }
{ kind: "held_volume", muscle: "SIDE_DELTS", at: 19, cause: "approaching_mrv", mrv: 26 }
{ kind: "infeasible", constraint: "session_time",
  detail: { requiredMin: 74, capMin: 60, session: "Upper A" } }
```

The LLM's only downstream job is *phrasing* facts — it never invents a reason, because every
decision ships with its reasons as data. `DecisionLog.payload` = facts + structured diff.
**Every mutation an engine function makes must emit at least one fact** (tested).

### Determinism

No RNG anywhere. Tie-breaks by stable ordering: priority desc → MRV headroom desc → name asc.
Same input ⇒ deep-equal output. This is what makes the engine provable.

### Time model (feasibility currency)

```
sessionMinutes = WARMUP_MIN (8)
              + Σ per exercise: SETUP_MIN (2) + sets × PER_SET_MIN (3)
```

Constants live in `src/engine/constants.ts` (with rep/RIR defaults) — tunable, never inline.

---

## 3. Constraint Resolver

`ConstraintSetInput + AthleteContext → ResolvedSpec | InfeasibilityReport`

- Fills unspecified muscle targets from landmark defaults; untargeted muscles get
  maintenance volume at MEV.
- **Phase modulation** (TDEE context doing real work): effective MRV = MRV × phase factor —
  cut ×0.85, maintain ×1.0, bulk ×1.05.
- **Beginner mode = knobs locked here:** template split, flat volume at the MEV–MAV
  midpoint, no ramp (progression via rep/load targets in prescriptions, not set counts).
- **Infeasibility is a first-class result, not an exception:** typed `InfeasibilityReport`
  with facts (e.g. requested volume cannot fit `daysPerWeek × sessionCap`), so the UI/AI can
  negotiate ("drop to 15 chest sets, or add a 6th day?").

---

## 4. Volume Distributor (greedy + repair)

**Decision:** deterministic greedy pipeline with repair passes — not CSP/ILP. Every step is a
traceable, narratable decision (feeds the coach voice); fast and testable at MVP sizes
(14 muscles × ≤7 sessions); upgradeable later behind the same API.

Operates on the **week template** (one representative week; the generator stamps ramps onto
it):

1. **Eligibility map** — split type defines which sessions may train which muscle
   (U/L: chest → upper days only).
2. **Compounds-first greedy:** order muscles by (priority, constraint tightness). For each,
   prefer exercises whose fractional credit also pays *unmet* secondary targets (row before
   curl — the biceps come free). Allocate sets round-robin across eligible sessions;
   spread across ≥2 sessions once weekly volume ≥ 6 sets (`FREQUENCY_THRESHOLD_SETS`
   in `constants.ts`).
3. **Repair passes** (each emits facts):
   - *Time-cap repair:* move sets/exercises from over-cap sessions to the slackest eligible
     session.
   - *Frequency repair:* split single-session volume lumps.
   - *Overshoot trim:* fractional credit pushed a muscle past target +0.5 → trim isolation
     sets first.
4. **Output:** session slots with exercises + sets, per-muscle achieved fractional volume,
   residual deviations (each deviation carries a fact).

---

## 5. Mesocycle Generator

- **Stable block template** (decision): the distributor runs *once* per block; exercises are
  fixed for the whole mesocycle — hypertrophy best practice (progress the same lifts; vary
  between blocks), simpler stepper comparisons, legible week-to-week Block grid.
- **Ramp semantics:** the user's explicit target = **peak-week volume** (last accumulation
  week). Week 1 = max(MEV, ~75% of peak), linear integer ramp to peak. Ramps stay inside
  [MEV, effective MRV]; a ramp that would cross MRV flattens there (with a fact).
- **Deload week:** ≈50% of week-1 volume at higher RIR, placed per spec
  (`deloadWeekIndex`, default last).
- **Prescriptions:** rep-range + RIR by movement class (compound 6–10 @ 2 RIR, isolation
  10–15 @ 1–2 RIR — constants file).
- Output `MesocyclePlan` maps 1:1 onto the data model
  (`Mesocycle → Week → TrainingSession → ExercisePrescription`) and the experience layer's
  view models.

---

## 6. Auto-Regulation Stepper

Per muscle, per completed week. Feedback scores (each 0–3, all optional): **recovery**
(0 wrecked → 3 fresh), **performance** (0 regressed → 3 beat targets), **joint**
(0 fine → 3 painful).

**Rule table** — evaluated top-down, first match wins, every row emits a fact:

| # | Condition | Δ next week | Fact cause |
|---|---|---|---|
| 1 | joint ≥ 2 | −2, flag exercise-swap candidate | `joint_stress` |
| 2 | recovery ≤ 1 | −1 (−2 if at/over MAV) | `under_recovered` |
| 3 | recovery ≥ 2 ∧ performance ≥ 2 ∧ next < MRV−1 | planned ramp +1 | `responding_well` |
| 4 | recovery ≥ 2 ∧ performance ≥ 2 ∧ near MRV (next planned > MRVeff − 2) | hold at planned | `approaching_mrv` |
| 5 | anything else (middling) | planned ramp as-is | `on_track` |
| 6 | no feedback | planned ramp as-is | `default_progression` |

Hard clamps after the table: never exceed effective MRV; never below MEV (deload excepted).
Graceful degradation falls out naturally — sparse feedback means only flagged muscles hit
non-default rows.

**Confidence signal** (enables the "smart check-in"): `stepWeek` returns
`checkInValue: 'high' | 'low'` — **high** iff feedback could change the outcome: the planned
ramp crosses MAV, comes within 2 sets of effective MRV, or a prior week flagged
joint/recovery. The AI prompts for a check-in only when `high`. Deterministic, explainable
nagging policy.

---

## 7. Deload Trigger

`evaluateDeload → { decision: 'none' | 'scheduled_next' | 'recommend_early', facts }`

- **Scheduled:** next week is the spec's deload week → `scheduled_next` (already built by the
  generator).
- **Reactive early deload:** ≥2 muscles at/over effective MRV **with** recovery ≤ 1 for two
  consecutive weeks → `recommend_early` (proposes swapping the remaining ramp for the deload
  week now; user accepts via decision card).
- **Beginner mode:** scheduled only — the reactive rule needs feedback quality beginners
  won't produce.

---

## 8. Redistribution Solver

**Decision:** the solver emits **candidate plans**; the AI phrases and the user picks
(Law 2 embodied) — no silent auto-apply, no always-cram.

`redistributeWeek(week, missedSessionIds)` → up to 3 candidates, each a **complete valid
`WeekPlan`** + facts + a `tradeoff` struct:

- **MAKE_UP** — pack missed sets into remaining eligible sessions within time caps and MRV;
  the unfittable remainder is dropped and quantified (`{ recovered: 14, dropped: 4 }`).
- **PARTIAL** — recover sets only for muscles with `priority > 0` (plus any muscle that would
  fall below MEV); the rest dropped.
- **LET_GO** — drop all missed volume; facts report per-muscle weekly deficit and flag any
  muscle falling below MEV.

Invalid candidates are simply not emitted (one candidate is acceptable, e.g. last day of the
week missed → LET_GO only). The engine marks one `recommended: true` by simple policy:
early-week + far from MRV → MAKE_UP; late-block near MRV → LET_GO.

---

## 9. Testing Strategy

Three layers, all Vitest; **fast-check** for property tests (dev-dep, test-only).

1. **Property tests** — arbitrary valid specs → invariants:
   - every session's estimated time ≤ cap
   - per-muscle achieved weekly volume within ±0.5 of target, or a deviation fact explains why
   - excluded exercises never appear anywhere
   - frequency floor respected
   - every ramp stays inside [MEV, effective MRV]; deload ≈ 50% of week 1
   - **determinism:** run twice, expect deep equality
   - **stepper monotonicity:** better feedback never yields fewer sets, all else equal
   - every redistribution candidate is itself a valid plan; recovered volume
     MAKE_UP ≥ PARTIAL ≥ LET_GO
   - every mutation emits ≥ 1 fact
2. **Golden fixture** — the vision's canonical input (U/L · 5 days · chest 16 / back 18 /
   quads 12 · 60-min cap · no squats · shoulders priority · 6 weeks) → snapshot-tested plan,
   human-reviewed once for domain sanity, then frozen as the regression anchor.
3. **Rule-table units** — every auto-reg row, every clamp boundary (exactly MEV/MAV/MRV),
   infeasibility cases, beginner-mode locking.

---

## 10. Decision Log

| Decision | Choice | Why |
|---|---|---|
| Spec scope | Full engine, one spec | Adaptation constrains generated plan shapes; build splits into two plans |
| Distributor | Greedy + repair | Explainable (feeds coach voice), fast, testable; CSP/ILP overkill + unexplainable |
| Exercise selection | Stable block template, compounds-first | Hypertrophy best practice; simpler stepper; fractional credit drives selection |
| User target semantics | Peak-week volume | Ramp start derived (max(MEV, ~75% peak)) |
| Redistribution | Candidate plans, AI/user picks | Cram-vs-drop is preference-laden; Law 2 architecture |
| Explanations | Typed `DecisionFact[]` on every output | LLM phrases, never invents; DecisionLog payload for free |
| Randomness | None | Determinism = provability + testability |
| Feedback model | Per-muscle 0–3 recovery/performance/joint, all optional | RP-style, graceful degradation built in |
| Check-in prompting | `checkInValue` from decision-boundary proximity | Smart, deterministic, explainable nagging policy |
```
