# Readiness + Next-Best-Workout — Depth POC (Design)

**Status:** Approved 2026-09-05
**Scope:** Experience-layer depth POC. Skeleton, faked data, no polish.
**North star:** Mesodapt = the all-in-one **volume / training / recovery management layer** for athletes balancing multiple sports *or* a single discipline. Reference experience: the Stamina triathlon app (onboard → plan → next-best-workout → coach "why" → Fitness/Fatigue/Form → trends).
**Builds on:** the Now home (`freddy/feat/now-home`). Depends on the Next-Session hero and nav being in place.
**Branch target:** merges into `freddy/experimental` (standing rule).

## Problem

Mesodapt has the middle of the Stamina coaching loop (the Now home: next session + training status + coach voice). Two loop stages that most express the "adaptive recovery" vision are missing:

1. **Readiness (Fitness · Fatigue · Form)** — the recovery surface that shows whether the athlete is fresh, accumulating, or digging too deep, and *why the plan behaves as it does*. Today the engine's fatigue/landmark model is the analog; in phase 2 this is fed by real biodata (Garmin / Strava / Bevel). Same surface, deeper data later.
2. **Next-Best-Workout swap** — Stamina's signature interaction: swap a session for an easier or harder option that still fits the plan. Mesodapt's engine already has the logic (`redistributeWeek`, `swap_suggested`); this surfaces it.

This is a **depth POC**: prove the loop feels best-in-class on one discipline (strength) with **faked data**. It is explicitly *not* polished.

## Non-goals (deferred, named)

