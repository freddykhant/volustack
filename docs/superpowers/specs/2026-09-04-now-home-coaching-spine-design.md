# Now Home — Coaching Spine (Design)

**Status:** Approved 2026-09-04
**Scope:** Experience-layer enhancement. Skeleton MVP.
**Branch target:** merges into `freddy/experimental` (standing rule: all features go there).

## Problem

Mesodapt's engine already produces coaching intelligence — `stepWeek`,
`evaluateDeload`, `redistributeWeek`, and the `DecisionFact` stream mean every
number carries a *why*. But the experience layer renders that intelligence as a
static spreadsheet (`/app/block` grid, week detail, analysis) that the athlete
must decode themselves. There is no front door that answers the coaching
questions **"what do I do now, and why?"**

The goal is to give the existing intelligence a **voice and a face**: a
Garmin-Coach-style "Now" home that leads with the next action, surfaces training
state at a glance, and speaks the plan's reasoning in plain language — beautiful
and glanceable, useful first.

This is a **skeleton MVP**: it proves the coaching experience on the existing
`MesocycleView` **fixture** plus a thin deterministic derived-view layer. No new
runtime dependencies. When the persistence/integration layer lands, it backfills
the same view fields with real engine output and **zero component changes** —
that is exactly what the view-model contract (`src/views/types.ts`) was built
for.

## Non-goals (explicitly deferred, named so they don't leak in)

- **Logging / session-completion state** → persistence/integration layer. In
  this skeleton, "next session" is derived structurally and "Start session"
  navigates (read-only); nothing is recorded.
- **LLM phrasing of coach notes** → AI-orchestration layer. Coach notes are
  deterministic templated text now; Law 2 keeps the engine as the source of
  every claim, and the AI layer later swaps templates for phrasing without
  touching the surface.
- **Real `DecisionFact` → `CoachNote` mapping** → integration layer. The
  fixture authors static notes now.
- **Visual flourish** (shadergradient / liquid-logo / `motion`) → dedicated
  later pass. This slice is "calm now": existing tokens + subtle CSS
  transitions only. See `docs/design/ui-libraries.md`.

## Architecture

### Information architecture & routing

- **New front door: `/app` → the Now home.** Today `/app` has no page; nav
  jumps straight to `/app/block`. Post-sign-in lands on `/app`.
- Add a **"Now"** item at the **top** of `AppNav` (Home/Activity icon). Existing
  items (`Block`, `Analysis`, `Coach`, `Library`, `Settings`) stay unchanged and
  become the "zoom out" / detail destinations the home links into.
- The Now home is a **centered single-column focus surface** — *not*
  `fullBleed`, no `column2` (unlike `/app/block` and `/app/analysis`).
  `AppFrame`'s pathname logic gains a case for the `/app` root: `isNow` when
  `pathname === "/app"`, which selects the centered treatment.

### The three home modules

All are pure presentational components that read the existing `MesocycleView`
fixture plus the new derived-view fields below. Calm styling: existing tokens,
subtle CSS transitions, zone tokens only on data.

1. **`NextSessionCard` (hero)** — the dominant element. Resolves the next
   session to train from the current week and shows: session `label`
   ("Upper A"), `dayTag`, exercise count, `estimatedMinutes`, a truncated
   exercise-name list, and a primary **"Start session →"** button that navigates
   to the read-only week/session detail (`/app/block/[blockId]/week/[n]`).
   *Skeleton "next" rule:* the first session of the current week (no completion
   state yet).

2. **`TrainingStatusCard`** — one rolled-up status label + a glanceable mini-viz
   reusing the existing zone visual language (a compact zone-distribution strip;
   the body-map may be reused if it composes cleanly). Reads like
   *"● Building · 9 of 12 in range."*

3. **`CoachCard`** — renders the block's 2–3 `coachNotes` as short plain-language
   lines, each toned (info / caution / positive). **Links out to `/app/coach`**
   for the fuller view.

### Thin coaching data layer (deterministic, pure, fixture-backed now)

Added to the view layer so the integration layer backfills it later with zero
component change:

