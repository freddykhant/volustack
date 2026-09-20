---
name: Mesodapt
description: The adaptive training command center for self-coached athletes — a flat, dark, accent-scarce operating surface.
colors:
  canvas: "#0b0c0d"
  surface: "rgba(255, 255, 255, 0.05)"
  surface-raised: "rgba(255, 255, 255, 0.075)"
  selection: "rgba(0, 146, 255, 0.09)"
  callout: "rgba(17, 140, 253, 0.05)"
  accent: "#0092ff"
  accent-strong: "#118cfd"
  fg: "#ffffff"
  fg-soft: "#c6cdd4"
  fg-muted: "#aab4bc"
  fg-subtle: "#9ba1a6"
  border: "rgba(255, 255, 255, 0.1)"
  border-subtle: "rgba(255, 255, 255, 0.08)"
  zone-rest: "#64748b"
  zone-building: "#38bdf8"
  zone-optimal: "#34d399"
  zone-max: "#f59e0b"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "39px"
    fontWeight: 600
    lineHeight: "50px"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "30px"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 600
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  eyebrow:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0.02em"
rounded:
  control: "6px"
  card: "8px"
  pill: "8px"
  callout: "2px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  section: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  card-filled:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.card}"
    padding: "24px"
  card-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
    rounded: "{rounded.card}"
    padding: "4px"
  callout:
    backgroundColor: "{colors.callout}"
    textColor: "{colors.fg}"
    rounded: "{rounded.callout}"
    padding: "20px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    typography: "{typography.body}"
  nav-item-neutral:
    backgroundColor: "transparent"
    textColor: "{colors.fg-muted}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
    typography: "{typography.label}"
  nav-item-neutral-active:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
  nav-item-accent-active:
    backgroundColor: "{colors.selection}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
---

# Design System: Mesodapt

## Overview

**Creative North Star: "The Training Command Center"**

Mesodapt is a quiet, dark instrument panel for the self-coached athlete. At rest, everything is measured and calm — near-black canvas, translucent surfaces, one type family, borders drawn in whisper-thin white alpha. The interface's job is to hold a lot of training intelligence (volumes, zones, readiness, the week ahead) without ever feeling loud, so the athlete can read their whole situation at a glance and act. The single blue accent is the one live signal on the board; its scarcity is what gives it authority.

Energy in this system is **concentrated, not distributed**. The visual world stays restrained precisely so that the moments that matter — the next session to hit, a plan proposal to accept, a completed set, a PR — can land with force. This is where the motivational voice lives: not in ambient decoration, but in the punch of accent and the confidence of the primary action at each decision point. The athlete is always in the pilot's seat; the coach proposes on the board and the athlete calls it.

Components lean **tactile and energetic** as their intended direction — buttons that feel eager to be pressed, responsive state shifts, accent used to reward action. The current build is more restrained than that target (flat surfaces, a single hover-brighten transition, no entry motion — see Elevation and Motion below); treat the tactile/energetic character as the direction new work should build toward from that flat baseline, not a license to scatter effects.

**Key Characteristics:**
- Near-black canvas (`#0b0c0d`) with translucent white surfaces — depth by tone, never shadow.
- A single blue accent (`#0092ff`), used scarcely and reserved for interactive/active state.
- One type family (Geist), hierarchy from size and weight alone — no typeface switching.
- Borders are white-alpha hairlines, never solid gray.
- A separate data-viz zone palette (grey → blue → green → amber) reserved strictly for data, never chrome.
- Three-column app shell: workspace nav · contextual list · scrollable 756px content.

## Colors

An intentionally small palette — one accent, one neutral spectrum on a dark ground — plus a walled-off data-viz family. Consistency comes from using tokens by role, never by hex.

### Primary
- **Signal Blue** (`#0092ff`): the one live signal. Links, active tab text, active nav-row text, primary-action buttons, focused input borders. Used on a small fraction of any screen — its rarity is the point.
- **Signal Blue Strong** (`#118cfd`): the pressed/emphatic sibling. Button hover, the 3px callout left bar, focus rings, callout icons.

### Neutral
- **Command Canvas** (`#0b0c0d`): the app background — `<body>`, the shell grid, and the ground every surface floats on.
- **Raised Surface** (`rgba(255,255,255,0.05)` / `0.075`): filled cards and popovers at 5%; menu/nav hover and active workspace rows at 7.5%. Elevation is expressed by this tonal step, not shadow.
- **Selection Wash** (`rgba(0,146,255,0.09)`): the active contextual-nav row background — a faint accent tint, not a solid fill.
- **Callout Wash** (`rgba(17,140,253,0.05)`): info-banner fill behind the accent-strong left bar.
- **Primary Text** (`#ffffff`): body copy, H1/H2, card titles. Exceeds WCAG AAA on canvas.
- **Soft Text** (`#c6cdd4`): eyebrow labels above headers.
- **Muted Text** (`#aab4bc`): card descriptions, secondary body, default icon color. Exceeds AA on canvas.
- **Subtle Text** (`#9ba1a6`): timestamps, disclosure chevrons, supporting labels only — never critical information.
- **Hairline Border** (`rgba(255,255,255,0.1)`): card and popover borders.
- **Hairline Border Subtle** (`rgba(255,255,255,0.08)`): dividers, column edges, input strokes.

