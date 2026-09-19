# Routing / Flow Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the app's routing/flow plumbing — a single cached block fetch, guards in one place, a clean entry flow, and flattened block URLs — with no feature/behavior changes.

**Architecture:** A request-scoped `React.cache()` accessor (`currentBlock`/`requireCurrentBlock`) collapses the ~7 per-request `getCurrentBlock` calls into one and centralizes the onboarding gate. The `/app` layout owns auth + onboarding guards; pages shrink to `requireCurrentBlock()`. `/` routes signed-in users into `/app`; the orphaned `/home` is deleted. Block routes drop the `[blockId]` segment.

**Tech Stack:** Next.js 15 App Router (RSC), tRPC 11, BetterAuth, Tailwind v4, pnpm.

## Global Constraints

- **Branch:** all work on `freddy/feat/routing-refactor`, off `freddy/experimental`; merges into `freddy/experimental` after the user's visual "lgtm". Nothing pushed to origin unless asked.
- **No behavior/feature changes** beyond routing/guards/fetching: engine, schema, view models, and page *content* (block grid, week view, session logging, reschedule, analysis, onboarding wizard) stay identical. Existing unit suites must stay green.
- **No landing/marketing redesign** — the signed-out `/` view keeps its current markup (the T3 "Hi there" gradient); we only add the signed-in redirect and remove the dead signed-in branch.
- **Import paths:** `~/*` → `src/*`. RSC tRPC caller `api` from `~/trpc/server`; `getSession` from `~/server/better-auth/server`; `redirect`/`notFound` from `next/navigation`; `cache` from `react`.
- **Verification:** structural — gate each task on `pnpm typecheck && pnpm lint`; the user does the click-through flow check (subagents don't run `pnpm dev`).
- **Flattened block URLs (verbatim):** block detail = `/app/block`; week detail = `/app/block/week/[n]`. No `[blockId]` segment; no back-compat redirects for old URLs.
- **Sign-in callback:** `SignInButton` must use `callbackURL: "/app"` (currently `/home`, which this refactor deletes).

---

## File Structure

| File | Action | Task |
|---|---|---|
| `src/server/mesocycle/current-block.ts` | create (`currentBlock`, `requireCurrentBlock`) | 1 |
| `src/app/page.tsx` (`/`) | modify (signed-in redirect, trim dead branch) | 2 |
| `src/app/_components/auth-buttons.tsx` | modify (`callbackURL`→`/app`, remove `SignOutButton`) | 2 |
| `src/app/home/page.tsx` | delete | 2 |
| `src/app/app/layout.tsx` | modify (cached accessor; sole guards) | 3 |
| `src/app/app/page.tsx` | modify (`requireCurrentBlock`, drop `EmptyBlockState`) | 3 |
| `src/app/app/analysis/page.tsx` | modify (same) | 3 |
| `src/app/onboarding/page.tsx` | modify (cached accessor) | 3 |
| `src/app/app/block/page.tsx` | replace redirect-only w/ block detail | 4 |
| `src/app/app/block/week/[n]/page.tsx` | create (from `[blockId]/week/[n]`) | 4 |
| `src/app/app/block/[blockId]/` | delete (both files) | 4 |
| `src/components/nav/block-navigator.tsx` | modify (link targets) | 4 |
| `src/components/home/next-session-card.tsx` | modify (drop `blockId`, link) | 4 |
| `src/app/app/page.tsx` | modify (drop `blockId` prop from NextSessionCard) | 4 |
| `src/components/app/empty-block-state.tsx` | delete (after last usage removed) | 4 |

**Order:** 1 (accessor) → 2 (entry flow, independent) → 3 (layout + non-block pages) → 4 (block routes + link updates + EmptyBlockState deletion). Tasks 3 and 4 both touch `src/app/app/page.tsx` (Task 3: accessor swap; Task 4: drop the `blockId` prop) — sequential, non-conflicting.

**Note on intermediate state:** Task 3 removes `EmptyBlockState` from `app/page`/`analysis` but leaves the component file and its remaining block-route importers intact, so the branch still typechecks between tasks; Task 4 removes the last importers and deletes the component.

---

## Setup: create the branch

- [ ] **Step 1: Branch off experimental**

```bash
git checkout freddy/experimental && git checkout -b freddy/feat/routing-refactor
```
Expected: `Switched to a new branch 'freddy/feat/routing-refactor'`.

---

### Task 1: Cached current-block accessor

**Files:**
- Create: `src/server/mesocycle/current-block.ts`

**Interfaces:**
- Consumes: `api` (`~/trpc/server`), `MesocycleView` (`~/views/types`), `cache` (react), `redirect` (next/navigation).
- Produces: `currentBlock(): Promise<MesocycleView | null>` (request-cached), `requireCurrentBlock(): Promise<MesocycleView>` (redirects to `/onboarding` when null).

- [ ] **Step 1: Write the accessor**

Create `src/server/mesocycle/current-block.ts`:

```ts
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { api } from "~/trpc/server";
import type { MesocycleView } from "~/views/types";

/**
 * The signed-in athlete's current block, fetched at most once per request.
 * `cache()` is request-scoped, so the /app layout and any page it renders share
 * a single getCurrentBlock query instead of each re-issuing it.
 */
export const currentBlock = cache(
  async (): Promise<MesocycleView | null> => api.mesocycle.getCurrentBlock(),
);

/**
 * The current block, guaranteed non-null. A blockless athlete is redirected to
 * onboarding (the same gate the /app layout applies) — so pages can consume the
 * block directly without their own empty-state branch.
 */
export async function requireCurrentBlock(): Promise<MesocycleView> {
  const block = await currentBlock();
  if (!block) redirect("/onboarding");
  return block;
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean (no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add src/server/mesocycle/current-block.ts && git commit -m "feat(routing): request-cached current-block accessor"
```

---

### Task 2: Entry / auth flow

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/_components/auth-buttons.tsx`
- Delete: `src/app/home/page.tsx`

- [ ] **Step 1: Route signed-in users off `/`**

Replace `src/app/page.tsx` entirely with:

```tsx
import { redirect } from "next/navigation";
import { SignInButton } from "~/app/_components/auth-buttons";
import { getSession } from "~/server/better-auth/server";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/app");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">Hi there</h1>
      <SignInButton />
    </main>
  );
}
```

(Keeps the signed-out view as-is per scope; removes the now-unreachable signed-in branch and the `SignOutButton` import.)

- [ ] **Step 2: Fix the sign-in callback + remove the orphaned SignOutButton**

In `src/app/_components/auth-buttons.tsx`:
- Change `callbackURL: "/home"` to `callbackURL: "/app"`.
- Delete the entire `SignOutButton` function (it was used only by `/` and `/home`; the app nav owns sign-out via `authClient.signOut`).
- Remove now-unused imports: `useRouter` from `next/navigation` (only `SignOutButton` used it). Keep `authClient`, `FaGoogle`.

Resulting file:

```tsx
"use client";

