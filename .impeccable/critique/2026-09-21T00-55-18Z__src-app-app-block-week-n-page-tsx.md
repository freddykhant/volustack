---
target: Week + session logging
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:/Users/freddykhant/repos/volustack/src/app/app/block/week/[n]/page.tsx"
target_fingerprint: "sha256:848fa6bc93c1f46c5bee287566138bc90f04f3c1699bb6b393e8018c0a33ae1b"
target_path: /Users/freddykhant/repos/volustack/src/app/app/block/week/[n]/page.tsx
timestamp: 2026-09-21T00-55-18Z
slug: src-app-app-block-week-n-page-tsx
closed: true
---
**Method:** dual-agent (A: design review · B: detector + browser evidence)

# Critique — Week + session logging (`/app/block/week/[n]`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Only end-state feedback; no per-set save state; reschedule query error (options.isError) never surfaced |
| 2 | Match System / Real World | 3 | Correct domain vocabulary; copy reads administrative vs. target voice |
| 3 | User Control and Freedom | 1 | Once COMPLETED, no way to re-edit; modal has no Escape/backdrop; no undo after applying reschedule |
| 4 | Consistency and Standards | 1 | Hand-rolls its H1 instead of PageHeader; StatusBadge puts zone-* colors on status pills — breaks Data-Only Zone Rule |
| 5 | Error Prevention | 1 | type=number with no min/max/step; unfilled sets silently dropped at submit; reschedule applies on one tap |
| 6 | Recognition Rather Than Recall | 1 | Rep-range + target RIR vanish on entering log mode |
| 7 | Flexibility and Efficiency | 3 | "Fill down" is a genuine gym-aware fast-path; little else |
| 8 | Aesthetic and Minimalist | 2 | On-token at rest; edit form is an undifferentiated stack, no chunking between exercises |
| 9 | Error Recovery | 1 | Reschedule fetch failures invisible; log errors show raw server string |
| 10 | Help and Documentation | 2 | Engine summary on reschedule options helps; nothing explains RIR |
| **Total** | | **17/40** | **Poor** |

## Design Specificity Verdict

A generic form + generic modal wearing Mesodapt's tokens — not a flow authored for logging a lift mid-workout. "Log session" swaps the prescription list for every exercise × every set × 3 inputs at once, with one commit point (finish()); nothing persists until the whole session is filled and submitted. That's a spreadsheet bulk-import model — opposite of "log the set I just did, pocket the phone."

- LLM assessment: Two real sparks — "fill down" and the reschedule dialog's recovered/dropped counts + single accent-flagged recommended (correct One Signal Rule). Both undermined by execution.
- Deterministic scan: detector → 4 advisory findings, all text-[11px] off the ramp (min 12px) in session-panel.tsx; two (lines 18,21) land on the exact StatusBadge pills the review flagged for the zone-color violation. Detector + human converge: status badges off-system on font size AND color role. page.tsx and dialog clean.
- Visual overlays: none — route auth-gated (307 → /).

## Overall Impression

Read-only week view is calm and on-brand (header zone pills give a fast correctly-colored read). But logging turns into a fragile all-or-nothing data-entry matrix with no autosave, no correction path, no hierarchy between log (frequent/safe) and mark-missed (rare/consequential). Biggest opportunity: redesign logging around "one set at a time, saved as you go" — the core promise (recording truth) is currently the most breakable flow.

## What's Working
1. Honest domain data model — weight/reps/achieved-RIR/rep-range/target-RIR in the right order with real units.
2. Reschedule engine output well-modeled — one border-accent bg-selection recommended option, recovered/dropped counts, per-session breakdown.
3. "Fill down" — considered gym-aware efficiency feature.

## Priority Issues

[P0] All-or-nothing save = single point of total data loss. Nothing persists until Finish; a locked phone/refresh mid-workout discards everything. Fix: per-set persistence (debounced per-row mutation, or localStorage draft keyed by slotId). Command: harden

[P0] No way to correct a logged session. Once COMPLETED the action row is gated out; a typo is permanent. Fix: keep affordance visible as "Edit log", pre-filled from loggedSets. Command: clarify

[P1] Log vs Mark-missed identical weight, neither uses accent. Both muted text links. Fix: promote "Log session" to an accent control; keep "Mark missed" the quiet link. Command: bolder

[P1] Targets disappear in edit mode + unfilled sets silently dropped. LogRows omits rep-range/RIR; finish() discards NaN rows with no notice. Fix: repeat target line in form; "2 sets left blank — skip them?" beat before submit. Command: clarify

[P2] Reschedule modal: no Escape/backdrop, no focus mgmt, swallows its own fetch error (only apply.isError handled, never options.isError). Fix: Escape + focus-trap + options.isError branch. Command: harden

[P2] StatusBadge breaks Data-Only Zone Rule (+ rides 11px off-ramp). zone-optimal-soft/zone-max-soft as Completed/Missed pills; DESIGN.md calls this "a bug." Fix: dedicated status-* tokens; 11px → 12px/ramp. Command: harden

## Persona Red Flags
Casey (one-handed, between sets): whole-session-before-save loses everything if pulled away; "fill down" smallest tap target; inputMode=numeric on weight drops iOS decimal (can't enter 61.25kg); two action links visually identical.
Sam (a11y): CellInput has no label/aria-label; modal has no aria-labelledby, no focus-trap, no Escape.
Marcus: must recall prescription in log mode; no typo correction after Finish; fixed set-count has no home for AMRAP/drop set.
Riley: refresh = total loss; no min/max/step; partial input silently dropped; empty/errored reschedule = dead end.

## Minor Observations
- Week H1 a full hierarchy level below every other page (24px, no eyebrow, skips PageHeader).
- Muscle fraction renders as raw decimal ("0.5").
- No positive feedback on log/reschedule success (no app-wide toast).

## Questions to Consider
1. If logging is "recording truth," why stage a whole session in memory before a single number is saved?
2. Why does the one modal DESIGN.md names for signature treatment have no focus trap, no Escape, no error state for its own fetch?
3. The day Marcus realizes a completed session's numbers are wrong — where does he fix them?
