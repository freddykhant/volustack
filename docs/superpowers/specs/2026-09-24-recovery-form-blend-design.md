# Integration Layer ④-C-2 — Recovery→Form Blend (Design)

**Status:** Approved 2026-09-24
**Scope:** Third slice of ④-C. Fold the subjective `CheckInMuscle.recovery` signal (persisted by ④-A, currently read only by `evaluateDeload`) into the Fitness/Fatigue/Form curve as a **bounded, athlete-relative corrective nudge** on Form — keeping `computeReadiness` a pure load model.
**Branch target:** merges into `freddy/experimental` (standing rule). Feature branch `freddy/feat/recovery-form-blend`.
**Builds on:** ④-B real readiness (`computeReadiness`, `readinessInputsFromBlock`, `readinessState` banding) and ④-A's persisted `CheckInMuscle.recovery`.
**Part of:** ④ — ④-A progression loop (done) → ④-B real readiness (done) → ④-C cross-links: ④-C-1 deload proposal (done) → **④-C-2 recovery→Form blend (this)**.

## Problem

④-B made Form real, but from **logged load only** — it deliberately left the subjective `CheckInMuscle.recovery` signal unused ("folding it in is ④-C"). So an athlete who logs a normal week but reports feeling wrecked still sees a Form read that only knows what the barbell knows. ④-C-2 blends that felt-state signal into Form so the readiness surfaces (Readiness page, chart, Now-home chip, headline) reflect how the athlete actually feels — the last honesty step before phase-2 biodata deepens Form further. Recovery is the same signal that can trigger a deload (④-C-1); here it also bends the curve that *reports* readiness.

## Decisions (locked during brainstorming)

- **Role: corrective nudge, both ways.** Load-derived Form stays the backbone; recovery bends it symmetrically within bounds — feeling wrecked pulls Form below what load predicts, feeling fresh lifts it. (Rejected: a co-equal fatigue input folded into the daily EWMA — it would compound/decay day-to-day rather than act as a bounded weekly correction, and muddies the pure load model.)
- **Aggregation: worst-biased.** A week's per-muscle recovery ratings collapse to one weekly signal via the mean of the `RECOVERY_WORST_N` (=2) least-recovered muscles — mirroring `evaluateDeload`'s `FATIGUE_MUSCLE_THRESHOLD = 2`. The muscles that can trigger a deload are the ones that bend Form.
- **Strength: athlete-relative, moderate.** The nudge scales with `fitness`, neutral at "Okay" (recovery = 2). Max downside ≈ 15% of fitness (recovery 0), max upside ≈ 7.5% (recovery 3) — the honest asymmetry of a neutral-2 anchor on a 0–3 scale (2 steps of downside, 1 of upside; per-step slope symmetric at 7.5% of fitness). Composes with the `form/fitness` banding instead of fighting it; same felt-impact for high- and low-volume lifters; load still dominates mid-range.
- **Seam: nudge Fatigue, recompute Form.** The correction is applied to each week's **Fatigue** sample and Form is recomputed as `fitness − fatigue'`. This preserves the documented `form = fitness − fatigue` identity, so the chart (three related lines), the `ReadinessPoint` shape, and the banding all keep working with zero change — and the Fatigue line visibly reflecting reported soreness is an honest bonus. Fitness is never touched, so the nudge lands entirely on Form and the `Building` floor stays keyed to logged load only.
- **Missing weeks: no nudge.** A week with no WEEK check-in (or a check-in with no muscle recoveries) shows the pure load-derived Form — no invented recovery (Law 2). The chart simply falls back to the objective signal for that week.
- **No hard clamp.** A strong "Fresh" week may push `fatigue'` slightly negative (Form > Fitness) — a peaked / supercompensated read the chart's existing zero-line already renders honestly. We allow it rather than cap the upside asymmetrically.
- **Tunable constants (chosen, may be adjusted):** `RECOVERY_NEUTRAL = 2`, `RECOVERY_NUDGE_MAX_FRAC = 0.15`, `RECOVERY_WORST_N = 2`.

## Non-goals (deferred, named)

- **Biodata (Garmin/Strava/Bevel) in Form** → phase 2. ④-C-2 blends the subjective self-report only; wearables deepen Form later.
- **Per-muscle / per-region Form** → later. Recovery is per-muscle but Form stays one whole-body number; the worst-biased collapse is the only per-muscle read here.
- **Daily/per-session recovery blend** → later. Recovery is a weekly check-in signal; it nudges the weekly sample, not the daily grid.
- **Tuning constants per athlete / auto-fit** → later. Constants are global.
- **Changing the load model, banding thresholds, or `Building` floor** → out of scope. ④-C-2 adds a blend layer over the existing samples; it does not touch `computeReadiness`, `readinessState`'s `+5/−10/−30` bands, or `FITNESS_FLOOR`.