### Data-viz Zone Family (walled off from chrome)
Reserved for **data only** — landmark/volume marks, grid cells, readiness regions — never decorative UI. The grey → blue → green → amber progression is colorblind-safe on the canvas and deliberately keeps "max" a warning amber, not an alarm red. Full-strength values (below) are for small marks; each has a translucent `-soft` fill for large areas (grid cells, body regions).
- **Rest Grey** (`#64748b`): rest / no-training state.
- **Building Blue** (`#38bdf8`): sub-optimal / building volume. Distinct from the UI Signal Blue by hue and context.
- **Optimal Green** (`#34d399`): in the optimal training zone.
- **Max Amber** (`#f59e0b`): at/over the max recoverable volume — a warning, not an alarm.

### Named Rules
**The One Signal Rule.** The primary accent marks interactive or active state and nothing else. If two elements on a screen both wear accent, one is probably wrong.

**The No New Hex Rule.** Never introduce a raw color. If a design needs a shade the tokens don't have, add a semantic token (`--color-<role>`) first, then use it.

**The Data-Only Zone Rule.** The `zone-*` palette never touches chrome. If a green or amber appears on a button, border, or label, it's a bug — those hues mean *data*.

## Typography

**Display / Body / Label Font:** Geist (with `ui-sans-serif, system-ui, -apple-system, sans-serif` fallback).

**Character:** One family does everything. The personality is precision and legibility on a dark ground — hierarchy is built entirely from size and weight, never from switching typefaces. No serif, no mono, no display face.

### Hierarchy
- **Display / Page Title** (600, 39px, 50px line-height): the single H1 per page, rendered by `PageHeader` with an eyebrow above it.
- **Headline / Section** (600, 24px, 30px line-height): section H2s, with `40px` (mt-10) top margin.
- **Title** (600, 16px): card titles and list-item titles.
- **Body** (400, 16px, 24px line-height): body copy.
- **Card Description** (400, 16px, 22.4px line-height, muted): sits directly under a 16px/600 title in a fixed rhythm — don't adjust the weights.
- **Label / Nav** (400–450, 14px): nav items and tab labels. 450 is the deliberate target between normal and medium; fall back to 500 where the font can't render 450.
- **Eyebrow** (500–600, 12px, 0.02em tracking, UPPERCASE, soft/subtle): the label above every page title and section header.

### Named Rules
**The One Family Rule.** Every heading and body string is Geist. Hierarchy comes from size and weight — reaching for a second typeface is off-system.

**The One H1 Rule.** Exactly one page title per page, always via `PageHeader`, always with an uppercase eyebrow above it. The eyebrow is never bold and never accent-colored.

## Layout

A full-viewport, always-visible **three-column grid**: `grid-template-columns: 256px 288px 1fr`, `height: 100vh`, canvas ground.
- **Column 1 (256px) — workspace nav:** transparent over canvas, no right border, `16px` padding. Workspace switcher, primary nav, admin nav, bottom user row.
- **Column 2 (288px) — contextual list:** content changes per route section, `20px` padding.
- **Column 3 (1fr) — content:** a fixed `49px` top nav bar over a scrollable `<main>`; content constrained to **`max-width: 756px`, `32px` padding**. This is the only column that scrolls.

**Content rhythm:** card grids are two columns (`grid gap-6 md:grid-cols-2`) with a `24px` gap; filled-card padding `24px`; callout padding `20px`; section H2 top margin `40px`; the `PageHeader` divider sits `24px` below the title. Inside content, use Tailwind's default spacing scale; only the shell dimensions (256 / 288 / 49 / 756) are fixed exact values.

**Responsive:** ≥1024px both sidebars visible, 2-col grids. 768–1023px Column 1 hides (`display:none`, toggleable later), Column 2 stays, 2-col grids. <768px both sidebars hide, single-column content. No hamburger menu in v1.

### Named Rules
**The 756 Rule.** Reading and form content lives in the 756px content column. Full-bleed is reserved for surfaces that opt in (training grid, analysis) via the shell's `fullBleed` flag.

## Elevation & Depth

**Flat by doctrine — no shadows.** On a `#0b0c0d` canvas, drop-shadows read as smudges. Depth is expressed entirely through **tonal layering**: the base canvas, then `surface` at 5% white, then `surface-raised` at 7.5% white for hover/active/popover. A raised element is lighter, not lifted.

### Named Rules
**The No-Shadow Rule.** No `box-shadow` for elevation anywhere in the dark UI. If something needs to feel raised, step it up the surface tone ladder (`surface` → `surface-raised`), don't shadow it.

**The Alpha-Border Rule.** Every border and divider is white with alpha (10% for `border`, 8% for `border-subtle`). Solid gray borders look muddy on the canvas — never use them.

