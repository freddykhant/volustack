# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary (MVP, design for this now):** the self-coached intermediate/advanced hypertrophy lifter — someone who programs their own training and wants volume and recovery *managed for them* rather than tracked by hand. They train in a gym, know their exercises and rough numbers, and are tired of juggling spreadsheets, notes apps, calendars, and ad-hoc AI prompts to keep a mesocycle on track.

**Adjacent, already partially served:** the structure-seeking beginner who wants a done-for-them plan with guardrails (a beginner template path exists in-app: flat volume, no priority targets).

**Roadmap audience (phase 2, not today's design target):** the multi-sport athlete balancing lifting with endurance (running, cycling, swimming) who needs one unified management layer. The readiness, session, swap, schedule and coach view models are deliberately discipline-agnostic so this expansion reuses them without rework (the volume/landmark views are muscle-specific by nature).

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
- **Miss a session → adaptive reschedule:** an accept-gated proposal reflows the week (make-up / partial / let-go, one recommended), the athlete picks one or closes it and decides later.
- **Readiness (Fitness / Fatigue / Form):** the through-line metric; "Form" = readiness.
- **Coach's Comments / Trends:** the "why" behind changes and progress over time. *Not built yet:* the Coach page is a placeholder, no coach notes are generated, and there is no Trends view. Today the why travels with each proposal, and the Readiness chart shows Fitness / Fatigue / Form across the block.

The athlete uses this self-coached, primarily around gym sessions, across a multi-week block.

## Capabilities and Constraints

**Deterministic engine (owns all numbers):** constraint resolution, mesocycle/block generation, weekly volume distribution against landmarks and zones, and `redistributeWeek` for missed-session recovery (make-up / partial / let-go candidates, one recommended). Real engine ↔ DB ↔ view round-trip is live for blocks; onboarding writes a real ACTIVE block; per-set logging and accept-gated reschedule are live.

**Adaptation (present):** Readiness (Fitness/Fatigue/Form) is computed from logged load, with the weekly check-in's subjective recovery nudging Form. Once every session in a week is logged or rescheduled, a weekly check-in (per-muscle recovery and joint stress) produces an accept-gated progression proposal for the next week, or, when readiness calls for it, an accept-gated early-deload proposal.

**Judgement layer (present):** a typed judgement model (Jev, via TypeSafe) may choose among options the engine has already built and costed: which missed-session option is recommended, whether an ambiguous muscle steps up a set, and which blocked-time arrangement is shown first. It never supplies a number, and if it is unavailable or unsure the engine's own choice stands.

**Not built yet:** the Next-Best-Workout swap (the home card hides it because no swap options are produced from real data), coach notes and the Coach page.

**Terminology (use exactly):** mesocycle, block, week, session, prescription, set, RIR (reps in reserve), volume landmarks, zones (optimal / max), deload, split, Fitness / Fatigue / Form (Form = readiness).

**Deferred (do not fabricate as present):** endurance/multi-sport disciplines; biodata integrations (Garmin / Strava / Bevel).

**Scheduling (present):** every session has a placement (weekday, optional AM/PM). Athletes choose one-a-day or AM/PM, set a standing availability grid (Preferred / Available / Blocked), and drag sessions on the week board. The engine warns about recovery problems and suggests single moves; it never moves a session on its own.

**Scheduling (blocked time):** an athlete can block a day or half-day on a specific date from the week board, without changing their standing availability, and can undo it. When a session is left standing on blocked time, the engine offers up to three ways to re-arrange the week: best recovery, fewest changes, keeps preferred times. When the week has more sessions left than open days, the options are instead to skip a named session, which goes through the existing missed-session reschedule and its own accept, or, in AM/PM mode and only when every session still fits, to train twice on one day. One-a-day athletes are never doubled up. The judgement model may choose which option is shown first. It cannot create or change an option, and if it is unavailable the engine's order is used. Nothing in the current week moves without the athlete's tap. A later week that has not started is re-arranged immediately when the athlete blocks time in it from the board, using the fewest-changes arrangement, and the change is logged; this can also move a session in that week that was already standing on blocked time; if that week cannot hold every session it is left alone and the athlete chooses when they open it.

**Scheduling (the coach box):** the week board has a text box where the athlete can say what has changed ("can't make Thursday", "Saturday is free again", "skip lower b") or ask one of four questions: what is wrong with the week, why a session is on its day, what is next, and how recovery looks. A language model turns the message into a fixed form (an intent, dates, a session) and nothing else. By default it is a small, fast model, chosen because the job is parsing. The server checks that form against the real week and answers in sentences built from engine facts. The model never writes what the athlete reads. Blocking, unblocking and skipping each show a card that states what will happen and wait for a tap; nothing changes before it. Blocking time in a later week can also re-arrange that week, as the board's own toggles do. When a message is too vague to act on, the box asks which day or which session, with a button for each. Messages are capped at 500 characters and 50 a day. The model is sent only today's date and weekday, the schedule mode, each remaining date of the block with its weekday, its block week and whether it is blocked, and the viewed week's sessions with their label, day, half of the day and status; never an id, an email or profile data. The text of each message is stored so the daily cap can be counted and so the team can see which phrasings were not understood; it is never fed back into a prompt. There is no saved conversation: each message stands alone. With no model key the box is absent and the board works as before. Still deferred: a conversation that remembers, and anything beyond scheduling.

**Scheduling (coach cues).** The athlete can mark simple outside activities on the week board: a run, a ride, a swim, a game, with an intensity and optionally a time of day and minutes. They never change where sessions go or how a week is scored. For today and tomorrow the engine looks at each day's sessions and activities and raises at most two cues: fuelling between two demanding things on one day, recovery when legs are loaded on consecutive days, and carbs before a big lower-body session. Numbers are ranges from the athlete's bodyweight and phase (published g/kg guidance, tunable in `src/engine/constants.ts`); without a bodyweight the cue uses words. Cues appear on the home page, can be dismissed on that device, and show as a marker on the board's day header.

## Brand Commitments

- **Name:** Mesodapt (from "mesocycle" + "adapt").
- **Mark and wordmark:** the M, one stroke through a training block (it climbs, deloads and climbs again from higher up), in an ink tile beside the name set in the system font, via the kit's `Wordmark`. Chosen 2026-10-21 from the brand exploration on `freddy/brand`. See DESIGN.md → Brand.
- **Signature accent:** `#0a6fe0` (blue), the one live signal, used scarcely against a light ground.
- **Theme:** light by default (warm off-white canvas `#faf9f7`, Luma-inspired); a dark theme is deferred and will override the same tokens via `[data-theme=dark]`. See DESIGN.md.
- **Target voice — motivational & high-energy:** punchy, encouraging, momentum-driven; the Coach and product copy should energize the athlete. This holds even where the engine's numbers are the source of truth — the voice frames the data, never invents it.
  - *Known gap to reconcile:* the current in-app copy (onboarding, empty states) reads calmer and warmer ("we'll fit the plan to it," "you can fine-tune later") than this target voice. Future copy work should move copy toward the chosen motivational voice, not treat the incumbent calm copy as the standard.

## Evidence on Hand

- Pre-release, single-developer project on the `freddy/experimental` branch; **no real users, testimonials, benchmarks, customer counts, or press exist** — future work must not fabricate any.
- Real product surfaces exist and read from Postgres for blocks/weeks/sessions, readiness, check-ins and proposals; the swap and coach notes are not wired to real data yet, so they do not render.
- Assets: the M (kit `Mark` / `Wordmark`, `src/app/icon.svg`, `src/app/apple-icon.tsx`). No illustration or photography assets on hand.

## Product Principles

1. **The coach proposes, the athlete controls.** Every engine-proposed plan change (swap, progression bump, reschedule, Coach mutation) flows through an accept-gate. Nothing mutates the plan silently. Recording truth (logging what was performed) is *not* gated.
2. **The engine owns the numbers (Law 1).** Volumes, weights, readiness, and zones come from the deterministic engine/data layer. Mappers, adapters, and UI only reshape them — they never originate numbers.
3. **Deterministic, no invented claims (Law 2).** No model-invented weights, volumes, or readiness anywhere. Models appear in two deliberate, bounded places. The Coach is a tool-calling model *over the engine*: it supplies intent-routing only, never writes what the athlete reads, and every reply is phrased from engine facts. Its changes go through the same operations the board uses, and only on the athlete's tap. The judgement layer (Jev) only picks among options the engine built, never carries a quantity, and falls back to the engine's pick.
4. **Take the mental strain off managing training.** Every surface should reduce management overhead, not add another thing to track. Default to "what's next," reflow automatically, and explain the why.
5. **Discipline-agnostic by construction.** The readiness, session, swap, schedule and coach view models carry no muscle-specific fields, so the phase-2 multi-sport expansion reuses the same readiness/session/swap surfaces without rework.
