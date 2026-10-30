---
name: Mesodapt
description: The adaptive training layer for self-coached athletes. A light, warm, quiet surface where one blue signal says what's next.
source: src/components/ui-kit/app-shell-kit/theme.css   # values below mirror it exactly; theme.css wins on conflict
colors:
  canvas: "#faf9f7"
  surface: "rgba(255, 255, 255, 0.82)"
  surface-raised: "#ffffff"
  sunken: "rgba(17, 18, 20, 0.035)"
  hover: "rgba(17, 18, 20, 0.04)"
  press: "rgba(17, 18, 20, 0.07)"
  scrim: "rgba(17, 18, 20, 0.28)"
  selection: "rgba(10, 111, 224, 0.08)"
  callout: "rgba(10, 111, 224, 0.06)"
  fg: "#17181a"
  fg-soft: "#3d4148"
  fg-muted: "#5f646c"
  fg-subtle: "#70757c"
  ink: "#17181a"
  ink-hover: "#2a2c30"
  on-ink: "#ffffff"
  accent: "#0a6fe0"
  accent-strong: "#0858b8"
  on-accent: "#ffffff"
  danger: "#c4320a"
  border: "rgba(17, 18, 20, 0.08)"
  border-subtle: "rgba(17, 18, 20, 0.06)"
  border-strong: "rgba(17, 18, 20, 0.14)"
  zone-rest: "#64748b"            # soft: rgba(100, 116, 139, 0.12)
  zone-building: "#0284c7"        # soft: rgba(2, 132, 199, 0.11)
  zone-optimal: "#059669"         # soft: rgba(5, 150, 105, 0.12)
  zone-max: "#d97706"             # soft: rgba(217, 119, 6, 0.14)
  # Ink ground (landing "Under the hood" sheet + site footer; the candidate dark surface for the next UI pass)
  on-ink-muted: "rgba(255, 255, 255, 0.68)"
  on-ink-subtle: "rgba(255, 255, 255, 0.64)"
  ink-raised: "rgba(255, 255, 255, 0.05)"
  ink-well: "rgba(255, 255, 255, 0.06)"
  ink-border: "rgba(255, 255, 255, 0.1)"
  accent-on-ink: "#7fb6ff"        # the live signal on ink; #0a6fe0 is only ≈3.9:1 there
  # Prism: the AI accent. See "Prism & glass" below.
  prism-rose: "#ff7ab6"
  prism-amber: "#ffc46b"
  prism-mint: "#6ff0c4"
  prism-sky: "#6cc8ff"
  prism-violet: "#a98bff"
typography:
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  display:    { size: "clamp(40px, 4.2vw + 20px, 56px)", lineHeight: 1.04, weight: 680, tracking: "-0.035em" }
  page-title: { size: 30px, lineHeight: 36px, weight: 650, tracking: "-0.022em" }
  section:    { size: 20px, lineHeight: 26px, weight: 600, tracking: "-0.014em" }
  card-title: { size: 17px, lineHeight: 22px, weight: 600, tracking: "-0.01em" }
  body:       { size: 15px, lineHeight: 22px, weight: 400 }
  list:       { size: 15px, lineHeight: 20px, weight: 500 }
  card-desc:  { size: 14px, lineHeight: 20px, weight: 400 }
  nav:        { size: 14px, lineHeight: 20px, weight: 500 }
  meta:       { size: 13px, lineHeight: 18px, weight: 400 }
  eyebrow:    { size: 12px, lineHeight: 16px, tracking: "0.04em", case: uppercase }
  stat:       { size: 34px, lineHeight: 38px, weight: 650, tracking: "-0.03em" }
rounded:
  tile: 9px
  control: 10px
  callout: 14px
  card: 20px
  sheet: 24px
  pill: 9999px
  skeleton: 8px   # .skeleton default
shadow:
  control: "0 1px 2px rgba(17, 18, 20, 0.08)"
  card: "0 1px 2px rgba(17, 18, 20, 0.04), 0 8px 24px -12px rgba(17, 18, 20, 0.1)"
  card-hover: "0 1px 2px rgba(17, 18, 20, 0.05), 0 14px 32px -14px rgba(17, 18, 20, 0.16)"
  pop: "0 2px 6px rgba(17, 18, 20, 0.05), 0 24px 56px -18px rgba(17, 18, 20, 0.22)"