import { FaGoogle } from "react-icons/fa";

import { authClient } from "~/server/better-auth/client";

export function SignInButton() {
  return (
    <button
      type="button"
      onClick={() =>
        authClient.signIn.social({
          provider: "google",
          callbackURL: "/app",
        })
      }
      className="inline-flex items-center rounded-full bg-white/10 px-10 py-3 font-semibold transition hover:bg-white/20"
    >
      <FaGoogle className="mr-2 h-4 w-4" />
      Sign in with Google
    </button>
  );
}
```

- [ ] **Step 3: Delete the orphaned `/home` route**

```bash
git rm src/app/home/page.tsx
```

- [ ] **Step 4: Verify nothing else references `/home` or `SignOutButton`**

Run: `grep -rn "/home\|SignOutButton" src` (expect no matches in `src`, aside from unrelated substrings — there should be none).
Then: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/_components/auth-buttons.tsx && git commit -m "feat(routing): route signed-in users to /app, drop dead /home + SignOutButton"
```

---

### Task 3: Centralize guards + cached fetch (layout + non-block pages)

**Files:**
- Modify: `src/app/app/layout.tsx`
- Modify: `src/app/app/page.tsx`
- Modify: `src/app/app/analysis/page.tsx`
- Modify: `src/app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `currentBlock`, `requireCurrentBlock` from `~/server/mesocycle/current-block` (Task 1).

- [ ] **Step 1: Layout uses the cached accessor (sole guards)**

Replace `src/app/app/layout.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { AppFrame } from "~/components/nav/app-frame";
import { currentBlock } from "~/server/mesocycle/current-block";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  const block = await currentBlock();
  if (!block) redirect("/onboarding");
  return (
    <AppFrame userName={session.user.name} userEmail={session.user.email} block={block}>
      {children}
    </AppFrame>
  );
}
```

- [ ] **Step 2: `/app` Now-home uses `requireCurrentBlock`**

In `src/app/app/page.tsx`:
- Remove the `EmptyBlockState` import and the `api` import.
- Add `import { requireCurrentBlock } from "~/server/mesocycle/current-block";`.
- Replace:
  ```tsx
    const block = await api.mesocycle.getCurrentBlock();
    if (!block) return <EmptyBlockState />;
  ```
  with:
  ```tsx
    const block = await requireCurrentBlock();
  ```
- Leave the rest of the file unchanged (including the `<NextSessionCard ... blockId={block.id} .../>` call — Task 4 removes that prop).

- [ ] **Step 3: Analysis page uses `requireCurrentBlock`**

Replace `src/app/app/analysis/page.tsx` with:

```tsx
import { AnalysisView } from "~/components/analysis/analysis-view";
import { requireCurrentBlock } from "~/server/mesocycle/current-block";

