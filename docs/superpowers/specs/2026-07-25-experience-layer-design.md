# VoluStack — Experience Layer Design (Shell + Block + Analysis)

**Date:** 2026-07-25
**Status:** Approved design, ready for implementation planning
**Parent spec:** `docs/superpowers/specs/2026-07-20-volustack-mvp-design.md` (§9 Experience Layer)

---

## 1. Scope

This spec covers the first buildable slice of the experience layer:

- **App shell integration** — mounting VoluStack's navigation into the existing app-shell kit
- **The Block view** — the mesocycle muscle × week grid (hero screen) + week detail drill-in
- **The Analysis view** — landmark bars + anatomical body map (signature visualization)
- **The landmark zone color system** — the one token extension the kit needs
- **The mock-data contract** — view-model types + fixtures the UI is built against

**Out of scope** (later specs): onboarding flow, check-in UI, ambient AI suggestion cards,
sidebar assistant, Coach tab, exercise library browse, settings. These get stub routes so the
IA is honest about the vision, but no content.

**Interactivity boundary:** this build is **read + drill-in**. No editing of cells or
prescriptions — mutation semantics arrive with the engine. No throwaway: drill-in routing,
zone rendering, and all components carry forward unchanged.

---

## 2. Posture Toward the App-Shell Kit

The kit at `src/components/ui-kit/app-shell-kit/` is the **styling foundation, tailored into
VoluStack** — an ideal starting point from a UI/styles perspective, up for modification.

**Keep as-is:**
- Shell anatomy: 256px workspace nav → 288px contextual column → 49px top bar → content
- Semantic-token discipline (never raw hexes; new colors enter via `@theme` tokens first)
- Dark-only canvas (`#0b0c0d`), no-shadow elevation (`bg-surface` = raised)
- Type scale, `PageHeader` / `SectionHeading` / `Card` rhythm on all standard pages
- The accent-is-scarce house rule

**Tailored for VoluStack:**
1. **Full-bleed tools.** The Block and Analysis views opt out of the 756px content cap using
   the kit's own full-bleed escape hatch — they are planning tools (the Motion-calendar
   analog), the exact case the opt-out exists for. Every other page (settings, library,
   future onboarding) keeps the 756px article rhythm.
2. **Data-viz token family.** The theme gains landmark zone tokens (§4).
3. **Accent rebrand is a one-line decision.** The kit ships ReadMe blue (`#0092ff`); whether
   VoluStack keeps or replaces it is decided by editing the `@theme` block in `theme.css`.
   This spec treats the current blue as placeholder and takes no dependency on its hue.

---

## 3. Information Architecture & Routing

```
/app                                    → AppShell mounts once (app/app/layout.tsx)
  /app/block                            → redirects to the active block
  /app/block/[blockId]                  → mesocycle grid (full-bleed hero)
  /app/block/[blockId]/week/[n]         → week detail (sessions + prescriptions, full-bleed)
  /app/analysis                         → landmark bars + body map (full-bleed)
  /app/coach                            → stub ("coming soon")
  /app/library                          → stub
  /app/settings                         → stub
```

**Column 1 (workspace nav):** VoluStack wordmark/workspace top slot → nav items **Block,
Analysis, Coach, Library, Settings** → user row at bottom (BetterAuth session: avatar, name,
sign-out). Active states derive from `usePathname()` per the kit.

**Column 2 (training section only):** the **block navigator** —
- Active mesocycle, expanded: name + status, then its week list
  (`Wk 1 ✓ · Wk 2 ✓ · Wk 3 ◀ current · Wk 4 · Deload`); completed weeks checked, current
  week marked. Selecting a week routes to week detail; selecting the block name routes to
  the grid.
- Past blocks, collapsed beneath.