### Planned material: Liquid Glass
*Intended direction, not yet built.* Polish will introduce a **liquid-glass** material (via `liquid-glass-react`, github.com/rdev/liquid-glass-react) — refraction, specular rim-light, and `backdrop-filter` blur — as the system's one form of true elevation. This amends "flat, full stop" to **flat by default, glass for signature elevation**. It does not reintroduce drop shadows (still banned): glass lifts through refraction and rim-light, not smudge.

**The Concentrated Glass Rule.** Glass is a signature material for the moments that matter, never a global skin. Apply it to elevated, decision-carrying surfaces — the accept-gate reschedule dialog, the Now / next-session card, a floating top nav — and never to data-dense regions (the block grid, analysis charts) where refraction hurts legibility and the `zone-*` data colors must read true. Because it is GPU-heavy (`backdrop-filter` + SVG displacement), scarcity is also a performance requirement, not only an aesthetic one.

## Shapes

A tight, restrained radius vocabulary — nothing is very round:
- **Control** (`6px`): buttons, inputs, workspace-nav rows.
- **Card / Pill** (`8px`): cards, contextual-nav rows (the "pill" and "card" radii are intentionally the same value).
- **Callout** (`2px`): near-square, letting the 3px accent-strong left bar do the identifying work.

Form language is rectangular and calm: hairline borders, generous internal padding, no heavy strokes or clipping. Icons are **Lucide, outlined only** — no filled/outlined mixing, no other icon family, no emoji.

## Components

Components lean tactile and energetic in intent; the values below are the current implemented baseline (precise and flat) to build that energy up from.

### Buttons
- **Shape:** `6px` radius (control), `inline-flex items-center gap-2`.
- **Primary:** `bg-accent` with white text, `text-nav font-medium`, padding `8px 16px` (px-4 py-2; a taller `px-4 py-2.5` variant exists for form footers).
- **Hover:** `transition-colors` to `accent-strong`.
- **Disabled:** `opacity-60` (or `opacity-40` + `cursor-not-allowed` on the hard-blocked variant).
- There is no documented secondary/ghost button; secondary actions are typically bordered rows or plain text links in accent.

### Cards / Containers
- **Corner:** `8px` (card).
- **Filled (hero tile):** `bg-surface`, `border-border`, `24px` padding; icon on top (24px, muted), then 16px/600 title, then muted description. Icon **and** title shift to accent on hover (`group-hover:text-accent`).
- **Ghost (list row):** transparent, `4px` padding, icon left + title/description right; same accent-on-hover behavior.
- **Shadow strategy:** none (see Elevation).

### Inputs / Fields
- **Style:** `bg-canvas` (recessed below the surrounding surface), `border-border-subtle`, `6px` radius, padding `10px 12px`, `text-body`, `placeholder:text-fg-subtle`.
- **Focus:** border shifts to `accent` (`focus:border-accent`), `outline-none` on the field but a visible 2px `accent-strong` focus ring elsewhere. No glow.
- **Read-only / display values:** `border-border-subtle bg-canvas` with `fg-subtle` text; informational values use `bg-callout` with `fg-soft`.

### Navigation
- **Neutral (Column 1 workspace nav):** `text-nav` (14px), `6px` radius; default `text-fg-muted hover:text-fg`, active `bg-surface-raised text-fg`.
- **Accent (Column 2 contextual list):** `text-list` (16px), `8px` pill radius; default `text-fg-muted hover:text-fg`, active `bg-selection text-accent`.
- Every active row carries `aria-current="page"`. Optional trailing chevron in `fg-subtle`.

### Callout
- Info banner: `bg-callout` fill with a **3px `accent-strong` left bar**, `2px` radius, `20px` padding, `role="note"`. Optional 20px accent-strong icon. Place directly under `PageHeader`.

## Do's and Don'ts

### Do:
- **Do** use tokens by role (`text-fg-muted`, `bg-surface`), never raw hex — add a semantic token before introducing any new color.
- **Do** keep the accent scarce: reserve `#0092ff` for interactive/active state and the one primary action per view.
- **Do** express elevation by stepping the surface tone (`surface` → `surface-raised`); keep everything flat otherwise.
- **Do** draw all borders in white alpha (10% / 8%).
- **Do** concentrate energy at decision moments — the next-session CTA, an accept-the-plan action, a logged PR — rather than spreading effects across the page.
- **Do** use the `zone-*` palette for data marks only, `-soft` fills for large regions and full-strength for small marks.
- **Do** render every page's H1 through `PageHeader` with an uppercase eyebrow above it.

### Don't:
- **Don't** add `box-shadow` for elevation — shadows read as smudges on the dark canvas.
- **Don't** put a second accent on screen; if two elements both wear blue, one is wrong.
- **Don't** let the `zone-*` green/amber/blue touch chrome (buttons, borders, labels) — those hues mean data.
- **Don't** switch typefaces for hierarchy; Geist does everything, size and weight carry the levels.
- **Don't** use solid gray borders, filled Lucide icons, mixed icon families, or emoji as icons.
- **Don't** use `fg-subtle` (`#9ba1a6`) for critical information — it's for supporting labels only.