export default async function AnalysisPage() {
  const block = await requireCurrentBlock();
  return <AnalysisView block={block} />;
}
```

- [ ] **Step 4: Onboarding page uses the cached accessor**

In `src/app/onboarding/page.tsx`, replace the `api` import and its call with the cached accessor (keep the two guards — they are correct here, outside the `/app` layout):

```tsx
import { redirect } from "next/navigation";
import { OnboardingWizard } from "~/components/onboarding/onboarding-wizard";
import { getSession } from "~/server/better-auth/server";
import { currentBlock } from "~/server/mesocycle/current-block";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/");
  const block = await currentBlock();
  if (block) redirect("/app"); // already has an active block — no re-onboarding
  return <OnboardingWizard />;
}
```

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (`EmptyBlockState` still imported by the block-route files — that's fine until Task 4.)

- [ ] **Step 6: Commit**

```bash
git add src/app/app/layout.tsx src/app/app/page.tsx src/app/app/analysis/page.tsx src/app/onboarding/page.tsx && git commit -m "feat(routing): centralize guards + single cached block fetch"
```

---

### Task 4: Flatten block routes

**Files:**
- Modify (replace): `src/app/app/block/page.tsx`
- Create: `src/app/app/block/week/[n]/page.tsx`
- Delete: `src/app/app/block/[blockId]/page.tsx`, `src/app/app/block/[blockId]/week/[n]/page.tsx`
- Modify: `src/components/nav/block-navigator.tsx`
- Modify: `src/components/home/next-session-card.tsx`
- Modify: `src/app/app/page.tsx`
- Delete: `src/components/app/empty-block-state.tsx`

- [ ] **Step 1: Block detail moves to `/app/block`**

Replace `src/app/app/block/page.tsx` (currently the redirect-only index) with the block detail:

```tsx
import { BlockHeader } from "~/components/block/block-header";
import { BlockGrid } from "~/components/block/block-grid";
import { requireCurrentBlock } from "~/server/mesocycle/current-block";

export default async function BlockPage() {
  const block = await requireCurrentBlock();
  return (
    <div className="flex min-h-full flex-col">
      <BlockHeader block={block} />
      <BlockGrid block={block} />
    </div>
  );
}
```

- [ ] **Step 2: Week detail moves to `/app/block/week/[n]`**

Create `src/app/app/block/week/[n]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { SessionPanel } from "~/components/block/session-panel";
import { zoneFor } from "~/components/viz/zone";
import { requireCurrentBlock } from "~/server/mesocycle/current-block";

