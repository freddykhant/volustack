# docs/

Design records for Mesodapt (originally named "volustack"; files dated before the rename keep the old name). Each feature goes **spec then plan**: a design spec in [`superpowers/specs/`](superpowers/specs/) is brainstormed and approved, then an implementation plan in [`superpowers/plans/`](superpowers/plans/) breaks it into tasks, and the work merges to `freddy/experimental`. Plans marked *training wheels* were written for the human developer to implement by hand. Specs and plans are **point-in-time records**: they are not updated after merge, their checkboxes are not reliable, and their file lists and routes can be out of date. The code is the source of truth. For what the product is now, read [`PRODUCT.md`](../PRODUCT.md) (users, behaviour, product laws). For the visual system, read [`DESIGN.md`](../DESIGN.md). Setup is in [`README.md`](../README.md). [`design/ui-libraries.md`](design/ui-libraries.md) is a reference shortlist, not a plan.

Statuses checked against code and `freddy/experimental` merge history on 2026-10-20.

## Index

| Date | Feature | Spec | Plan | Status | Notes |
|---|---|---|---|---|---|
| 07-20 | MVP vision and architecture | [mvp](superpowers/specs/2026-07-20-volustack-mvp-design.md) | — | Superseded | Laws and core loop hold; stack, auth, AI surfaces changed. See below. |
| 07-21 | Google sign-in (BetterAuth) | — | [google-oauth](superpowers/plans/2026-07-21-google-oauth-training-wheels.md) | Built | Training wheels. |
| 07-24 | Data model | MVP §7 | [data-model](superpowers/plans/2026-07-24-volustack-data-model.md) | Superseded | Rewritten as the 07-27 training-wheels plan (adds Neon preview branches). |
| 07-27 | Data model (training wheels) | MVP §7 | [data-model-tw](superpowers/plans/2026-07-27-volustack-data-model-training-wheels.md) | Built | Training wheels. Merged 08-28 (`freddy/feat/db-design`). Schema has grown since. |
| 07-25 | Training engine (6 modules) | [engine](superpowers/specs/2026-07-25-training-engine-design.md) | [generation](superpowers/plans/2026-08-26-training-engine-generation.md), [adaptation](superpowers/plans/2026-09-02-training-engine-adaptation.md) | Built with deviations | `stepWeek` takes a context arg; Jev later judges reschedule ranking and progression cause. |
| 07-25 | Experience layer (shell, Block, Analysis) | [experience](superpowers/specs/2026-07-25-experience-layer-design.md) | [experience](superpowers/plans/2026-09-03-experience-layer.md) | Built with deviations | `[blockId]` routes flattened 09-19; Now and Readiness nav items added. |
| 07-25 | AI orchestration (goal parser, phrasing, chat) | [ai-orchestration](superpowers/specs/2026-07-25-ai-orchestration-design.md) | — | Superseded | Never built. Structured wizard, Jev (10-01) and coach box (10-14) replaced it. |
| 09-04 | UI flourish libraries | [ui-libraries](design/ui-libraries.md) | — | Not started | Reference shortlist; none of the libraries are installed. |
| 09-04 | Now home | [now-home](superpowers/specs/2026-09-04-now-home-coaching-spine-design.md) | [now-home](superpowers/plans/2026-09-04-now-home-coaching-spine.md) | Built with deviations | Coach card never shows: the real-data mapper returns empty `coachNotes`. |
| 09-05 | Readiness + Next-Best-Workout POC | [readiness-nbw](superpowers/specs/2026-09-05-readiness-and-next-best-workout-design.md) | [readiness-nbw](superpowers/plans/2026-09-05-readiness-and-next-best-workout.md) | Partially built | Readiness now real (09-21). The swap control only renders from fixtures. |
| 09-06 | Integration ① engine-DB-view round-trip | [round-trip](superpowers/specs/2026-09-06-integration-round-trip-design.md) | [round-trip](superpowers/plans/2026-09-06-integration-round-trip.md) | Built | Merged 09-09. |
| 09-11 | Integration ② onboarding to plan | [onboarding](superpowers/specs/2026-09-11-onboarding-to-plan-design.md) | [onboarding](superpowers/plans/2026-09-11-onboarding-to-plan.md) | Built | Merged 09-12. |
| 09-14 | Integration ③ check-in and logging | [checkin-logging](superpowers/specs/2026-09-14-checkin-logging-design.md) | [checkin-logging](superpowers/plans/2026-09-14-checkin-logging.md) | Built | Merged 09-19. The plan's file layout shipped, not the spec's. |
| 09-19 | Routing and flow refactor | [routing](superpowers/specs/2026-09-19-routing-refactor-design.md) | [routing](superpowers/plans/2026-09-19-routing-refactor.md) | Built | Merged 09-19. Routes are now `/app/block` and `/app/block/week/[n]`. |
| 09-21 | ④-A weekly check-in to progression | [progression](superpowers/specs/2026-09-21-weekly-checkin-progression-design.md) | [progression](superpowers/plans/2026-09-21-weekly-checkin-progression.md) | Built | Merged 09-21. |
| 09-21 | ④-B real readiness from logged load | [real-readiness](superpowers/specs/2026-09-21-real-readiness-design.md) | [real-readiness](superpowers/plans/2026-09-21-real-readiness.md) | Built | Merged 09-21. Deleted the readiness fixture. |
| 09-24 | ④-C-1 readiness-driven deload | [deload](superpowers/specs/2026-09-24-readiness-deload-design.md) | [deload](superpowers/plans/2026-09-24-readiness-deload.md) | Built | Merged 09-24. |
| 09-24 | ④-C-2 recovery to Form blend | [recovery-form](superpowers/specs/2026-09-24-recovery-form-blend-design.md) | [recovery-form](superpowers/plans/2026-09-24-recovery-form-blend.md) | Built | Merged 10-01. |
| 10-01 | Jev judgement foundation | [jev](superpowers/specs/2026-10-01-jev-judgement-foundation-design.md) | [jev](superpowers/plans/2026-10-01-jev-judgement-foundation.md) | Built | Merged 10-03. Seam 3 (Coach) superseded by the coach box. |
| 10-04 | Dynamic scheduling ① + ② foundation and drag-and-drop | [schedule](superpowers/specs/2026-10-04-schedule-foundation-dnd-design.md) | [schedule](superpowers/plans/2026-10-04-schedule-foundation-dnd.md) | Built | Merged 10-07. |
| 10-12 | Dynamic scheduling ③ blocked time and re-placement | [exceptions](superpowers/specs/2026-10-12-schedule-exceptions-replacement-design.md) | [exceptions](superpowers/plans/2026-10-12-schedule-exceptions-replacement.md) | Built | Merged 10-13. `nominateOverflow` is still the placeholder left for the product owner. |
| 10-14 | Dynamic scheduling ④ coach box | [coach-box](superpowers/specs/2026-10-14-coach-box-design.md) | [coach-box](superpowers/plans/2026-10-14-coach-box.md) | Built | Merged 10-14. Prompt ambiguity rules are still placeholders left for the product owner. |

