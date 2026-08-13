# mesodapt — MVP Design Spec

**Date:** 2026-07-20
**Status:** Approved design, ready for implementation planning
**Author:** Freddy (with Claude, via brainstorming)

---

## 1. Vision & Positioning

mesodapt is the **intelligent operating system for self-coached athletes** — a platform that
automatically plans, manages, and optimises training so the user never has to manually
recalculate volume again.

The long-term ambition is to own the entire exercise-programming workflow across all
disciplines (bodybuilding, powerlifting, running, hybrid, CrossFit, rehab, sport-specific).
The MVP deliberately serves **one** athlete and **one** loop, exceptionally well.

### What mesodapt is (MVP)

An **intelligent, auto-regulated program planner and volume-management platform.** The user
defines goals and constraints; the system generates and continuously adapts a training block.

### What mesodapt is NOT (MVP)

- **Not a per-set workout logger.** Cadence is the training block, not the rep. In-gym logging
  is a V2 companion app.
- **Not a chatbot-in-a-box.** AI appears as ambient suggestions on the plan, plus a dedicated
  coach surface — but it never does arithmetic and never bypasses the engine.
- **Not a nutrition/food logger.** TDEE is training _context_, not calorie tracking.

---

## 2. The Beachhead

**MVP is ruthlessly built for the intermediate/advanced hypertrophy lifter** — the "Excel
refugee" who already understands training volume, progressive overload, mesocycles, deloads,
and per-muscle frequency, and who currently manages this by hand across Notes, Excel, ChatGPT,
and Hevy.

Why this wedge:

- The pain (manual weekly volume management) is acute, quantifiable, and underserved.
- The engine stays pure: weekly sets per muscle × frequency × progression, with no cardio
  physiology to model yet.
- Competitors don't own this layer: Hevy/Strong log but don't program; RP ships rigid
  templates; ChatGPT hallucinates and forgets.

Beginners are supported as a funnel-widener (see §5) **without building a second system.**

---

## 3. Core Philosophy & Architectural Laws

Two rules govern the entire system. They are non-negotiable because **trust is the product** —
the promise "never recalculate volume again" collapses the first time a number is wrong.

### Law 1 — The engine is the only thing that touches numbers.

All volume math, set allocation, progression, deload timing, and redistribution live in a
**deterministic, pure, exhaustively-tested engine.** No LLM ever performs arithmetic.

### Law 2 — The LLM only selects among engine-validated options and phrases them.

The LLM parses intent, chooses between options the engine has already certified as valid, and
explains decisions in natural language. Any message that would _change the plan_ round-trips
through the engine. **Chat is a conversational front door to the engine, never a backdoor
around it.**

---

## 4. The Core Loop (the product's heartbeat)

The fundamental clock is the **training block / mesocycle**, configured at onboarding
(presets or custom). Weeks are its sub-beats. **Weekly check-ins are optional; the AI decides
when one is worth asking for.**

```
1. DEFINE goals + constraints  (once, refined over time)
      "5 days, U/L, Chest 16, Back 18, Quads 12,
       avoid squats, prioritise shoulders, 6-week block"
        │
        ▼
2. GENERATE mesocycle  — engine builds the block:
      per-muscle weekly volume ramp (MEV→MAV→MRV),
      distributed across sessions, deload at the end
        │
        ▼
3. TRAIN the week  (off-platform in MVP)
        │
        ▼
4. OPTIONAL CHECK-IN  — per-muscle: recovery, performance,
      joint/effort  +  planned vs. actual volume
      (surfaced only when the AI judges it will change the plan)
        │
        ▼
5. AUTO-REGULATE  — engine adjusts next week per muscle:
      add / hold / cut sets, time the deload, redistribute
      missed volume across remaining days
        │
        ▼
6. EXPLAIN  — AI narrates every change on the timeline
      → loop back to 3
```

The user lives in steps 1, 4, 6. The system owns 2 and 5. That is the "world-class coach
quietly working in the background."

### Graceful degradation (design requirement)

The engine must handle any feedback density:

- **Rich feedback** → precise auto-regulation (add/hold/cut per muscle).
- **Sparse feedback** (e.g. "shoulders still smashed") → adjust only what's flagged, hold the rest.
- **No feedback** → follow the planned progression ramp on defaults.

The engine must also expose a confidence signal — "how certain is next week's plan, and would a
check-in change it?" — so the AI can prompt for check-ins intelligently rather than on a timer.

