# Mesodapt — UI Flourish Libraries (forward-looking shortlist)

**Date:** 2026-09-04
**Status:** Reference / decision guide. Not a build plan — pull these in only when the surfaces below exist.

## The governing tension

Mesodapt's core is a **calm, flat, data-honest** planning tool. The design system (`app-shell-kit`) is deliberately restrained: dark canvas, no shadows, accent-scarce, semantic tokens, and zone colors reserved for *data only*. The heat-map grid and analysis views must stay instantly legible — putting animated refraction or a shader behind a volume grid actively harms the product.

So the rule for every library here:

> **Flourish lives on the edges, never behind live data.**
> Rich/animated/WebGL effects belong on pre-auth and ambient surfaces — landing, sign-in, onboarding, empty states, the AI/Coach surface, route transitions, and celebratory moments (block complete). The Block grid, Analysis, and week detail stay flat and fast.

These are **V1.5 "make it feel premium" tools**, not MVP-critical. Ship the core loop legible first; do not gold-plate before the engine + experience shell prove out.

---

## Where flourish is allowed vs. forbidden

| Surface | Flourish? | Notes |
|---|---|---|
| Landing / marketing | ✅ yes | shader gradient hero, liquid logo — this is the "wow" |
| Sign-in / auth | ✅ subtle | ambient gradient behind the card |
| Onboarding (biodata → goals) | ✅ subtle | gradient/motion to make setup feel premium |
| Empty states ("no block yet") | ✅ subtle | a moment of polish before data exists |
| AI / Coach surface | ✅ selective | a glass panel or gradient can signal "this is the intelligent layer" |
| Block-complete / deload celebration | ✅ one moment | liquid logo or a burst — sparingly |
| **Block grid / Analysis / week detail** | ❌ **never** | data legibility is the product; keep flat, fast, token-driven |
| Nav shell / everyday chrome | ❌ no | the kit's restraint is the brand here |

---

## The three requested libraries

### 1. `liquid-glass-js` (dashersw) — Apple "Liquid Glass" refraction
- **What:** WebGL2 glass surfaces with real-time refraction/blur/masking (rounded-rect, circle, pill), incl. nested glass.
- **Tech:** WebGL 2.0 shaders + **`html2canvas`** to sample the page underneath for the refraction. Vanilla JS (React/Vue wrappers only "planned"). **MIT.** **Not on npm** (vendor/copy-in). Not SSR-safe (client-only).
- **Maturity:** ~860★ but essentially a single-commit repo — **immature; treat as a technique, not a dependency you'll get updates from.**
- **Placement in Mesodapt:** one or two premium *overlay* surfaces — the AI/Coach assistant panel, a command palette, a modal. **Not** as page chrome and **never** over the data grid.
- **Risks:** `html2canvas` page-capture is expensive (reflows, repaints) and brittle with dynamic content; no npm package means vendoring + owning it; WebGL context cost. **Verdict: prototype-only** behind a single hero surface; gate on `prefers-reduced-motion` and a WebGL capability check with a CSS-`backdrop-filter` fallback (which alone gets you 80% of the look far cheaper).

### 2. `shadergradient` (`@shadergradient/react`, ruucm) — animated gradient backgrounds
- **What:** Configurable, animated shader gradient meshes as backgrounds. The polished, "flowing color" ambient look.
- **Tech:** **react-three-fiber + Three.js.** React/Next-friendly but **client-only** — must be `next/dynamic` with `ssr:false`. Pulls Three.js (heavy, ~150KB+ gz). Typically MIT. *(License/version not freshly re-verified — confirm before shipping.)*
- **Placement:** landing hero, auth background, onboarding, empty states, Coach hero. The workhorse for "ambient premium."
- **Risks:** **Three.js bundle weight** — must be code-split out of the app bundle; **battery/thermal on the tablet target** (recall: desktop/tablet web only); needs a `prefers-reduced-motion` static-image fallback (freeze the frame). **Verdict: adopt** for pre-app/ambient surfaces via lazy client import; one canvas at a time; tear down on route change.

