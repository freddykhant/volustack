# App-Shell UI Kit (ReadMe-cloned, dark-only)

A drop-in design system for a **Next.js App Router + Tailwind v4** project (T3-ready).
Every token value was extracted from the live ReadMe app via computed-style
measurement (2026-07-24) — this is a faithful clone of that shell, not an approximation.

Plain React + Tailwind + `lucide-react`. No other dependencies.

## Install into a T3 app

1. Copy this folder to `src/components/ui-kit/` (or wherever you keep shared UI).
2. `pnpm add lucide-react` (or npm/bun equivalent).
3. In `src/styles/globals.css`, after `@import "tailwindcss";`, add:
   ```css
   @import "../components/ui-kit/theme.css";
   ```
4. Mount your app section inside the shell, in that section's `layout.tsx`:

```tsx
import { AppShell } from "~/components/ui-kit";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell slug="acme" workspaceName="Acme Inc">
      {children}
    </AppShell>
  );
}
```

Active nav/tab states derive from `usePathname()` automatically (exact paths or
`"/prefix/*"` via `matchPatterns`). Pass `currentPath` only to override in tests/storybook.

## Components

| Component | Use |
|---|---|
| `AppShell` | The frame: 256px workspace nav → 49px hub bar (spans the rest) → optional 288px `column2` → 756px-capped content → optional `toc`. Slots: `column1`, `column2`, `tabs`, `toc`, `topNav`. Mount once per route section — never nested. |
| `AppCanvas` | Dark canvas root for anything rendered outside the shell. |
| `PageHeader` | Every content page starts with this: eyebrow + 39px H1 + divider. `divider={false}` when a TabStrip follows. |
| `SectionHeading` | 24px H2 with 42px top rhythm + optional accent action link. |
| `Card` | `filled` (hero grid tile) / `ghost` (list row). Always in `grid gap-6 md:grid-cols-2`. |
| `Callout` | Info banner (3px accent bar) — sits directly under PageHeader. |
| `NavItem` | Sidebar row. `appearance="neutral"` = Column-1 style (14px, white on 7.5%-white); default `"accent"` = Column-2 style (16px, accent on blue selection). |
| `TabStrip` | 14px/500 underline tabs (hub bar or detail pages). Container needs `border-b border-border-subtle`. |
| `WorkspaceSwitcher` | Column-1 top slot (replaces a logo/wordmark). |
| `PageToc` | Right-hand ToC — accent rail on the active item. Pass into `AppShell`'s `toc` slot. |

## Styling rules (what makes it look right)

Style **only** with the semantic token utilities — never raw hexes, never `gray-500`-style palette names:

- Surfaces: `bg-canvas` `bg-surface` `bg-surface-raised` `bg-selection` `bg-callout`
- Text: `text-fg` `text-fg-soft` `text-fg-muted` `text-fg-subtle` `text-accent` `text-accent-strong`
- Borders: `border-border` `border-border-subtle` (white-alpha — never solid gray)
- Radii: `rounded-card` `rounded-pill` `rounded-control` (32px-high buttons/inputs) `rounded-callout`
- Type: `text-page-title` `text-section` `text-card-title` `text-body` `text-card-desc` `text-nav` `text-list` `text-eyebrow` (add weight + color at use site: content eyebrows `font-medium text-fg-soft`, sidebar labels `font-semibold text-fg-muted`)

House rules from the source system: **accent is scarce** (active/interactive only — two accent elements on screen usually means one is wrong); **no shadows** in dark UI (elevation = `bg-surface`); card grids are always 2-column inside the 756px content column, never 3; every content page opens with `PageHeader`, every section with `SectionHeading`; hub-bar controls are 32px tall with `rounded-control`.

**Re-branding**: every component styles itself through the role-named tokens, so
editing the `@theme` block in `theme.css` re-skins the whole kit — add a semantic
token before ever introducing a new hex.

## Guidelines folder

`guidelines/` holds the original design-system spec docs (foundations, layout,
screens, components) — great as a composition brief and for AI coding agents
(reference them from your CLAUDE.md). **Caveat:** a few written values predate the
live-app clone (22px sections, 3.5px callout bar, Geist font, content-only top bar).
Where the docs and this kit disagree, **the kit and `theme.css` win**.

## Provenance

Cloned from the ReadMe docs-app shell (a live instance) as part of a
/design-sync run; the same components are synced to the Claude Design project
"ReadMe Landing Design System" — design screens there, then implement with this kit
for a 1:1 mapping.
