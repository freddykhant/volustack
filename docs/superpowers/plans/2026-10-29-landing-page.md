# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the signed-out landing at `/` with the approved "week rewrites itself" page (hero demo, itero-paced scroll, ink sheet, footer), and add `/privacy` and `/terms`.

**Architecture:** Server Components for every static section under `src/app/_components/landing/`. The only client leaves are the hero demo player, the scroll-in vignettes (one shared `useReveal` hook) and `SignInButton`. Demo timing is a pure, elapsed-time-driven script, so it is unit-testable and immune to StrictMode double effects. Legal pages live in a `(legal)` route group with a shared layout and the same footer.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4 tokens in `src/components/ui-kit/app-shell-kit/theme.css`, the kit at `~/components/ui-kit/app-shell-kit`, Vitest (node env, `src/**/*.test.ts`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-28-landing-page-design.md`. Approved mockups: `.superpowers/brainstorm/20352-1793194849/content/hero-directions.html` (direction A) and `full-scroll-v2.html`. Open the mockup in a browser before building a section; it is the visual reference.

**Branch:** `freddy/feat/landing` (cut from `dev`). Commit there; don't push.

## Global Constraints

- DESIGN.md is normative. The only sanctioned exceptions: ink sheets ("Under the hood" and the footer), and the landing-only type tokens `text-landing-h2` (~44px / 1.06 / 680 / -0.032em) and `text-landing-h3` (~34px / 1.08 / 660 / -0.03em).
- No hex or Tailwind palette class in components. Add a role token to `theme.css` first.
- One blue: accent only on the moved session's ring, accent buttons, focus rings and engine step "04 · You accept".
- Data replicas mirror the app's encoding: Productive = `building` chip tone; readiness chart Form = `fg` (2.5), Fitness = `zone-building`, Fatigue = dashed `zone-max` (as in `src/components/readiness/readiness-chart.tsx`).
- Every colour choice listed in the spec's "Flagged for re-review" section carries a `// re-review: colour scheme` comment where it is made.
- Motion: ≤300ms per transition, `--ease-soft`/`--ease-out`, no overshoot, nothing loops. The hero sequence totals **< 5000ms**. Reduced motion shows final states immediately.
- Left-aligned everywhere. One H1 per page. `tabular-nums` on every number.
- Copy: motivational, true to PRODUCT.md, and passes the banned-phrase guard (Task 2). Legal pages are first person ("I").
- No new dependencies. No waitlist, analytics, stats or testimonials.
- Footer Connect: `mailto:freddyhmk@gmail.com`, `https://www.linkedin.com/in/freddykhant240/`, `https://github.com/freddykhant`, `https://freddykhant.com`.

## Review Focus

1. **Phone width (360px):** the 7-column week board, the block grid and the step cards must not cause horizontal page scroll. Checked by Task 7's `scrollWidth` assertion at 360px.
2. **Reduced motion:** a visitor with reduced motion must see the hero's final state (Thursday busy, Upper B on Friday, accept card visible) with no typing. Covered by Task 3's `demoStateAt` reduced-motion test and Task 7's emulated screenshot.
3. **StrictMode / remount:** the hero demo must not double-play or leak timers when effects run twice. Covered by Task 3's purity test (`demoStateAt` depends only on elapsed time) and the effect cleanup in Step 3.5.
4. **Keyboard:** the first Tab lands on "Skip to content". Nothing inside the `aria-hidden` replicas is focusable. Covered by Task 7's focus checks.
5. **Signed-in visitors:** `/` still redirects to `/app`, but `/privacy` and `/terms` render without a redirect. Covered by Task 6 Step 6.4.

---

### Task 1: Tokens, scroll behaviour and the Mark's stroke

**Files:**
- Modify: `src/components/ui-kit/app-shell-kit/theme.css`
- Modify: `src/components/ui-kit/app-shell-kit/components/mark.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Produces: utilities `text-landing-h2`, `text-landing-h3`; colours `on-ink-muted` (white @ .68), `on-ink-subtle` (white @ .64), `ink-raised` (white @ .05), `ink-well` (white @ .06), `ink-border` (white @ .10); radius `rounded-sheet-xl` = 40px; `Mark({ className, strokeWidth? = 2.5 })`.

- [ ] **Step 1.1:** In `theme.css` `@theme`, add the two landing text tokens (with `--line-height`, `--font-weight` and `--letter-spacing` sub-properties like `--text-display`, each commented `/* landing only */`), the five ink-ground colour tokens (commented `/* landing ink sheet + footer. re-review: colour scheme */`), and `--radius-sheet-xl: 40px`.
- [ ] **Step 1.2:** In `globals.css`, set `html { scroll-behavior: smooth; }` inside `@media (prefers-reduced-motion: no-preference)`, and add `[id] { scroll-margin-top: 24px; }`.
- [ ] **Step 1.3:** Give `Mark` an optional `strokeWidth?: number` prop (default `2.5`). Leave the doc comment, and note that only the landing's block story passes a thinner stroke.
- [ ] **Step 1.4:** Run `pnpm check`. Expected: no lint or type errors.
- [ ] **Step 1.5:** Commit: `feat(landing): landing type and ink-sheet tokens; Mark stroke prop`.

---

### Task 2: Copy guard and shared landing primitives

**Files:**
- Create: `src/app/_components/landing/copy-guard.test.ts`
- Create: `src/app/_components/landing/primitives.tsx`

**Interfaces:**
- Produces (`primitives.tsx`, server components):
  - `LandingSection({ id?, labelledBy, className?, children })`, a `<section aria-labelledby>`.
  - `Container({ className?, children })`: `mx-auto w-full max-w-[1120px] px-4 sm:px-8`.
  - `Eyebrow({ children, onInk? })`.
  - `Tag({ children })`: a neutral 26px pill.
  - `TickList({ items: string[], onInk? })`: Lucide `Check` `size-4`, `aria-hidden`.
  - `FeatureRow({ tag, title: [string, string], lede, ticks: string[], visual: ReactNode, flip?: boolean, headingId })`: H3 in `text-landing-h3`, with the visual on the right (left when `flip`), stacking below `lg`.

- [ ] **Step 2.1: Write the failing test.** `copy-guard.test.ts` reads every `.tsx`/`.ts` file (excluding `*.test.ts`) under `src/app/_components/landing/` and `src/app/(legal)/` with `node:fs`, then asserts:

```ts
const BANNED = [/\bseamless/i, /\bleverag/i, /\bempower/i, /\bunlock/i, /\belevat/i, /\beffortless/i,
  /\brevolution/i, /\bjourney\b/i, /cutting[- ]edge/i, /\brobust\b/i, /we value your privacy/i,
  /at mesodapt,? we/i, /AI operating system/i];
it("scans the landing sources", () => expect(files.length).toBeGreaterThanOrEqual(1));
it.each(BANNED)("no %s in landing or legal copy", (re) => { for (const f of files) expect(read(f)).not.toMatch(re); });
```

- [ ] **Step 2.2:** Run `pnpm vitest run src/app/_components/landing/copy-guard.test.ts`. Expected: FAIL on "scans the landing sources" (no files yet).
- [ ] **Step 2.3:** Write `primitives.tsx` to the interfaces above.
- [ ] **Step 2.4:** Rerun. Expected: PASS. Commit: `feat(landing): section primitives and a banned-phrase copy guard`.

---

### Task 3: Top bar, hero and the scripted week demo

**Files:**
- Create: `src/app/_components/landing/demo-script.ts`, `demo-script.test.ts`
- Create: `src/app/_components/landing/week-demo.tsx` (`"use client"`)
- Create: `src/app/_components/landing/top-bar.tsx`, `hero.tsx`
- Modify: `src/app/_components/auth-buttons.tsx`

**Interfaces:**
- Produces (`demo-script.ts`):
  - `export const DEMO_MESSAGE = "can't make Thursday, work trip"`.
  - `type DemoPhase = "idle" | "typing" | "busy" | "moved" | "proposed"`.
  - `type DemoState = { phase: DemoPhase; typed: string; done: boolean }`.
  - `export const DEMO_TOTAL_MS: number`.
  - `export function demoStateAt(elapsedMs: number, opts?: { reducedMotion?: boolean }): DemoState`.
- Produces: `SignInButton({ variant?: "primary" | "secondary" = "primary", size?: "md" | "lg" = "lg", label?: string = "Continue with Google", showIcon?: boolean = true })`.
- Produces: `TopBar()` and `Hero()` (server). `Hero` contains `<WeekDemo />`.

- [ ] **Step 3.1: Write the failing tests** in `demo-script.test.ts`:
  - `DEMO_TOTAL_MS < 5000`.
  - `demoStateAt(0).phase === "idle"` and `typed === ""`.
  - Mid-typing (pick a time inside the typing window): `typed` is a strict prefix of `DEMO_MESSAGE`.
  - Phases occur in the order idle → typing → busy → moved → proposed as `t` increases. Sample every 50ms up to `DEMO_TOTAL_MS + 500` and assert the phase index never decreases.
  - `demoStateAt(DEMO_TOTAL_MS)` equals `{ phase: "proposed", typed: DEMO_MESSAGE, done: true }`, and so does any later time.
  - `demoStateAt(0, { reducedMotion: true })` equals the final state.
  - Purity: `demoStateAt(1234)` deep-equals a second call to `demoStateAt(1234)`.
  - Negative input is clamped: `demoStateAt(-100)` equals `demoStateAt(0)`.
- [ ] **Step 3.2:** Run `pnpm vitest run src/app/_components/landing/demo-script.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3.3:** Implement `demoStateAt` as a lookup over a constant schedule. Suggested schedule: 400ms idle, then typing at ~45ms/char (~1.35s), a 250ms hold, then `busy`, `moved` (+650ms) and `proposed` (+650ms), for a total of about 3.6s. Each visual change is a CSS transition ≤300ms; the gaps are holds.
- [ ] **Step 3.4:** Rerun. Expected: PASS.
- [ ] **Step 3.5: `WeekDemo`.** A client component that renders the Panel replica from the mockup (coach-box pill, "Week 3 of 6" with `<Chip tone="building">Form · Productive</Chip>` `// re-review: colour scheme`, a 7-day board, the "Run · easy" activity on Saturday, and the accept card).
  - **Driving it:** a `useEffect` starts a `requestAnimationFrame` loop that stores `performance.now() - start` and renders `demoStateAt(elapsed, { reducedMotion })`. Read reduced motion with `matchMedia`.
  - **When it starts:** only once `document.visibilityState === "visible"` *and* an IntersectionObserver (threshold 0.4) reports the demo is in view.
  - **Cleanup:** the effect returns cleanup that cancels the RAF and disconnects the observer.
  - **Accessibility:** the whole replica is `aria-hidden`, with a sibling `sr-only` sentence: "Demo: you tell Mesodapt you can't make Thursday, and it proposes moving Upper B to Friday. Nothing changes until you accept."
  - **Inert controls:** replica buttons are `<span>`s styled with `buttonClass(...)`, never `<button>`.
  - **Replay:** after `done`, show a ghost "Replay" `<button>` *outside* the `aria-hidden` subtree that resets the start time. It also listens for a `landing:replay` window event (Task 5 dispatches it).
  - **Visual states:** `busy` → Thursday cell gets the hatched style and a "Busy" label, with Upper B ghosted (dashed). `moved` → Upper B appears in Friday with `ring-2 ring-accent/15 border-accent` `// re-review: colour scheme`. `proposed` → the accept card mounts with `animate-rise`.
  - **Under 400px:** day cells show initials and set counts hide. No horizontal scroll.
- [ ] **Step 3.6: `SignInButton`.** Add the props from Interfaces. The kit's `Button` takes `variant` and `size`. When `showIcon` is false, render no Google glyph.
- [ ] **Step 3.7: `TopBar` and `Hero`** per spec §0–1.
  - `TopBar`: a visually hidden "Skip to content" link (`href="#main"`, visible on focus) comes first. Then `Wordmark`, the anchors `#how-it-works` / `#engine` (hidden below `sm`), and `<SignInButton variant="secondary" size="md" label="Sign in" showIcon={false} />`.
  - `Hero`: `bg-atmosphere`, the H1 in `text-display`, `SignInButton`, and a `ButtonLink variant="secondary" href="#how-it-works"` reading "See how it adapts ↓". Two columns at `lg`, stacked below.
- [ ] **Step 3.8:** Run `pnpm vitest run src/app/_components/landing && pnpm check`. Expected: all pass.
- [ ] **Step 3.9:** Commit: `feat(landing): top bar, hero and the scripted week demo`.

---

### Task 4: The problem, How it works and the scroll-in vignettes

**Files:**
- Create: `src/app/_components/landing/use-reveal.ts` (`"use client"`)
- Create: `src/app/_components/landing/demo-data.ts`, `demo-data.test.ts`
- Create: `src/app/_components/landing/problem.tsx`, `how-it-works.tsx`
- Create: `src/app/_components/landing/vignettes/reschedule.tsx`, `block-grid.tsx`, `readiness.tsx`, `progression.tsx`, `coach-cue.tsx` (each `"use client"` only if it animates)

**Interfaces:**
- Produces: `useReveal<T extends Element>(): { ref: RefObject<T | null>; revealed: boolean }`. It reveals once when 35% visible, is true immediately under reduced motion, never un-reveals, and disconnects on cleanup.
- Produces (`demo-data.ts`):
  - `BLOCK_GRID: { muscle: string; weeks: number[]; deload: number }[]` (4 muscles, 5 weeks).
  - `zoneFor(sets: number, muscle: string): "building" | "optimal" | "max"`.
  - `READINESS_SERIES: { week: number; fitness: number; fatigue: number; form: number }[]`.
  - `PROGRESSION: { muscle: string; from: number; to: number | null; note?: string }[]`.

- [ ] **Step 4.1: Write the failing tests** in `demo-data.test.ts`. These pin the spec's "plausible for the engine" rule:
  - Every muscle's `deload` is between 40% and 60% of `Math.max(...weeks)`.
  - Every muscle's `weeks` is non-decreasing.
  - `zoneFor` never returns `"max"` before week 4 for any muscle.
  - The last `READINESS_SERIES` point has `form < 0` and `form / fitness >= -0.10`. That makes it "Productive" by the app's banding (≥ −10% and < +5%), so the "Productive" chip and the "−6%" copy are consistent; derive the displayed % from the data.
  - `PROGRESSION` contains Chest 16 → 18 and Quads 14 → null with the note "hold, recovery low".
- [ ] **Step 4.2:** Run `pnpm vitest run src/app/_components/landing/demo-data.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 4.3:** Write `demo-data.ts` using the mockup's numbers where they satisfy the tests, and adjust any that don't.
- [ ] **Step 4.4:** Rerun. Expected: PASS.
- [ ] **Step 4.5:** Build `useReveal`, then the vignettes, each matching the mockup. Each one plays its one change when `revealed`; nothing else on screen moves.
  - **reschedule:** the recommended option gets its accent outline and "Recommended" chip.
  - **block-grid:** cells fill week by week, with a ≤300ms fade each and a ~60ms stagger. Uses `bg-zone-*-soft` `// re-review: colour scheme`.
  - **readiness:** an inline SVG, following the app's encoding (Global Constraints). The Form line draws in via `stroke-dashoffset` over 300ms. Includes the legend and the `text-stat` value.
  - **progression:** "16 → 18" fades in.
  - **coach-cue:** static, no motion.
  - All replicas are `aria-hidden`, with an `sr-only` one-line summary each.
- [ ] **Step 4.6:** Build `Problem` (spec §2: four struck-through neutral chips, an arrow, then the M pill) and `HowItWorks` (spec §3: three `FeatureRow`s with the middle one flipped, then the card pair; `id="how-it-works"`). Copy starts from the mockup, then goes through the voice rules.
- [ ] **Step 4.7:** Run `pnpm vitest run src/app/_components/landing && pnpm check`. Expected: PASS.
- [ ] **Step 4.8:** Commit: `feat(landing): problem section, how-it-works rows and scroll-in vignettes`.

---

### Task 5: Under the hood, the M story, closing CTA, footer and assembly

**Files:**
- Create: `src/app/_components/landing/engine.tsx`, `block-story.tsx`, `closing-cta.tsx`, `replay-link.tsx` (`"use client"`), `site-footer.tsx`, `index.tsx`
- Delete: `src/app/_components/landing.tsx`
- Modify: `src/app/layout.tsx` (metadata)

**Interfaces:**
- Consumes: the Task 1 tokens, the Task 2 primitives, `SignInButton`, and the `landing:replay` event.
- Produces: `Landing()` exported from `~/app/_components/landing` (so `src/app/page.tsx` is unchanged), and `SiteFooter()` (reused by Task 6).

- [ ] **Step 5.1: `Engine`** (spec §4).
  - Section `id="engine"` on `bg-ink text-on-ink rounded-t-sheet-xl` `// re-review: colour scheme`.
  - The H2 uses `text-landing-h2`. Four step cards on `bg-ink-raised border-ink-border`; card 04 has an accent hairline `// re-review: colour scheme`. The parsed-form well uses `bg-ink-well`.
  - Two law cards: Law 1 "The engine owns every number." / Law 2 "Nothing is made up."
  - Step cards go 4-up at `lg`, 2-up at `sm` and 1-up below.
- [ ] **Step 5.2: `BlockStory`** (spec §5).
  - Canvas ground, `-mt-10 rounded-t-sheet-xl` over the ink sheet.
  - `<Mark strokeWidth={1.4} className="w-full max-w-[520px] text-fg" />`, with the labels "Weeks 1–4 · Deload · Block 2". Static, no animation.
- [ ] **Step 5.3: `ClosingCta`** (spec §6).
  - 64px ink tile containing a 40px `Mark`, then an H2 in `text-display`, a lede and a `SignInButton`.
  - `ReplayLink`: a secondary-styled `<a href="#top">` labelled "See how it adapts ↑". On click it dispatches `new Event("landing:replay")` after the scroll starts.
- [ ] **Step 5.4: `SiteFooter`** (spec §7).
  - `bg-ink text-on-ink` `// re-review: colour scheme`. An inverted wordmark (white tile with an ink `Mark`, built here, not by changing `Wordmark`) with one short, human line.
  - Columns: Product, Training (with "(soon)"), Connect (the Global Constraints URLs). External links get `target="_blank" rel="noopener noreferrer"`.
  - Bottom row: "Built by Freddy Khant", `/privacy`, `/terms`, "© 2026 Mesodapt".
  - Column headings use `on-ink-subtle`.
- [ ] **Step 5.5: `index.tsx`.** `Landing()` composes `TopBar`, then `<main id="main">` holding Hero, Problem, HowItWorks, Engine, BlockStory and ClosingCta, then `SiteFooter`. Give the hero wrapper `id="top"`. Then delete the old `landing.tsx`.
- [ ] **Step 5.6:** In `layout.tsx` metadata, set `description` to a plain line without "AI operating system" (for example "Training blocks that adapt when your week changes. You approve every change."), and add `openGraph: { title: "Mesodapt", description }`.
- [ ] **Step 5.7:** Run `pnpm vitest run && pnpm check`. Expected: PASS (the full suite, so nothing else broke).
- [ ] **Step 5.8:** Commit: `feat(landing): engine sheet, block story, closing CTA, footer; assemble the page`.

---

### Task 6: Privacy and Terms

**Files:**
- Create: `src/app/(legal)/layout.tsx`, `src/app/(legal)/privacy/page.tsx`, `src/app/(legal)/terms/page.tsx`, `src/app/(legal)/legal-section.tsx`

**Interfaces:**
- Consumes: `SiteFooter`, `Wordmark`.
- Produces: `LegalSection({ n: number, title: string, children })`, numbered "01", "02"… in `tabular-nums`.

- [ ] **Step 6.1: Audit before writing.** Read and note the facts the spec's §8 checklist asks for:
  - `prisma/schema.prisma` (`User`, `Session`, `Account`, `AthleteProfile`, `CoachMessage`, plus the training models).
  - `src/server/better-auth/config.ts`: providers, email/password, session lifetime. Find out whether Google tokens are persisted (Better Auth stores `accessToken`, `refreshToken` and `idToken` on `Account` by default unless configured otherwise; confirm against the code and, if possible, one row's null-ness via `pnpm db:studio`, **read-only**).
  - `src/server/coach/client.ts` (what is sent to Anthropic).
  - `src/server/judgement/client.ts` (what is sent to TypeSafe).
  - `.env` `DATABASE_URL` host (provider name only, no secrets).

  Write the findings as the commit body in Step 6.5. Don't put any claim in the copy that the audit didn't confirm.
- [ ] **Step 6.2: Layout.** `(legal)/layout.tsx`: a canvas ground, a top bar with `Wordmark` linking to `/`, a `max-w-[800px]` reading column, then `SiteFooter`. No session redirect.
- [ ] **Step 6.3: Pages.**
  - Each page has one H1 (`text-page-title`) and a "Last updated 29 October 2026" line.
  - **Privacy sections:** Who runs Mesodapt · What it stores · Google sign-in · Your training data · The coach box · Services it relies on · How long things are kept · Deleting your data · Changes.
  - **Terms sections:** About these terms · Provided as is · Your account · Acceptable use · Training and fuelling advice isn't medical advice · Changes · Contact.
  - **Voice:** modelled on itero.world/privacy and /terms (first person, one person, short and specific). Read itero's pages with WebFetch or Playwright for tone only; never copy claims.
- [ ] **Step 6.4: Verify the routes.** Run `pnpm dev`, then:
  - Signed out: `curl -s -o /dev/null -w "%{http_code}" localhost:3000/privacy` → `200`, and the same for `/terms`.
  - Signed in: open `/privacy` in the browser and confirm it renders with no redirect, then confirm that `/` still redirects to `/app`.
- [ ] **Step 6.5:** Run `pnpm vitest run src/app/_components/landing/copy-guard.test.ts && pnpm check`. Expected: PASS. Commit: `feat(legal): privacy and terms pages, written from an audit of what the app stores`, with the audit notes as the body. The owner reviews this copy before merge.

---

### Task 7: Browser verification

**Files:**
- Create (scratch, not committed): a Playwright script in the session scratchpad. Install `playwright` there, not in the repo; Chromium is cached at `~/Library/Caches/ms-playwright/chromium-1228`.

- [ ] **Step 7.1:** With `pnpm dev` running (port 3000; restart it if it was started on another branch, since stale RSC graphs are a known issue), take full-page screenshots of `/` at 1440, 1024, 768, 390 and 360 wide. Also capture the hero at 0s, 1.5s and 4s after load at 1440.
- [ ] **Step 7.2:** At 360px, assert `document.documentElement.scrollWidth <= 360`. Do the same on `/privacy` and `/terms`.
- [ ] **Step 7.3:** With `reducedMotion: "reduce"` emulated, screenshot the hero immediately after load. Expected: final state (Busy Thursday, Upper B on Friday, accept card), and the input shows the full message.
- [ ] **Step 7.4:** Keyboard checks:
  - The first `Tab` focuses the "Skip to content" link, and pressing Enter moves focus or scroll to `#main`.
  - `document.querySelectorAll('[aria-hidden="true"] a, [aria-hidden="true"] button, [aria-hidden="true"] [tabindex]').length === 0`.
- [ ] **Step 7.5:** Click "See how it adapts ↓" and confirm `#how-it-works` scrolls into view. Click the closing CTA's "↑" link and confirm the hero replays (the 0.5s screenshot shows phase `typing`).
- [ ] **Step 7.6:** Compare the screenshots against the mockups, fix any drift, then rerun `pnpm vitest run && pnpm check`. Commit fixes as `fix(landing): …`. Report the screenshot paths to the owner for visual sign-off.