motion:
  ease-soft: "cubic-bezier(0.4, 0, 0.2, 1)"     # default for every transition
  ease-out: "cubic-bezier(0.22, 1, 0.36, 1)"    # entrances, check-offs; no overshoot
  default-duration: 200ms
  rise: "320ms ease-soft, translateY(6px) -> none"
  fade: "240ms ease-soft"
  shimmer: "1.6s ease-soft infinite"
layout:
  nav-column: 240px
  context-column: 256px
  top-bar: 52px
  content-max: 800px
  content-padding: "pt-10 pb-20, px-6 / md:px-10"
---

# Design System: Mesodapt

## Overview

**Creative north star: "A calm page with one live signal."**

Mesodapt takes the strain out of managing training, so the interface has to feel like relief. It's a light, warm page: an off-white canvas, translucent white cards drawn with a hairline and a soft, wide shadow, lots of whitespace, and the system font. Nearly everything is ink on paper. **One blue** marks what's live: the next session, the active row, a link, the focus ring, the confirm on an accept-gate. Because it's rare, the eye goes straight to it.

The engine holds a lot of numbers (volumes, zones, readiness, the week ahead). Those numbers carry the only other colour in the system, the zone family, and that family is for data only. Chrome stays neutral so that data reads as data.

Motion is quick and soft: 200–300ms on one curve, with no bounce. Loading uses skeletons shaped like the content they stand in for, never a spinner in the middle of the page.

**What this is not:** gradient text, glass on everything, emoji icons, purple-to-blue buttons, cards inside cards, centred hero templates. If a screen looks like a landing-page kit, it's wrong.

> **Heading into the app UI pass?** Read **Handover: the app UI pass** below first. The landing shipped on 2026-10-30 is now the reference for the whole product. The values in this file's front matter and in the Colors section are the app as it is *today*, and the pass replaces them.

## Handover: the app UI pass

**Status (2026-10-30).** The owner signed off the redesigned landing (`src/app/_components/landing/`) and named it **the design system for the app UI pass**. Where this section disagrees with older guidance further down, this section wins. Everything structural from the Luma facelift stays: the system font and type scale, radii, the 800px column, the elevation ladder, the component kit, skeletons and zone semantics. What changes is colour, the AI treatment, a few signature motions and the voice.

**The new north star: "A white page, a sky-blue brand, one pink signal, and navy glass wherever the model speaks."**

- **White and sky lead.** The page is `snow` `#fcffff`. Sky `#0593c6` is the brand: the primary pill, the mark tile, display accents, glows, chart bars.
- **Hot pink is the one live signal.** `#d83995` (text and white-on-pink use `pink-strong` `#c92d88`) does exactly what blue does today: the accept confirm, the session that just moved, "this week", the focus ring, selection. Still rare, still one per thing.
- **Navy glass is where the language model works.** The dark sheet (`night` `#071019`) with prism, grain and heavy frosted glass is the only dark surface, and it means "AI". Use it where the model's output appears, and keep numbers on light surfaces.

### Where the system lives today

Open `src/components/ui-kit/app-shell-kit/theme.css` and find the `.theme-landing` block. It re-points the existing role tokens, so every kit component already renders correctly inside it (the landing and legal pages wrap themselves in it). **The pass is mostly a token move.**

1. **Promote the values.** Copy each `.theme-landing` declaration into the root `@theme` block, replacing the current value. Then delete `.theme-landing` along with its `.bg-atmosphere`, `.glass-ink` and `::selection` overrides (fold those in too), and drop the `theme-landing` class from `landing/index.tsx` and `(legal)/layout.tsx`.
2. **Dark grounds use `bg-night`, never `bg-ink`.** `ink` is now the sky primary-button fill. Grep for `bg-ink` used as a background region (outside buttons and the mark tile) and switch it to `bg-night`. The landing footer and the AI sheet already do this.
3. **Re-check every `accent` use.** Blue becomes pink with the same meaning, so a correct use stays correct. Pink is louder than blue, though, so any place leaning on accent for decoration will now shout. Remove those.
4. **Refresh the brand assets.** `.bg-aura` (two-hue gradient), `src/app/apple-icon.tsx`, `src/app/icon.svg` and the `/app/styleguide` swatches still carry peach and periwinkle. Move them to sky and pink.
5. **Update this file.** Rewrite the front matter, the Colors section and the Overview to the new values. Then delete this "Where the system lives today" subsection.

### Token map (app today → after the pass)

