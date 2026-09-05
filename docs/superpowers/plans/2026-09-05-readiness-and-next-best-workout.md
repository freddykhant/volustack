# Readiness + Next-Best-Workout — Depth POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two Stamina-style loop stages to the experience: a Fitness/Fatigue/Form **Readiness** surface at `/app/readiness`, and an ephemeral **Next-Best-Workout swap** on the Now-home hero — both on faked, discipline-agnostic view models.

**Architecture:** A pure `readinessState` band-classifier (like `zoneFor`), a fixture readiness arc aligned to the mock block, a dedicated readiness page with a hand-rolled SVG line chart, and a client swap control mounted in the existing `NextSessionCard`. A Form chip on the Now home links the loop together.

**Tech Stack:** Next.js 15 (App Router, server + client components), TypeScript, Tailwind v4 (`@theme` tokens; `stroke-*` utilities are auto-generated from color tokens), Vitest, lucide-react, pnpm.

Spec: `docs/superpowers/specs/2026-09-05-readiness-and-next-best-workout-design.md`. Builds on the Now home (`src/app/app/page.tsx`, `src/components/home/next-session-card.tsx`, `src/components/nav/app-nav.tsx`).

## Global Constraints

- **Merges into `freddy/experimental`** (standing rule).
- **Law 1 — engine/data owns numbers.** `readinessState` only *classifies* an existing Form number; it invents none. Readiness values are fixture data now, biodata in phase 2.
- **Law 2 — no invented claims.** No LLM; the swap "still fits your plan" copy and the readiness arc are deterministic fixtures.
- **Discipline-agnostic view models.** `ReadinessView`, `ReadinessPoint`, `SwapOption` carry NO muscle-specific fields — phase-2 endurance reuses them verbatim.
- **Readiness surface is monochrome/fg-based.** Do NOT use `--color-zone-*` tokens on the readiness surface (they mean landmark zones only). Form = strongest `fg`, Fitness = `fg-soft`, Fatigue = dashed `fg-subtle`. No new color tokens.
- **Accent stays scarce** — the only accent remains the Now-home "Start session" button. Swap and readiness use `fg` shades.
- **Swap is ephemeral** — client state only; nothing persists (persistence is phase 2).
- **Calm/skeleton, no polish.** Existing tokens + subtle CSS transitions only. No new runtime dependencies.
- **Subagent hygiene:** do NOT start dev servers (`pnpm dev`) or run `pkill`/kill processes. Verify with `pnpm typecheck`, `pnpm lint`, and `pnpm exec vitest run` only. Visual verification is the user's job.

---

## File Structure

- Modify `src/views/types.ts` — `ReadinessLabel`, `ReadinessPoint`, `ReadinessView`, `SwapOption`; `SessionView.swapOptions?`.
- Create `src/components/viz/readiness-state.ts` + `.test.ts`.
- Create `src/views/_fixtures/mock-readiness.ts` + `.test.ts`.
- Modify `src/views/_fixtures/mock-block.ts` — `swapOptions` on the `upper-a` session.
- Create `src/components/readiness/readiness-headline.tsx`, `readiness-chart.tsx`, `readiness-chip.tsx`.
- Create `src/app/app/readiness/page.tsx`.
- Modify `src/components/nav/app-nav.tsx` — "Readiness" nav item.
- Create `src/components/home/session-swap-control.tsx` (client).
- Modify `src/components/home/next-session-card.tsx` — mount the swap control.
- Modify `src/app/app/page.tsx` — Form chip + pass readiness label to the hero.

`src/components/nav/app-frame.tsx` needs no change: `/app/readiness` is neither `isTraining` nor `isAnalysis`, so it already renders the centered single column.

---

## Task 1: View types + `readinessState` helper

**Files:**
- Modify: `src/views/types.ts`
- Create: `src/components/viz/readiness-state.ts`
- Test: `src/components/viz/readiness-state.test.ts`

