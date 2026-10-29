# Landing page: "the week rewrites itself"

Date: 2026-10-28 · Status: draft for owner review
Approved mockups: `.superpowers/brainstorm/20352-1793194849/content/hero-directions.html` (direction **A**) and `full-scroll-v2.html` (gitignored; screenshots can be regenerated from them).

## Intent

A signed-out visitor should leave the page thinking: *"these engineers have optimised training with agents and data."* The wow comes from **seeing the product work**, not from effects: a real-looking training week rewrites itself in front of them, a small model turns what they said into a structured request, a deterministic engine does the maths, and nothing changes until they tap.

The honest split (the model listens, the engine decides, the athlete approves) is the selling point, not a caveat. It's what an engineer finds impressive, and it is what the product really does (PRODUCT.md principles 1–3).

The page replaces the current signed-out landing at `/` (`src/app/_components/landing.tsx`). It reads as the same product as the app: same tokens, same kit, the M.

## Goals

- A hero that shows a week adapting (direction A), played once on load.
- A scroll below it with itero.world's pacing: short tag, two-beat headline, three ticks and a product visual, alternating sides, one dark sheet for contrast, a closing CTA and a footer.
- Every visual is built from kit components and Tailwind tokens (crisp at any DPI), not screenshots.
- Fully responsive down to 360px with no horizontal scroll. Respects reduced motion.

## Non-goals

- No live engine or model calls from the page. Every visual is a scripted, static-data replica.
- No waitlist, email capture, analytics, pricing, testimonials, stats or press. (Sign-up is open via Google, as today.) None of these exist (PRODUCT.md "Evidence on hand"), and none may be invented.
- No dark theme for the app, and no changes to any `/app` surface.
- No new font, colour hex or icon family.

## Anti-goals (a failure even if it works)

- Looks like a landing-page kit: centred hero, gradient text, glass, floating feature pills, purple buttons.
- Claims the AI writes the plan, or shows a model producing a number. "AI operating system" framing is retired on this page.
- Anything that loops or moves for decoration. Motion only ever shows a *change* to the plan.
- Presents roadmap items (endurance sports, Garmin/Strava) as available.

## Constraints

- **DESIGN.md is normative**, with two sanctioned exceptions for this page only (owner-approved via the mockup):
  1. **Ink sheets:** the "Under the hood" section and the footer use an `ink` ground with white text, and the section after the sheet overlaps it with a 40px top radius (itero's sheet transition). Add any new colours needed (e.g. white-on-ink text and hairline alphas) as role tokens in `theme.css` first (No New Hex Rule). Do not introduce a general dark theme.
  2. **Larger section headlines:** the landing uses `text-display` for the hero and closing CTA, plus two landing-only sizes: an H2 (~44px / 1.06 / 680) and a feature H3 (~34px / 1.08 / 660, also used for the card-pair titles at ~22px if needed). Add them as tokens or utilities in `theme.css` (for example `text-landing-h2` and `text-landing-h3`); don't use ad-hoc sizes in components. *(Spec-writer's call after the builder check: a third token beats reusing `text-stat` for headings.)*
