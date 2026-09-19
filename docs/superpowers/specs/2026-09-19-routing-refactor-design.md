# Routing / Flow Refactor (Design)

**Status:** Approved 2026-09-19
**Scope:** Structural plumbing of the app's routing, guards, entry flow, and data fetching. NOT an IA/section rework, NOT a landing redesign.
**Branch target:** merges into `freddy/experimental` (standing rule).
**Builds on:** ①/②/③ merged. Touches routing/guards only — no engine, schema, or feature-logic changes.

## Problem

The routing and navigation flow accreted across ①–③ and is now a mess:

1. **Two dead/duplicate entry pages.** `/` (`src/app/page.tsx`) is a half-finished T3 scaffold that **dead-ends signed-in users** (renders a sign-out button instead of routing them to `/app`). `/home` (`src/app/home/page.tsx`) is an orphaned scaffold nothing links to.
2. **`getCurrentBlock` fetched ~7× per navigation.** The `/app` layout fetches it, then every page under it fetches it again; no `React.cache()`, so the same query double-runs each request. (The ① deferred minor, still open.)
3. **Block URLs are ceremony.** `/app/block` is a redirect-only page → `/app/block/[blockId]`, and `[blockId]` `notFound()`s unless it equals the single active block. With multi-block a deferred non-goal, the `[blockId]` segment buys only a redirect hop + 404 risk.
4. **Guards scattered & duplicated.** Auth, onboarding-gate, and block-exists/`EmptyBlockState` logic are spread across the layout, the onboarding page, and each page — subtly different in each.

## Non-goals (deferred, named)

- **IA / section changes** — `readiness`, `coach`, `library`, `settings` stay first-class nav items with their current content. Their thinness is not addressed here.
- **Landing / marketing redesign** — the signed-out `/` view stays functionally as-is (sign-in entry). No new marketing page.
- **Multi-block support** — still one ACTIVE block; that's *why* we can flatten the block URLs.
- **Middleware-based auth** — considered and rejected: the onboarding gate needs a DB query (block existence), which is awkward at the edge. Guards stay in the RSC `/app` layout.
- **Page content / components** beyond link-target updates and dropping redundant guards.

## Architecture

### 1. Entry / auth flow

- **`src/app/page.tsx`** (`/`): add `const session = await getSession(); if (session) redirect("/app");` — signed-in users go straight to the app. The signed-out branch keeps the existing `SignInButton` view (functionally unchanged; the now-unreachable "signed in as … / SignOutButton" branch is removed).
- **Delete `src/app/home/page.tsx`** (`/home`) — orphaned; nothing links to it and it's not in the nav.
- **`src/app/_components/auth-buttons.tsx`** — `SignOutButton` was consumed only by `/` and `/home`; after cleanup the nav owns sign-out (`app-nav.tsx` calls `authClient.signOut`). Remove `SignOutButton` if it becomes unused; keep `SignInButton`.

### 2. One guard, one fetch

- **Request-cached accessor.** Add `src/server/mesocycle/current-block.ts`:
  - `currentBlock()` = `React.cache()`-wrapped call to the RSC tRPC caller `api.mesocycle.getCurrentBlock()`. `cache()` is request-scoped, so the layout's call and any page's call within the same request dedupe to a single DB query.
  - `requireCurrentBlock()` = `const b = await currentBlock(); if (!b) redirect("/onboarding"); return b;` — returns a **non-null** `MesocycleView`, so callers get a clean type without re-implementing the empty check.
- **Guards centralized in `src/app/app/layout.tsx`** (already the natural chokepoint): `getSession()` → `redirect("/")` if none; `await currentBlock()` → `redirect("/onboarding")` if none; render `AppFrame`. This is the single source of the auth + onboarding gates for everything under `/app`.
- **Pages under `/app` stop re-guarding.** Each page that needs the block calls `await requireCurrentBlock()` (one cached query) and drops its own `getCurrentBlock()` + `if (!block) return <EmptyBlockState />`. Because both the layout and `requireCurrentBlock()` redirect a blockless user to `/onboarding`, the "no active block" page state is now unreachable — **remove every `EmptyBlockState` usage, and delete the component** (`src/components/app/empty-block-state.tsx`) once no imports remain. (Grep to confirm before deleting.)
- **Onboarding page** (`src/app/onboarding/page.tsx`, outside the `/app` layout) keeps its own `getSession` + block guards — that is correct, not the duplication we're removing — but switches to the cached `currentBlock()` accessor for consistency.

