# Now Home — Coaching Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Garmin-Coach-style "Now" home at `/app` — a Next-Session hero, a Training-Status rollup, and a Coach-voice card — driven by the existing `MesocycleView` fixture plus a thin deterministic derived-view layer.

**Architecture:** New server-component page at `/app` reads `mockMesocycle`, resolves the current week, and feeds three presentational cards. Two new pure helpers (`nextSession`, `rollUpStatus`) and one new view type family (`CoachNote`, `TrainingStatusView`) form the derived-view seam the integration layer will later backfill from real engine output — with zero component change. No new runtime dependencies.

**Tech Stack:** Next.js 15 (App Router, async server components, `params` as Promise), TypeScript, Tailwind v4 (`@theme` tokens), Vitest, lucide-react, pnpm.

Spec: `docs/superpowers/specs/2026-09-04-now-home-coaching-spine-design.md`.

## Global Constraints

- **Merges into `freddy/experimental`** (standing rule: all features go there), not dev/main.
- **Law 1 — engine owns numbers.** New helpers only *classify/aggregate* existing view-model numbers (via `zoneFor`); they invent no training numbers.
- **Law 2 — no invented claims.** Coach notes are deterministic static text in the fixture now; no LLM. `CoachNote.factKind` records which `DecisionFact` each note will later derive from.
- **Zone tokens are data-only.** `--color-zone-*` (rest grey / building blue / optimal green / max amber) appear only on data marks, never as decorative UI. Accent (`text-accent` / `#0092ff`) stays scarce — do not use it for the priority marker or card chrome.
- **Calm now, flourish later.** Existing tokens + subtle CSS transitions only. No shadergradient / liquid-logo / `motion` / new deps.
- **Fixture-only.** All data comes from `mockMesocycle`. No persistence, no logging, no mutation.
- **Subagent hygiene:** do NOT start dev servers (`pnpm dev`) or run `pkill`/kill processes. Verify with `pnpm typecheck` and `pnpm lint` only. Visual verification is the controller's/user's job.
- **View models live in `src/views/types.ts`.** Components consume view models, never the engine or Prisma.

---

## File Structure

- Modify `src/views/types.ts` — add `CoachNote`, `TrainingStatusView`; add `coachNotes` to `MesocycleView`.
- Modify `src/views/_fixtures/mock-block.ts` — author `coachNotes`.
- Create `src/views/next-session.ts` + `src/views/next-session.test.ts` — `nextSession` helper.
- Create `src/components/viz/roll-up-status.ts` + `src/components/viz/roll-up-status.test.ts` — `rollUpStatus` helper.
- Create `src/components/home/next-session-card.tsx`, `training-status-card.tsx`, `coach-card.tsx` — presentational cards.
- Create `src/app/app/page.tsx` — the Now home (server component).
- Modify `src/components/nav/app-nav.tsx` — add "Now" nav item at top.

`src/components/nav/app-frame.tsx` is intentionally **not** modified: for `pathname === "/app"`, `AppFrame` already yields the centered, 756px-capped single column (no `column2`, not `fullBleed`).

---

## Task 1: View-model additions + fixture coach notes + `nextSession`

**Files:**
- Modify: `src/views/types.ts`
- Modify: `src/views/_fixtures/mock-block.ts`
- Create: `src/views/next-session.ts`
- Test: `src/views/next-session.test.ts`

**Interfaces:**
- Consumes: existing `Zone`, `WeekView`, `SessionView`, `MesocycleView` from `src/views/types.ts`.
- Produces:
  - `interface CoachNote { id: string; tone: "info" | "caution" | "positive"; text: string; factKind?: string; }`
  - `interface TrainingStatusView { label: "Recovering" | "Overreaching" | "Optimal" | "Building"; counts: Record<Zone, number>; inRange: number; total: number; }`
  - `MesocycleView.coachNotes: CoachNote[]`
  - `function nextSession(week: WeekView): SessionView | undefined`

- [ ] **Step 1: Add the new view types**

In `src/views/types.ts`, add these interfaces (place `CoachNote` and `TrainingStatusView` near the top after `Zone`, and add the `coachNotes` field to the existing `MesocycleView` interface):