| Role token | Today | After the pass | Contrast / notes |
|---|---|---|---|
| `canvas` | `#faf9f7` | `#fcffff` (`snow`) | |
| `surface` | white 82% | white 88% | |
| `sunken` / `hover` / `press` | ink 3.5 / 4 / 7% | sky 6 / 7 / 12% | Wells and washes pick up a faint sky tint |
| `selection` / `callout` | blue 8 / 6% | pink 9 / 6% | |
| `fg` / `fg-soft` / `fg-muted` / `fg-subtle` | neutral greys | navy-tinted `#0c1b26` / `#2f4252` / `#4f6272` / `#637685` | `fg-muted` ≈6.3:1, `fg-subtle` ≈4.7:1 on snow |
| `ink` / `ink-hover` | `#17181a` / `#2a2c30` | `#047aa6` (`sky-strong`) / `#03688e` | White on it ≈4.8:1 |
| `accent` / `accent-strong` | `#0a6fe0` / `#0858b8` | `#c92d88` (`pink-strong`) / `#ad1f72` | White on it ≈5:1 |
| `border*` | ink 8 / 6 / 14% | navy 9 / 6 / 16% | |
| `shadow-card` / `shadow-pop` | neutral | sky-tinted (see `.theme-landing`) | |
| `night` | `#17181a` | `#071019` | The dark ground |
| `ink-raised` / `ink-well` / `ink-border` | white 5 / 6 / 10% | white 7 / 8 / 12% | Heavier glass |
| `accent-on-ink` | `#7fb6ff` | `#ff7cc4` | The pink signal on navy |
| `prism-rose…violet` | rose, amber, mint, sky, violet | `#d83995`, `#ff8fcf`, `#9ff0ff`, `#0593c6`, `#7c4dff` | Pink-led iridescence |
| `zone-*` | unchanged | **unchanged, but see the decision below** | |