Analysis and stub sections render no Column 2 (shell's `column2` slot omitted).

---

## 4. Landmark Zone Color System

The heat semantics are VoluStack's visual signature, so they are **first-class semantic
tokens** in `theme.css` — used identically by grid cells, analysis bars, and the body map.

| Token | Zone | Meaning |
|---|---|---|
| `--color-zone-rest` | below MEV | maintenance/untrained — muted grey |
| `--color-zone-building` | MEV → MAV | productive volume, room to grow |
| `--color-zone-optimal` | MAV → MRV | the sweet spot |
| `--color-zone-max` | at/over MRV | overreaching — the only "alarm" color on screen |

Each token has a `-soft` translucent variant for large fills (grid cells, body regions);
full-strength versions for small marks (bar segments, chips, markers).

**House-rule extension:** zone colors are reserved for *data* — never decorative UI. This
preserves accent scarcity: accent = interactive/active, zones = meaning.

**Hue selection is an implementation-time task** using the dataviz skill: validate contrast
against `#0b0c0d`, colorblind-safe progression, and that `zone-max` reads as warning without
screaming. The spec fixes the *token names and semantics*, not the hexes.

---

## 5. The Block View (hero, full-bleed)

### Tool header (not the standard PageHeader)
- Block name + status chip (`ACTIVE`)
- Meta line: `Upper/Lower · 5 days/week · Week 3 of 6`
- Slim block progress bar (weeks elapsed / total)

### The grid — muscles × weeks
- **Rows:** the block's trained muscle groups. Sticky left labels: muscle name + priority
  marker (▲) for muscles prioritized in the constraint set.
- **Columns:** weeks (`Wk 1 … Wk N`, `DL` for deload). Deload column visually muted.
  The **current week** column gets a subtle `bg-selection` wash and an accent column
  header — the only accent inside the grid.
- **Cells:** planned sets for that muscle-week. Cell background = that muscle's zone color at
  that volume (`-soft` variant) — the grid reads as a heat map at a glance. Number in `text-fg`.
- **Hover tooltip:** `14 sets — optimal · MEV 8 / MAV 14 / MRV 22`.
- **Column footer:** per-week total sets, `text-fg-subtle`.
- **Interaction:** clicking a week column (header or cell) routes to week detail. No editing.

### Week detail (`/week/[n]`, full-bleed for continuity)
- Week header: `Week 3 · 5 sessions · 92 total sets` + zone summary chips
  (e.g. `2 muscles optimal · 1 near MRV`)
- **Session cards** in a responsive grid: `splitSlot` title (`Upper A`), day tag, duration
  estimate, then the prescription list — `Bench Press — 4 × 6–10 @ 2 RIR` — each exercise
  with muscle chips showing fractional credit (`chest 1.0 · tri 0.5 · f.delts 0.5`).
- Back affordance to the grid; Column 2 keeps orientation.

---

## 6. The Analysis View (full-bleed)

Header with a **week selector** (defaults to current week); the page renders for the selected
week.

- **Left — body map:** front + back anatomical SVG, ~14 regions keyed by `MuscleGroup`,
  filled with the zone color for the selected week's planned volume. Hover/tap a region
  highlights its bar on the right. One-time asset: `body-map.tsx`, a single SVG component
  with region paths; after that it's fill colors only.
- **Right — landmark bars:** one horizontal bar per muscle. The *track* renders that muscle's
  personal zone bands (MEV/MAV/MRV as background segments); the bar fills to planned volume;
  a marker shows actual volume when known. Right label: `14 → optimal`. Sorted by closeness
  to MRV, so risk floats to the top.
- **Below — volume distribution strip:** compact chart of planned sets per session across the
  selected week.

---

## 7. Mock-Data Contract (load-bearing)

The UI is built against **one fixture module impersonating future engine output**, typed by a
view-model contract. Components consume ONLY the view models.

```
src/views/types.ts
  MesocycleView / WeekView / SessionView / PrescriptionView /
  MuscleWeekCell / LandmarkBarDatum
  — the view-model contract for every component in this spec.

src/views/_fixtures/mock-block.ts
  mockMesocycle: MesocycleView — 6-week U/L 5-day block, realistic ramp (e.g. chest 12→16),
  deload week, priority muscles, fractional-credit prescriptions.
  Landmark data per muscle in the DEFAULT_LANDMARKS shape.
```

- If `src/schema/enums.ts` exists when this builds (data-model plan Task 2), fixtures import
  the real `MuscleGroup` enums; otherwise this spec defines them locally and the data-model
  plan reconciles.
- When the engine lands, its output is mapped to these view models and the fixture is
  deleted — **no component changes**.

---

## 8. Component Inventory

```
src/components/ui-kit/…            kit as-is; theme.css gains zone tokens (§4)
src/components/viz/
  zone.ts                — zoneFor(volume, landmarks) → 'rest'|'building'|'optimal'|'max'
                           (pure; the only logic in this phase; unit-tested)
  landmark-bar.tsx       — single bar with zone-band track
  body-map.tsx           — anatomical SVG, regions keyed by MuscleGroup
src/components/block/
  block-header.tsx       — tool header + progress
  block-grid.tsx         — the muscle × week grid
  week-column-header.tsx
  grid-cell.tsx
  session-card.tsx       — prescription card with fractional muscle chips
src/components/nav/
  block-navigator.tsx    — Column 2 content
src/app/app/layout.tsx   — AppShell mount (Column 1 nav + user row)
src/app/app/…            — routes per §3
```

---

## 9. Testing & Verification

- **`zoneFor()` unit tests** (Vitest): boundary cases — exactly MEV, exactly MAV, exactly
  MRV, zero, above MRV.
- **Typecheck** (`pnpm typecheck`) enforces the view-model contract across all components.
- **Visual verification** against the fixture block: grid heat reads correctly (ramp
  progresses zones; deload drops to rest/building; prioritized muscle shows marker and runs
  hotter), current-week accent is the only accent in the grid, Analysis bars and body map
  agree with grid cells for the same week.
- Component render tests are deferred until real behavior (mutation, engine data) exists —
  testing pure presentation against its own fixture is low-value.

---

## 10. Decision Log

| Decision | Choice | Why |
|---|---|---|
| Scope | Shell + Block + Analysis only | Sharpest buildable slice; other §9 surfaces get stubs |
| Kit posture | Foundation, tailored | Kit is an ideal starting point, explicitly up for modification |
| Block width | Full-bleed | It's a planning tool — the kit's own escape-hatch case |
| Column 2 | Block navigator | Mirrors kit's collections-tree pattern; always-visible orientation |
| Grid depth | Read + drill-in | No edit UX before the engine defines mutation semantics |
| Analysis form | Landmark bars + body map | Bars = analytical workhorse; body map = signature wow |
| Zone colors | Semantic tokens, data-only | Preserves accent scarcity; one visual language everywhere |
| Data | View-model contract + fixture | UI ships before engine; engine maps to view models later |