```ts
export interface CoachNote {
  id: string;
  tone: "info" | "caution" | "positive";
  text: string;
  factKind?: string; // the DecisionFact kind this note will later derive from
}

export interface TrainingStatusView {
  label: "Recovering" | "Overreaching" | "Optimal" | "Building";
  counts: Record<Zone, number>; // rest | building | optimal | max
  inRange: number; // building + optimal + max (muscles at or above MEV)
  total: number; // trained muscles this week
}
```

Add to the existing `MesocycleView` interface (after `weeks: WeekView[];`):

```ts
  coachNotes: CoachNote[];
```

- [ ] **Step 2: Author fixture coach notes**

In `src/views/_fixtures/mock-block.ts`, import `CoachNote` in the existing type import block, then add `coachNotes` to the `mockMesocycle` export (the current week is 3 of 6, deload at week 6, priority SIDE_DELTS):

```ts
  coachNotes: [
    {
      id: "note-chest-ceiling",
      tone: "caution",
      text: "Chest is near its recoverable ceiling — I'm holding its volume steady this week rather than adding more.",
      factKind: "ramp_flattened",
    },
    {
      id: "note-deload",
      tone: "info",
      text: "Deload lands in week 6 to shed the fatigue you're banking now.",
      factKind: "deload_scheduled",
    },
    {
      id: "note-priority",
      tone: "positive",
      text: "Side delts are your priority this block, so they're taking the most direct volume.",
    },
  ],
```

Add `CoachNote` to the existing `import type { … } from "~/views/types";` block.

- [ ] **Step 3: Write the failing test for `nextSession`**

Create `src/views/next-session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SessionView, WeekView } from "~/views/types";
import { nextSession } from "~/views/next-session";

function weekWith(sessions: SessionView[]): WeekView {
  return { index: 1, isDeload: false, isCurrent: true, totalSets: 0, sessions, cells: [] };
}

const session = (slotId: string): SessionView => ({
  slotId,
  label: slotId,
  estimatedMinutes: 40,
  prescriptions: [],
});

describe("nextSession", () => {
  it("returns the first session of the week", () => {
    const week = weekWith([session("upper-a"), session("lower-a")]);
    expect(nextSession(week)?.slotId).toBe("upper-a");
  });

  it("returns undefined when the week has no sessions", () => {
    expect(nextSession(weekWith([]))).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm exec vitest run src/views/next-session.test.ts`
Expected: FAIL — cannot find module `~/views/next-session`.

- [ ] **Step 5: Implement `nextSession`**

Create `src/views/next-session.ts`:

```ts
import type { SessionView, WeekView } from "~/views/types";

/** The next session to train in a week. Skeleton rule: the first session
 * (no completion state yet). Returns undefined for a session-less week. */
export function nextSession(week: WeekView): SessionView | undefined {
  return week.sessions[0];
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec vitest run src/views/next-session.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Verify typecheck**

Run: `pnpm typecheck`
Expected: 0 errors (confirms `coachNotes` satisfies `MesocycleView` and the fixture compiles).

- [ ] **Step 8: Commit**

```bash
git add src/views/types.ts src/views/_fixtures/mock-block.ts src/views/next-session.ts src/views/next-session.test.ts
git commit -m "feat(home): coach-note + training-status view types, fixture notes, nextSession helper"
```

---

## Task 2: `rollUpStatus` training-status helper

**Files:**
- Create: `src/components/viz/roll-up-status.ts`
- Test: `src/components/viz/roll-up-status.test.ts`

**Interfaces:**
- Consumes: `zoneFor` from `~/components/viz/zone`; `WeekView`, `MuscleWeekCell`, `Zone`, `TrainingStatusView` from `~/views/types` (Task 1).
- Produces: `function rollUpStatus(week: WeekView): TrainingStatusView`

**Rule (top-down, first match wins):**
1. `week.isDeload` → `"Recovering"`
2. any cell in zone `max` → `"Overreaching"`
3. `optimal` cells are a strict majority of trained muscles (`counts.optimal * 2 > total`) → `"Optimal"`
4. otherwise → `"Building"`

`inRange` = `building + optimal + max` (cells at or above MEV; `rest` is below MEV). A zero-cell week returns `total: 0`, `inRange: 0`, label `"Building"`.

- [ ] **Step 1: Write the failing test**

Create `src/components/viz/roll-up-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MuscleGroup } from "~/schema";
import type { MuscleWeekCell, WeekView } from "~/views/types";
import { rollUpStatus } from "~/components/viz/roll-up-status";