- **Onboarding → plan** and **Trends / history** → after backend integration (user's call).
- **Real biodata** (Garmin / Strava / Bevel) → phase 2. Readiness data is a fixture now.
- **Swap persistence** → phase 2. The swap is an ephemeral client-state POC interaction; nothing is saved.
- **A readiness color family / visual polish** → polish pass. This POC is monochrome/fg-based on the readiness surface (see "Rendering" below); no new color tokens.
- **Multi-sport surfaces** → phase 2. But view models here are discipline-agnostic so phase-2 reuse needs no rework.

## Architecture

### Discipline-agnostic principle

`ReadinessView`, `ReadinessPoint`, `SwapOption`, and the session/swap concepts carry **zero muscle-specific fields**. Fitness/fatigue/form/load and "swap easier/harder" are training concepts, not hypertrophy concepts. Muscle-specific data stays confined to the block/analysis surfaces. Phase-2 endurance reuses these exact view models.

### A. Readiness surface

- **New page `/app/readiness`** + a "Readiness" nav item (after "Analysis"). Analysis stays about *plan volume*; Readiness is about *recovery*.
- **Model** (the endurance PMC applied to strength):
  - **Fitness** — slow-moving chronic load.
  - **Fatigue** — fast-moving acute load.
  - **Form = Fitness − Fatigue** — freshness.
- **Pure helper** `readinessState(form): ReadinessLabel`, banded top-down (first match wins), analogous to `zoneFor`:
  1. `form >= 5` → `"Fresh"`
  2. `form >= -10` → `"Productive"`
  3. `form >= -25` → `"Fatigued"`
  4. otherwise → `"Overreaching"`
  Location: `src/components/viz/readiness-state.ts` (sibling to `zone.ts`).
- **View model** (`src/views/types.ts`):
  ```ts
  export type ReadinessLabel = "Fresh" | "Productive" | "Fatigued" | "Overreaching";

  export interface ReadinessPoint {
    weekIndex: number; // 1-based, aligned to the block's weeks
    fitness: number;
    fatigue: number;
    form: number; // = fitness - fatigue
  }

  export interface ReadinessView {
    series: ReadinessPoint[];
    currentWeekIndex: number;
  }
  ```
- **Fixture** (`src/views/_fixtures/mock-readiness.ts`), aligned to the 6-week mock block (current week 3, deload week 6). The narrative arc *is* the point — form declines into overreaching, then the deload rebounds it to fresh:

  | wk | fitness | fatigue | form | state |
  |----|---------|---------|------|-------|
  | 1  | 32 | 28 | +4  | Productive |
  | 2  | 38 | 42 | −4  | Productive |
  | 3 (current) | 44 | 56 | −12 | Fatigued |
  | 4  | 49 | 66 | −17 | Fatigued |
  | 5  | 53 | 80 | −27 | Overreaching |
  | 6 (deload) | 51 | 30 | +21 | Fresh |

- **Components** (`src/components/readiness/`):
  - `ReadinessHeadline` — current state label + the three current numbers (fitness/fatigue/form). Current point = `series.find(p => p.weekIndex === currentWeekIndex)`.
  - `ReadinessChart` — a hand-rolled inline **SVG line chart** (no new deps, same approach as `landmark-bar.tsx`) plotting the three series across weeks, with a small legend and the current week marked.
  - `ReadinessChip` — a compact "Form: {state} →" chip used on the Now home, linking to `/app/readiness`.

- **Loop tie-in:** the Now home renders `ReadinessChip` in its header, linking to the Readiness surface.

### B. Next-Best-Workout swap

- **View type** (`src/views/types.ts`):
  ```ts
  export interface SwapOption {
    id: string;
    intent: "easier" | "harder";
    label: string;   // "Easier" | "Harder"
    summary: string; // "−2 sets · RIR 3 · ~46 min"
  }
  ```
  Add `swapOptions?: SwapOption[]` to `SessionView`.
- **Fixture:** `mock-block.ts` gives the current week's first session (`upper-a`) an easier + harder `SwapOption`.
- **Component** `src/components/home/session-swap-control.tsx` — a **client** component (`"use client"`):
  - Collapsed: a "Swap session" text button (muted, not accent).
  - Expanded: the easier/harder options as choosable rows (each shows `label` + `summary`).
  - After a choice: an ephemeral confirmation — *"Swapped to {label} · still fits your plan"* — with an "Undo" / "Back to planned" affordance. **Nothing persists.**
  - **Readiness cross-link:** the control accepts the current `ReadinessLabel`; when it is `Fatigued` or `Overreaching`, the easier option carries a hint *"Fatigue high — consider easier."*
- **Placement:** embedded in the Now-home Next-Session hero (`NextSessionCard`), under the "Start session" button. `NextSessionCard` stays a server component and mounts the client control as a child. Trivially reusable on week-detail session cards later (out of scope).

## Rendering / styling

- **Calm / skeleton, no polish.** Existing tokens only; subtle CSS transitions only; no new dependencies.
- **Readiness surface is monochrome/fg-based:** Form is the emphasized line (strongest `fg`), Fitness a solid `fg-soft` line, Fatigue a dashed `fg-subtle` line, with a text legend. **Zone tokens are NOT reused here** — they mean landmark zones only; readiness is a different data family, and a proper readiness color family is an explicit polish follow-up.
- **Accent stays scarce:** the only accent remains the Now-home "Start session" button. Swap and readiness use `fg` shades.

## Error / empty handling

- `ReadinessChart` with `<2` points renders a calm "Not enough data yet" state instead of a degenerate chart.
- `ReadinessHeadline` when the current week has no point falls back to the last point in the series.
- `SessionSwapControl` with no `swapOptions` renders nothing (the control is omitted).

## Testing

- `readinessState` — table-driven unit tests: `10→Fresh`, `5→Fresh` (boundary), `0→Productive`, `-10→Productive` (boundary), `-12→Fatigued`, `-25→Fatigued` (boundary), `-30→Overreaching`.
- `mock-readiness` reconciliation — a test asserting the series has 6 points, `form === fitness - fatigue` for every point, and the current week (3) is present.
- Swap is a client interaction → typecheck + lint + the user's visual check (matching the presentational-component convention). No unit test.

## Files (anticipated)

- Modify `src/views/types.ts` — `ReadinessLabel`, `ReadinessPoint`, `ReadinessView`, `SwapOption`; `SessionView.swapOptions?`.
- Create `src/views/_fixtures/mock-readiness.ts` (+ test).
- Modify `src/views/_fixtures/mock-block.ts` — `swapOptions` on `upper-a`.
- Create `src/components/viz/readiness-state.ts` (+ test).
- Create `src/components/readiness/readiness-headline.tsx`, `readiness-chart.tsx`, `readiness-chip.tsx`.
- Create `src/components/home/session-swap-control.tsx` (client).
- Create `src/app/app/readiness/page.tsx`.
- Modify `src/components/home/next-session-card.tsx` — mount `SessionSwapControl`.
- Modify `src/app/app/page.tsx` — render `ReadinessChip` in the header.
- Modify `src/components/nav/app-nav.tsx` — add "Readiness" nav item.

## Success criteria

`/app/readiness` shows a readiness headline and a Fitness/Fatigue/Form chart whose arc visibly explains the week-6 deload; the Now home carries a Form chip linking to it; and the Now-home hero offers a working easier/harder swap that confirms "still fits your plan" and can be undone — all on faked, discipline-agnostic view models, green (typecheck + tests), structured so phase-2 biodata and multi-sport slot in without reworking these surfaces.
