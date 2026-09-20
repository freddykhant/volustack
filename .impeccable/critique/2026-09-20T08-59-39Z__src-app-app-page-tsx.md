---
target: Now-home (/app)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:/Users/freddykhant/repos/volustack/src/app/app/page.tsx"
target_fingerprint: "sha256:2cd65f2e4a896d83ec473a47429dd64c3ce7af6957433f474ccae67deab3464b"
target_path: /Users/freddykhant/repos/volustack/src/app/app/page.tsx
timestamp: 2026-09-20T08-59-39Z
slug: src-app-app-page-tsx
---
**Method:** dual-agent (A: design review · B: detector + browser evidence)

# Critique — Now-home (`/app`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | ReadinessChip dot is always gray (bg-fg-muted) regardless of state; no echo after logging |
| 2 | Match System / Real World | 3 | Domain terms (RIR, zones, sets) used correctly and consistently |
| 3 | User Control and Freedom | 3 | Swap has cancel + undo; but can't act on a session without leaving the page |
| 4 | Consistency and Standards | 2 | Hero card = secondary cards; CoachCard gives caution and positive the same color |
| 5 | Error Prevention | 3 | Swap requires explicit selection; sensible empty states |
| 6 | Recognition Rather Than Recall | 3 | Exercise list truncates to "+N" with no expand-in-place |
| 7 | Flexibility and Efficiency | 1 | Every real action is a link elsewhere — no in-place logging, no shortcuts |
| 8 | Aesthetic and Minimalist Design | 3 | Token-disciplined, but card sameness flattens rather than clarifies |
| 9 | Error Recovery | 2 | No fallback UI for partial data (missing readiness point silently → null) |
| 10 | Help and Documentation | 1 | No legend for what zone colors or "Form" mean — assumes the athlete already knows |
| **Total** | | **23/40** | **Acceptable** |

## Design Specificity Verdict

The page is a generic "what's next" dashboard wearing Mesodapt's tokens. Strip the copy and the skeleton (eyebrow + H1 + status pill, one hero card + CTA, a 2-col grid of info cards) is interchangeable with a PM "today" view or a habit tracker. Only the vocabulary says strength training — not the shape.

- **LLM assessment:** The one genuinely product-specific element is TrainingStatusCard's zone strip. Two checkable misses against DESIGN.md: (1) it names the Now/next-session card by name as a "Concentrated Glass" signature-elevation surface, yet the card ships the identical flat `border border-border bg-surface p-6` as every secondary tile; (2) the stated motivational voice is absent — "Next session / Training status / Swap session / View all" reads administrative. PRODUCT.md flags this voice gap as unresolved; this page is Exhibit A.
- **Deterministic scan:** `impeccable detect` → 0 findings, exit 0, all six .tsx files parsed cleanly. Confirms CSS/token hygiene (no slop patterns, no raw hex, accent scarce) — but the detector can't see hierarchy, voice, or product-specificity, which is where the substance is.
- **Visual overlays:** none — /app requires an authenticated session + seeded block; the running dev server on :3000 is unauthenticated (/app → 307 → /), so no live overlay was injected or claimed.

## Overall Impression

The bones are disciplined and the token system is respected — but the page is too polite for what it is. It opens quiet, treats its highest-stakes moment (the accept-gated swap) as a footnote, and ends quieter. Biggest opportunity: make the visual system carry the hierarchy the content model already knows — the next-session card is the hero, the swap is a real decision, "Form" is the through-line metric. All three are currently flattened into the same calm gray field.

## What's Working

1. The zone strip (training-status-card.tsx:32) — proportional, colorblind-safe, correctly reserved for data per the Data-Only Zone Rule. The one unmistakably domain-specific piece.
2. Token discipline — every surface uses semantic tokens, no raw hex; the One Signal Rule works (accent "Start session" button is the clear visual peak).
3. The swap state machine (open → chosen → undo) correctly implements the accept-gate principle — logic sound, only visual presentation undersells it.

## Priority Issues

**[P0] The swap control has no visual weight for the highest-stakes interaction on the page.** Why: this is where "the coach proposes, the athlete controls" happens — rendered as a 14px muted text link, indistinguishable from CoachCard's "View all." Fix: distinct bordered/chip affordance + the planned "Concentrated Glass" elevation DESIGN.md names for this moment. Command: bolder

**[P0] The hero card is visually identical to the secondary cards.** Why: NextSessionCard, TrainingStatusCard, CoachCard, and the empty state all share `rounded-card border border-border bg-surface p-6`; hierarchy rests on position alone. Fix: step it up the tone ladder (surface-raised) or apply glass; heavier border / larger padding. Command: shape (then bolder)

**[P1] ReadinessChip ignores the zone-color system entirely.** Why: "Form" is the through-line metric and its dot is hardcoded bg-fg-muted — all states render identical gray. Fix: map the dot to the same zone-* tokens TrainingStatusCard already uses. Command: colorize

**[P1] CoachCard's tone map collapses caution and positive into one color.** Why: coach-card.tsx:5 gives caution and positive identical text-fg-soft; a recovery warning and a compliment render the same, and the motivational voice gets no visual expression. Fix: distinct on-system treatments per tone (icon or new semantic token — not zone-*, which is data-only). Command: clarify

**[P2] The page voice is flat/administrative against a stated motivational target.** Why: flagship every-session screen reads like an admin panel; PRODUCT.md flags this gap. Fix: rework microcopy for momentum — Law 2 holds, voice frames numbers, never invents them. Command: delight

## Persona Red Flags

**Alex (power user):** "Start session" is navigation not action; exercise list truncates at 4 with no expand; plain-text swap easy to miss on a fast scan.

**Sam (accessibility):** zone strip fully aria-hidden (count but no breakdown for screen readers); SessionSwapControl unmounts/remounts button trees with no focus management (focus likely dropped to body on swap); safety-adjacent fatigue warning is the smallest text on the page (12px).

**Marcus (self-coached intermediate lifter — primary persona):** "Form: Fatigued" is text-only, no color — slower for a between-sets glance; "5 of 8 muscles in range" never says which muscles (undercuts "management layer, not tracker"); fatigue nudge is passive (only if he opens swap); fixture-driven readiness/swap most likely to be caught by the persona who "knows his numbers," with nothing marking that data provisional.

## Minor Observations
- Empty state appropriately de-emphasized — good restraint.
- No streak / last-completed summary — missed lever for the momentum voice goal.
- Readiness chip "Fatigued" and swap panel fatigue hint share no color/icon thread.
- dayTag at fg-subtle correctly follows the "supporting labels only" rule.

## Questions to Consider
1. If a habit tracker swapped in this exact card set, would anyone notice this was a strength-training command center and not a to-do app?
2. Why does the card DESIGN.md names as a signature glass moment wear the same flat surface as a two-line coach note?
3. If "Form" is the metric the whole roadmap is built around, why is it the only status indicator that renders pure gray no matter what it says?