- Everything else holds: one blue (only the moved session's ring, accept buttons, focus rings and the "04 · You accept" step), zone colours on data only, left-aligned layout, Lucide outlined icons, `tabular-nums` on numbers, motion ≤300ms per step on `--ease-soft` / `--ease-out` with no overshoot, and one ink-primary button per viewport.
- Stack: Next.js 15 App Router, React 19, Tailwind v4, kit at `~/components/ui-kit/app-shell-kit`. No new dependencies (no animation library). Motion uses CSS plus a small amount of client state.
- `src/app/page.tsx` keeps its job: signed-in visitors are redirected to `/app`, and signed-out visitors get the landing. Sign-in stays `SignInButton` (Google, `callbackURL: "/app"`).
- Copy follows the target voice in PRODUCT.md: motivational, punchy, high-energy and true. Use the terminology exactly (block, week, session, set, RIR, deload, Form).

## The page, top to bottom (as approved)

Sections are left-aligned inside a ~1120px container (the 800 Rule is for app content; the landing is marketing, matching the existing landing's `max-w-6xl`).

### 0. Top bar

`Wordmark` on the left. On the right: anchor links **How it works** (`#how-it-works`) and **The engine** (`#engine`), plus a secondary pill **Sign in** that triggers the same Google sign-in. Below `sm`, hide the anchor links and keep Sign in.

### 1. Hero (direction A)

- Left: eyebrow "Adaptive training, engineered", `text-display` H1 (the page's one H1), a lede naming the split (the engine owns every number, a small model listens, nothing changes until you tap), then **Continue with Google** (primary) and **See how it adapts ↓** (secondary, scrolls to `#how-it-works`).
- Right: a Panel containing:
  - a coach-box replica (pill input with a send button),
  - a header row ("Week 3 of 6" and a `building` Chip "Form · Productive", matching the app's `readiness-chip.tsx` mapping),
  - a 7-day week board (Mon–Sun with dates, sessions as small white cards with set counts, one outside activity "Run · easy" on Saturday),
  - an accept-gate card: "Move Upper B to Friday?", a reason line, then **Not now** (ghost) and **Accept move** (accent).
- **The one-shot sequence**, starting shortly after first paint:
  1. "can't make Thursday, work trip" types into the input.
  2. Thursday turns hatched with a "Busy" label, and Upper B becomes a dashed ghost there.
  3. Upper B settles into Friday with the accent ring.
  4. The accept card rises in (`animate-rise`).

  Each transition is ≤300ms. The total length, including holds, stays **under 5s** so it needs no pause control (WCAG 2.2.2). The final state stays on screen. A small "Replay" text button appears after it ends. The sequence starts only while the tab is visible and the demo is in view, so a background-tab load doesn't play it unseen.
- **Reduced motion:** render the final state immediately, with no typing.
- **Not interactive:** the demo's buttons are presentational (no focus, `aria-hidden` on the replica, and a visually hidden one-sentence description of what it shows).

### 2. The problem

Eyebrow "The problem", H2 "A spreadsheet, a notes app, a calendar and a chatbot walk into your training block.", lede beside it (the athlete shouldn't also be the project manager). Below: four struck-through neutral chips (`Block_v7_FINAL.xlsx`, `Notes: "legs?? thurs"`, `Calendar, moved 3×`, `"make me a PPL split"`), an arrow, and a pill with the M tile and "One adaptive plan".

### 3. How it works (`#how-it-works`)

Three alternating feature rows (text left/visual right, then flipped, then back), each with a tag, a two-line H3, a lede and three tick bullets:

| Tag | Headline | Visual (kit-built replica) |
|---|---|---|
| Missed a session | Miss a day. / The week reflows. | Reschedule dialog: "You missed Upper A", three options (make it up on Wednesday, *Recommended*, accent outline; fold half into Upper B; let it go), **Decide later** / **Accept** |
| The engine | Every set / has a reason. | Block grid: 4 muscles × W1–W5 + Deload, cells filled with zone `-soft` colours, plus a zone legend |
| Readiness | Know when to push. / Know when to back off. | Form stat (`text-stat`, e.g. −6%), a `building` "Productive" chip, a Fitness / Fatigue / Form line chart and legend that **mirror the app's `readiness-chart.tsx` encoding** (Form ink 2.5, Fitness `zone-building`, Fatigue dashed `zone-max`) |

Then a two-card pair:
- **Progression**, "Check in. Level up.": a sunken well with "Chest 16 → 18 sets", "Quads 14 · hold, recovery low", **Keep as is** / **Accept week 4**.
- **Coach cues**, "Running Saturday? It noticed.": a cue row (icon tile, "Two big days in a row", a g/kg carb line).

Each visual plays its one change once when it first scrolls into view (IntersectionObserver): the recommended option highlights, the grid's cells fill week by week, the Form line draws, and "16 → 18" appears. With reduced motion, the final state shows immediately. Nothing replays on scroll-back.

### 4. Under the hood (`#engine`), ink sheet

Ink ground, 40px top radius. Eyebrow "Under the hood", H2 "The model listens. The engine decides. You approve.", lede ("Most 'AI coaches' let a language model make up your sets. We don't…").

- **Four step cards:** 01 You say ("can't make Thursday, work trip"); 02 A small model parses (a well showing `intent: block / date: Thu 13 / half: all day`); 03 The engine costs it (three arrangements: best recovery, fewest changes, keeps preferred times); 04 You accept (accent hairline).
- **Two law cards:** **Law 1**, "The engine owns every number." **Law 2**, "Nothing is made up." (The model never writes a weight, a set count or a readiness score.)

### 5. The M story

Canvas section overlapping the ink sheet with a 40px top radius. Eyebrow "Built around the block", H2 "Climb. Deload. Come back higher.", a lede tying the method to the mark. On the right, the M drawn large from the canonical path at a thinner stroke, with labels "Weeks 1–4 · Deload · Block 2" under the segments. Use the kit `Mark` or the canonical path. Don't redraw or distort the geometry. Showing the mark large in marketing is allowed; the One Mark Rule's "never animate" applies to product chrome, and the M stays static here too.

### 6. Closing CTA

`bg-atmosphere`. 64px ink tile with the M, `text-display` H2 "Your next block deserves a real plan.", lede, **Continue with Google** and **See how it adapts ↑** (scrolls to the hero and replays the demo).

### 7. Footer (ink)

- **Columns:** Wordmark (inverted: white tile, ink M) with one short, human line about what Mesodapt is · **Product** (How it works, The engine, Sign in) · **Training** (Hypertrophy blocks; Running & cycling *(soon)*; Garmin & Strava *(soon)*) · **Connect**.
- **Connect links** (the same ones the owner uses on itero.world's footer): Email `mailto:freddyhmk@gmail.com` · LinkedIn `https://www.linkedin.com/in/freddykhant240/` · GitHub `https://github.com/freddykhant` (profile, not the repo) · Portfolio `https://freddykhant.com`. External links open in a new tab with `rel="noopener noreferrer"`.
- **Bottom row:** "Built by Freddy Khant" · Privacy (`/privacy`) · Terms (`/terms`) · © 2026 Mesodapt.

### 8. Privacy and Terms pages (owner-approved, in scope)

Two new public routes, `/privacy` and `/terms`, sharing a simple light layout: Wordmark top bar, an 800px reading column, a "Last updated <date>" line, numbered sections, and the same footer. Signed-in visitors can open them too (no redirect).

**Voice: model them on itero.world/privacy and /terms**, which the owner wrote. First person singular ("I"), because Mesodapt is built and run by one person, not a company. Short sentences, specific facts, and no legal fog. They describe what the app actually does *today* and promise to update the page and its date when that changes.

**They must be true, so derive them from the code, not from memory.** The builder audits and states:
- **Account (Better Auth):** name, email, email-verified flag, profile image URL, timestamps.
- **Sessions:** token, IP address, user agent, and their lifetime.
- **Google sign-in:** what scopes are requested, and **whether Google access, refresh or ID tokens are stored.** The `Account` model has columns for them. Check what Better Auth actually writes. Itero says it keeps none; don't copy that claim unless it's true here.
- Whether email/password sign-in is enabled (`src/server/better-auth/config.ts`).
- **Training data:** athlete profile (age, sex, height, bodyweight if given), availability, blocked time, outside activities, the block and sessions, set logs, and check-ins.
- **Coach box:** the text of each message (≤500 chars) is stored, to count the daily cap and to see which phrasings weren't understood. It's never fed back into a prompt. The message, plus the limited week context listed in PRODUCT.md (no ids, email or profile data), is sent to Anthropic's API to be parsed.
- **Judgement layer:** what is sent to TypeSafe (Jev), if anything personal.
- **Infrastructure:** hosting (Vercel) and the database host (check `DATABASE_URL`'s provider, e.g. Neon).
- How to get data deleted (email the owner) and the contact address.

**Terms** cover: one person runs it; it's provided as is and may change or lose data; acceptable use (no scraping, no running up model costs, no attacking the service); **training and fuelling guidance is general information, not medical advice. Check with a professional if you have an injury or condition, and stop if something hurts.** That last point matters because coach cues give g/kg carb ranges.

The owner reviews both pages before merge. They are the only copy on the site with legal weight.

## Writing so it doesn't sound AI-generated (owner requirement)

Applies to the footer and the Privacy and Terms pages, and as a standing rule to all landing copy:

- Write like the owner talks. Name things plainly: "I", "Mesodapt", "your block". Don't use a corporate "we" on the legal pages.
- Ban the tells: *seamless, leverage, empower, unlock, elevate, effortless, revolutionise, journey, cutting-edge, robust, "we value your privacy", "at Mesodapt we believe"*. Avoid rule-of-three lists used for rhythm, em-dash chains, and every sentence opening with a verb.
- Be specific instead of grand: "a session lasts seven days" beats "we keep sessions secure".
- Leave a little personality in: the "Notes: legs?? thurs" chip energy, not brochure polish.
- Read every line aloud before shipping. If it sounds like an ad for a bank, rewrite it.

## Data visuals mirror the app

Every replica of an app surface uses the app's own colour encoding and labels, so a visitor who signs in sees the same key. Where the mockup differs from the app (it used green for Productive), **the app wins**. *(Spec-writer's call after the builder check.)*

## Copy

The mockup copy is the approved first pass. The builder may tighten wording but keeps every claim true to PRODUCT.md. Illustrative numbers (set counts, −6%, 1–1.2 g/kg, 48h) are fine as demo data but must be internally consistent and plausible for the engine (e.g. deload ≈ half of peak volume).

## Metadata

Update `src/app/layout.tsx` metadata `description` away from "The AI operating system for self-coached athletes" to the mental-strain-relief framing (for example "The adaptive training layer for self-coached athletes."). Add Open Graph title and description. An OG image is out of scope.

## UI/UX checks (from the ui-ux-pro-max guidelines)

Verified against the skill's `landing`, `ux`, `nextjs` and `react` guidance:

- **Product-demo pattern:** the final state of every demo is real, readable content. Never autoplay under reduced motion. Don't run work offscreen or in a hidden tab.
- **Motion budget:** animate at most one or two key elements per viewport. Each feature row's visual plays one change, and nothing else on screen moves. No parallax and no scroll-jacking.
- **Anchors:** in-page links scroll smoothly (`scroll-behavior: smooth`, set to `auto` under reduced motion), and sections get a `scroll-margin-top` so headings land with breathing room. If the top bar is made sticky, the margin must clear it.
- **Landmarks:** `header` > `nav`, `main`, one `section` per block with `aria-labelledby` pointing at its heading, and `footer`. Add a visually hidden "Skip to content" link as the first focusable element.
- **Server first (Next.js):** `page.tsx` and every static section stay Server Components. Only the leaves are `"use client"`: the hero demo player, the scroll-in vignettes and `SignInButton`.
- **Effects (React):** every timer and IntersectionObserver is cleaned up in the effect's return. React 19 StrictMode double-invokes effects in dev, so the one-shot sequence must not double-play.

## Flagged for re-review: the colour scheme

The owner plans to redesign the colour schemes. These choices follow today's tokens on purpose and must be revisited when that happens:

- **Form and readiness colours**: mirror the app (`readiness-chip.tsx` / `readiness-chart.tsx`) for now: Productive = `building`, Form line ink, Fitness `zone-building`, Fatigue dashed `zone-max`.
- **Zone fills** in the block grid and legend.
- **Ink sheets**: the "Under the hood" section and the footer (and any `on-ink` text and hairline tokens added for them).
- **The atmosphere glow** on the hero and closing CTA (peach → periwinkle).
- **The accent blue's placements**: moved session, accept buttons, step 04.

Keep every one of these on role tokens (no literal colours in components), so the redesign is a `theme.css` change, not a hunt through the landing's files. Mark each with a short `// re-review: colour scheme` comment where the choice is made.

## Left to the builder

- Component breakdown and file layout (suggested: `src/app/_components/landing/` with one file per section plus the shared demo pieces). The replicas may share small presentational pieces with each other but must not import live app components that fetch data or need tRPC.
- Exact timings within the ≤300ms-per-step rule, and how the typing effect is done.
- Mobile layouts: stack the columns. The week board keeps 7 columns at 360px by shortening cells (day initials, session names on two lines, set counts may hide). The block grid may drop to 3 muscles × 6 columns. The step cards stack 1-up/2-up.
- Tests: pure logic only (e.g. the demo's step sequencer, if extracted) as `*.test.ts`. The visuals are verified in the browser.