---

## 5. Onboarding

```
1. Biodata        → age, sex, height, weight, activity → TDEE
2. Goal phase     → cut / maintain / bulk   (modulates recovery capacity → effective MRV)
3. Experience     → beginner | intermediate | advanced      ← the router
        │
        ├─ Beginner       → pick a split → proven template + simple linear progression
        └─ Int / Advanced → full block planning, per-muscle targets, custom mesocycles
```

### TDEE as context (boundary)

Biodata + TDEE + phase feed the engine as **context that modulates recovery capacity**, not as
a nutrition tracker. A lifter in a deficit recovers worse → lower effective MRV → the engine
auto-regulates more conservatively. **No calorie/macro logging in MVP.**

### Beginners via the same engine (unification)

A beginner is **the same engine with the knobs locked** — handed a template split and
simplified constraints, generating a block with gentle linear progression instead of
MEV→MRV auto-regulation. One engine, two levels of exposed configuration. This widens the
funnel almost for free while keeping engineering focused on the intermediate/advanced core.

---

## 6. System Architecture

Three layers plus data. The discipline: the engine is the only numeric authority; the LLM only
selects and phrases; Zod contracts guard every boundary.

```
┌──────────────────────────────────────────────────────────┐
│  EXPERIENCE LAYER  (desktop/tablet web, PWA)              │
│  Block timeline · muscle heat map · volume distribution   │
│  charts · optional check-in · ambient AI suggestion cards │
│  · sidebar assistant · AI Coach tab                       │
└──────────────────────────────────────────────────────────┘
             ▲                        │
   structured plan +                  │  user goals, check-in data,
   AI-phrased reasoning               ▼  accept/reject, chat intent
┌──────────────────────────────────────────────────────────┐
│  AI ORCHESTRATION LAYER  (LLM, tool-use)                  │
│  • Parse NL goals → validated constraints                 │
│  • Choose among engine-valid options (judgment/nuance)    │
│  • Narrate decisions in plain language                    │
│  Never does arithmetic. Calls the engine as tools.        │
│  Every LLM output is Zod-validated before use.            │
└──────────────────────────────────────────────────────────┘
             ▲                        │
   valid options,                     │  constraints, feedback,
   computed plans                     ▼  "give me options for X"
┌──────────────────────────────────────────────────────────┐
│  TRAINING ENGINE  (deterministic — the moat)             │
│  Constraint Resolver · Volume Distributor · Mesocycle     │
│  Generator · Auto-Regulation Stepper · Deload Trigger ·   │
│  Redistribution Solver.  Pure functions. Fully tested.    │
└──────────────────────────────────────────────────────────┘
             ▲                        │
             │                        ▼
┌──────────────────────────────────────────────────────────┐
│  DATA  ·  athletes · goals · blocks · weeks · sessions ·  │
│  prescriptions · muscle volume · check-ins · decision log │
└──────────────────────────────────────────────────────────┘
```

### LLM-as-tool-caller (the elegant heart)

The model never returns a plan. It returns a _call to the engine_ with parsed intent; the
engine returns the valid plan; the model phrases it. Zod validates the boundary. The math is
uncorruptible by construction.

---

## 7. Data Model

Core entities:

```
Athlete
  · biodata (age, sex, height, weight, activity) · TDEE · phase (cut/maintain/bulk)
  · experience level
  └─ landmarks: per MuscleGroup { MEV, MAV, MRV }     ← personalized, learned over time

Goal / ConstraintSet                                   ← the user's intent, versioned
  · days/week · split type · session-length cap
  · per-muscle set targets or priorities (e.g. grow shoulders)
  · exercise exclusions (no squats — knee) · block structure · check-in cadence

Mesocycle (the clock)
  └─ Week[]  (planned per-muscle volume ramp + deload week)
       └─ Session  (day, split slot, ~duration)
            └─ ExercisePrescription  (exercise, sets, target rep/RIR)

Exercise (library)
  · primary + secondary MuscleGroups (FRACTIONAL attribution)
  · movement pattern · equipment · contraindication tags (knee, shoulder, …)

CheckIn (OPTIONAL, any scope: week / session / ad-hoc)
  · per-muscle: recovery, performance, joint/effort
  · planned-vs-actual volume

DecisionLog                                            ← the audit trail + longitudinal moat
  · every engine change + AI explanation + accepted/rejected
```

