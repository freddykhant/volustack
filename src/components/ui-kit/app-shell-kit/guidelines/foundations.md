# Foundations

## Color usage

The palette is intentionally small — one accent, one neutral spectrum. Consistency comes from using tokens by role, never by hex.

### Semantic mapping

| Role | Token | Where you'll see it |
|---|---|---|
| App background | `--color-canvas` | `<body>`, root grid wrapper |
| Raised surface | `--color-surface` | Filled cards, popover backgrounds, menu items on hover |
| Selection | `--color-selection` | Active nav row, selected list item background |
| Callout fill | `--color-callout` | Info banner backgrounds |
| Primary text | `--color-fg` | Body copy, H1/H2, card titles |
| Muted text | `--color-fg-muted` | Card descriptions, secondary body |
| Subtle text | `--color-fg-subtle` | Eyebrow labels, timestamps, keyboard chip text |
| Accent | `--color-accent` | Links, active tab text, active nav row text |
| Accent strong | `--color-accent-strong` | Callout left bar, focus rings |
| Border | `--color-border` | Card borders, popover borders |
| Border subtle | `--color-border-subtle` | Dividers, column edges |

### Rules

- **Never introduce a new hex.** If a design calls for a shade not in the token set, add a semantic token first (`--color-<role>`), then use it.
- **Accent is scarce.** Reserve `--color-accent` for active/interactive state (links, active nav, hover-shifted card titles). If two elements on screen both use accent, one is probably wrong.
- **No shadows in dark UI.** Elevation is expressed through `surface` background alone; drop-shadows read as smudges on dark canvases.
- **Border alpha, not gray.** All borders use white with alpha (10% / 8%). Solid gray borders look muddy on the canvas color.

## Typography

System-family stack with Geist as the primary sans. All headings and body use the same family — hierarchy comes from size and weight, not typeface switching.

### Scale

| Class | Size | Line-height | Weight | Uses |
|---|---|---|---|---|
| `text-page-title` | 39px | 50px | 600 | Page H1 (one per page) |
| `text-section` | 22px | 30.8px | 600 | Section H2 |
| `text-card-title` | 16px | — | 600 | Card titles, list-item titles |
| `text-body` | 16px | 24px | 400 | Body copy |
| `text-card-desc` | 16px | 22.4px | 400 | Card descriptions (uses `fg-muted`) |
| `text-nav` | 14px | — | 450 | Nav items, tab labels |
| `text-eyebrow` | 12px | — | 600 | Eyebrow labels above H1 and section headers |

### Rules

- **One H1 per page.** Rendered via the `PageHeader` component with an eyebrow above.
- **Eyebrow is always uppercase, always `--color-fg-subtle`,** with `letter-spacing: 0.05em`. Never bold, never accent.
- **Card titles and description together** have a specific rhythm: 16px title (600) with a 16px description (400, 22.4 line-height) directly below. Do not adjust weights.
- **Nav weight 450** is deliberately between normal (400) and medium (500). If the browser can't distinguish it from 400 (some system fonts collapse it), fall back to 500.

## Iconography

Icons are from **lucide-react** (React) or Lucide's icon set generally. One family only — no mixing with Font Awesome, Material, Phosphor, etc.

### Sizing

| Context | Size | Notes |
|---|---|---|
| Nav item icon (Column 1, Column 2) | 16px | `size-4` in Tailwind |
| Card icon (filled + ghost) | 24px | `size-6` |
| Tab icon (top nav) | 16px | `size-4` |
| Callout icon | 20px | `size-5` |
| Button-adjacent icon (inline text) | 14px | `size-3.5` |

### Rules

- **Icons inherit color from parent text color** unless they're actively accent. Use `text-fg-muted` (default) or `text-accent` (hover / active).
- **No filled-vs-outlined mixing.** Lucide is outlined. Stick to outlined.
- **No emoji as icons.** They render inconsistently across systems and don't inherit color.

## Spacing

The layout uses fixed pixel dimensions for the shell (256 / 288 / 49 / 756) — those are the ReadMe reference and stay exact. Everything inside content areas uses Tailwind's default spacing scale (`p-2`, `gap-6`, etc.).

### Common values

- Card grid gap: **24px** (`gap-6`)
- Card padding (filled): **24px** (`p-6`)
- Callout padding: **20px** (`p-5`)
- Section H2 top margin: **40px** (`mt-10`)
- PageHeader divider top margin: **24px** (`mt-6`)
- Nav item vertical padding: **6px** (`py-1.5`)
- Nav item horizontal padding: **10px** (`px-2.5`)

## Motion

No page transitions. No shell entry animations. Only:
- **Hover-brighten**: `transition-colors` (150ms default) on interactive elements. Icon and title shift toward `--color-accent`.
- **Focus rings**: 2px `--color-accent-strong` outline, 2px offset.

That's the whole motion vocabulary in v1. Adding animation later is a scope decision.

## Accessibility

- Every nav item has `aria-current="page"` when active.
- Info callouts have `role="note"`.
- Interactive icons that appear next to text labels are marked `aria-hidden` — the label carries the semantics.
- Focus rings are always visible (no `outline: none`).
- Color contrast: primary text (`#ffffff` on `#0b0c0d`) exceeds WCAG AAA. Muted text (`#aab4bc`) exceeds AA on the canvas. Subtle text (`#9ba1a6`) is used only for supporting labels — never for critical information.
