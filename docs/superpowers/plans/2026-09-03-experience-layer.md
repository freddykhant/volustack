# Experience Layer — Shell + Block + Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first buildable slice of the Mesodapt experience layer — the app shell + navigation, the Block view (muscle × week heat-map grid + week-detail drill-in), and the Analysis view (landmark bars + anatomical body map) — rendered against a typed view-model fixture, so the UI ships before the engine is wired and maps onto real engine output later with zero component changes.

**Architecture:** Next.js App Router under `src/app/app/`, mounting the existing `AppShell` kit once via a server layout that fetches the BetterAuth session and delegates to a client `AppFrame` (which chooses `column2`/`fullBleed` by pathname). All screens consume ONLY the view-model contract in `src/views/types.ts`, fed in this phase by `src/views/_fixtures/mock-block.ts`. The single piece of real logic is the pure `zoneFor()` (volume → landmark zone), which drives one visual language — grid cells, analysis bars, body-map regions — via four new semantic `@theme` "zone" tokens. Read + drill-in only; no editing (mutation semantics arrive with the engine).

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 (`@theme` tokens) · the `app-shell-kit` component library · lucide-react (already a dep) · Vitest (for `zoneFor` only). Path alias `~/*` → `src/*`.

**Parent spec:** `docs/superpowers/specs/2026-07-25-experience-layer-design.md`.

## Global Constraints