**Interfaces:**
- Consumes: existing `SessionView` in `src/views/types.ts`.
- Produces:
  - `type ReadinessLabel = "Fresh" | "Productive" | "Fatigued" | "Overreaching"`
  - `interface ReadinessPoint { weekIndex: number; fitness: number; fatigue: number; form: number }`
  - `interface ReadinessView { series: ReadinessPoint[]; currentWeekIndex: number }`
  - `interface SwapOption { id: string; intent: "easier" | "harder"; label: string; summary: string }`
  - `SessionView.swapOptions?: SwapOption[]`
  - `function readinessState(form: number): ReadinessLabel`

- [ ] **Step 1: Add the view types**

In `src/views/types.ts`, add (place the readiness types near `Zone`; add `swapOptions` to the existing `SessionView` interface, and add `SwapOption` near it):

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

export interface SwapOption {
  id: string;
  intent: "easier" | "harder";
  label: string; // "Easier" | "Harder"
  summary: string; // "−2 sets · RIR 3 · ~46 min"
}
```

Add to the existing `SessionView` interface (after `prescriptions: PrescriptionView[];`):

```ts
  swapOptions?: SwapOption[];
```

- [ ] **Step 2: Write the failing test**

Create `src/components/viz/readiness-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readinessState } from "~/components/viz/readiness-state";