All dates are 2026. Where a spec has an "Amendments" section, the amendments win over its body.

## Superseded and historical: the July docs

The 2026-07-20 MVP spec and the 2026-07-25 AI orchestration spec were written before anything was built. Their vision still holds: the engine owns every number, the model never invents a claim, and changes are accept-gated. These specific claims are no longer true:

- **Stack.** The MVP spec (§10) calls for a pnpm + Turborepo monorepo with `engine`, `web` and `schema` packages. The app is a single-package T3 app: `src/engine/`, `src/schema/`, `src/domain/`.
- **Auth and hosting.** The MVP spec says "Supabase or Clerk". The app uses BetterAuth (email/password and Google) on Neon Postgres. The `@auth/prisma-adapter` dependency is a leftover from the T3 scaffold.
- **Delivery and charts.** No PWA (no manifest or service worker). No D3, visx or Recharts: the charts are hand-written SVG.
- **The model's role.** Both specs describe a Claude Sonnet/Opus tool-caller that calls engine functions and phrases decisions. What exists:
  - **Jev:** TypeSafe's typed-verdict model, which ranks or judges options the engine has already computed.
  - **The coach box:** Claude Haiku 4.5 by default. It fills one fixed intent form and never writes text the athlete reads.

  `src/server/ai/`, `parseGoals`, `phraseFacts` and the numeric guardrail were never built.
- **AI surfaces.** None of these exist:
  - natural-language goal intake (onboarding is a structured wizard);
  - ambient AI suggestion cards with Adjust/Why;
  - a sidebar assistant;
  - a conversational Coach tab (`/app/coach` is a "Coming soon" stub);
  - `ChatThread`/`ChatMessage` tables (the coach box stores single messages in `CoachMessage` for its daily cap).
- **Logging scope.** The MVP spec says "not a per-set workout logger". Per-set logging (`SetLog`) shipped in ③ and feeds readiness.
- **Constraints.** The MVP example ("Chest 16, Back 18, avoid squats") cannot be entered in the app. Onboarding collects days, session cap, split, proficiency and up to 3 priority muscles. It has no per-muscle set targets and no exclusions.
- **Nutrition context.** There is no TDEE calculation and no goal-phase question. `AthleteProfile.tdee` is never written. The phase defaults to `MAINTAIN`, so the cut/bulk MRV factor never changes anything in-app.
- **Routes.** The experience-layer spec and plan use `/app/block/[blockId]` and `/app/block/[blockId]/week/[n]`. Since 2026-09-19 these are `/app/block` and `/app/block/week/[n]`. The ①, ③ and Now-home docs use the same old paths.
- **Data-model reference.** The engine spec cites the 07-24 data-model plan. The 07-27 training-wheels plan is the one that was built.

## Next (not on this branch)

Dynamic scheduling ⑤, situational coach cues: the spec and plan are on `freddy/feat/coach-cues`. They are paused by the 2026-10-20 feature freeze while one real training block is dogfooded.