### Fractional muscle attribution (key modeling decision)

Compound lifts hit multiple muscles. Secondary muscles count as **fractional sets** (e.g.
barbell row = 1.0 back + 0.5 biceps + 0.5 rear delt). This is what separates a real volume
manager from a naive set-counter, and the attribution data becomes proprietary and improves
with scale. **Built into the MVP engine.**

---

## 8. Training Engine Modules

All modules are pure, deterministic, and unit- + property-tested.

| Module                      | Job                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Constraint Resolver**     | Normalize goals → solvable spec; detect infeasibility (e.g. "16 chest sets across 2 sessions of 60 min won't fit") and surface it                                          |
| **Volume Distributor**      | Allocate weekly per-muscle sets across sessions — the core constraint-satisfaction problem: respects frequency, session-length cap, split logic, fractional muscle overlap |
| **Mesocycle Generator**     | Build the whole block: weekly ramp MEV→MAV→MRV, exercise selection honoring exclusions/priorities, deload placement                                                        |
| **Auto-Regulation Stepper** | From check-in signal (or defaults) → next week's per-muscle target; graceful degradation on sparse data                                                                    |
| **Deload Trigger**          | Scheduled + reactive (MRV breach / accumulated fatigue signal)                                                                                                             |
| **Redistribution Solver**   | Missed sessions → reallocate remaining volume within all constraints (cannot dump multiple skipped days into one)                                                          |

---

## 9. Experience Layer (desktop/tablet web)

Design principle: **calm, premium, intelligent.** AI appears as ambient suggestions on the
plan and in a dedicated coach surface — never as an intrusive chatbot.

### MVP screens

**① Goal Intake (onboarding)** — a calm single surface: "Tell me how you want to train."
Natural language in → LLM parses to structured constraints → shown back as editable chips/cards
the user confirms. NL is the magic first impression; the structured layer is the safety net.

**② The Block — the hero screen.** A Motion-calendar analog for a mesocycle: a grid of
muscle × week volume cells, visualising the ramp, the deload, and priorities running hot.
Click a week → its sessions.

```
        Wk1    Wk2    Wk3    Wk4    Wk5   Deload
Chest   12 ─── 13 ─── 14 ─── 15 ─── 16 ── 8
Back    14 ─── 15 ─── 16 ─── 17 ─── 18 ── 9
Quads   10 ─── 11 ─── 12 ─── 12 ─── 12 ── 6
Delts   16 ─── 17 ─── 18 ─── 19 ── ⚠20 ── 10     ← priority, near MRV
```

**③ Muscle Heat Map + Volume Distribution — the signature visualization.** A body map + bar
chart where each muscle is colored against _its own_ landmarks:

- below MEV = grey (maintenance) · MEV–MAV = building · MAV–MRV = optimal · over MRV = red (overreaching)

One glance = the athlete's entire training balance. This is the "never manually calculate
volume again" promise made visual.

**④ Optional Check-in** — lightweight per-muscle recovery/performance input, surfaced only
when the AI judges it will change the plan.

**⑤ Ambient AI Suggestion Cards** — docked to the relevant object (a week, a muscle, a
session), not a chat panel:

> 🟢 "Back recovered well + rows up → I'd add a set next week (17→18). Delts are near MRV, so
> I'm holding them." **[Accept] [Adjust] [Why?]**

The user always _approves the coach_; reasoning is one tap away, never in the face.

**⑥ Sidebar assistant** — contextual, docked next to the plan; handles the optional smart
check-in and quick nudges.

**⑦ AI Coach tab** — a full conversational coaching view: ask "why is my back volume so high?",
request changes "make Fridays shorter", explore "what if I add a 6th day?". Informational
questions → LLM answers directly. Any change → round-trips through the engine and appears on the
Block with accept/reject (Law 2).

---

## 10. Tech Stack

Principle: the engine is a **pure, framework-free package** so it can be exhaustively tested and
cannot be corrupted by UI or LLM code.