describe("readinessState", () => {
  it("bands Form top-down, first match wins", () => {
    expect(readinessState(10)).toBe("Fresh");
    expect(readinessState(5)).toBe("Fresh"); // boundary
    expect(readinessState(0)).toBe("Productive");
    expect(readinessState(-10)).toBe("Productive"); // boundary
    expect(readinessState(-12)).toBe("Fatigued");
    expect(readinessState(-25)).toBe("Fatigued"); // boundary
    expect(readinessState(-30)).toBe("Overreaching");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run src/components/viz/readiness-state.test.ts`
Expected: FAIL — cannot find module `~/components/viz/readiness-state`.

- [ ] **Step 4: Implement `readinessState`**

Create `src/components/viz/readiness-state.ts`:

```ts
import type { ReadinessLabel } from "~/views/types";

/** Band a Form value (Fitness − Fatigue) into a readiness state. Classification
 * only — invents no numbers (Law 1). Top-down, first match wins. */
export function readinessState(form: number): ReadinessLabel {
  if (form >= 5) return "Fresh";
  if (form >= -10) return "Productive";
  if (form >= -25) return "Fatigued";
  return "Overreaching";
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run src/components/viz/readiness-state.test.ts`
Expected: PASS (1 test, 7 assertions).

- [ ] **Step 6: Verify typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/views/types.ts src/components/viz/readiness-state.ts src/components/viz/readiness-state.test.ts
git commit -m "feat(readiness): readiness/swap view types + readinessState band helper"
```

---

## Task 2: Readiness fixture + swap-option fixture

**Files:**
- Create: `src/views/_fixtures/mock-readiness.ts`
- Test: `src/views/_fixtures/mock-readiness.test.ts`
- Modify: `src/views/_fixtures/mock-block.ts`

**Interfaces:**
- Consumes: `ReadinessPoint`, `ReadinessView`, `SwapOption` from `~/views/types` (Task 1).
- Produces: `export const mockReadiness: ReadinessView`; `swapOptions` on the `mock-block` `upper-a` session.

- [ ] **Step 1: Create the readiness fixture**

Create `src/views/_fixtures/mock-readiness.ts`:

```ts
import type { ReadinessPoint, ReadinessView } from "~/views/types";

const point = (weekIndex: number, fitness: number, fatigue: number): ReadinessPoint => ({
  weekIndex,
  fitness,
  fatigue,
  form: fitness - fatigue,
});

/** Faked readiness arc aligned to the 6-week mock block (current week 3, deload
 * week 6): fitness climbs, fatigue accumulates, form slides into overreaching by
 * week 5, then the deload rebounds it to fresh. Phase 2 replaces this with real
 * biodata (Garmin / Strava / Bevel). */
export const mockReadiness: ReadinessView = {
  currentWeekIndex: 3,
  series: [
    point(1, 32, 28),
    point(2, 38, 42),
    point(3, 44, 56),
    point(4, 49, 66),
    point(5, 53, 80),
    point(6, 51, 30),
  ],
};
```

- [ ] **Step 2: Write the failing reconciliation test**

Create `src/views/_fixtures/mock-readiness.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mockReadiness } from "~/views/_fixtures/mock-readiness";

describe("mockReadiness", () => {
  it("has 6 weekly points", () => {
    expect(mockReadiness.series).toHaveLength(6);
  });

  it("form equals fitness minus fatigue for every point", () => {
    for (const p of mockReadiness.series) {
      expect(p.form).toBe(p.fitness - p.fatigue);
    }
  });

  it("includes the current week", () => {
    expect(
      mockReadiness.series.some((p) => p.weekIndex === mockReadiness.currentWeekIndex),
    ).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm exec vitest run src/views/_fixtures/mock-readiness.test.ts`
Expected: PASS (3 tests). (The fixture already exists from Step 1, so this passes immediately — it is a reconciliation guard, not TDD-red.)

- [ ] **Step 4: Add swap options to the `mock-block` fixture**

In `src/views/_fixtures/mock-block.ts`, find the `upper-a` session object inside `sessionsForWeek` (the one with `slotId: "upper-a", label: "Upper A"`). Add a `swapOptions` field to that object literal (alongside `slotId`/`label`/`dayTag`/`estimatedMinutes`/`prescriptions`):

```ts
      swapOptions: [
        { id: "upper-a-easier", intent: "easier", label: "Easier", summary: "−2 sets · RIR 3 · ~46 min" },
        { id: "upper-a-harder", intent: "harder", label: "Harder", summary: "+2 sets · RIR 1 · ~64 min" },
      ],
```

No new import is needed — `swapOptions` is an optional field of the already-typed `SessionView[]` return.

- [ ] **Step 5: Verify typecheck and the full fixture suite**

Run: `pnpm typecheck && pnpm exec vitest run src/views/_fixtures/`
Expected: 0 typecheck errors; `mock-readiness.test.ts` and the existing `mock-block.test.ts` all pass.

- [ ] **Step 6: Commit**

```bash
git add src/views/_fixtures/mock-readiness.ts src/views/_fixtures/mock-readiness.test.ts src/views/_fixtures/mock-block.ts
git commit -m "feat(readiness): fixture readiness arc + swap options on the current session"
```

---

## Task 3: Readiness display components

**Files:**
- Create: `src/components/readiness/readiness-headline.tsx`
- Create: `src/components/readiness/readiness-chart.tsx`
- Create: `src/components/readiness/readiness-chip.tsx`

**Interfaces:**
- Consumes: `ReadinessView` from `~/views/types`; `readinessState` from `~/components/viz/readiness-state`; lucide-react.
- Produces: `ReadinessHeadline({ readiness })`, `ReadinessChart({ readiness })`, `ReadinessChip({ readiness })`.

Presentational (no unit tests, per the `src/components/block/*` convention); gated by typecheck + lint + visual. Monochrome/fg only — no zone tokens, no accent.

- [ ] **Step 1: Implement `ReadinessHeadline`**

Create `src/components/readiness/readiness-headline.tsx`:

```tsx
import { readinessState } from "~/components/viz/readiness-state";
import type { ReadinessView } from "~/views/types";

export function ReadinessHeadline({ readiness }: { readiness: ReadinessView }) {
  const current =
    readiness.series.find((p) => p.weekIndex === readiness.currentWeekIndex) ??
    readiness.series[readiness.series.length - 1];
  if (!current) return null;
  const state = readinessState(current.form);
  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="text-eyebrow font-medium text-fg-soft">Readiness</div>
      <div className="mt-2 flex items-center gap-2">
        <span className="size-2.5 rounded-full bg-fg-muted" aria-hidden />
        <span className="text-card-title text-fg">{state}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div>
          <div className="text-eyebrow font-medium text-fg-soft">Fitness</div>
          <div className="mt-1 text-section text-fg tabular-nums">{current.fitness}</div>
        </div>
        <div>
          <div className="text-eyebrow font-medium text-fg-soft">Fatigue</div>
          <div className="mt-1 text-section text-fg tabular-nums">{current.fatigue}</div>
        </div>
        <div>
          <div className="text-eyebrow font-medium text-fg-soft">Form</div>
          <div className="mt-1 text-section text-fg tabular-nums">
            {current.form > 0 ? `+${current.form}` : current.form}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `ReadinessChart`**

Create `src/components/readiness/readiness-chart.tsx` (hand-rolled inline SVG; `stroke-*` classes are generated from the theme color tokens):

```tsx
import type { ReadinessView } from "~/views/types";

const W = 320;
const H = 140;
const PAD = 8;

export function ReadinessChart({ readiness }: { readiness: ReadinessView }) {
  const pts = readiness.series;
  if (pts.length < 2) {
    return (
      <div className="rounded-card border border-border bg-surface p-6 text-card-desc text-fg-muted">
        Not enough data yet
      </div>
    );
  }
  const values = pts.flatMap((p) => [p.fitness, p.fatigue, p.form]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);
  const line = (key: "fitness" | "fatigue" | "form") =>
    pts.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
  const currentI = pts.findIndex((p) => p.weekIndex === readiness.currentWeekIndex);

  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="text-eyebrow font-medium text-fg-soft">Fitness · Fatigue · Form</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-4 w-full"
        role="img"
        aria-label="Fitness, fatigue, and form across the block"
      >
        {min < 0 && max > 0 ? (
          <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} className="stroke-border" strokeWidth={1} />
        ) : null}
        {currentI >= 0 ? (
          <line
            x1={x(currentI)}
            x2={x(currentI)}
            y1={PAD}
            y2={H - PAD}
            className="stroke-border-subtle"
            strokeWidth={1}
          />
        ) : null}
        <polyline points={line("fitness")} fill="none" className="stroke-fg-soft" strokeWidth={1.5} />
        <polyline
          points={line("fatigue")}
          fill="none"
          className="stroke-fg-subtle"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <polyline points={line("form")} fill="none" className="stroke-fg" strokeWidth={2} />
      </svg>
      <div className="mt-3 flex gap-4 text-[12px]">
        <span className="text-fg">■ Form</span>
        <span className="text-fg-soft">■ Fitness</span>
        <span className="text-fg-subtle">▨ Fatigue</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement `ReadinessChip`**

Create `src/components/readiness/readiness-chip.tsx`:

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { readinessState } from "~/components/viz/readiness-state";
import type { ReadinessView } from "~/views/types";

export function ReadinessChip({ readiness }: { readiness: ReadinessView }) {
  const current =
    readiness.series.find((p) => p.weekIndex === readiness.currentWeekIndex) ??
    readiness.series[readiness.series.length - 1];
  if (!current) return null;
  const state = readinessState(current.form);
  return (
    <Link
      href="/app/readiness"
      className="inline-flex items-center gap-1.5 rounded-pill border border-border px-3 py-1 text-nav text-fg-muted transition-colors hover:text-fg"
    >
      <span className="size-2 rounded-full bg-fg-muted" aria-hidden />
      Form: {state}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}
```

- [ ] **Step 4: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/readiness/readiness-headline.tsx src/components/readiness/readiness-chart.tsx src/components/readiness/readiness-chip.tsx
git commit -m "feat(readiness): headline, fitness/fatigue/form chart, and form chip"
```

---

## Task 4: Readiness page + nav item

**Files:**
- Create: `src/app/app/readiness/page.tsx`
- Modify: `src/components/nav/app-nav.tsx`

**Interfaces:**
- Consumes: `ReadinessHeadline`, `ReadinessChart` (Task 3); `mockReadiness` (Task 2); `NavItem` from `~/components/ui-kit/app-shell-kit`.
- Produces: the `/app/readiness` route; a "Readiness" nav row.

- [ ] **Step 1: Implement the readiness page**

Create `src/app/app/readiness/page.tsx` (server component):

```tsx
import { ReadinessHeadline } from "~/components/readiness/readiness-headline";
import { ReadinessChart } from "~/components/readiness/readiness-chart";
import { mockReadiness } from "~/views/_fixtures/mock-readiness";

export default function ReadinessPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="text-eyebrow font-medium text-fg-soft">Recovery</div>
        <h1 className="mt-1 text-page-title text-fg">Readiness</h1>
        <p className="mt-1 text-card-desc text-fg-muted">
          Fitness, fatigue, and form across your block. In phase 2 this is driven by your wearables.
        </p>
      </header>
      <ReadinessHeadline readiness={mockReadiness} />
      <ReadinessChart readiness={mockReadiness} />
    </div>
  );
}
```

- [ ] **Step 2: Add the "Readiness" nav item**

In `src/components/nav/app-nav.tsx`, add `HeartPulse` to the existing `lucide-react` import, then insert this `NavItem` immediately AFTER the "Analysis" item:

```tsx
        <NavItem appearance="neutral" href="/app/readiness" label="Readiness" icon={HeartPulse} matchPatterns={["/app/readiness"]} />
```

`matchPatterns={["/app/readiness"]}` is an exact match, active only on the readiness surface.

- [ ] **Step 3: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/readiness/page.tsx src/components/nav/app-nav.tsx
git commit -m "feat(readiness): mount /app/readiness with Readiness nav item"
```

---

## Task 5: Next-Best-Workout swap + Now-home wiring

**Files:**
- Create: `src/components/home/session-swap-control.tsx` (client)
- Modify: `src/components/home/next-session-card.tsx`
- Modify: `src/app/app/page.tsx`

**Interfaces:**
- Consumes: `SwapOption`, `ReadinessLabel`, `SessionView` from `~/views/types`; `readinessState` (Task 1); `mockReadiness` (Task 2); `ReadinessChip` (Task 3).
- Produces: `SessionSwapControl({ options, readinessLabel })`; `NextSessionCard` gains an optional `readinessLabel` prop; the Now home renders the chip and passes the label.

- [ ] **Step 1: Implement the client swap control**

Create `src/components/home/session-swap-control.tsx`:

```tsx
"use client";

import { useState } from "react";
import { RefreshCw, Undo2 } from "lucide-react";
import type { ReadinessLabel, SwapOption } from "~/views/types";

export function SessionSwapControl({
  options,
  readinessLabel,
}: {
  options: SwapOption[];
  readinessLabel?: ReadinessLabel;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<SwapOption | null>(null);
  if (options.length === 0) return null;
  const fatigued = readinessLabel === "Fatigued" || readinessLabel === "Overreaching";

  if (chosen) {
    return (
      <div className="mt-4 flex items-center justify-between rounded-control border border-border-subtle px-3 py-2 text-nav text-fg-soft">
        <span>Swapped to {chosen.label} · still fits your plan</span>
        <button
          type="button"
          onClick={() => {
            setChosen(null);
            setOpen(false);
          }}
          className="inline-flex items-center gap-1 text-fg-muted transition-colors hover:text-fg"
        >
          <Undo2 className="size-4" aria-hidden /> Undo
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-1.5 text-nav text-fg-muted transition-colors hover:text-fg"
      >
        <RefreshCw className="size-4" aria-hidden /> Swap session
      </button>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      {options.map((opt) => {
        const hint = fatigued && opt.intent === "easier";
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => setChosen(opt)}
            className="flex items-center justify-between gap-3 rounded-control border border-border-subtle px-3 py-2 text-left transition-colors hover:border-border"
          >
            <span className="text-nav text-fg">{opt.label}</span>
            <span className="text-[12px] text-fg-muted">
              {hint ? "Fatigue high — consider easier · " : ""}
              {opt.summary}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="self-start text-[12px] text-fg-subtle transition-colors hover:text-fg"
      >
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Mount the swap control in `NextSessionCard`**

In `src/components/home/next-session-card.tsx`:
- Extend the type import to include `ReadinessLabel`: `import type { ReadinessLabel, SessionView } from "~/views/types";`
- Add the import: `import { SessionSwapControl } from "~/components/home/session-swap-control";`
- Add `readinessLabel` to the props (type and destructure):

```tsx
export function NextSessionCard({
  session,
  blockId,
  weekIndex,
  readinessLabel,
}: {
  session: SessionView | undefined;
  blockId: string;
  weekIndex: number;
  readinessLabel?: ReadinessLabel;
}) {
```

- Immediately AFTER the closing `</Link>` of the "Start session" button (and before the card's closing `</div>`), add:

```tsx
      {session.swapOptions && session.swapOptions.length > 0 ? (
        <SessionSwapControl options={session.swapOptions} readinessLabel={readinessLabel} />
      ) : null}
```

- [ ] **Step 3: Wire the Now home — Form chip + readiness label**

In `src/app/app/page.tsx`:
- Add imports:

```tsx
import { readinessState } from "~/components/viz/readiness-state";
import { ReadinessChip } from "~/components/readiness/readiness-chip";
import { mockReadiness } from "~/views/_fixtures/mock-readiness";
```

- Inside `NowHome`, after the existing `status` line, compute the current readiness label:

```tsx
  const readinessPoint =
    mockReadiness.series.find((p) => p.weekIndex === mockReadiness.currentWeekIndex) ??
    mockReadiness.series[mockReadiness.series.length - 1];
  const readinessLabel = readinessPoint ? readinessState(readinessPoint.form) : undefined;
```

- In the `<header>`, after the `<p>...{block.name}</p>` line, add the chip:

```tsx
        <div className="mt-3">
          <ReadinessChip readiness={mockReadiness} />
        </div>
```

- Pass the label to the hero — change the `<NextSessionCard ... />` call to include `readinessLabel={readinessLabel}`:

```tsx
      <NextSessionCard
        session={session}
        blockId={block.id}
        weekIndex={block.currentWeekIndex}
        readinessLabel={readinessLabel}
      />
```

- [ ] **Step 4: Verify typecheck, lint, and the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 0 typecheck/lint errors; all suites pass, including Tasks 1–2's new tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/session-swap-control.tsx src/components/home/next-session-card.tsx src/app/app/page.tsx
git commit -m "feat(readiness): Next-Best-Workout swap on the hero + Form chip on the Now home"
```

---

## Self-Review (author checklist — done)

- **Spec coverage:** Readiness page + nav (Task 4) · `readinessState` bands (Task 1) · readiness fixture arc (Task 2) · headline/chart/chip (Task 3) · Form chip on Now home + readiness→swap hint (Task 5) · `SwapOption` + swap control + hero mount (Tasks 1/2/5) · empty handling (chart `<2` pts, headline fallback, swap no-options) · discipline-agnostic view models · monochrome readiness (no zone tokens) · swap ephemeral · deferred items untouched.
- **Placeholders:** none — every step has real code/commands.
- **Type consistency:** `ReadinessView`/`ReadinessPoint`/`ReadinessLabel`/`SwapOption` used identically across tasks; `readinessState(form)` signature matches; `NextSessionCard`'s new optional `readinessLabel` is passed from the Now home; the current-point fallback (`find ?? last`) is identical in headline, chip, and page. Fixture arc values satisfy the `readinessState` bands and the `form === fitness - fatigue` reconciliation test.
