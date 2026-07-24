# Layout

## App shell — three columns

Full-viewport, always-visible three-column grid. Content column is the only one that scrolls; the two sidebars stay fixed.

```
┌────────────────┬────────────────────┬──────────────────────────────────┐
│                │                    │  Top nav bar (49px)              │
│  Column 1      │  Column 2          ├──────────────────────────────────┤
│  256px         │  288px             │                                  │
│                │                    │  Content column                  │
│  Workspace     │  Contextual list   │  max-width 756px                 │
│  + admin nav   │  per section       │  padding 32px                    │
│                │                    │  scrollable                      │
│                │                    │                                  │
└────────────────┴────────────────────┴──────────────────────────────────┘
```

### CSS

```css
.app-shell {
  display: grid;
  grid-template-columns: 256px 288px 1fr;
  grid-template-rows: 1fr;
  height: 100vh;
  background: var(--color-canvas);
  color: var(--color-fg);
}
```

### Behavior

- **Column 1 (workspace nav)**: transparent over canvas, no right border. Vertical flex, `padding: 16px`. Contains workspace switcher, primary nav (Workspace section), admin nav (Admin Tools section), and bottom Help/User row.
- **Column 2 (contextual list)**: content changes per route section (collections on `/prompts`, sub-nav on `/settings`, etc.). `padding: 20px`.
- **Column 3 (content)**: contains a fixed-height (49px) top nav bar + a scrollable `<main>`. Content inside `<main>` is constrained to `max-width: 756px` with `padding: 32px`.

## Breakpoints

| Width | Column 1 | Column 2 | Content grids |
|---|---|---|---|
| ≥ 1024px | visible | visible | 2 columns |
| 768–1023px | hidden (toggleable) | visible | 2 columns |
| < 768px | hidden | hidden | 1 column |

### Rules

- **No hamburger menu in v1.** At small widths, Column 1 hides via `display: none`. A future feature can add a client-state toggle.
- **Column 2 hides at 768px**, not 1024, because the contextual list is often more valuable than the workspace-level nav on tablet-ish widths.
- **Card grids collapse from 2 → 1 column below 768px.** Use Tailwind's `grid-cols-1 md:grid-cols-2` (or your framework's equivalent).

## Content column structure

Every article-style page follows the same top-to-bottom rhythm:

1. **`PageHeader`** — eyebrow + H1 + divider. Always present on content pages.
2. **Optional `Callout`** — info banner, immediately after the header.
3. **Content sections**, each starting with a `SectionHeading` (H2, `margin-top: 40px`).
4. **Card grids** inside sections — filled cards for hero content, ghost cards for lists.
5. **Optional footer** — "Updated N minutes ago" muted timestamp.

### Constraints

- **756px max-width is intentional.** On wide monitors, the right edge has whitespace. That's the reading-comfort trade — full-bleed only when a screen genuinely needs it (playbook editor, playground panel).
- **Full-bleed opt-out** is a top-level render that ignores `max-width: 756px`. Reserve for tools (editors, runners), never for docs / dashboards / detail views.

## Layout composition rules

- **AppShell mounts once** per route section (e.g., inside `/prompts` layout, `/playbooks` layout, `/settings` layout). It doesn't nest.
- **Column 2 content is per-section**, not per-route. All routes under `/prompts` share the same Column 2 (collections tree); all routes under `/settings` share sub-nav.
- **Top-nav tabs are per-detail-page**, not per-section. A prompt detail page renders its own tab strip; the section index doesn't.

## Grid inside content — cards

Card grids are always 2-column at desktop (`grid-cols-2`), collapsing to 1 at mobile. Gap: 24px.

```css
.card-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
}

@media (min-width: 768px) {
  .card-grid {
    grid-template-columns: 1fr 1fr;
  }
}
```

**Never 3-column card grids** in this layout — the 756px content width doesn't leave enough room per card. If you have 6+ cards, use two 2-column sections separated by a `SectionHeading`.
