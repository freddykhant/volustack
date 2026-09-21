# Integration Layer ④-B — Real Readiness from Logged Load (Design)

**Status:** Approved 2026-09-21
**Scope:** Second sub-project of ④. Replace the faked `mockReadiness` with **Fitness / Fatigue / Form computed from actual logged training load** (a Banister/PMC model over per-session stimulus). Makes the Readiness page, the Fitness/Fatigue/Form chart, and the Now-home Form chip real.
**Branch target:** merges into `freddy/experimental` (standing rule). Feature branch `freddy/feat/real-readiness`.
**Builds on:** ④-A weekly check-in → progression — merged at `bab8ab5`. Consumes the `SetLog` data ③ captures and ④-A's completed-week statuses. Reuses ③'s user-scoped ACTIVE-block loading pattern.
**Part of:** ④ progression + real readiness — **④-A progression loop (done)** → **④-B real readiness (this)** → ④-C progression↔readiness cross-links.

## Problem

Readiness — Fitness/Fatigue/Form, the through-line the vision inherits from Stamina's PMC — is currently a hardcoded arc (`src/views/_fixtures/mock-readiness.ts`), rendered by the Readiness page, the `ReadinessChart`, the `ReadinessHeadline`, and the Now-home `ReadinessChip`. ③ and ④-A now capture real performed data (`SetLog` per set, session `completedAt`/status). ④-B turns that logged load into a real readiness signal so the numbers on those surfaces mean something, and so the "Form" surface becomes genuine ahead of phase-2 biodata.

## Decisions (locked during brainstorming)