## Architecture

### 1. Weekly recovery signal (pure engine — `src/engine/readiness.ts`)

```ts
/** Worst-biased weekly recovery: mean of the RECOVERY_WORST_N least-recovered
 * muscles (or all, if fewer). null when no muscle reported a recovery value. */
export function weeklyRecoverySignal(recoveries: (number | null)[]): number | null;
```
Drop `null`s; if none remain → `null`. Otherwise sort ascending, average the first `min(RECOVERY_WORST_N, n)`. Pure, unit-tested.

### 2. The blend (pure engine — `src/engine/readiness.ts`)

```ts
/** Bounded athlete-relative corrective nudge: recovery bends each week's Fatigue
 * (Form recomputed as fitness − fatigue'). Weeks absent from the map (or null
 * signal) pass through unchanged. Preserves form = fitness − fatigue. Pure. */
export function blendRecovery(
  samples: ReadinessSample[],
  recoveryByWeek: Map<number, number | null>,
): ReadinessSample[];
```
Per sample:
```
r = recoveryByWeek.get(weekIndex)
if (r == null) return sample                                   // no data → no nudge
deviation    = (RECOVERY_NEUTRAL − r) / RECOVERY_NEUTRAL       // r2→0, r1→+0.5, r0→+1, r3→−0.5
fatigueDelta = deviation × RECOVERY_NUDGE_MAX_FRAC × fitness   // per recovery step = 7.5% of fitness
fatigue'     = fatigue + fatigueDelta                          // worse recovery ⇒ more fatigue ⇒ lower Form
form'        = round1(fitness − fatigue')
→ { weekIndex, fitness, fatigue: round1(fatigue'), form: form' }
```
Fitness unchanged; no clamp on `fatigue'`. Deterministic.

### 3. Recovery adapter (pure-ish — `src/server/mesocycle/recovery-by-week.ts`)

```ts
export interface BlockForRecovery {
  weeks: {
    index: number;
    checkIns: { scope: string; muscleFeedback: { recovery: number | null }[] }[];
  }[];
}

/** Map week.index → worst-biased weekly recovery signal, for weeks that have a
 * WEEK check-in. Weeks with no WEEK check-in are absent from the map. Pure. */
export function recoveryByWeekFromBlock(block: BlockForRecovery): Map<number, number | null>;
```
For each week, find its `scope === "WEEK"` check-in; if present, set `map[week.index] = weeklyRecoverySignal(checkIn.muscleFeedback.map(m => m.recovery))`. Sibling of `readinessInputsFromBlock`; the Prisma include lives in the router.

**Key-space correctness:** `ReadinessSample.weekIndex` comes from `weekEnds` = `1 … lengthWeeks` (positional), and `Week.index` is 1-based position (`@@unique([mesocycleId, index])`) — same space, so `map[week.index]` aligns with `sample.weekIndex` directly.

### 4. New constants (`src/engine/constants.ts`)

```ts
export const RECOVERY_NEUTRAL = 2;        // "Okay" → zero nudge (0=Wrecked … 3=Fresh)
export const RECOVERY_NUDGE_MAX_FRAC = 0.15; // max fraction of fitness the nudge moves Form (recovery 0)
export const RECOVERY_WORST_N = 2;        // # least-recovered muscles averaged (mirrors FATIGUE_MUSCLE_THRESHOLD)
```

### 5. Read path (router edit only — `src/server/api/routers/readiness.ts`)

`getReadiness` gains a check-in include and two compose steps:
```ts
weeks: {
  select: {
    index: true,                                    // NEW — key space for the recovery map
    sessions: { /* …unchanged… */ },
    checkIns: {                                     // NEW
      where: { scope: "WEEK" },
      select: { scope: true, muscleFeedback: { select: { recovery: true } } },
    },
  },
},
// …
const samples  = computeReadiness(inputs.events, inputs.weekEnds);   // unchanged
const recovery = recoveryByWeekFromBlock(block);                     // NEW
const blended  = blendRecovery(samples, recovery);                  // NEW
return toReadinessView(blended, curIdx);
```
`ReadinessView`/`ReadinessPoint` shapes unchanged; chart, chip, headline, and `readinessState` consume the already-blended series with no change.