export default async function WeekDetail({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const block = await requireCurrentBlock();
  const week = block.weeks.find((w) => w.index === Number(n));
  if (!week) notFound();

  const optimal = week.cells.filter((c) => zoneFor(c.plannedSets, c) === "optimal").length;
  const nearMax = week.cells.filter((c) => zoneFor(c.plannedSets, c) === "max").length;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border-subtle px-6 py-5">
        <Link href="/app/block" className="mb-2 inline-flex items-center gap-1 text-nav text-fg-muted hover:text-fg">
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
          <SessionPanel key={s.slotId} session={s} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Delete the `[blockId]` directory**

```bash
git rm -r "src/app/app/block/[blockId]"
```

- [ ] **Step 4: Update the block navigator links**

In `src/components/nav/block-navigator.tsx`:
- Change `href={`/app/block/${block.id}`}` (the block-name link) to `href="/app/block"`.
- Change the per-week `const href = `/app/block/${block.id}/week/${w.index}`;` to `const href = `/app/block/week/${w.index}`;`.

(No other changes; `block.id` may now be unused in this file — remove any resulting unused reference if lint flags it.)

- [ ] **Step 5: Update NextSessionCard — drop `blockId`**

In `src/components/home/next-session-card.tsx`:
- Remove `blockId` from the props type and the destructured params.
- Change the link `href={`/app/block/${blockId}/week/${weekIndex}`}` to `href={`/app/block/week/${weekIndex}`}`.

- [ ] **Step 6: Drop the `blockId` prop at the call site**

In `src/app/app/page.tsx`, remove `blockId={block.id}` from the `<NextSessionCard ... />` call (leave `session`, `weekIndex`, `readinessLabel`).

- [ ] **Step 7: Delete the now-unused `EmptyBlockState`**

Confirm no importers remain, then delete:

```bash
grep -rn "EmptyBlockState\|empty-block-state" src   # expect: no matches
git rm src/components/app/empty-block-state.tsx
```

If grep still shows a match, remove that import/usage first (it should already be gone after Tasks 3–4).

- [ ] **Step 8: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(routing): flatten block routes to /app/block + /app/block/week/[n]"
```

---

## Post-implementation: user flow verification (not a subagent step)

Run `pnpm dev` and confirm:
1. Signed-out `/` shows the sign-in button; signing in with Google lands on `/app` (not a 404 — `/home` is gone).
2. A signed-in athlete with a block sees `/app`; visiting `/` bounces to `/app`.
3. A signed-in athlete with no ACTIVE block is sent to `/onboarding`.
4. Nav "Block" → `/app/block` (grid); the week sidebar + "Start session" land on `/app/block/week/[n]`; the week "Block" back-link returns to `/app/block`.
5. Session logging + reschedule still work through the new week URL.
6. Old `/app/block/<id>` and `/home` URLs 404 (expected).
7. (Optional) server logs show a single `getCurrentBlock` per `/app/*` request.

## Whole-branch review

Dispatch the whole-branch review (most capable model) over `freddy/experimental..freddy/feat/routing-refactor`, focused on: no dangling references to removed routes/props/component; guards not weakened (every `/app/*` path still auth+onboarding gated); the cached accessor genuinely dedupes; existing unit suites green. Then use superpowers:finishing-a-development-branch.

## Self-Review (completed)

- **Spec coverage:** cached accessor (Task 1) ✓; entry flow incl. `callbackURL` fix (Task 2) ✓; centralized guards + single fetch (Task 3) ✓; flattened block routes + link updates + `blockId` prop drop + `EmptyBlockState` deletion (Task 4) ✓.
- **Discovered + folded in:** `SignInButton.callbackURL` was `/home` — flipped to `/app` so deleting `/home` doesn't break sign-in.
- **File-overlap check:** `src/app/app/page.tsx` edited by Task 3 (accessor) then Task 4 (prop drop) — sequential, distinct edits. `src/app/page.tsx` (root `/`) ≠ `src/app/app/page.tsx` (`/app`) — no confusion.
- **Intermediate typecheck:** Task 3 leaves `EmptyBlockState` + its block-route importers intact; Task 4 removes the last importers before deleting the component — no broken intermediate state.
- **Placeholder scan:** none; every code step carries full code or an exact edit.