- **Load metric: stimulus sets (hard sets × RIR weighting), NOT tonnage.** Per completed session, `Σ_sets w(achievedRir)` where `w`: RIR 0–1 → 1.0, RIR 2–3 → 0.7, RIR ≥4 → 0.4, `null` → 0.7. Weight-agnostic — robust to bodyweight/machine/cable work and bad weight entries, and it stays in the *sets* currency the whole engine already reasons in (MEV/MAV/MRV). Absolute-load progression is already captured by ④-A's performance derivation; readiness here is accumulated fatigue vs fitness.
- **Model: Banister PMC on a daily grid, per-session by date, sampled weekly.** Build a daily load series (sum of that day's session stimulus; 0 on rest days) from each completed session's `completedAt`; run two EWMAs (slow fitness, fast fatigue); sample at each week-end date into the weekly `ReadinessPoint[]` the chart consumes.
- **Normalization: Form as % of Fitness (athlete-relative), TSB-style.** Band on `formPct = form / fitness` so a fatigue dip means the same for a 15-set/wk and a 40-set/wk lifter. Cold start (fitness below a data floor) → a new **Building** state, not a false band.
- **Scope: load-only.** ④-B computes Form from logged load only. The subjective `CheckInMuscle.recovery` signal (persisted by ④-A) stays unused here — folding it in is ④-C. Keeps ④-B a clean single-input model matching the roadmap split.
- **Tunable constants (chosen, may be adjusted):** `τ_fit = 21d` (fitness/CTL), `τ_fat = 7d` (fatigue/ATL); Form% bands `+5 / −10 / −30`; `FITNESS_FLOOR = 1.5` (Building below it).

## Non-goals (deferred, named)

- **Subjective recovery in Form** → ④-C (progression↔readiness cross-links). Recovery is captured, not read here.
- **Biodata (Garmin/Strava/Bevel)** → phase 2. ④-B is load-only; biodata deepens Form later.
- **Daily/per-session readiness view** → later. The model runs on a daily grid but only weekly points are surfaced (the existing view shape); the daily curve is an internal detail a future daily view can expose.
- **Tuning constants per athlete / auto-fit** → later. Constants are global for now.
- **Readiness-driven proposals** (e.g. auto-deload when Overreaching) → ④-C / later. ④-B only *reports* readiness.
- **Endurance TSS load** → phase 2. The output shape is discipline-agnostic; strength computes its own load→Form here.

## Architecture

### 1. Load metric (pure engine — `src/engine`)

`sessionStimulus(sets: { achievedRir: number | null }[]): number` — `Σ w(achievedRir)`:
```
w(rir) = rir === null ? 0.7 : rir <= 1 ? 1.0 : rir <= 3 ? 0.7 : 0.4
```
Pure, unit-tested. A session's stimulus is `sessionStimulus` over all its prescriptions' `setLogs`. No logs → 0.

### 2. Readiness model (pure engine — `src/engine/readiness.ts`)

Types (engine-local, mapped to the view later):
```ts
interface LoadEvent { dayOffset: number; load: number } // dayOffset = whole days since block start
interface ReadinessSample { weekIndex: number; fitness: number; fatigue: number; form: number }
```

`computeReadiness(events, weekEndOffsets, opts) → ReadinessSample[]`:
- Collapse `events` into a daily load map keyed by `dayOffset` (sum per day).
- Iterate days `d = 0 … lastWeekEndOffset` on a daily grid, `load_d` = daily map value or 0:
  ```
  fitness_d = fitness_{d-1} + (load_d − fitness_{d-1}) · (1 − e^(−1/τ_fit))
  fatigue_d = fatigue_{d-1} + (load_d − fatigue_{d-1}) · (1 − e^(−1/τ_fat))
  ```
  seed `fitness_{-1} = fatigue_{-1} = 0` (cold start: no assumed history — Law 2, no invented load).
- At each `weekEndOffsets[w]`, emit `ReadinessSample { weekIndex, fitness: round1, fatigue: round1, form: round1(fitness − fatigue) }`.
- `opts = { tauFit: 21, tauFat: 7 }` defaults; injectable for tests/tuning.

Pure, deterministic, fully unit-tested (decay math, rest-day zeros, weekly sampling, empty input → `[]`).

### 3. Banding (pure — reworked `src/components/viz/readiness-state.ts`)

`ReadinessLabel` gains **`Building`**: `"Fresh" | "Productive" | "Fatigued" | "Overreaching" | "Building"`.

`readinessState(point: { fitness: number; form: number }): ReadinessLabel`:
```
if (fitness < FITNESS_FLOOR) return "Building";     // too little logged load to judge
const pct = form / fitness;                          // fitness ≥ floor > 0, safe
if (pct >= 0.05) return "Fresh";
if (pct >= -0.10) return "Productive";
if (pct >= -0.30) return "Fatigued";
return "Overreaching";
```
`FITNESS_FLOOR = 1.5` (daily fitness settles toward mean daily load ≈ 3–4 for a normal training week, so ~1.5 means "some consistent training is logged"; tunable). Signature change from `(form: number)` → `(point)`; callers updated (§5). Still classification-only (Law 1).

### 4. Data adapter (pure-ish — `src/server/mesocycle`)

`readinessInputsFromBlock(block) → { events: LoadEvent[]; weekEndOffsets: {weekIndex, dayOffset}[] } | null`:
- `null` (or empty) when `startDate` is null (a block with no timeline → Building/empty).
- For each **COMPLETED** `TrainingSession` with a `completedAt`: `dayOffset = floor((completedAt − startDate) / DAY_MS)`, `load = sessionStimulus(session.setLogs across prescriptions)`. Missed/scheduled sessions contribute nothing.
- `weekEndOffsets`: for `w = 1 … lengthWeeks`, `dayOffset = w × 7 − 1` (last day of week w, block-relative). Sampling the decayed curve at every week end — even weeks with no completed sessions — so the series is complete and honest.

Pure given the loaded rows; the Prisma include lives in the router.

### 5. Read path / view + tRPC

- `ReadinessPoint`/`ReadinessView` shapes are **unchanged** (`{ weekIndex, fitness, fatigue, form }`, `{ series, currentWeekIndex }`) — `computeReadiness` samples map 1:1, so the chart needs no change.
- New `toReadinessView(samples, currentWeekIndex) → ReadinessView` mapper (or inline in the router).
- New **`readiness` router**: `getReadiness: protectedProcedure.query → ReadinessView` — loads the user's ACTIVE mesocycle (`startDate`, `lengthWeeks`, weeks → sessions → prescriptions → setLogs, filtered/aware of `status = COMPLETED`), runs `readinessInputsFromBlock` + `computeReadiness` + `toReadinessView`, with `currentWeekIndex` from the existing `currentWeekIndex(startDate, lengthWeeks)` helper. Empty/no-timeline → `{ series: [], currentWeekIndex }`.
- **Consumers swap off the fixture:**
  - `src/app/app/readiness/page.tsx` → RSC calls `api.readiness.getReadiness()` (or a `requireReadiness()` cache helper mirroring `current-block`), drops `mockReadiness`. Copy tweak: the subline "In phase 2 this is driven by your wearables" stays (still true).
  - Now-home `src/app/app/page.tsx` + `ReadinessChip` → real `getReadiness`.
  - `ReadinessHeadline` → show Form as a signed **%** (`formPct`), fitness/fatigue as rounded load-index numbers; add the `Building` case (dot + label).
  - `ReadinessChip` `DOT` map (from ④-A colorize) → add a `Building` color (a neutral token, e.g. `bg-fg-muted`), keeping Data-Only-Zone compliance.
- `mock-readiness.ts` stays only if its own tests still reference it; otherwise remove. No other fixture consumers.

### 6. Edge / cold-start

- **No completed sessions / no `startDate`** → `series: []` → `ReadinessChart`'s existing "Not enough data yet"; `ReadinessHeadline`/chip → **Building**.
- **Sparse logs** → fitness stays below `FITNESS_FLOOR` → **Building** until enough load accrues.
- **A week with no completed sessions** → still emitted, sampling the decayed curve (fatigue falls faster than fitness → Form rises, the honest "resting up" signal).
- **Determinism (Law 2):** no invented points; identical logs → identical series. `formPct` guarded (fitness ≥ floor before dividing).

## Data flow

```
getReadiness  [READ]
  load ACTIVE mesocycle (startDate, lengthWeeks, weeks→sessions[status,completedAt]→prescriptions→setLogs)
  → readinessInputsFromBlock → { events (completed only, by dayOffset), weekEndOffsets }
  → computeReadiness (daily PMC EWMA, τ_fit/τ_fat) → ReadinessSample[]
  → toReadinessView(samples, currentWeekIndex) → ReadinessView
Readiness page + Now-home chip/headline render it; readinessState(point) bands on form/fitness (Building floor)
```

## Testing

**Pure / unit-tested (no DB):**
- `sessionStimulus` — RIR weights (0/1→1.0, 2/3→0.7, ≥4→0.4, null→0.7), empty → 0, sums across sets.
- `computeReadiness` — daily decay toward load; rest-day (0) decay; a load spike raises fatigue faster than fitness → Form dips, then recovers on rest; weekly sampling picks the right day; empty events → `[]`; a mid-block deload week → Form rebounds. Injected small τ for deterministic assertions.
- `readinessState` — the four % bands at their boundaries (+5/−10/−30) and the `Building` floor; `fitness` exactly at floor.
- `readinessInputsFromBlock` — only COMPLETED sessions become events; `dayOffset` from `completedAt`−`startDate`; `weekEndOffsets` = `w×7−1`; null `startDate` → null/empty.
- `toReadinessView` — samples → view; `currentWeekIndex` passthrough.

**DB-bound → typecheck/lint gate + user/browser verification (subagents can't touch Neon):**
- The `readiness` router + page/chip wiring. Verify in-browser (Week 4 has real logs): Readiness page shows a real Fitness/Fatigue/Form curve and a banded state; Now-home Form chip matches; a block with no logs shows Building / "Not enough data yet".

**Client → typecheck/lint + visual:** headline Form-% + Building case; chip Building color.

## Files (anticipated)

- Create `src/engine/readiness.ts` (`sessionStimulus`, `computeReadiness`, types) + `.test.ts`; export from `src/engine/index.ts`.
- Modify `src/components/viz/readiness-state.ts` (rework `readinessState`, add `FITNESS_FLOOR`) + `.test.ts`.
- Modify `src/views/types.ts` (`ReadinessLabel += "Building"`).
- Create `src/server/mesocycle/readiness-inputs.ts` (`readinessInputsFromBlock`) + `.test.ts`.
- Create `src/server/api/routers/readiness.ts` (`getReadiness`); register `readiness` on `appRouter`.
- Create `src/views/readiness.ts` (`toReadinessView`) + `.test.ts` (or inline mapper in router).
- Modify `src/app/app/readiness/page.tsx`, `src/app/app/page.tsx` (drop `mockReadiness`, call `getReadiness`).
- Modify `src/components/readiness/readiness-headline.tsx` (Form %, Building), `src/components/readiness/readiness-chip.tsx` (Building color).
- Optionally add `requireReadiness()` to `src/server/mesocycle/current-block.ts` sibling, matching the RSC cache pattern.
- `src/views/_fixtures/mock-readiness.ts` — remove if unreferenced after the swap (keep if a test needs it).

## Success criteria

An athlete who has logged sessions sees a **real** Fitness/Fatigue/Form curve on the Readiness page and a matching Form chip on Now-home, both computed from their logged stimulus load — Fatigue rising through hard weeks, Form dipping and rebounding on lighter/deload weeks, banded athlete-relatively (a high-volume and a low-volume lifter both get sensible Fresh→Overreaching reads). A brand-new or barely-logged block honestly shows **Building** / "Not enough data yet" rather than a fake arc. `mockReadiness` is gone from the app surfaces. Laws 1 & 2 hold (engine owns every number; identical logs → identical readiness); the ①/②/③/④-A paths are untouched; typecheck + lint + existing tests clean.