| Layer              | Choice                                                            | Why                                                                                                                         |
| ------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Scaffold**       | **T3 stack** (`create-t3-app`)                                    | Next.js + TS + tRPC + Prisma + Tailwind; end-to-end type safety out of the box                                              |
| **Monorepo**       | pnpm + Turborepo; packages: `engine`, `web`, `schema`             | Isolates the crown-jewel engine                                                                                             |
| **Engine**         | Pure TypeScript, zero deps                                        | Deterministic, unit- + property-tested in isolation                                                                         |
| **Contracts**      | **Zod schemas** (in `schema`)                                     | Validates LLM output before it touches the engine; types the DB. Enforces the laws in code                                  |
| **Web**            | Next.js (App Router) + TypeScript + Tailwind                      | One codebase, desktop/tablet                                                                                                |
| **Delivery**       | **Installable PWA**                                               | Premium "it's an app" feel (dock/home-screen icon, own window, offline cache) while keeping the tablet target — no Electron |
| **Visualization**  | Custom SVG + D3/visx (Block & heat map); Recharts (simple charts) | The signature visuals need bespoke control                                                                                  |
| **API**            | tRPC                                                              | End-to-end type safety across the monorepo                                                                                  |
| **DB**             | Postgres + Prisma                                                 | The domain is deeply relational (blocks→weeks→sessions→prescriptions)                                                       |
| **Auth + hosting** | Supabase or Clerk; Vercel                                         | Move fast, managed                                                                                                          |
| **LLM**            | Claude (Sonnet default, Opus for hard reasoning) via **tool-use** | The LLM calls engine functions as tools — it proposes, the engine executes                                                  |

### On Electron (decision record)

Electron is **rejected for MVP.** It runs on desktop only (breaks the tablet target), integrates
awkwardly with Next.js's server model, and adds packaging/signing/update overhead without product
value for an inherently-online planner. A native shell only earns its keep where offline matters
— which is the **V2 mobile logger**, not the desktop planner. If a desktop shell is ever wanted,
use **Tauri** (tiny, OS-webview) over Electron.

---

## 11. Scope: MVP / V2 / Long-term

|                  | **MVP** (the loved core loop)                                                         | **V2**                                                                   | **Long-term**                                   |
| ---------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- |
| **Athletes**     | Hypertrophy: beginner (templates) + int/adv (full)                                    | Hybrid/concurrent, powerlifting                                          | Oly, CrossFit, triathlon, rehab, sport-specific |
| **Engine**       | Volume landmarks, fractional attribution, generator, auto-reg, deload, redistribution | Personalized landmarks (learned), fatigue model (ACWR/readiness)         | Population-level ML response prediction         |
| **Data in**      | Optional weekly check-in (manual)                                                     | Companion mobile logger (per-set, offline); wearables (Garmin/Whoop/HRV) | Full ecosystem sync                             |
| **AI**           | NL parser, ambient cards, sidebar + Coach tab (through engine)                        | Proactive weekly briefings, deeper reasoning                             | Autonomous long-horizon planning                |
| **Integrations** | —                                                                                     | Import Hevy/Strong/Strava                                                | Open API/platform, coach marketplace            |

### Defensibility flywheel

Engine + fractional-attribution library is the _initial_ moat (correct where others guess) →
longitudinal training data → personalized landmarks & response prediction → a coach no one can
match at cold-start → the data compounds. **The chat is never the moat; the brain and the data
are.**

---

## 12. Top Risks

1. **Engine correctness = existential.** If the volume math is ever wrong, trust evaporates.
   → pure functions, exhaustive + property-based tests, always-visible reasoning.
2. **Domain accuracy** (landmarks, attribution) — skeptical advanced lifters will audit the
   numbers. → ground defaults in published literature (RP-style landmarks), make them
   overridable, learn over time.
3. **Feedback sparsity** — optional check-ins mean the engine often runs on defaults.
   → graceful degradation (designed in), smart prompting, V2 logger.
4. **LLM reliability** → Zod-validated tool-use, engine as sole executor, model never touches
   numbers.
5. **Cold-start moat** — "learning" isn't real until scale. → early value must be the engine +
   UX being correct and beautiful on day one.
6. **Scope discipline** — the vision is enormous; the failure mode is building V2 before the MVP
   loop is loved. → this spec is the guardrail.

---

## 13. Open Questions (for implementation planning)

- Exact default landmark values (MEV/MAV/MRV) per muscle group and their literature sources.
- Split taxonomy for MVP (U/L, PPL, full-body, bro-split, custom?).
- Exercise-library seed size and attribution source for MVP.
- Volume Distributor algorithm choice (greedy heuristic vs. constraint solver) — start simple,
  measure.
- Auth/hosting final pick (Supabase vs. Clerk).

```

```