- **`rollUpStatus(week: WeekView): TrainingStatusView`** — pure function.
  Runs each `MuscleWeekCell` through the existing `zoneFor`, counts cells by
  zone, and maps to one status label by this rule (evaluated top-down,
  first match wins):
  1. `week.isDeload` → **`"Recovering"`**
  2. any cell in zone `max` → **`"Overreaching"`**
  3. `optimal` cells are a strict majority of trained muscles (`optimal * 2 > total`)
     → **`"Optimal"`**
  4. otherwise → **`"Building"`**

  Returns:
  ```ts
  interface TrainingStatusView {
    label: "Recovering" | "Overreaching" | "Optimal" | "Building";
    counts: Record<Zone, number>; // rest | building | optimal | max
    inRange: number; // building + optimal + max (i.e. at or above MEV)
    total: number;   // trained muscles this week
  }
  ```
  Location: `src/components/viz/` (sibling to `zone.ts`), since it is part of
  the zone visual language. Later the engine may author this field directly;
  the component contract does not change.

- **`CoachNote`** view type, added to the view model:
  ```ts
  interface CoachNote {
    id: string;
    tone: "info" | "caution" | "positive";
    text: string;
    factKind?: string; // the DecisionFact kind this note will derive from later
  }
  ```
  Added to `MesocycleView` as `coachNotes: CoachNote[]`. The fixture authors
  static notes matching its state (e.g. a chest-at-ceiling caution, a
  deload-scheduled info, a recovering-well positive). Later the integration
  layer maps real `DecisionFact`s → `CoachNote`s (the future home of
  AI-orchestration phrasing); the component only ever renders notes.

- **`nextSession(week: WeekView): SessionView | undefined`** — pure helper
  returning the first session of the given week (skeleton rule above).
  Location: `src/views/` (view-model helper).

## Data flow

```
mock-block.ts (fixture MesocycleView, now incl. coachNotes)
        │
        ├─ /app page (server) → picks current week via currentWeekIndex
        │        │
        │        ├─ nextSession(currentWeek)      → NextSessionCard
        │        ├─ rollUpStatus(currentWeek)     → TrainingStatusCard
        │        └─ view.coachNotes               → CoachCard
        │
        └─ (later) integration layer replaces the fixture with engine output;
           coachNotes come from DecisionFacts; components unchanged.
```

## Error / empty handling

- `nextSession` returns `undefined` when the current week has no sessions
  (e.g. a fully-deloaded/empty week). `NextSessionCard` renders a calm empty
  state ("No session scheduled") rather than crashing.
- `rollUpStatus` on a week with zero trained muscles returns
  `total: 0, inRange: 0` and label `"Building"`; `TrainingStatusCard` shows
  "No volume planned" instead of "0 of 0 in range".
- `coachNotes` empty → `CoachCard` renders nothing (the card is omitted), not an
  empty shell.

## Testing

- **`rollUpStatus`** — table-driven unit tests (mirroring `zone.test.ts`):
  a deload week → `Recovering`; a week containing a `max`-zone muscle →
  `Overreaching`; a week where `optimal` is a strict majority → `Optimal`;
  a low-volume week → `Building`; a zero-muscle week → `Building` with
  `total: 0`.
- **`nextSession`** — returns the first session of a populated week; returns
  `undefined` for a session-less week.
- **Fixture reconciliation** — a test asserting `coachNotes` are well-formed
  (non-empty `id`/`text`, valid `tone`) and that any `factKind` present is a
  plausible `DecisionFact` kind.
- Typecheck + lint are the automated gate. **Visual verification stays with the
  user** (`pnpm dev`); implementer subagents must NOT start dev servers or kill
  processes (standing rule from the experience-layer work).

## Files (anticipated)

- Modify `src/views/types.ts` — add `CoachNote`, `TrainingStatusView`,
  `MesocycleView.coachNotes`.
- Modify `src/views/_fixtures/mock-block.ts` — author `coachNotes`.
- Create `src/views/next-session.ts` (+ test) — `nextSession` helper.
- Create `src/components/viz/roll-up-status.ts` (+ `roll-up-status.test.ts`).
- Create `src/components/home/next-session-card.tsx`,
  `training-status-card.tsx`, `coach-card.tsx`.
- Create `src/app/app/page.tsx` — the Now home (server component).
- Modify `src/components/nav/app-frame.tsx` — `isNow` centered case.
- Modify `src/components/nav/app-nav.tsx` — add "Now" nav item at top.

## Success criteria

Navigating to `/app` shows a centered Now home: a Next-Session hero that opens
the real read-only session view, a Training-Status card driven by the live zone
rollup, and a Coach card speaking the fixture's notes — all on the existing
fixture, all deterministic, all green (typecheck + tests), and structured so the
integration layer swaps in real data without touching a component.
