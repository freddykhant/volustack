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
**The No Glass Rule.** No `backdrop-blur` on surfaces. The only blur in the system is the 2px blur on the dialog scrim.

## Motion

Every transition uses `--ease-soft` (`cubic-bezier(0.4, 0, 0.2, 1)`) at **200ms**, Tailwind's default, so `transition-colors` needs no duration. Lifts and shadows use `duration-300`. Use `--ease-out` (`cubic-bezier(0.22, 1, 0.36, 1)`) for entrances and check-offs, and never use an overshoot or spring.

- `animate-rise`: 320ms, 6px up plus fade. Use it for page headers, dialogs and newly inserted cards.
- `animate-fade`: 240ms. Use it for scrims and swapped content.
- `active:scale-[0.98]`: the button press, built in.
- `prefers-reduced-motion` reduces every animation and transition to 1ms and stops the shimmer. That's handled globally, so don't re-implement it.

**The Quiet Motion Rule.** Motion confirms a change; it never decorates. Nothing loops except the skeleton shimmer.

## Loading & empty states

- **Skeletons mirror layout.** Build the same Panel with the same padding, and put `Skeleton` bars where the text sits, sized to the line (`h-4` for body, `h-5` for card titles, `h-3` for meta). Use `rounded-pill` for chip and button placeholders. Don't use a page spinner. A button's own `loading` spinner is the only spinner.
- **Empty states** sit in a Panel: a 40px `bg-aura` or `bg-sunken` tile with an outlined Lucide icon, a `text-card-title` line saying what's missing, one `text-card-desc` line saying why or what to do, and at most one button. Centre this one block only.

## Shapes

`rounded-tile` 9px (wordmark, icon tiles) · `rounded-control` 10px (inputs, nav rows, icon chips) · `rounded-callout` 14px · `rounded-card` 20px (cards, panels) · `rounded-sheet` 24px (dialogs) · `rounded-pill` (every button, chip and segmented control). Inner radius = outer radius minus padding; never put a sharp corner inside a round one.

Icons are **Lucide, outlined**: `size-4` in controls, `size-[18px]` in tiles and `size-5` in list rows. Never use filled icons, a second icon family or emoji.

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
- **Wordmark:** the ink tile with a Dumbbell, plus the name. `md` for nav, `lg` for landing.
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

**Named rules, recap:** One Signal · Data-Only Zone · No New Hex · Tabular · One H1 · 800 · Flat Inside · No Glass · Quiet Motion.

**Theming later:** dark mode will arrive as `[data-theme=dark]` overriding these same token names. Components never branch on the theme.
