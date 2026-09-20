# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary (MVP, design for this now):** the self-coached intermediate/advanced hypertrophy lifter — someone who programs their own training and wants volume and recovery *managed for them* rather than tracked by hand. They train in a gym, know their exercises and rough numbers, and are tired of juggling spreadsheets, notes apps, calendars, and ad-hoc AI prompts to keep a mesocycle on track.

**Adjacent, already partially served:** the structure-seeking beginner who wants a done-for-them plan with guardrails (a beginner template path exists in-app: flat volume, no priority targets).

**Roadmap audience (phase 2, not today's design target):** the multi-sport athlete balancing lifting with endurance (running, cycling, swimming) who needs one unified management layer. View models are deliberately discipline-agnostic so this expansion needs no rework.

## Product Purpose

Mesodapt is the **all-in-one volume / training / recovery management layer for athletes**, starting with hypertrophy. It is not a hypertrophy app that might grow — it is a management layer that happens to start with hypertrophy. Its core job is to **take the mental strain off managing training**: instead of the athlete juggling calendars, lists, and AI by hand, Mesodapt gives them one unified, adaptive schedule that reflows automatically when sessions are missed. Success is the athlete trusting the plan enough to stop managing it themselves.

## Positioning

**Lead with mental-strain relief:** the durable one-liner is that Mesodapt removes the overhead of managing your own training — one adaptive schedule replaces the manual juggling of tools. The mechanism a neighboring app could not truthfully copy is the pairing of (1) a **deterministic engine that owns every number** (volume landmarks, zones, mesocycle generation, redistribution) with (2) **Motion-style adaptive rescheduling** and (3) an **accept-gated coaching loop** where the athlete stays in control. It is adaptive like Motion, rigorous like a good coach's spreadsheet, and it never invents numbers.

The app metadata currently also carries the tagline *"The AI operating system for self-coached athletes"* — a punchier framing that is compatible with, but secondary to, the mental-strain-relief lead.

## Operating Context

The reference experience is the **Stamina** triathlon app (joinstamina.com) — same concept, endurance-focused. Its coaching loop is the model Mesodapt follows for strength:

- **Onboard → plan:** the athlete sets up their profile, schedule, split, and experience; the engine generates a mesocycle (block of weeks).
- **Now-home ("what next"):** the athlete opens the app to see the next best action.
- **Log the session:** per-set actuals (weight × reps × achieved RIR) recorded as truth — not gated.
- **Miss a session → adaptive reschedule:** an accept-gated proposal reflows the week (make-up / partial / let-go), the athlete accepts, holds, or edits.
- **Readiness (Fitness / Fatigue / Form):** the through-line metric; "Form" = readiness.
- **Coach's Comments / Trends:** the "why" behind changes and progress over time.

The athlete uses this self-coached, primarily around gym sessions, across a multi-week block.

## Capabilities and Constraints

**Deterministic engine (owns all numbers):** constraint resolution, mesocycle/block generation, weekly volume distribution against landmarks and zones, and `redistributeWeek` for missed-session recovery (make-up / partial / let-go candidates, one recommended). Real engine ↔ DB ↔ view round-trip is live for blocks; onboarding writes a real ACTIVE block; per-set logging and accept-gated reschedule are live.

**Still on fixtures / in progress:** Readiness (Fitness/Fatigue/Form), the Next-Best-Workout swap, and progression are not yet computed from logged load — that is the next roadmap slice (real readiness + progression from logged actuals).

**Terminology (use exactly):** mesocycle, block, week, session, prescription, set, RIR (reps in reserve), volume landmarks, zones (optimal / max), deload, split, Fitness / Fatigue / Form (Form = readiness).

**Deferred (do not fabricate as present):** endurance/multi-sport disciplines; biodata integrations (Garmin / Strava / Bevel); AM/PM two-a-day scheduling; real readiness/progression from logged load.

## Brand Commitments

- **Name:** Mesodapt (from "mesocycle" + "adapt").
- **Wordmark:** the name set with a Dumbbell mark (lucide `Dumbbell`) in the accent color; typographic identity, no separate logo asset yet.
- **Signature accent:** `#0092ff` (blue), used scarcely against a dark ground.
- **Theme:** dark by default (canvas `#0b0c0d`), established across the app shell.
- **Target voice — motivational & high-energy:** punchy, encouraging, momentum-driven; the Coach and product copy should energize the athlete. This holds even where the engine's numbers are the source of truth — the voice frames the data, never invents it.
  - *Known gap to reconcile:* the current in-app copy (onboarding, empty states) reads calmer and warmer ("we'll fit the plan to it," "you can fine-tune later") than this target voice. Future copy work should move copy toward the chosen motivational voice, not treat the incumbent calm copy as the standard.

## Evidence on Hand

- Pre-release, single-developer project on the `freddy/experimental` branch; **no real users, testimonials, benchmarks, customer counts, or press exist** — future work must not fabricate any.
- Real product surfaces exist and read from Postgres for blocks/weeks/sessions; Readiness and swap render from fixtures pending the logged-load slice.
- Assets: `public/favicon.ico` only. No logo, illustration, or photography assets on hand.

## Product Principles

1. **The coach proposes, the athlete controls.** Every engine-proposed plan change (swap, progression bump, reschedule, Coach mutation) flows through an accept-gate. Nothing mutates the plan silently. Recording truth (logging what was performed) is *not* gated.
2. **The engine owns the numbers (Law 1).** Volumes, weights, readiness, and zones come from the deterministic engine/data layer. Mappers, adapters, and UI only reshape them — they never originate numbers.
3. **Deterministic, no invented claims (Law 2).** No model-invented weights, volumes, or readiness anywhere — except the Coach, the one deliberate LLM surface, which is a tool-calling agent *over the engine*: it supplies language and intent-routing only, calls the same operations the UI does, and its mutations stay accept-gated.
4. **Take the mental strain off managing training.** Every surface should reduce management overhead, not add another thing to track. Default to "what's next," reflow automatically, and explain the why.
5. **Discipline-agnostic by construction.** View models carry no muscle-specific fields, so the phase-2 multi-sport expansion reuses the same readiness/session/swap surfaces without rework.