## Data flow

```
getReadiness  [READ]
  load ACTIVE block (startDate, lengthWeeks, weeks→{index, sessions→…→setLogs, checkIns[WEEK]→muscleFeedback.recovery})
  → readinessInputsFromBlock → computeReadiness            (pure load model — unchanged)
  → recoveryByWeekFromBlock(block) → Map<weekIndex, signal|null>   (worst-biased weekly recovery)
  → blendRecovery(samples, recoveryByWeek)                (bounded athlete-relative Fatigue nudge → Form)
  → toReadinessView(blended, currentWeekIndex) → ReadinessView
Readiness page + Now-home chip/headline render it; readinessState bands on the blended form/fitness.
```

## Error handling / edge cases

- **Week with no WEEK check-in** → absent from map → sample unchanged.
- **Check-in present, all recoveries null** → signal `null` → sample unchanged.
- **Empty series** (`computeReadiness` → `[]`) → `blendRecovery` → `[]`; Building / "Not enough data yet" intact.
- **Fresh week near zero load-fatigue** → `fatigue'` may go slightly negative (Form > Fitness); chart's `min < 0` zero-line renders it.
- **Determinism (Law 2):** identical logs + identical check-ins → identical series; nothing invented; fitness (Building floor denominator) never altered.

## Testing

**Pure / unit-tested (no DB):**
- `weeklyRecoverySignal` — worst-2 average; fewer than 2 muscles (average all); ignores `null`s; all-null / empty → `null`.
- `blendRecovery` — recovery 2 → identity; recovery 0 → Form down ≈ 15% of fitness (Fatigue up); recovery 3 → Form up ≈ 7.5%; missing week → unchanged; **`form === round1(fitness − fatigue)` holds on every output**; empty input → `[]`; injected fitness values for deterministic magnitude assertions.
- `recoveryByWeekFromBlock` — only WEEK check-ins mapped; correct `week.index` keys; no-checkin weeks absent; null-recovery check-in → `null` entry.

**DB-bound → typecheck/lint gate + user/browser verification (subagents can't touch Neon):**
- The `readiness` router wiring. Verify in-browser: a block with two "wrecked" WEEK check-ins shows a visibly **lower** Form than load-only predicted (Fatigue line lifts); a "Fresh" week lifts Form; a block with no check-ins renders identically to ④-B (pure load-Form).

**Client → no change:** chart/chip/headline/banding untouched (consume blended series).

## Files (anticipated)

- Modify `src/engine/readiness.ts` (`weeklyRecoverySignal`, `blendRecovery`) + `src/engine/readiness.test.ts`.
- Modify `src/engine/index.ts` (export both).
- Modify `src/engine/constants.ts` (3 constants).
- Create `src/server/mesocycle/recovery-by-week.ts` + `.test.ts`.
- Modify `src/server/api/routers/readiness.ts` (check-in include + compose blend).

## Success criteria

An athlete who logs a normal week but reports feeling wrecked sees a Form read that dips **below** what logged load alone predicts, athlete-relatively banded (a high- and a low-volume lifter both feel the same-sized correction); a genuinely fresh week lifts Form; a block with no check-ins is byte-identical to ④-B's load-only Form. The nudge is bounded (≤ ~15% of fitness), worst-biased (the least-recovered muscles drive it, consistent with the deload trigger), and never invents data (missing check-in → no nudge). Laws 1 & 2 hold (engine owns every number; identical logs + check-ins → identical series); `computeReadiness`, the banding thresholds, and the `Building` floor are untouched; the chart/chip/headline need no change; typecheck + lint + existing tests stay clean.

## Self-Review notes

- **Spec coverage:** role/aggregation/strength/seam/missing-weeks/clamp all locked in Decisions; each maps to a unit (§1 signal, §2 blend, §3 adapter, §5 router). No TBDs.
- **Internal consistency:** the "nudge Fatigue, recompute Form" seam is used identically in §2, §Data flow, §Testing (identity assertion), and §Success criteria. Constants named once (§4) and referenced by symbol elsewhere.
- **Scope check:** single implementation plan — 3 pure units + 1 router edit; no UI/view/schema changes.
- **Ambiguity check:** `deviation` normalization made explicit (`(NEUTRAL − r)/NEUTRAL`, per-step 7.5% of fitness); missing-week vs null-signal both resolve to "unchanged sample"; weekIndex key-space alignment stated (§3).