- **View models only.** Every component imports types from `src/views/types.ts` and never from `src/engine/*` or Prisma. The fixture is the only data source this phase; when the engine lands, its output maps to these view models and the fixture is deleted with **no component changes**.
- **Semantic tokens only — never raw hexes in components.** New colors enter via `@theme` tokens in `src/components/ui-kit/app-shell-kit/theme.css` first. The four zone tokens (+ `-soft` variants) are the only token additions.
- **Zone colors are reserved for DATA, never decorative UI.** This preserves the kit's accent-scarcity rule: `accent` = interactive/active only; zones = meaning.
- **Kit posture: foundation, tailored.** Keep shell anatomy (256px nav → 288px column → 49px bar → content), dark-only canvas (`#0b0c0d`), no-shadow elevation (`bg-surface` = raised), the type scale, and `PageHeader`/`SectionHeading`/`Card` rhythm on standard pages. Block + Analysis are **full-bleed** (the kit's `fullBleed` escape hatch); stubs/settings keep the 756px cap.
- **Read + drill-in only.** No cell/prescription editing anywhere. Clicking a week routes to detail; that's the only mutation-shaped interaction.
- **`AppShell` mounts exactly once** (in `src/app/app/layout.tsx`, via `AppFrame`). Never nest it.
- **Column 2 (block navigator) appears on training routes only** (`/app/block*`); Analysis and stubs omit it.
- **Muscle taxonomy is the 14-value `MuscleGroup`** from `~/schema`; landmark values come in the `DEFAULT_LANDMARKS` (`{mev,mav,mrv}`) shape from `~/domain/landmarks`.
- **Testing posture (per spec §9):** `zoneFor()` is unit-tested (Vitest, boundary cases). `pnpm typecheck` is the contract gate across all components. Component render tests are DEFERRED (pure presentation against its own fixture is low-value). Each UI task ends with a **visual verification checklist** run against `pnpm dev`.

---

## File Structure

**Created:**
- `src/views/types.ts` — the view-model contract (all screens consume these).
- `src/views/_fixtures/mock-block.ts` — `mockMesocycle: MesocycleView`.
- `src/components/viz/zone.ts` — `zoneFor()` + `Zone` type (pure).
- `src/components/viz/zone.test.ts` — boundary unit tests.
- `src/components/viz/landmark-bar.tsx`, `src/components/viz/body-map.tsx`.
- `src/components/block/block-header.tsx`, `block-grid.tsx`, `week-column-header.tsx`, `grid-cell.tsx`, `session-card.tsx`.
- `src/components/nav/app-frame.tsx`, `app-nav.tsx`, `block-navigator.tsx`.
- `src/app/app/layout.tsx`, `src/app/app/block/page.tsx`, `src/app/app/block/[blockId]/page.tsx`, `src/app/app/block/[blockId]/week/[n]/page.tsx`, `src/app/app/analysis/page.tsx`, `src/app/app/coach/page.tsx`, `src/app/app/library/page.tsx`, `src/app/app/settings/page.tsx`.

**Modified:**
- `src/components/ui-kit/app-shell-kit/theme.css` — add the 4 zone tokens + `-soft` variants.

---

## Task 1: Foundation — view-model contract, zone tokens, `zoneFor()`

**Files:**
- Create: `src/views/types.ts`, `src/components/viz/zone.ts`, `src/components/viz/zone.test.ts`
- Modify: `src/components/ui-kit/app-shell-kit/theme.css`

**Interfaces:**
- Consumes: `MuscleGroup` from `~/schema` (type-only).
- Produces (used by every later task): the view-model types below; `Zone = "rest"|"building"|"optimal"|"max"`; `zoneFor(volume: number, lm: { mev: number; mav: number; mrv: number }): Zone`; CSS tokens `--color-zone-rest|building|optimal|max` and their `-soft` variants.

- [ ] **Step 1: Write the view-model contract `src/views/types.ts`**

```ts
import type { MuscleGroup } from "~/schema";

export type Zone = "rest" | "building" | "optimal" | "max";

export type MuscleRole = "PRIMARY" | "SECONDARY";

export interface MuscleChip {
  muscle: MuscleGroup;
  role: MuscleRole;
  fraction: number; // 1.0 primary, <1 secondary — fractional credit
}

export interface PrescriptionView {
  exerciseName: string;
  sets: number;
  repRangeLow: number;
  repRangeHigh: number;
  targetRir: number;
  muscles: MuscleChip[];
}

export interface SessionView {
  slotId: string;
  label: string; // "Upper A"
  dayTag?: string; // optional day-of-week tag
  estimatedMinutes: number;
  prescriptions: PrescriptionView[];
}

/** One muscle's planned volume in one week, with that muscle's landmarks for zone/tooltip. */
export interface MuscleWeekCell {
  muscle: MuscleGroup;
  weekIndex: number;
  plannedSets: number;
  mev: number;
  mav: number;
  mrv: number;
}

export interface WeekView {
  index: number; // 1-based
  isDeload: boolean;
  isCurrent: boolean;
  totalSets: number;
  sessions: SessionView[];
  cells: MuscleWeekCell[]; // one per trained muscle, this week
}

export interface LandmarkBarDatum {
  muscle: MuscleGroup;
  planned: number;
  actual?: number; // known only after a completed week
  mev: number;
  mav: number;
  mrv: number;
}

export type BlockStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

export interface MesocycleView {
  id: string;
  name: string;
  status: BlockStatus;
  splitLabel: string; // "Upper/Lower"
  daysPerWeek: number;
  blockLengthWeeks: number;
  currentWeekIndex: number;
  deloadWeekIndex: number;
  muscles: MuscleGroup[]; // grid rows, in display order
  priorityMuscles: MuscleGroup[]; // show a ▲ marker
  weeks: WeekView[];
}
```

- [ ] **Step 2: Write the failing `zoneFor` test `src/components/viz/zone.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { zoneFor } from "./zone";

const lm = { mev: 8, mav: 14, mrv: 22 };

describe("zoneFor", () => {
  it("returns rest below MEV (incl. zero)", () => {
    expect(zoneFor(0, lm)).toBe("rest");
    expect(zoneFor(7, lm)).toBe("rest");
  });
  it("returns building at exactly MEV up to just below MAV", () => {
    expect(zoneFor(8, lm)).toBe("building");
    expect(zoneFor(13, lm)).toBe("building");
  });
  it("returns optimal at exactly MAV up to just below MRV", () => {
    expect(zoneFor(14, lm)).toBe("optimal");
    expect(zoneFor(21, lm)).toBe("optimal");
  });
  it("returns max at exactly MRV and above", () => {
    expect(zoneFor(22, lm)).toBe("max");
    expect(zoneFor(30, lm)).toBe("max");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run src/components/viz/zone.test.ts`
Expected: FAIL — "Cannot find module './zone'".

- [ ] **Step 4: Implement `src/components/viz/zone.ts`**

```ts
export type { Zone } from "~/views/types";
import type { Zone } from "~/views/types";

/** Classify a weekly set volume into its landmark zone. Boundaries are inclusive
 * at the lower edge: exactly MEV = building, exactly MAV = optimal, exactly MRV = max. */
export function zoneFor(
  volume: number,
  lm: { mev: number; mav: number; mrv: number },
): Zone {
  if (volume < lm.mev) return "rest";
  if (volume < lm.mav) return "building";
  if (volume < lm.mrv) return "optimal";
  return "max";
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/components/viz/zone.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Add the zone tokens to `theme.css`**

In `src/components/ui-kit/app-shell-kit/theme.css`, inside the `@theme { … }` block, after the `--color-callout` line, add:

```css
  /* Landmark zone tokens (Mesodapt data-viz family) — reserved for DATA, never
     decorative UI. Progression grey→blue→green→amber is colorblind-safe on the
     #0b0c0d canvas and keeps "max" a warning, not an alarm. Full-strength for
     small marks (bars, chips, markers); -soft translucent fills for large areas
     (grid cells, body regions). Hues may be refined with the dataviz skill. */
  --color-zone-rest: #64748b;
  --color-zone-rest-soft: rgba(100, 116, 139, 0.14);
  --color-zone-building: #38bdf8;
  --color-zone-building-soft: rgba(56, 189, 248, 0.16);
  --color-zone-optimal: #34d399;
  --color-zone-optimal-soft: rgba(52, 211, 153, 0.18);
  --color-zone-max: #f59e0b;
  --color-zone-max-soft: rgba(245, 158, 11, 0.22);
```

These generate Tailwind utilities `bg-zone-rest`, `bg-zone-building-soft`, `text-zone-max`, etc.

- [ ] **Step 7: Verify typecheck + tokens compile**

Run: `pnpm typecheck` → 0 errors.
Run: `pnpm dev`, load any page, and confirm no CSS build error (the new tokens parse). Stop the server.

- [ ] **Step 8: Commit**

```bash
git add src/views/types.ts src/components/viz/zone.ts src/components/viz/zone.test.ts src/components/ui-kit/app-shell-kit/theme.css
git commit -m "feat(experience): view-model contract, zoneFor, and landmark zone tokens"
```

---

## Task 2: Fixture — `mock-block.ts`

**Files:**
- Create: `src/views/_fixtures/mock-block.ts`, `src/views/_fixtures/mock-block.test.ts`

**Interfaces:**
- Consumes: view-model types from `~/views/types`; `DEFAULT_LANDMARKS` from `~/domain/landmarks`; `MuscleGroup` from `~/schema`; `zoneFor` (test only).
- Produces: `mockMesocycle: MesocycleView` — a 6-week Upper/Lower 5-day block, realistic ramp, deload week 6, priority side-delts, fractional-credit prescriptions.

- [ ] **Step 1: Write `src/views/_fixtures/mock-block.ts`**

```ts
import { DEFAULT_LANDMARKS } from "~/domain/landmarks";
import type { MuscleGroup } from "~/schema";
import type {
  MesocycleView,
  MuscleChip,
  MuscleWeekCell,
  PrescriptionView,
  SessionView,
  WeekView,
} from "~/views/types";

const MUSCLES: MuscleGroup[] = ["CHEST", "BACK", "SIDE_DELTS", "QUADS", "HAMSTRINGS", "BICEPS", "TRICEPS"];
const PRIORITY: MuscleGroup[] = ["SIDE_DELTS"];
const CURRENT_WEEK = 3;
const DELOAD_WEEK = 6;

// Per-muscle planned volume by week (index 0 = week 1 … index 5 = deload).
const RAMP: Record<string, number[]> = {
  CHEST: [12, 14, 14, 16, 16, 6],
  BACK: [14, 15, 16, 17, 18, 7],
  SIDE_DELTS: [12, 14, 14, 16, 16, 6],
  QUADS: [10, 11, 11, 12, 12, 4],
  HAMSTRINGS: [8, 9, 9, 10, 10, 4],
  BICEPS: [8, 9, 9, 10, 10, 4],
  TRICEPS: [8, 9, 9, 10, 10, 4],
};

const chip = (muscle: MuscleGroup, role: "PRIMARY" | "SECONDARY", fraction: number): MuscleChip => ({ muscle, role, fraction });

function sessionsForWeek(weekIndex: number, isDeload: boolean): SessionView[] {
  const rir = isDeload ? 4 : 2;
  const setsFor = (base: number) => (isDeload ? Math.max(2, Math.round(base * 0.4)) : base);
  const px = (
    exerciseName: string,
    sets: number,
    lo: number,
    hi: number,
    muscles: MuscleChip[],
  ): PrescriptionView => ({ exerciseName, sets: setsFor(sets), repRangeLow: lo, repRangeHigh: hi, targetRir: rir, muscles });

  return [
    {
      slotId: "upper-a", label: "Upper A", dayTag: "Mon",
      estimatedMinutes: isDeload ? 32 : 58,
      prescriptions: [
        px("Barbell Bench Press", 4, 6, 10, [chip("CHEST", "PRIMARY", 1), chip("TRICEPS", "SECONDARY", 0.5), chip("FRONT_DELTS", "SECONDARY", 0.5)]),
        px("Barbell Row", 4, 6, 10, [chip("BACK", "PRIMARY", 1), chip("BICEPS", "SECONDARY", 0.5), chip("REAR_DELTS", "SECONDARY", 0.5)]),
        px("Lateral Raise", 4, 10, 15, [chip("SIDE_DELTS", "PRIMARY", 1)]),
      ],
    },
    {
      slotId: "lower-a", label: "Lower A", dayTag: "Tue",
      estimatedMinutes: isDeload ? 24 : 46,
      prescriptions: [
        px("Leg Press", 4, 6, 10, [chip("QUADS", "PRIMARY", 1), chip("GLUTES", "SECONDARY", 0.5)]),
        px("Romanian Deadlift", 4, 6, 10, [chip("HAMSTRINGS", "PRIMARY", 1), chip("GLUTES", "SECONDARY", 0.5)]),
      ],
    },
    {
      slotId: "upper-b", label: "Upper B", dayTag: "Thu",
      estimatedMinutes: isDeload ? 32 : 56,
      prescriptions: [
        px("Incline Dumbbell Press", 4, 6, 10, [chip("CHEST", "PRIMARY", 1), chip("FRONT_DELTS", "SECONDARY", 0.5), chip("TRICEPS", "SECONDARY", 0.5)]),
        px("Lat Pulldown", 4, 6, 10, [chip("BACK", "PRIMARY", 1), chip("BICEPS", "SECONDARY", 0.5)]),
        px("Barbell Curl", 4, 10, 15, [chip("BICEPS", "PRIMARY", 1), chip("FOREARMS", "SECONDARY", 0.25)]),
      ],
    },
    {
      slotId: "lower-b", label: "Lower B", dayTag: "Fri",
      estimatedMinutes: isDeload ? 22 : 40,
      prescriptions: [
        px("Leg Press", 4, 6, 10, [chip("QUADS", "PRIMARY", 1), chip("GLUTES", "SECONDARY", 0.5)]),
        px("Cable Triceps Pushdown", 4, 10, 15, [chip("TRICEPS", "PRIMARY", 1)]),
      ],
    },
    {
      slotId: "upper-c", label: "Upper C", dayTag: "Sat",
      estimatedMinutes: isDeload ? 30 : 54,
      prescriptions: [
        px("Barbell Row", 4, 6, 10, [chip("BACK", "PRIMARY", 1), chip("BICEPS", "SECONDARY", 0.5), chip("REAR_DELTS", "SECONDARY", 0.5)]),
        px("Lateral Raise", 4, 10, 15, [chip("SIDE_DELTS", "PRIMARY", 1)]),
      ],
    },
  ];
}

function week(weekIndex: number): WeekView {
  const isDeload = weekIndex === DELOAD_WEEK;
  const cells: MuscleWeekCell[] = MUSCLES.map((muscle) => {
    const lm = DEFAULT_LANDMARKS[muscle];
    return {
      muscle,
      weekIndex,
      plannedSets: RAMP[muscle]![weekIndex - 1]!,
      mev: lm.mev,
      mav: lm.mav,
      mrv: lm.mrv,
    };
  });
  const sessions = sessionsForWeek(weekIndex, isDeload);
  const totalSets = sessions.reduce((s, sess) => s + sess.prescriptions.reduce((n, p) => n + p.sets, 0), 0);
  return {
    index: weekIndex,
    isDeload,
    isCurrent: weekIndex === CURRENT_WEEK,
    totalSets,
    sessions,
    cells,
  };
}

export const mockMesocycle: MesocycleView = {
  id: "mock-block-1",
  name: "Autumn Hypertrophy — Block 1",
  status: "ACTIVE",
  splitLabel: "Upper/Lower",
  daysPerWeek: 5,
  blockLengthWeeks: 6,
  currentWeekIndex: CURRENT_WEEK,
  deloadWeekIndex: DELOAD_WEEK,
  muscles: MUSCLES,
  priorityMuscles: PRIORITY,
  weeks: Array.from({ length: 6 }, (_, i) => week(i + 1)),
};
```

- [ ] **Step 2: Write a fixture sanity test `src/views/_fixtures/mock-block.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { zoneFor } from "~/components/viz/zone";
import { mockMesocycle } from "./mock-block";

describe("mockMesocycle fixture", () => {
  it("has 6 weeks with the deload marked last", () => {
    expect(mockMesocycle.weeks).toHaveLength(6);
    expect(mockMesocycle.weeks.filter((w) => w.isDeload).map((w) => w.index)).toEqual([6]);
  });
  it("ramps chest volume up to a peak, then deloads", () => {
    const chest = (w: number) => mockMesocycle.weeks[w - 1]!.cells.find((c) => c.muscle === "CHEST")!.plannedSets;
    expect(chest(5)).toBeGreaterThanOrEqual(chest(1));
    expect(chest(6)).toBeLessThan(chest(1)); // deload
  });
  it("exercises multiple zones across the block (heat-map is legible)", () => {
    const zones = new Set(
      mockMesocycle.weeks.flatMap((w) => w.cells.map((c) => zoneFor(c.plannedSets, c))),
    );
    expect(zones.size).toBeGreaterThan(1);
  });
  it("has fractional-credit prescriptions (a secondary chip < 1.0 exists)", () => {
    const chips = mockMesocycle.weeks[0]!.sessions.flatMap((s) => s.prescriptions.flatMap((p) => p.muscles));
    expect(chips.some((c) => c.role === "SECONDARY" && c.fraction < 1)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the fixture test + typecheck**

Run: `pnpm vitest run src/views/_fixtures/mock-block.test.ts` → PASS (4 tests).
Run: `pnpm typecheck` → 0 errors (the fixture satisfies the view-model contract).

- [ ] **Step 4: Commit**

```bash
git add src/views/_fixtures/mock-block.ts src/views/_fixtures/mock-block.test.ts
git commit -m "feat(experience): mock mesocycle fixture against the view-model contract"
```

---

## Task 3: App shell mount, navigation, and stub routes

**Files:**
- Create: `src/app/app/layout.tsx`, `src/components/nav/app-frame.tsx`, `src/components/nav/app-nav.tsx`, `src/app/app/block/page.tsx`, `src/app/app/coach/page.tsx`, `src/app/app/library/page.tsx`, `src/app/app/settings/page.tsx`

**Interfaces:**
- Consumes: `AppShell` from `~/components/ui-kit/app-shell-kit`; `getSession` from `~/server/better-auth/server`; `SignOutButton` from `~/app/_components/auth-buttons`; `NavItem` from the kit; `mockMesocycle` (for the `/app/block` redirect target); `BlockNavigator` (created in Task 4 — until then `AppFrame` renders `undefined` for column2, see note).
- Produces: the mounted shell at `/app`, Column-1 nav with the 5 sections + user row, stub pages for coach/library/settings, and `/app/block` → active block redirect.

- [ ] **Step 1: Server layout `src/app/app/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { AppFrame } from "~/components/nav/app-frame";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  return (
    <AppFrame userName={session.user.name} userEmail={session.user.email}>
      {children}
    </AppFrame>
  );
}
```

- [ ] **Step 2: Client frame `src/components/nav/app-frame.tsx`**

Chooses `column2` and `fullBleed` by pathname so `AppShell` mounts once.

```tsx
"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "~/components/ui-kit/app-shell-kit";
import { AppNav } from "./app-nav";
import { BlockNavigator } from "./block-navigator";

export function AppFrame({
  children,
  userName,
  userEmail,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname() ?? "";
  const isTraining = pathname.startsWith("/app/block");
  const isAnalysis = pathname.startsWith("/app/analysis");
  return (
    <AppShell
      slug="app"
      workspaceName="Mesodapt"
      column1={<AppNav userName={userName} userEmail={userEmail} />}
      column2={isTraining ? <BlockNavigator /> : undefined}
      fullBleed={isTraining || isAnalysis}
      topNav={<div className="text-nav text-fg-muted">Mesodapt</div>}
    >
      {children}
    </AppShell>
  );
}
```

Note: `BlockNavigator` is created in Task 4. To keep this task independently runnable, create a temporary one-line placeholder now — `src/components/nav/block-navigator.tsx` exporting `export function BlockNavigator() { return null; }` — and Task 4 replaces its body. (Deleted-then-replaced, not a placeholder in the final tree.)

- [ ] **Step 3: Column-1 nav `src/components/nav/app-nav.tsx`**

```tsx
"use client";

import { Dumbbell, LineChart, MessageSquare, Library, Settings, LogOut } from "lucide-react";
import { NavItem } from "~/components/ui-kit/app-shell-kit";
import { authClient } from "~/server/better-auth/client";
import { useRouter } from "next/navigation";

export function AppNav({ userName, userEmail }: { userName: string; userEmail: string }) {
  const router = useRouter();
  return (
    <>
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-card-title text-fg">
        <Dumbbell className="size-5 text-accent" />
        Mesodapt
      </div>
      <nav className="mt-6 flex flex-col gap-0.5">
        <NavItem appearance="neutral" href="/app/block" label="Block" icon={Dumbbell} matchPatterns={["/app/block", "/app/block/*"]} />
        <NavItem appearance="neutral" href="/app/analysis" label="Analysis" icon={LineChart} matchPatterns={["/app/analysis", "/app/analysis/*"]} />
        <NavItem appearance="neutral" href="/app/coach" label="Coach" icon={MessageSquare} matchPatterns={["/app/coach"]} />
        <NavItem appearance="neutral" href="/app/library" label="Library" icon={Library} matchPatterns={["/app/library"]} />
        <NavItem appearance="neutral" href="/app/settings" label="Settings" icon={Settings} matchPatterns={["/app/settings"]} />
      </nav>
      <div className="mt-auto flex items-center gap-3 border-t border-border-subtle pt-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-nav text-fg-muted">
          {userName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-nav text-fg">{userName}</div>
          <div className="truncate text-[12px] text-fg-subtle">{userEmail}</div>
        </div>
        <button
          type="button"
          aria-label="Sign out"
          onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } })}
          className="rounded-control p-1.5 text-fg-subtle transition-colors hover:text-fg"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 4: `/app/block` redirect to the active block `src/app/app/block/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { mockMesocycle } from "~/views/_fixtures/mock-block";

export default function BlockIndex() {
  redirect(`/app/block/${mockMesocycle.id}`);
}
```

- [ ] **Step 5: Stub pages**

Create `src/app/app/coach/page.tsx`, `src/app/app/library/page.tsx`, `src/app/app/settings/page.tsx`, each identical but for the title. Use this shape (shown for coach; repeat with `title="Library"` and `title="Settings"`):

```tsx
import { PageHeader } from "~/components/ui-kit/app-shell-kit";

export default function CoachStub() {
  return (
    <>
      <PageHeader title="Coach" />
      <p className="mt-4 text-body text-fg-muted">Coming soon.</p>
    </>
  );
}
```

(If `PageHeader`'s prop is not `title`, open `src/components/ui-kit/app-shell-kit/components/page-header.tsx` and match its actual prop — do not guess.)

- [ ] **Step 6: Verify (typecheck + visual)**

Run: `pnpm typecheck` → 0 errors.
Run: `pnpm dev`, sign in, visit `/app/coach`:
- Column 1 shows the Mesodapt wordmark, 5 nav items, and the user row (name, email, sign-out) at the bottom.
- The active nav item is highlighted; navigating between Coach/Library/Settings updates the active state.
- Stubs render capped (756px) with "Coming soon"; NO Column 2 appears on these routes.
- `/app/block` redirects to `/app/block/mock-block-1` (will 404 on the page body until Task 4 — the redirect itself should fire).
Stop the server.

- [ ] **Step 7: Commit**

```bash
git add src/app/app/layout.tsx src/components/nav/app-frame.tsx src/components/nav/app-nav.tsx src/components/nav/block-navigator.tsx src/app/app/block/page.tsx src/app/app/coach/page.tsx src/app/app/library/page.tsx src/app/app/settings/page.tsx
git commit -m "feat(experience): mount app shell, navigation, user row, and stub routes"
```

---

## Task 4: Block view — header, heat-map grid, and Column-2 navigator

**Files:**
- Create: `src/components/block/block-header.tsx`, `src/components/block/week-column-header.tsx`, `src/components/block/grid-cell.tsx`, `src/components/block/block-grid.tsx`, `src/app/app/block/[blockId]/page.tsx`
- Modify: `src/components/nav/block-navigator.tsx` (replace the Task-3 placeholder body)

**Interfaces:**
- Consumes: `MesocycleView`/`WeekView`/`MuscleWeekCell`/`Zone` from `~/views/types`; `zoneFor` from `~/components/viz/zone`; `mockMesocycle` from the fixture; `NavItem` from the kit.
- Produces: the Block hero screen at `/app/block/[blockId]` and the real Column-2 block navigator.

- [ ] **Step 1: `block-header.tsx` (tool header + progress)**

```tsx
import type { MesocycleView } from "~/views/types";

export function BlockHeader({ block }: { block: MesocycleView }) {
  const pct = Math.round((block.currentWeekIndex / block.blockLengthWeeks) * 100);
  return (
    <header className="border-b border-border-subtle px-6 py-5">
      <div className="flex items-center gap-3">
        <h1 className="text-section text-fg">{block.name}</h1>
        <span className="rounded-pill bg-selection px-2 py-0.5 text-[12px] font-semibold text-accent">
          {block.status}
        </span>
      </div>
      <div className="mt-1 text-nav text-fg-muted">
        {block.splitLabel} · {block.daysPerWeek} days/week · Week {block.currentWeekIndex} of {block.blockLengthWeeks}
      </div>
      <div className="mt-3 h-1.5 w-full max-w-md overflow-hidden rounded-pill bg-surface">
        <div className="h-full rounded-pill bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: `week-column-header.tsx`**

```tsx
import Link from "next/link";
import type { MesocycleView, WeekView } from "~/views/types";

export function WeekColumnHeader({ block, week }: { block: MesocycleView; week: WeekView }) {
  const label = week.isDeload ? "DL" : `Wk ${week.index}`;
  return (
    <Link
      href={`/app/block/${block.id}/week/${week.index}`}
      className={
        "block px-2 py-1.5 text-center text-nav transition-colors hover:text-fg " +
        (week.isCurrent ? "font-semibold text-accent" : week.isDeload ? "text-fg-subtle" : "text-fg-muted")
      }
    >
      {label}
    </Link>
  );
}
```

- [ ] **Step 3: `grid-cell.tsx` (heat cell + tooltip)**

```tsx
import Link from "next/link";
import { zoneFor } from "~/components/viz/zone";
import type { MesocycleView, MuscleWeekCell, WeekView } from "~/views/types";

const SOFT: Record<string, string> = {
  rest: "bg-zone-rest-soft",
  building: "bg-zone-building-soft",
  optimal: "bg-zone-optimal-soft",
  max: "bg-zone-max-soft",
};

export function GridCell({
  block,
  week,
  cell,
}: {
  block: MesocycleView;
  week: WeekView;
  cell: MuscleWeekCell;
}) {
  const zone = zoneFor(cell.plannedSets, cell);
  const tooltip = `${cell.plannedSets} sets — ${zone} · MEV ${cell.mev} / MAV ${cell.mav} / MRV ${cell.mrv}`;
  return (
    <Link
      href={`/app/block/${block.id}/week/${week.index}`}
      title={tooltip}
      className={
        "flex h-10 items-center justify-center text-nav text-fg transition-opacity hover:opacity-80 " +
        SOFT[zone] +
        (week.isCurrent ? " ring-1 ring-inset ring-accent/40" : "") +
        (week.isDeload ? " opacity-60" : "")
      }
    >
      {cell.plannedSets}
    </Link>
  );
}
```

- [ ] **Step 4: `block-grid.tsx` (muscles × weeks)**

```tsx
import { WeekColumnHeader } from "./week-column-header";
import { GridCell } from "./grid-cell";
import type { MesocycleView } from "~/views/types";

function muscleLabel(m: string): string {
  return m.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function BlockGrid({ block }: { block: MesocycleView }) {
  const priority = new Set(block.priorityMuscles);
  return (
    <div className="overflow-x-auto p-6">
      <div
        className="grid min-w-max gap-px"
        style={{ gridTemplateColumns: `160px repeat(${block.weeks.length}, minmax(56px, 1fr))` }}
      >
        {/* header row */}
        <div className="sticky left-0 z-10 bg-canvas" />
        {block.weeks.map((w) => (
          <div key={w.index} className={w.isCurrent ? "bg-selection" : undefined}>
            <WeekColumnHeader block={block} week={w} />
          </div>
        ))}

        {/* muscle rows */}
        {block.muscles.map((muscle) => (
          <RowFragment key={muscle} block={block} muscle={muscle} isPriority={priority.has(muscle)} muscleLabel={muscleLabel(muscle)} />
        ))}

        {/* footer: per-week totals */}
        <div className="sticky left-0 z-10 bg-canvas px-2 py-1.5 text-right text-[12px] text-fg-subtle">Total</div>
        {block.weeks.map((w) => (
          <div key={`t-${w.index}`} className={"px-2 py-1.5 text-center text-[12px] text-fg-subtle " + (w.isCurrent ? "bg-selection" : "")}>
            {w.totalSets}
          </div>
        ))}
      </div>
    </div>
  );
}

function RowFragment({
  block,
  muscle,
  isPriority,
  muscleLabel,
}: {
  block: MesocycleView;
  muscle: MesocycleView["muscles"][number];
  isPriority: boolean;
  muscleLabel: string;
}) {
  return (
    <>
      <div className="sticky left-0 z-10 flex items-center gap-1 bg-canvas pr-3 text-nav text-fg-soft">
        {isPriority ? <span className="text-accent" title="Prioritized">▲</span> : null}
        {muscleLabel}
      </div>
      {block.weeks.map((w) => {
        const cell = w.cells.find((c) => c.muscle === muscle)!;
        return <GridCell key={`${muscle}-${w.index}`} block={block} week={w} cell={cell} />;
      })}
    </>
  );
}
```

- [ ] **Step 5: Block page `src/app/app/block/[blockId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { BlockHeader } from "~/components/block/block-header";
import { BlockGrid } from "~/components/block/block-grid";
import { mockMesocycle } from "~/views/_fixtures/mock-block";

export default async function BlockPage({ params }: { params: Promise<{ blockId: string }> }) {
  const { blockId } = await params;
  if (blockId !== mockMesocycle.id) notFound();
  return (
    <div className="flex min-h-full flex-col">
      <BlockHeader block={mockMesocycle} />
      <BlockGrid block={mockMesocycle} />
    </div>
  );
}
```

- [ ] **Step 6: Replace the `block-navigator.tsx` placeholder with the real Column-2 content**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mockMesocycle } from "~/views/_fixtures/mock-block";

export function BlockNavigator() {
  const pathname = usePathname() ?? "";
  const block = mockMesocycle;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/app/block/${block.id}`} className="text-list font-semibold text-fg hover:text-accent">
          {block.name}
        </Link>
        <div className="text-[12px] text-fg-subtle">{block.status}</div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {block.weeks.map((w) => {
          const href = `/app/block/${block.id}/week/${w.index}`;
          const active = pathname === href;
          const marker = w.index < block.currentWeekIndex ? "✓" : w.isCurrent ? "◀" : "";
          const label = w.isDeload ? "Deload" : `Wk ${w.index}`;
          return (
            <Link
              key={w.index}
              href={href}
              className={
                "flex items-center justify-between rounded-pill px-2.5 py-1.5 text-list transition-colors " +
                (active ? "bg-selection text-accent" : "text-fg-muted hover:text-fg")
              }
            >
              <span>{label}</span>
              <span className={w.isCurrent ? "text-accent" : "text-fg-subtle"}>{marker}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

- [ ] **Step 7: Verify (typecheck + visual)**

Run: `pnpm typecheck` → 0 errors.
Run: `pnpm dev`, visit `/app/block/mock-block-1`:
- Grid reads as a heat map: the ramp warms week-to-week (rest→building→optimal), the deload column is muted and lower-zone.
- Current week (Wk 3) column has the `bg-selection` wash + accent header — the **only** accent inside the grid.
- Sticky muscle labels stay pinned on horizontal scroll; SIDE_DELTS shows the ▲ priority marker.
- Hovering a cell shows the `14 sets — optimal · MEV 8 / MAV 14 / MRV 22` tooltip; column footers show weekly totals.
- Column 2 shows the block navigator with week checks/current marker; clicking a week (cell, header, or navigator) routes to `/week/[n]` (page body lands in Task 5).
Stop the server.

- [ ] **Step 8: Commit**

```bash
git add src/components/block/ src/components/nav/block-navigator.tsx src/app/app/block/[blockId]/page.tsx
git commit -m "feat(experience): block heat-map grid, tool header, and block navigator"
```

---

## Task 5: Week detail — session cards with fractional muscle chips

**Files:**
- Create: `src/components/block/session-card.tsx`, `src/app/app/block/[blockId]/week/[n]/page.tsx`

**Interfaces:**
- Consumes: `SessionView`/`PrescriptionView`/`WeekView`/`MuscleWeekCell` from `~/views/types`; `zoneFor`; `mockMesocycle`.
- Produces: the week-detail screen at `/app/block/[blockId]/week/[n]`.

- [ ] **Step 1: `session-card.tsx`**

```tsx
import type { SessionView } from "~/views/types";

function short(m: string): string {
  return m.replace(/_/g, " ").toLowerCase();
}

export function SessionCard({ session }: { session: SessionView }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-card-title text-fg">{session.label}</div>
        <div className="text-[12px] text-fg-subtle">
          {session.dayTag ? `${session.dayTag} · ` : ""}
          {session.estimatedMinutes} min
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {session.prescriptions.map((p, i) => (
          <li key={`${p.exerciseName}-${i}`}>
            <div className="text-body text-fg">
              {p.exerciseName} — {p.sets} × {p.repRangeLow}–{p.repRangeHigh} @ {p.targetRir} RIR
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {p.muscles.map((c) => (
                <span
                  key={c.muscle}
                  className={
                    "rounded-pill px-1.5 py-0.5 text-[11px] " +
                    (c.role === "PRIMARY" ? "bg-surface-raised text-fg-soft" : "text-fg-subtle")
                  }
                >
                  {short(c.muscle)} {c.fraction}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Week-detail page `src/app/app/block/[blockId]/week/[n]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { SessionCard } from "~/components/block/session-card";
import { zoneFor } from "~/components/viz/zone";
import { mockMesocycle } from "~/views/_fixtures/mock-block";

export default async function WeekDetail({ params }: { params: Promise<{ blockId: string; n: string }> }) {
  const { blockId, n } = await params;
  if (blockId !== mockMesocycle.id) notFound();
  const week = mockMesocycle.weeks.find((w) => w.index === Number(n));
  if (!week) notFound();

  const optimal = week.cells.filter((c) => zoneFor(c.plannedSets, c) === "optimal").length;
  const nearMax = week.cells.filter((c) => zoneFor(c.plannedSets, c) === "max").length;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border-subtle px-6 py-5">
        <Link href={`/app/block/${mockMesocycle.id}`} className="mb-2 inline-flex items-center gap-1 text-nav text-fg-muted hover:text-fg">
          <ChevronLeft className="size-4" /> Block
        </Link>
        <h1 className="text-section text-fg">
          {week.isDeload ? "Deload week" : `Week ${week.index}`} · {week.sessions.length} sessions · {week.totalSets} total sets
        </h1>
        <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
          <span className="rounded-pill bg-zone-optimal-soft px-2 py-0.5 text-fg-soft">{optimal} muscles optimal</span>
          {nearMax > 0 ? <span className="rounded-pill bg-zone-max-soft px-2 py-0.5 text-fg-soft">{nearMax} near MRV</span> : null}
        </div>
      </header>
      <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        {week.sessions.map((s) => (
          <SessionCard key={s.slotId} session={s} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify (typecheck + visual)**

Run: `pnpm typecheck` → 0 errors.
Run: `pnpm dev`, from the grid click Wk 3:
- Week header shows `Week 3 · 5 sessions · N total sets` + zone summary chips.
- Session cards show `Upper A`, day tag, duration, and each prescription as `Barbell Bench Press — 4 × 6–10 @ 2 RIR` with fractional muscle chips (`chest 1 · triceps 0.5 · front delts 0.5`), primary chip emphasized.
- Back affordance returns to the grid; Column 2 stays visible (training route).
- Visiting the deload week (Wk 6) shows higher RIR (4) and reduced sets.
Stop the server.

- [ ] **Step 4: Commit**

```bash
git add src/components/block/session-card.tsx src/app/app/block/[blockId]/week/[n]/page.tsx
git commit -m "feat(experience): week detail with session cards and fractional muscle chips"
```

---

## Task 6: Analysis view — landmark bars, body map, distribution strip

**Files:**
- Create: `src/components/viz/landmark-bar.tsx`, `src/components/viz/body-map.tsx`, `src/app/app/analysis/page.tsx`

**Interfaces:**
- Consumes: `LandmarkBarDatum`/`MuscleWeekCell`/`WeekView`/`MesocycleView`/`Zone` from `~/views/types`; `zoneFor`; `mockMesocycle`; `MuscleGroup` from `~/schema`.
- Produces: the Analysis screen at `/app/analysis` with a week selector, body map, MRV-sorted landmark bars, and a per-session distribution strip.

- [ ] **Step 1: `landmark-bar.tsx`**

Track renders the muscle's MEV/MAV/MRV bands; the fill goes to planned volume; a marker shows actual when known.

```tsx
import { zoneFor } from "~/components/viz/zone";
import type { LandmarkBarDatum } from "~/views/types";

const FILL: Record<string, string> = {
  rest: "bg-zone-rest",
  building: "bg-zone-building",
  optimal: "bg-zone-optimal",
  max: "bg-zone-max",
};

function label(m: string): string {
  return m.replace(/_/g, " ").toLowerCase();
}

export function LandmarkBar({ datum, scaleMax }: { datum: LandmarkBarDatum; scaleMax: number }) {
  const zone = zoneFor(datum.planned, datum);
  const pct = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 text-right text-[12px] text-fg-muted">{label(datum.muscle)}</div>
      <div className="relative h-4 flex-1 overflow-hidden rounded-pill bg-surface">
        {/* zone bands (track) */}
        <div className="absolute inset-y-0 left-0 bg-zone-rest-soft" style={{ width: pct(datum.mev) }} />
        <div className="absolute inset-y-0 bg-zone-building-soft" style={{ left: pct(datum.mev), width: pct(datum.mav - datum.mev) }} />
        <div className="absolute inset-y-0 bg-zone-optimal-soft" style={{ left: pct(datum.mav), width: pct(datum.mrv - datum.mav) }} />
        <div className="absolute inset-y-0 bg-zone-max-soft" style={{ left: pct(datum.mrv), right: 0 }} />
        {/* planned fill */}
        <div className={"absolute inset-y-0 left-0 opacity-90 " + FILL[zone]} style={{ width: pct(datum.planned) }} />
        {/* actual marker */}
        {datum.actual !== undefined ? (
          <div className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: pct(datum.actual) }} />
        ) : null}
      </div>
      <div className="w-24 shrink-0 text-[12px] text-fg-soft">
        {datum.planned} → {zone}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `body-map.tsx` (stylized anatomical SVG, 14 regions keyed by MuscleGroup)**

A single SVG with front + back schematic figures; each region is a shape whose `fill` is set by the caller per zone. This is a stylized (not medically-detailed) map — good enough to read at a glance and the signature "wow"; anatomical refinement is a later visual-polish pass. Regions are keyed by `MuscleGroup`; the caller passes a `fillFor(muscle)` returning a CSS color.

```tsx
import type { MuscleGroup } from "~/schema";

type RegionProps = { muscle: MuscleGroup; fill: string; onHover?: (m: MuscleGroup | null) => void; title: string };

function Region({ muscle, fill, onHover, title, ...rest }: RegionProps & React.SVGProps<SVGRectElement>) {
  return (
    <rect
      {...rest}
      rx={4}
      fill={fill}
      stroke="var(--color-border)"
      strokeWidth={1}
      onMouseEnter={() => onHover?.(muscle)}
      onMouseLeave={() => onHover?.(null)}
      className="cursor-pointer transition-[fill] duration-150"
    >
      <title>{title}</title>
    </rect>
  );
}

/** Stylized front+back figure. `fillFor` maps a muscle to a CSS color (zone token). */
export function BodyMap({
  fillFor,
  onHover,
}: {
  fillFor: (m: MuscleGroup) => string;
  onHover?: (m: MuscleGroup | null) => void;
}) {
  const r = (muscle: MuscleGroup, x: number, y: number, w: number, h: number, title: string) => (
    <Region muscle={muscle} x={x} y={y} width={w} height={h} fill={fillFor(muscle)} onHover={onHover} title={title} />
  );
  return (
    <svg viewBox="0 0 320 220" className="w-full" role="img" aria-label="Muscle volume body map">
      {/* FRONT */}
      <text x="70" y="14" textAnchor="middle" className="fill-[var(--color-fg-subtle)] text-[10px]">Front</text>
      {r("FRONT_DELTS", 44, 40, 52, 12, "Front delts")}
      {r("CHEST", 46, 54, 48, 22, "Chest")}
      {r("BICEPS", 30, 66, 12, 28, "Biceps")}
      {r("ABS", 54, 78, 32, 34, "Abs")}
      {r("QUADS", 48, 118, 44, 44, "Quads")}
      {r("FOREARMS", 24, 96, 12, 26, "Forearms")}
      {/* BACK */}
      <text x="250" y="14" textAnchor="middle" className="fill-[var(--color-fg-subtle)] text-[10px]">Back</text>
      {r("TRAPS", 226, 38, 48, 14, "Traps")}
      {r("REAR_DELTS", 218, 52, 16, 12, "Rear delts")}
      {r("SIDE_DELTS", 264, 52, 16, 12, "Side delts")}
      {r("BACK", 226, 54, 48, 40, "Back")}
      {r("TRICEPS", 210, 66, 12, 28, "Triceps")}
      {r("GLUTES", 228, 112, 44, 20, "Glutes")}
      {r("HAMSTRINGS", 228, 134, 44, 40, "Hamstrings")}
      {r("CALVES", 232, 178, 36, 26, "Calves")}
    </svg>
  );
}
```

Note: 13 of the 14 `MuscleGroup` regions are placed; if `pnpm typecheck` reveals a missing muscle (the caller's `fillFor` is total over `MuscleGroup`, but the SVG need not place every one), that's fine — unplaced muscles simply don't appear. Place all that fit legibly; the fixture's trained muscles are the ones that matter visually.

- [ ] **Step 3: Analysis page `src/app/app/analysis/page.tsx` (client — week selector state)**

```tsx
"use client";

import { useState } from "react";
import { LandmarkBar } from "~/components/viz/landmark-bar";
import { BodyMap } from "~/components/viz/body-map";
import { zoneFor } from "~/components/viz/zone";
import { mockMesocycle } from "~/views/_fixtures/mock-block";
import type { LandmarkBarDatum } from "~/views/types";
import type { MuscleGroup } from "~/schema";

const ZONE_VAR: Record<string, string> = {
  rest: "var(--color-zone-rest-soft)",
  building: "var(--color-zone-building-soft)",
  optimal: "var(--color-zone-optimal-soft)",
  max: "var(--color-zone-max-soft)",
};

export default function AnalysisPage() {
  const block = mockMesocycle;
  const [weekIndex, setWeekIndex] = useState(block.currentWeekIndex);
  const [hover, setHover] = useState<MuscleGroup | null>(null);
  const week = block.weeks.find((w) => w.index === weekIndex)!;

  const bars: LandmarkBarDatum[] = week.cells
    .map((c) => ({ muscle: c.muscle, planned: c.plannedSets, mev: c.mev, mav: c.mav, mrv: c.mrv }))
    .sort((a, b) => b.planned / b.mrv - a.planned / a.mrv); // closeness to MRV, risk on top

  const scaleMax = Math.max(...week.cells.map((c) => c.mrv)) * 1.1;
  const fillFor = (m: MuscleGroup): string => {
    const cell = week.cells.find((c) => c.muscle === m);
    if (!cell) return "var(--color-surface)";
    const base = ZONE_VAR[zoneFor(cell.plannedSets, cell)]!;
    return m === hover ? "var(--color-accent)" : base;
  };

  const perSession = week.sessions.map((s) => ({
    label: s.label,
    sets: s.prescriptions.reduce((n, p) => n + p.sets, 0),
  }));
  const maxSession = Math.max(...perSession.map((s) => s.sets));

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-border-subtle px-6 py-5">
        <h1 className="text-section text-fg">Analysis</h1>
        <label className="flex items-center gap-2 text-nav text-fg-muted">
          Week
          <select
            value={weekIndex}
            onChange={(e) => setWeekIndex(Number(e.target.value))}
            className="rounded-control border border-border bg-surface px-2 py-1 text-fg"
          >
            {block.weeks.map((w) => (
              <option key={w.index} value={w.index}>
                {w.isDeload ? "Deload" : `Week ${w.index}`}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="grid gap-8 p-6 lg:grid-cols-[320px_1fr]">
        <div><BodyMap fillFor={fillFor} onHover={setHover} /></div>
        <div className="flex flex-col gap-2">
          {bars.map((d) => (
            <LandmarkBar key={d.muscle} datum={d} scaleMax={scaleMax} />
          ))}
        </div>
      </div>

      <div className="border-t border-border-subtle px-6 py-5">
        <div className="text-eyebrow font-semibold text-fg-muted">Volume distribution</div>
        <div className="mt-3 flex items-end gap-3">
          {perSession.map((s) => (
            <div key={s.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end">
                <div className="w-full rounded-t bg-accent/60" style={{ height: `${(s.sets / maxSession) * 100}%` }} />
              </div>
              <div className="text-[11px] text-fg-subtle">{s.label}</div>
              <div className="text-[11px] text-fg-muted">{s.sets}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify (typecheck + visual)**

Run: `pnpm typecheck` → 0 errors.
Run: `pnpm dev`, visit `/app/analysis`:
- Defaults to the current week; body map regions are filled by zone; landmark bars show MEV/MAV/MRV bands with a planned fill and are sorted with the closest-to-MRV on top.
- Changing the week selector re-renders both; hovering a body region turns it accent (and you can see which muscle it is via the `<title>`).
- The body map, bars, and the grid (Block view) **agree** for the same week — cross-check SIDE_DELTS in Wk 3 reads the same zone in both.
- The distribution strip shows per-session set totals.
- No Column 2 on this route; the page is full-bleed.
Stop the server.

- [ ] **Step 5: Final verification + commit**

Run: `pnpm test` → all pass (zoneFor + fixture). Run: `pnpm typecheck` → 0 errors. Run: `pnpm lint` → clean on the new files.

```bash
git add src/components/viz/landmark-bar.tsx src/components/viz/body-map.tsx src/app/app/analysis/page.tsx
git commit -m "feat(experience): analysis view — landmark bars, body map, distribution strip"
```

---

## Self-Review

**Spec coverage (§ by §):**
- §2 kit posture — kept anatomy/tokens/type-scale; tailored via full-bleed (Task 3 `AppFrame`), zone tokens (Task 1), accent left as-is. ✓
- §3 IA & routing — `/app` layout mounts shell once; block redirect, `[blockId]`, `week/[n]`, analysis, and coach/library/settings stubs (Tasks 3–6); Column 1 nav + user row; Column 2 = block navigator on training routes only (`AppFrame` pathname gate). ✓
- §4 zone tokens — 4 tokens + `-soft`, one visual language, data-only (Task 1). ✓
- §5 Block view — tool header + progress, muscle×week heat grid with sticky labels, priority ▲, deload muting, current-week accent (only accent in grid), hover tooltip, column footers, click-to-drill (Task 4). ✓
- §6 Analysis — week selector, body map (14-keyed regions), MRV-sorted landmark bars with zone-band tracks, distribution strip (Task 6). ✓
- §7 mock-data contract — `src/views/types.ts` + `mock-block.ts`; components consume view models only; engine maps in later with no component change (Tasks 1–2). ✓
- §8 component inventory — all listed files created. ✓
- §9 testing — `zoneFor` unit-tested (Task 1); typecheck is the contract gate every task; visual checklists per task; render tests deferred. ✓

**Deliberate decisions (documented, not placeholders):**
- Single `AppShell` mount reconciled with per-route `column2`/`fullBleed` via a server-layout → client-`AppFrame` split (server fetches session; client reads pathname). Cleanest way to keep one shell while varying columns.
- Zone hexes are concrete + colorblind-safe (grey→blue→green→amber) with a note that the dataviz skill may refine — the spec fixed names/semantics, not hues.
- `body-map.tsx` is a stylized schematic (geometric regions), not medical anatomy — buildable now, keyed correctly by `MuscleGroup`; anatomical fidelity is a visual-polish follow-up.
- `BlockNavigator` is created as a null placeholder in Task 3 and given its real body in Task 4, so Task 3 runs independently.

**Type consistency:** every component's props are view-model types from `src/views/types.ts`; `zoneFor` takes the `{mev,mav,mrv}` shape that `MuscleWeekCell`/`LandmarkBarDatum` both satisfy; `Zone` is defined once and re-exported by `zone.ts`. No component imports `~/engine` or Prisma.

## Execution Handoff

Plan complete. Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, spec+quality review between tasks, final whole-branch review. Note: UI tasks verify via typecheck + the per-task visual checklist (the controller or user runs `pnpm dev`), since render tests are deferred.
2. **Inline Execution** — execute in this session with checkpoints.
