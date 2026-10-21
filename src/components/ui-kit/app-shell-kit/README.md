# Mesodapt UI kit (app-shell-kit)

The light, Luma-inspired design system for Mesodapt: Next.js App Router, Tailwind v4,
`lucide-react`, and nothing else.

**Source of truth:** [`/DESIGN.md`](../../../../DESIGN.md) is the design system: rules,
tokens, motion, loading and empty states, and copy-paste component recipes.
[`theme.css`](./theme.css) holds the token values. If DESIGN.md and theme.css
disagree, theme.css wins and DESIGN.md is the bug. The live reference is
`/app/styleguide` (signed in), which renders every token and component below.

## Wiring

`src/styles/globals.css` imports `theme.css` after `@import "tailwindcss";`, and each
token becomes a utility (`bg-surface`, `text-fg-muted`, `rounded-card`, `shadow-card`,
`text-page-title`, `animate-rise`). Import components from
`~/components/ui-kit/app-shell-kit`.

## Components

| Component | Use |
|---|---|
| `AppShell` | The frame: a 240px nav column, an optional 256px `column2`, an optional 52px top bar (`tabs` / `topNav`), and an 800px content column with the atmosphere glow (`fullBleed` opts out). There's an optional `toc`. Mount it once per route section. |
| `AppCanvas` | The canvas, font and text root for content rendered outside the shell. |
| `PageHeader` | The one H1 per page: eyebrow, title, description, and `actions`. |
| `SectionHeading` | An H2 with `mt-10` and an optional text link. |
| `Panel` | The card surface (hairline, `shadow-card`, 20px radius). `padding`, `interactive`, `as`. |
| `Skeleton` | A shimmer placeholder, shaped with size and `rounded-*` utilities. |
| `Card` | A whole-card link: `filled` tile or `ghost` row. |
| `Callout` | An info banner, placed directly under PageHeader. |
| `Button` / `ButtonLink` / `buttonClass` | Pills: `primary` (ink), `accent`, `secondary`, `ghost`, `danger`; `sm` / `md` / `lg`; `icon`, `trailingIcon`, `loading`. |
| `IconButton` | A 32px round icon-only button. `aria-label` is required. |
| `Chip` | A status pill in the `neutral`, `accent` or zone tones (`rest`, `building`, `optimal`, `max`). |
| `Segmented` | A 2–4 option exclusive switch (client component). |
| `NavItem` / `isNavItemActive` | A sidebar row: `appearance="neutral"` (nav column) or `"accent"` (contextual list). |
| `TabStrip` | Underline tabs for the top bar. |
| `PageToc` | A right-hand table of contents. |
| `WorkspaceSwitcher` | A legacy menu from the original kit, not used by Mesodapt. |
| `Wordmark` | The ink tile with the M, and the name. |
| `Mark` | The M on its own, in `currentColor`. For the rare place that needs the mark without the name. |

## House rules (short form; DESIGN.md has the full set)

- Use role tokens only. No raw hex and no `gray-500`-style palette classes; add a token first.
- Use one ink primary per view. Accent is the one live signal: next-up, active, links, focus, and the accept-gate confirm.
- Zone colours are for data only.
- No card inside a card, no glass and no gradient text.
- Motion is 200–300ms on `--ease-soft`, and `tabular-nums` goes on numbers.

`guidelines/` only holds pointers into DESIGN.md. The original ReadMe-clone specs it
held described the old dark system and have been retired.