Raw `sky` `#0593c6` is only ≈3.5:1 on white. Use it for fills, bars, glows, rings and display-size type (the landing's 56px headline accent), never for body text or a label someone must read. Raw `pink` `#d83995` is ≈4.3:1, so it's for marks and fills; text uses `pink-strong`.

### Decisions the pass has to make first

- **`zone-building` collides with the brand.** It's `#0284c7`, almost the same sky as the primary button, which breaks the Data-Only Zone Rule by eye. Recommendation: move Building off sky (an indigo near `#4f5bd5` keeps the cool-to-warm order of rest → building → optimal → max), then re-check the readiness chart's Fitness line and every Building chip. Owner call.
- **Dark mode.** The navy `night` ground and the heavier glass are the natural seed for a `[data-theme=dark]` theme. That's not part of this pass unless the owner says so.

### Signature patterns to carry into the app

Each one exists on the landing, and each has a home in the product. Reuse the landing code as the reference implementation.

| Pattern | Landing source | Where it goes in the app |
|---|---|---|
| **Prism edge on the coach box while the model reads.** `border-prism` on the input, on only while a message is being parsed, then off. This is the one place prism may sit on the light page. | `story.tsx` → `WeekCard` (`reading`) | The home page coach box, between send and the proposal arriving |
| **Navy glass sheet for model output.** `bg-night` + two `.bg-prism` fields + `.bg-grain` + `.glass-ink` cards, with one `border-prism` card where the model works | `engine.tsx` | A coach-reply or "here's what I understood" sheet, and a parsed-request preview. One per screen. |
| **The hop.** A moved session leaves a dashed ghost and slides one column with `translateX(calc(100% + var(--hop)))`, 700ms `--ease-out`, landing with the pink live ring | `story.tsx` → `Traveller`, `Session look="moved"` | The week board after an accepted move. Only after Accept, never as a preview. |
| **Floating accept card.** The proposal floats over the board's edge on `shadow-pop` instead of pushing the layout down | `story.tsx` → `AcceptCard` | Every accept-gate that proposes a change to something visible behind it |
| **The block and the M.** Weekly volume bars under the mark's own path. The current week is pink and the deload sits in the notch. | `story.tsx` → `BlockChart` | The block overview header, and onboarding's "here's your block" reveal |
| **The spine.** A 1px `border-strong` line with sky ring nodes; each entry's words pin (`lg:sticky lg:top-24`) while its content scrolls | `week-diary.tsx` | The move log ("saved with the reason"), week history and block history |
| **Pinned stage.** One object stays put while text scrolls and changes it. Position is read from the captions' boxes into a pure `storyStateAt(pos)`, so it runs both ways and is unit-testable. | `story.tsx`, `story-script.ts` | Onboarding and first-run explainers only. Never in working screens. |

### Motion, adjusted

The 200ms `--ease-soft` default and the Quiet Motion Rule stand. Two sanctioned exceptions came out of the landing:

- **Spatial moves run 500–700ms on `--ease-out`.** That covers the hop, the board-to-block zoom and the accept card's rise. They explain where something went, so they need to be readable. Nothing else gets this long.
- **Scroll-scrubbed drawing is allowed on explainers.** The typing and the M are driven by scroll position rather than time, so the visitor controls them and they reverse. Under reduced motion, transitions drop to 1ms and the scroll still steps through the states.

### Voice

Every string in the pass is written the way the landing is. Use first person from Freddy where a person is speaking (empty states, onboarding, settings explanations), and plain statements of what the engine did everywhere else. Say the specific thing ("Friday still gives your upper body 48 hours") instead of the category ("Optimised for recovery"). Avoid the AI tells: seamless, leverage, empower, unlock, elevate, journey, "not X but Y" contrasts, stacked one-word fragments ("Climb. Deload."), reflexive lists of three and em-dash chains. `copy-guard.test.ts` holds the banned list; consider pointing it at `src/app/app` during the pass.

### Done looks like

- No screen uses a value that isn't a role token, and no `.theme-landing` scope remains.
- The landing, the legal pages and the app are visibly one product, with the same white, sky, pink and navy glass.
- Pink appears at most once per thing on any app screen, and the navy glass sheet at most once per screen.
- This file's front matter, Colors and Overview describe the new values, and this handover is trimmed to the patterns table.

## Colors

Use tokens by role (`bg-surface`, `text-fg-muted`). Never write a hex in a component.

- **Ground:** `canvas` (`#faf9f7`) is the page. `surface` (white at 82%) is cards and panels. `surface-raised` (`#ffffff`) is dialogs, popovers, the active nav row and secondary buttons. `sunken` (ink at 3.5%) is wells: inputs, segmented tracks, icon chips and grid cells.
- **States:** `hover` (4%) and `press` (7%) are ink washes on rows and ghost buttons. `selection` (accent at 8%) is the active contextual row. `callout` (accent at 6%) is the info banner. `scrim` (ink at 28%) sits behind dialogs.
- **Ink:** `fg` for titles and body, `fg-soft` for eyebrows and strong secondary text, `fg-muted` (≈5.9:1) for descriptions, metadata and default icons. `fg-subtle` (≈4.6:1) is for timestamps and chevrons, never for anything critical.
- **Action:** `ink` / `ink-hover` / `on-ink` make the primary pill. `accent` (`#0a6fe0`, ≈4.9:1) and `accent-strong` (`#0858b8`) are the live signal. `danger` (`#c4320a`) is for destructive confirm text only.
- **Lines:** `border` (8%) for card and popover hairlines, `border-subtle` (6%) for column edges and dividers, and `border-strong` (14%) for input focus and dividers that must read.
- **Zones (data only):** `zone-rest` `#64748b` · `zone-building` `#0284c7` · `zone-optimal` `#059669` · `zone-max` `#d97706`. Each has a `-soft` fill. Use full strength for small marks (dots, bars, lines) and `-soft` for large areas (grid cells, body regions, chip fills). Max is a warning amber, not an alarm red.
- **Atmosphere:** `.bg-atmosphere` puts a peach-to-periwinkle glow along the top of the scrolling column; the AppShell applies it, once per screen. `.bg-aura` is the same two hues as a small solid fill (avatar, empty-state art), and it's the only other place those hues may appear.

**The One Signal Rule.** Accent marks live or interactive state and nothing else. If two unrelated things on screen are both blue, one of them is wrong.
**The Data-Only Zone Rule.** Zone hues never touch chrome. A green button, an amber border or a sky-blue heading is a bug.
**The No New Hex Rule.** Need a shade that doesn't exist? Add a role token to `theme.css` first.

## Typography

**The system stack:** SF Pro on Apple, Segoe UI or Roboto elsewhere. There is one family, and size and weight carry the hierarchy. Never add a display face, a serif or a mono.

| Utility | Size / line | Weight | Use |
|---|---|---|---|
| `text-display` | clamp(40→56px) / 1.04 | 680 | Landing headline only |
| `text-page-title` | 30 / 36 | 650 | The one H1, via `PageHeader` |
| `text-section` | 20 / 26 | 600 | Section H2, via `SectionHeading` |
| `text-card-title` | 17 / 22 | 600 | Card and dialog titles |
| `text-body` | 15 / 22 | 400 | Body copy, inputs |
| `text-list` | 15 / 20 | 500 | List-row titles |
| `text-card-desc` | 14 / 20 | 400 | Descriptions under a title (`text-fg-muted`) |
| `text-nav` | 14 / 20 | 500 | Nav, tabs, md buttons |
| `text-meta` | 13 / 18 | 400 | Timestamps, captions, sm buttons |
| `text-eyebrow` | 12 / 16, +0.04em, caps | add `font-medium` | Label above a title (`text-fg-subtle`) |
| `text-stat` | 34 / 38 | 650 | Big numbers: readiness, volume totals |

Large sizes carry negative tracking from the token, so don't add `tracking-*` yourself.

**The Tabular Rule.** Every number that can change or sit in a column (sets, reps, kg, RIR, percentages, dates in lists) gets `tabular-nums`.
**The One H1 Rule.** One page title per page, always through `PageHeader`.

## Layout

`AppShell` gives a 240px nav column, an optional 256px contextual column, an optional 52px top bar (tabs) and one scrolling content column. Content is capped at **800px** (`max-w-[800px] px-6 md:px-10 pt-10 pb-20`) unless the route opts into `fullBleed` (block grid, analysis). Below `lg` the nav column hides, and below `md` the contextual column hides.

- **Rhythm:** use `gap-6` between page blocks and `mt-10` before a section (built into `SectionHeading`). Cards in a pair go in `grid gap-4 md:grid-cols-2`, never three across inside 800px.
- **Whitespace separates.** Use space before you reach for a divider. `PageHeader`'s `divider` is off by default.
- **Alignment:** left-aligned, always. Centre only an empty state's contents.

**The 800 Rule.** Reading and form content lives in the 800px column. Full-bleed is opt-in, for dense data surfaces only.

## Elevation & Depth

Elevation on a light page is a soft, low, wide shadow plus a hairline, never a hard drop. The ladder has four steps:

1. **Canvas:** flat.
2. **Card** (`bg-surface border border-border shadow-card`): anything that holds content.
3. **Card hover** (`shadow-card-hover` + `-translate-y-px`): whole-card click targets only, and `Panel interactive` does it for you.
4. **Pop** (`bg-surface-raised shadow-pop`): dialogs, sheets, menus and popovers.

`shadow-control` is the 1px lift on secondary buttons, the segmented thumb and the active nav row.

**The Flat Inside Rule.** A card never contains another shadowed card. Group inside a card with `bg-sunken` wells, `border-t border-border-subtle` dividers or whitespace.
**The No Glass Rule.** No `backdrop-blur` on light surfaces. The only blur on the light page is the 2px blur on the dialog scrim. Glass is allowed in one place: on an ink ground, over a prism (see **Prism & glass** below).

## Motion

Every transition uses `--ease-soft` (`cubic-bezier(0.4, 0, 0.2, 1)`) at **200ms**, Tailwind's default, so `transition-colors` needs no duration. Lifts and shadows use `duration-300`. Use `--ease-out` (`cubic-bezier(0.22, 1, 0.36, 1)`) for entrances and check-offs, and never use an overshoot or spring.

- `animate-rise`: 320ms, 6px up plus fade. Use it for page headers, dialogs and newly inserted cards.
- `animate-fade`: 240ms. Use it for scrims and swapped content.
- `active:scale-[0.98]`: the button press, built in.
- `prefers-reduced-motion` reduces every animation and transition to 1ms and stops the shimmer. That's handled globally, so don't re-implement it.

**The Quiet Motion Rule.** Motion confirms a change; it never decorates. Nothing loops except the skeleton shimmer and the prism's slow turn (see below), and both stop completely under reduced motion.

## Prism & glass (the AI accent)

Approved by the owner on 2026-10-30 from the landing page's "Under the hood" sheet (`src/app/_components/landing/engine.tsx`), and earmarked for the next UI pass. It's how Mesodapt shows *intelligence*: a slow, blurred colour wheel behind frosted glass, on the navy `night` ground. It is the one decorative effect in the system, so it stays rare and always means the same thing.

**What it means.** The rainbow marks **where a language model is involved**: the coach box, a parsed message, the model's step in a flow. The accent (hot pink after the pass, blue in the app today) keeps its job as *you* and *live*. In the landing pipeline, step 02 ("A small model reads it") has the prism edge and step 04 ("You accept") has the pink one, side by side. Don't put prism on something the deterministic engine computed; that would blur the line the product is built on.

**The pieces** (all in `theme.css`, all landing-scoped today):

| Class / token | What it does |
|---|---|
| `.bg-prism` | A conic wheel of the five `prism-*` hues, `blur(90px) saturate(1.4)`, turning once every 28s via the `--prism-angle` custom property. Size and place it with utilities (`absolute size-[680px] -top-48 -right-40 opacity-40`); run a second, smaller one with `[animation-direction:reverse]` for depth. |
| `.bg-grain` | An SVG `feTurbulence` fractal-noise tile in `overlay` blend. Lay it over the prisms at `opacity-[0.16]` so the glass reads as a material, not a flat tint. |
| `.glass-ink` | Frosted glass on ink: `ink-raised` fill, `backdrop-filter: blur(22px) saturate(1.5)` and a 1px inner top highlight. Pair with `border border-ink-border rounded-card`. |
| `.border-prism` | An iridescent 1px edge (masked conic gradient on `::before`, turning every 8s). One per view, on the model's element. |
| `prism-*` tokens | `rose #ff7ab6 · amber #ffc46b · mint #6ff0c4 · sky #6cc8ff · violet #a98bff`. `text-prism-violet` is allowed for a small Lucide `Sparkles` beside a model label. |

**Recipe** (the section must clip its glow and stack it behind content):

```tsx
<section className="isolate relative overflow-hidden rounded-t-sheet-xl bg-night text-on-ink">
  <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
    <div className="bg-prism absolute -top-48 -right-40 size-[460px] opacity-40 sm:size-[680px]" />
    <div className="bg-prism absolute top-[46%] left-[8%] size-[380px] opacity-25 [animation-direction:reverse] sm:size-[560px]" />
    <div className="bg-grain absolute inset-0 opacity-[0.16]" />
  </div>
  {/* content: glass-ink cards; one border-prism card where the model works */}
</section>
```

**The Prism Rules.**
- **Night only.** Prism and glass live on the `night` ground (`bg-night`; it was `bg-ink` before `ink` became the sky button colour). On the light canvas the atmosphere glow is still the only colour wash. The one exception is the coach box's `border-prism` edge while the model reads (see the handover).
- **Behind, never on.** The wheel sits behind glass; text never sits directly on a bright prism. Body text on glass stays `on-ink-muted` or brighter, at least 4.5:1.
- **One prism field per screen**, and at most one `border-prism` element in it.
- **Never on data or chrome.** No prism on buttons, chips, nav, charts or zone marks, and no gradient text.
- **Reduced motion stops it.** `.bg-prism` and `.border-prism::before` set `animation: none` under `prefers-reduced-motion` (the global 1ms rule would make an infinite loop strobe). Keep that override if you add another looping effect.
- **Re-review with the colour scheme.** The five hues were tuned against today's ink (`#17181a`); revisit them with the planned colour redesign.

## Marketing palette (landing + legal)

Owner pick, 2026-10-30: **mostly white and sky blue, with hot pink as the accent**, and a navy AI sheet that leans on glass and pink. It's scoped to the marketing pages through `.theme-landing` in `theme.css`, which re-points the role tokens, so kit components repaint with no new props. The app keeps its ink-and-blue scheme until the colour redesign reaches it.

| Role | Marketing value | Notes |
|---|---|---|
| `canvas` | `snow` `#fcffff` | |
| `ink` (primary pill, mark tile) | `sky-strong` `#047aa6` | White on it ≈4.8:1. Raw `sky` `#0593c6` is for fills, bars, glows and display type (≈3.5:1, large text only). |
| `accent` (the live signal) | `pink-strong` `#c92d88` | Same job as blue in the app: accept confirms, the session that just moved, the current week. Raw `pink` `#d83995` is for marks and fills. |
| `night` (AI sheet, footer) | `#071019` | Ink in the app scheme. Use `bg-night` for dark ground, never `bg-ink`, which is a button colour here. |
| `prism-*` | pink, light pink, ice, sky, violet | Prism still means "a language model is involved". Pink is the live signal on the sheet too (`accent-on-ink` `#ff7cc4`). |

The landing's scroll story (`story.tsx`) gives the coach box a `border-prism` edge on the light page while the model reads the message. That's the one sanctioned exception to **Night only**, and it appears only on that one element.

## Loading & empty states

- **Skeletons mirror layout.** Build the same Panel with the same padding, and put `Skeleton` bars where the text sits, sized to the line (`h-4` for body, `h-5` for card titles, `h-3` for meta). Use `rounded-pill` for chip and button placeholders. Don't use a page spinner. A button's own `loading` spinner is the only spinner.
- **Empty states** sit in a Panel: a 40px `bg-aura` or `bg-sunken` tile with an outlined Lucide icon, a `text-card-title` line saying what's missing, one `text-card-desc` line saying why or what to do, and at most one button. Centre this one block only.

## Shapes

`rounded-tile` 9px (wordmark, icon tiles) · `rounded-control` 10px (inputs, nav rows, icon chips) · `rounded-callout` 14px · `rounded-card` 20px (cards, panels) · `rounded-sheet` 24px (dialogs) · `rounded-pill` (every button, chip and segmented control). Inner radius = outer radius minus padding; never put a sharp corner inside a round one.

Icons are **Lucide, outlined**: `size-4` in controls, `size-[18px]` in tiles and `size-5` in list rows. Never use filled icons, a second icon family or emoji.

## Brand

**The mark is the M:** one stroke through a training block. It climbs a step each week, drops for the deload, runs flat, then climbs again from higher up, which closes into an M. The same shape fits any sport that trains in blocks, so it outlives lifting-only imagery.

- **Geometry:** Lucide's 24 grid, path `M4 19.25V11.75L10 6.75V15.25H14V9.75L20 4.75V19.25`, stroke 2.5, round caps and joins. The deload notch is drawn deeper than true scale so it survives at 16px. Don't "correct" it.
- **In the tile:** white on `ink`, `rounded-tile`. The mark is 18px in the 28px nav tile and 20px in the 32px landing tile. The favicon (`src/app/icon.svg`) is its own 16px cut with the stroke raised to 2.8. The home-screen icon (`src/app/apple-icon.tsx`) is the ink M on canvas under the atmosphere's two hues.
- **Type:** the name is set in the system stack with the `Wordmark` component. There's no brand typeface and no logo file to outline. The mark and the atmosphere carry the identity.

**The Ink Mark Rule.** The mark is always `fg`, or white on its `ink` tile (sky after the pass). It is never `accent`, so the live signal keeps its one job.
**The One Mark Rule.** Use `Wordmark` or `Mark` from the kit. Never redraw the M, stretch it, add a second weight or animate it in product chrome.

## Components

All of these come from `~/components/ui-kit/app-shell-kit`.

- **Button / ButtonLink:** `variant` = `primary` (ink pill, one per view), `accent` (blue pill, accept-gate confirm only), `secondary` (white pill with hairline), `ghost` (text) or `danger` (destructive confirm). `size` = `sm` 32px · `md` 36px · `lg` 44px. `icon`, `trailingIcon` and `loading` keep the button's width. `buttonClass()` covers the element that can't be a button.
- **IconButton:** 32px round, icon only, `aria-label` required.
- **Chip:** 24px pill. `tone` = `neutral`, `accent`, `rest`, `building`, `optimal` or `max`. Zone tones carry a full-strength dot.
- **Segmented:** a sunken pill track with a raised white thumb. Use it for 2–4 exclusive views, `sm` or `md`.
- **Panel:** the card surface, with `padding` none/sm/md/lg (0/16/20/24px). `interactive` adds the lift; `as` takes section or article.
- **Card:** a whole-card link. `filled` is a tile with an icon chip (it goes in a 2-col grid); `ghost` is a list row with a hover wash.
- **Callout:** an info banner (`bg-callout`, accent icon, `role="note"`), placed directly under PageHeader.
- **PageHeader:** eyebrow, H1, description and `actions` (one Button or a Segmented). Exactly one per page.
- **SectionHeading:** the H2 with `mt-10` and an optional "View all →" link.
- **NavItem / TabStrip / PageToc:** navigation. The active row is `bg-surface-raised shadow-control` (neutral) or `bg-selection text-accent` (contextual), and always carries `aria-current`.
- **Wordmark:** the ink tile with the M, plus the name. `md` for nav, `lg` for landing.
- **Mark:** the M alone, in `currentColor`. Reach for `Wordmark` first.
- **Skeleton:** `<Skeleton className="h-4 w-32" />`.

## Component recipes

Canonical className patterns. Copy them; don't improvise variants.

```tsx
// Page layout (inside AppShell; the shell supplies the 800px column and atmosphere)
<>
  <PageHeader eyebrow="Block 2" title="Week 3 of 6" description="Upper / Lower · 4 sessions"
    actions={<Button>Log session</Button>} />
  <div className="mt-8 flex flex-col gap-6">{/* Panels */}</div>
  <SectionHeading title="This week" action={{ label: "View block", href: "/app/block" }} />
</>

// Card list row (rows inside one Panel padding="none", divided, never nested cards)
<Panel padding="none">
  <ul className="divide-y divide-border-subtle">
    <li className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-hover">
      <span className="flex size-9 items-center justify-center rounded-control bg-sunken text-fg-muted">
        <Dumbbell className="size-[18px]" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-list text-fg">Upper A</div>
        <div className="text-meta text-fg-muted tabular-nums">Tue · 5 exercises · 18 sets</div>
      </div>
      <Chip tone="accent">Next up</Chip>
    </li>
  </ul>
</Panel>

// Empty state
<Panel padding="lg" className="flex flex-col items-center py-12 text-center">
  <span className="flex size-10 items-center justify-center rounded-control bg-aura text-fg-soft">
    <CalendarPlus className="size-5" aria-hidden /></span>
  <div className="mt-4 text-card-title text-fg">No sessions logged yet</div>
  <p className="mt-1 max-w-[36ch] text-card-desc text-fg-muted">Log your first session and your volume shows up here.</p>
  <Button className="mt-5" size="sm">Log a session</Button>
</Panel>

// Card skeleton (same Panel, same padding, bars where the text sits)
<Panel aria-busy="true">
  <Skeleton className="size-9 rounded-control" />
  <Skeleton className="mt-4 h-5 w-40" />
  <Skeleton className="mt-2 h-4 w-64" />
</Panel>

// Dialog (accept-gate: accent confirm; ordinary: primary confirm; always a ghost cancel)
<div className="fixed inset-0 z-50 grid place-items-center bg-scrim p-4 backdrop-blur-[2px] animate-fade">
  <div role="dialog" aria-modal="true" aria-labelledby="dlg-title"
    className="w-full max-w-[440px] rounded-sheet bg-surface-raised p-6 shadow-pop animate-rise">
    <h2 id="dlg-title" className="text-card-title text-fg">Move Lower B to Saturday?</h2>
    <p className="mt-1.5 text-card-desc text-fg-muted">Thursday is blocked. Nothing changes until you accept.</p>
    <div className="mt-6 flex justify-end gap-2">
      <Button variant="ghost">Not now</Button>
      <Button variant="accent">Accept move</Button>
    </div>
  </div>
</div>

// Form input
<label className="flex flex-col gap-1.5">
  <span className="text-nav text-fg-soft">Top-set weight</span>
  <input className="h-10 rounded-control bg-sunken border border-transparent px-3 text-body text-fg tabular-nums
    placeholder:text-fg-subtle outline-none transition-colors focus:bg-surface-raised focus:border-border-strong" />
  <span className="text-meta text-fg-muted">kg, as lifted</span>
</label>
```

## Do's and Don'ts

**Do**
- Use role tokens only, and add a token to `theme.css` before you use any new colour.
- Keep one ink primary per view. Use accent for live state and the accept-gate confirm.
- Shape skeletons like the content they replace.
- Put `tabular-nums` on numbers, and use left-aligned layouts with whitespace before dividers.
- Use zone colours for data marks: soft fills for areas, full strength for small marks.

**Don't**
- Use gradient text, gradient buttons, glass surfaces or glows beyond `.bg-atmosphere` / `.bg-aura`.
- Put a card inside a card, or a shadow inside a shadow.
- Put zone hues on chrome, or a second accent on screen.
- Use emoji or filled icons, or mix icon families.
- Use `fg-subtle` for anything the athlete must read to act.
- Go above 300ms, overshoot easing or add decorative loops.
- Write a raw hex or Tailwind palette class (`gray-500`, `blue-600`) in a component.

**Named rules, recap:** One Signal · Data-Only Zone · No New Hex · Tabular · One H1 · 800 · Flat Inside · No Glass (except Prism & glass on night) · Quiet Motion · Prism Rules.

**Theming later:** dark mode will arrive as `[data-theme=dark]` overriding these same token names. Components never branch on the theme.