### 3. Flatten block routes

Single active block ⇒ drop the `[blockId]` segment:

- Move `src/app/app/block/[blockId]/page.tsx` → **`src/app/app/block/page.tsx`** (block detail, no id param). This replaces the current redirect-only `block/page.tsx`. Remove the `blockId !== block.id` `notFound()`.
- Move `src/app/app/block/[blockId]/week/[n]/page.tsx` → **`src/app/app/block/week/[n]/page.tsx`**. Remove the `blockId` param + its `notFound()`; keep the `week` lookup + `notFound()` when the week index is invalid.
- Delete the now-empty `[blockId]` directory.
- **Update link sources:**
  - `src/components/nav/block-navigator.tsx` — `href={`/app/block/${block.id}`}` → `/app/block`; week links `/app/block/${block.id}/week/${w.index}` → `/app/block/week/${w.index}`.
  - `src/components/home/next-session-card.tsx` — `href={`/app/block/${blockId}/week/${weekIndex}`}` → `/app/block/week/${weekIndex}`; drop the now-unused `blockId` prop (and its pass-in at `src/app/app/page.tsx`).
- `AppFrame`'s `pathname.startsWith("/app/block")` (`app-frame.tsx`) is unchanged — still correctly matches the flattened routes.

## Data flow (after)

```
/  (signed in) ─redirect→ /app
/  (signed out) → sign-in view
/app/* layout:  getSession ? : →/     ·  currentBlock() ? : →/onboarding   [one cached query]
  page: requireCurrentBlock() → same cached block, non-null
/app/block           → block detail (was /app/block/[blockId])
/app/block/week/[n]  → week detail  (was /app/block/[blockId]/week/[n])
/onboarding: signed out →/ · has block →/app · else wizard   (uses cached accessor)
```

## Error / edge handling

- Signed-out at any `/app/*` route → `/` (layout). Signed-out at `/onboarding` → `/`.
- No ACTIVE block at `/app/*` → `/onboarding` (layout, one place).
- Invalid week index at `/app/block/week/[n]` → `notFound()`.
- Direct navigation to old `/app/block/<id>` URLs → Next 404 (acceptable; pre-release, no external links). Not adding redirects for the removed segment.

## Testing

Structural refactor — no new pure logic beyond the thin cached accessor, so:
- **Typecheck + lint gate** (catches broken imports, dangling props, removed-file references).
- **User flow verification** (subagents don't run the dev server): signed-out `/` shows sign-in; signing in lands on `/app`; a no-block account is sent to `/onboarding`; `/app/block` shows the block; the week sidebar + "Start session" links land on `/app/block/week/[n]`; session logging + reschedule still reachable; `/home` is gone (404); the block still renders with a single `getCurrentBlock` query (spot-check via server logs / network).
- Existing unit suites (mappers, engine, schema) must stay green — this refactor must not touch their inputs.

## Files (anticipated)

- Modify `src/app/page.tsx` (signed-in redirect; trim dead branch).
- Delete `src/app/home/page.tsx`; trim `src/app/_components/auth-buttons.tsx` if `SignOutButton` unused.
- Create `src/server/mesocycle/current-block.ts` (`currentBlock`, `requireCurrentBlock`).
- Modify `src/app/app/layout.tsx` (use cached accessor; sole guards).
- Move `block/[blockId]/page.tsx` → `block/page.tsx`; move `block/[blockId]/week/[n]/page.tsx` → `block/week/[n]/page.tsx`; delete `[blockId]/`.
- Modify `src/app/app/page.tsx`, `analysis/page.tsx` (use `requireCurrentBlock`, drop re-guards + `EmptyBlockState`).
- Delete `src/components/app/empty-block-state.tsx` once no imports remain (grep to confirm).
- Modify `src/app/onboarding/page.tsx` (use cached accessor).
- Modify `src/components/nav/block-navigator.tsx`, `src/components/home/next-session-card.tsx` (link targets; drop `blockId` prop).

## Success criteria

Signed-in users never dead-end on `/`; `/home` is gone. Every `/app/*` request resolves the block in **one** cached query, with auth + onboarding gates living solely in the `/app` layout and pages reduced to `requireCurrentBlock()`. Block detail is `/app/block` and week detail `/app/block/week/[n]` — no `[blockId]` hop or 404 trap. All existing features (block grid, week view, session logging, reschedule, onboarding, analysis) work unchanged through the new paths. Typecheck + lint clean; existing unit suites green; no engine/schema/feature-logic changes.