// Landmarks: mev=10, mav=16, mrv=22 → <10 rest, <16 building, <22 optimal, >=22 max.
const cell = (muscle: MuscleGroup, plannedSets: number): MuscleWeekCell => ({
  muscle,
  weekIndex: 1,
  plannedSets,
  mev: 10,
  mav: 16,
  mrv: 22,
});

function week(cells: MuscleWeekCell[], isDeload = false): WeekView {
  return { index: 1, isDeload, isCurrent: true, totalSets: 0, sessions: [], cells };
}

describe("rollUpStatus", () => {
  it("labels a deload week Recovering regardless of volume", () => {
    const w = week([cell("CHEST", 18), cell("BACK", 18)], true);
    expect(rollUpStatus(w).label).toBe("Recovering");
  });

  it("labels Overreaching when any muscle is at max", () => {
    const w = week([cell("CHEST", 22), cell("BACK", 12), cell("QUADS", 12)]);
    expect(rollUpStatus(w).label).toBe("Overreaching");
  });

  it("labels Optimal when optimal is a strict majority", () => {
    const w = week([cell("CHEST", 18), cell("BACK", 18), cell("QUADS", 12)]);
    const s = rollUpStatus(w);
    expect(s.label).toBe("Optimal");
    expect(s.counts.optimal).toBe(2);
  });

  it("labels Building when optimal is not a strict majority", () => {
    const w = week([cell("CHEST", 18), cell("BACK", 12)]);
    expect(rollUpStatus(w).label).toBe("Building");
  });

  it("counts inRange as cells at or above MEV", () => {
    const w = week([cell("CHEST", 18), cell("BACK", 12), cell("QUADS", 4)]);
    const s = rollUpStatus(w);
    expect(s.inRange).toBe(2); // 18 optimal + 12 building; 4 is rest
    expect(s.counts.rest).toBe(1);
    expect(s.total).toBe(3);
  });

  it("handles a zero-cell week", () => {
    const s = rollUpStatus(week([]));
    expect(s).toMatchObject({ label: "Building", total: 0, inRange: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/components/viz/roll-up-status.test.ts`
Expected: FAIL — cannot find module `~/components/viz/roll-up-status`.

- [ ] **Step 3: Implement `rollUpStatus`**

Create `src/components/viz/roll-up-status.ts`:

```ts
import { zoneFor } from "~/components/viz/zone";
import type { TrainingStatusView, WeekView, Zone } from "~/views/types";

/** Roll a week's per-muscle zones into a single training-status readout.
 * Classification only — invents no numbers (Law 1). Rule is top-down,
 * first match wins: deload → Recovering; any muscle at max → Overreaching;
 * optimal a strict majority → Optimal; else Building. */
export function rollUpStatus(week: WeekView): TrainingStatusView {
  const counts: Record<Zone, number> = { rest: 0, building: 0, optimal: 0, max: 0 };
  for (const cell of week.cells) {
    counts[zoneFor(cell.plannedSets, cell)] += 1;
  }
  const total = week.cells.length;
  const inRange = counts.building + counts.optimal + counts.max;

  let label: TrainingStatusView["label"];
  if (week.isDeload) label = "Recovering";
  else if (counts.max > 0) label = "Overreaching";
  else if (counts.optimal * 2 > total) label = "Optimal";
  else label = "Building";

  return { label, counts, inRange, total };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/components/viz/roll-up-status.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/viz/roll-up-status.ts src/components/viz/roll-up-status.test.ts
git commit -m "feat(home): rollUpStatus — per-week training-status readout from zones"
```

---

## Task 3: Home card components

**Files:**
- Create: `src/components/home/next-session-card.tsx`
- Create: `src/components/home/training-status-card.tsx`
- Create: `src/components/home/coach-card.tsx`

**Interfaces:**
- Consumes: `SessionView`, `TrainingStatusView`, `CoachNote`, `Zone` from `~/views/types`; lucide-react icons.
- Produces:
  - `NextSessionCard({ session, blockId, weekIndex }: { session: SessionView | undefined; blockId: string; weekIndex: number })`
  - `TrainingStatusCard({ status }: { status: TrainingStatusView })`
  - `CoachCard({ notes }: { notes: CoachNote[] })`

These are presentational (no unit tests, matching the existing `src/components/block/*` convention); gated by `pnpm typecheck` + `pnpm lint` and the user's visual check. Styling: existing tokens only; zone tokens only on data; accent stays scarce.

- [ ] **Step 1: Implement `NextSessionCard` (hero)**

Create `src/components/home/next-session-card.tsx`:

```tsx
import Link from "next/link";
import { ArrowRight, Dumbbell } from "lucide-react";
import type { SessionView } from "~/views/types";

export function NextSessionCard({
  session,
  blockId,
  weekIndex,
}: {
  session: SessionView | undefined;
  blockId: string;
  weekIndex: number;
}) {
  if (!session) {
    return (
      <div className="rounded-card border border-border bg-surface p-6">
        <div className="text-eyebrow font-medium text-fg-soft">Next session</div>
        <div className="mt-2 text-card-title text-fg-muted">No session scheduled</div>
      </div>
    );
  }
  const exercises = session.prescriptions.map((p) => p.exerciseName);
  const shown = exercises.slice(0, 4).join(" · ");
  const more = exercises.length > 4 ? ` · +${exercises.length - 4}` : "";
  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="text-eyebrow font-medium text-fg-soft">Next session</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-section text-fg">{session.label}</span>
        {session.dayTag ? <span className="text-nav text-fg-subtle">{session.dayTag}</span> : null}
      </div>
      <div className="mt-1 text-card-desc text-fg-muted">
        {session.prescriptions.length} exercises · ~{session.estimatedMinutes} min
      </div>
      <div className="mt-3 text-nav text-fg-subtle">
        {shown}
        {more}
      </div>
      <Link
        href={`/app/block/${blockId}/week/${weekIndex}`}
        className="mt-5 inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2 text-nav font-medium text-white transition-colors hover:bg-accent-strong"
      >
        <Dumbbell className="size-4" aria-hidden />
        Start session
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Implement `TrainingStatusCard`**

Create `src/components/home/training-status-card.tsx`. The dot and distribution strip use zone tokens (data); the label maps to its zone-ish color intent. Build the strip from `counts` proportionally.

```tsx
import type { TrainingStatusView, Zone } from "~/views/types";

const DOT: Record<TrainingStatusView["label"], string> = {
  Recovering: "bg-zone-rest",
  Building: "bg-zone-building",
  Optimal: "bg-zone-optimal",
  Overreaching: "bg-zone-max",
};

const STRIP: Record<Zone, string> = {
  rest: "bg-zone-rest",
  building: "bg-zone-building",
  optimal: "bg-zone-optimal",
  max: "bg-zone-max",
};

const ORDER: Zone[] = ["rest", "building", "optimal", "max"];

export function TrainingStatusCard({ status }: { status: TrainingStatusView }) {
  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="text-eyebrow font-medium text-fg-soft">Training status</div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`size-2.5 rounded-full ${DOT[status.label]}`} aria-hidden />
        <span className="text-card-title text-fg">{status.label}</span>
      </div>
      <div className="mt-1 text-card-desc text-fg-muted">
        {status.total === 0
          ? "No volume planned"
          : `${status.inRange} of ${status.total} muscles in range`}
      </div>
      {status.total > 0 ? (
        <div className="mt-4 flex h-2 overflow-hidden rounded-pill" aria-hidden>
          {ORDER.map((zone) =>
            status.counts[zone] > 0 ? (
              <div
                key={zone}
                className={STRIP[zone]}
                style={{ flexGrow: status.counts[zone] }}
              />
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Implement `CoachCard`**

Create `src/components/home/coach-card.tsx`. Renders nothing when `notes` is empty. Tone maps to a small left marker using `fg` shades (not accent, not zone tokens — coach voice is not data).

```tsx
import type { CoachNote } from "~/views/types";

const TONE: Record<CoachNote["tone"], string> = {
  info: "text-fg-muted",
  caution: "text-fg-soft",
  positive: "text-fg-soft",
};

export function CoachCard({ notes }: { notes: CoachNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="text-eyebrow font-medium text-fg-soft">Coach</div>
      <ul className="mt-3 flex flex-col gap-3">
        {notes.map((note) => (
          <li key={note.id} className={`text-card-desc ${TONE[note.tone]}`}>
            {note.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/next-session-card.tsx src/components/home/training-status-card.tsx src/components/home/coach-card.tsx
git commit -m "feat(home): next-session, training-status, and coach cards"
```

---

## Task 4: The Now home page + nav item

**Files:**
- Create: `src/app/app/page.tsx`
- Modify: `src/components/nav/app-nav.tsx`

**Interfaces:**
- Consumes: `mockMesocycle` from `~/views/_fixtures/mock-block`; `nextSession` (Task 1); `rollUpStatus` (Task 2); the three cards (Task 3); `NavItem` from `~/components/ui-kit/app-shell-kit`.
- Produces: the `/app` route; a "Now" nav row.

- [ ] **Step 1: Implement the Now home page**

Create `src/app/app/page.tsx` (server component; the current week is resolved by `currentWeekIndex`):

```tsx
import { nextSession } from "~/views/next-session";
import { rollUpStatus } from "~/components/viz/roll-up-status";
import { NextSessionCard } from "~/components/home/next-session-card";
import { TrainingStatusCard } from "~/components/home/training-status-card";
import { CoachCard } from "~/components/home/coach-card";
import { mockMesocycle } from "~/views/_fixtures/mock-block";

export default function NowHome() {
  const block = mockMesocycle;
  const week =
    block.weeks.find((w) => w.index === block.currentWeekIndex) ?? block.weeks[0];
  const session = week ? nextSession(week) : undefined;
  const status = week ? rollUpStatus(week) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="text-eyebrow font-medium text-fg-soft">{block.splitLabel}</div>
        <h1 className="mt-1 text-page-title text-fg">
          Week {block.currentWeekIndex} of {block.blockLengthWeeks}
        </h1>
        <p className="mt-1 text-card-desc text-fg-muted">{block.name}</p>
      </header>

      <NextSessionCard
        session={session}
        blockId={block.id}
        weekIndex={block.currentWeekIndex}
      />

      <div className="grid gap-6 md:grid-cols-2">
        {status ? <TrainingStatusCard status={status} /> : null}
        <CoachCard notes={block.coachNotes} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the "Now" nav item**

In `src/components/nav/app-nav.tsx`, import `Home` from lucide-react (add to the existing import), and add this `NavItem` as the **first** child of the `<nav>` block, before the `Block` item:

```tsx
        <NavItem appearance="neutral" href="/app" label="Now" icon={Home} matchPatterns={["/app"]} />
```

`matchPatterns={["/app"]}` is an exact match (`isNavItemActive` only prefix-matches on a trailing `/*`), so "Now" is active solely on the Now home and never on `/app/block`, `/app/analysis`, etc.

- [ ] **Step 3: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 errors.

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test`
Expected: all suites pass, including the two new ones from Tasks 1–2.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/page.tsx src/components/nav/app-nav.tsx
git commit -m "feat(home): mount Now home at /app with Now nav item"
```

---

## Self-Review (author checklist — done)

- **Spec coverage:** IA/routing (Task 4) · Next-Session hero (Task 3/4) · Training-Status rollup (Task 2/3/4) · Coach card (Task 1/3/4) · derived-view layer `nextSession`/`rollUpStatus`/`CoachNote`/`TrainingStatusView` (Tasks 1–2) · empty/error handling (empty session, zero-muscle week, empty notes — covered in components + `rollUpStatus`) · testing (Tasks 1–2) · deferred items untouched. `AppFrame` change from the spec dropped as dead code (default already centers) — noted above.
- **Placeholders:** none — every step carries real code/commands.
- **Type consistency:** `nextSession(week)`, `rollUpStatus(week): TrainingStatusView`, card props, and `MesocycleView.coachNotes` are used identically across tasks; `zoneFor(volume, {mev,mav,mrv})` matches `src/components/viz/zone.ts`; route href `/app/block/{id}/week/{n}` matches the existing `[blockId]/week/[n]` route.