### 3. `liquid-logo` (paper-design) — GLSL liquid-metal logo
- **What:** Turns a logo/SVG into an animated liquid-metal shader.
- **Tech:** **A Next.js *app/tool*, not a library** — GLSL + WebGL + Tailwind, built with Bun. ~1k★, ~50 commits, live at liquid.paper.design. Reuse = **extract the shader + WebGL component** into a Mesodapt React component (not plug-and-play). License in-repo — **verify terms before shipping.**
- **Placement:** exactly **one** branding moment — landing/splash wordmark, or a block-complete celebration. A liquid logo everywhere cheapens it.
- **Risks:** extraction effort; unpackaged (you own the copy); WebGL cost for a decorative element. **Verdict: extract-for-one-moment**, static PNG/SVG fallback elsewhere.

---

## Complements worth adding (keep the set small)

- **`motion` (Framer Motion)** — **adopt.** The "premium, calm" feel comes more from *tasteful motion* (route/layout transitions, spring easing, staggered reveals) than from shaders. Cheaper, accessible, works with the flat design. This is the highest-leverage addition here.
- **`@react-three/fiber` + `@react-three/drei`** — if both shadergradient and an extracted liquid-logo ship, **standardize on one R3F/Three.js version** so you don't bundle Three.js twice. Make R3F the single WebGL substrate.
- Already in the stack: **lucide-react** (icons ✓), **Tailwind v4** (✓). No headless-component lib needed yet — the kit covers shell/nav; add Radix/shadcn only if/when complex primitives (menus, dialogs, comboboxes) appear.
- Optional cheap depth: a subtle **CSS grain/noise overlay** — premium texture with zero WebGL cost.

---

## Integration guardrails (Next.js App Router)

All three are client/WebGL. Non-negotiables when any of them land:
1. **Client-only:** `next/dynamic(() => import(...), { ssr: false })`; never in a server component or the shared layout.
2. **Code-split:** Three.js / WebGL must **not** enter the main app bundle — lazy-load per surface, below the fold where possible.
3. **One WebGL context at a time:** don't stack shader canvases; dispose on unmount/route change.
4. **`prefers-reduced-motion`:** every effect has a static fallback (frozen gradient, CSS backdrop-filter glass, static logo). This is an accessibility requirement, not a nicety.
5. **Tablet perf budget:** test on a real mid-tier tablet; watch battery/thermal. If it stutters behind content, it doesn't ship.
6. **Token discipline unchanged:** these effects are *chrome*, not data. Zone colors stay data-only; accent stays scarce; the grid/analysis stay flat.

---

## License / maintenance snapshot

| Library | Type | Framework | License | Maturity | Verdict |
|---|---|---|---|---|---|
| liquid-glass-js | vanilla JS (copy-in) | wrappers planned | MIT | ~860★, ~1 commit — immature | Prototype one overlay; CSS `backdrop-filter` fallback |
| shadergradient | npm (R3F/Three) | React/Next (client) | MIT *(verify)* | maintained | **Adopt** for ambient/pre-app surfaces |
| liquid-logo | Next app (extract) | Next/React | in-repo *(verify)* | ~1k★, active | Extract for **one** branding moment |
| motion (Framer Motion) | npm | React/Next | MIT | mature | **Adopt** — highest leverage |

---

## Suggested sequencing

1. **Now / MVP:** none. Finish the engine + experience shell; keep it flat and legible. (Optionally add `motion` for transition polish once the experience layer merges.)
2. **Pre-launch polish (V1.5):** `shadergradient` on landing/auth/onboarding + one extracted `liquid-logo` moment. Behind reduced-motion + code-split.
3. **If it earns its place:** a single `liquid-glass-js` (or CSS `backdrop-filter`) treatment on the AI/Coach panel to signal the intelligent layer.

The through-line: **the moat is the deterministic engine and the honest data viz — these libraries decorate the doorway, they don't touch the machine.**
