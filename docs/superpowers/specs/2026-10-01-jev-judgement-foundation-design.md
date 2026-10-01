# Jev Judgement Foundation — Design

**Date:** 2026-10-01
**Status:** Approved design, awaiting implementation plan
**Roadmap position:** follows ④ (progression + real readiness). Independent of phase 2.

## 1. Goal

Introduce TypeSafe AI's **Jev** — a "System One" model returning *typed, calibrated*
decisions (Choice / Score / Noul) in a single parallel pass, 70–500ms — as a judgement
layer over Mesodapt's deterministic engine.

Two decision sites that are currently crude threshold logic become judged decisions:

| Seam | Today | Authority |
|---|---|---|
| Reschedule candidate ranking (`redistribute.ts:123-130`) | `lateBlock && nearMrv ? LET_GO : MAKE_UP` | 1 — advisory |
| Progression cause (`step-week.ts:52-79`) | priority cascade on two scalars | 2 — accept-gated proposal |

The foundation must also *provably* express a third seam (Coach intent routing +
tool-call guardrails) without modification, so the abstraction is not over-fit to the
two that ship here.

## 2. Scope

**Ships this cycle:** the foundation, seam 1, seam 2.
**Designed but not implemented:** seam 3 (Coach), specified in §8 as a paper contract.

Seam 3 is excluded because `/app/coach` is an eight-line stub; building the Coach agent
surface is its own spec→plan cycle. Its contract is written here only as design
pressure on the abstraction.

## 3. Governing decisions

### 3.1 Authority model

Jev verdicts may hold exactly two authority levels. A third — a model verdict directly
replacing engine logic inline — is **not representable in the type system**, not merely
discouraged.

- **ADVISORY** — may reorder or annotate options the engine already produced. Changes no
  number and no persisted plan. Takes effect immediately.
- **PROPOSAL** — may select among engine-enumerated labels whose consequences the engine
  then computes. Must route through an existing accept-gate before touching a plan.

### 3.2 Law 1 (engine owns numbers) is preserved structurally

A `Verdict` payload is always a **selector** — a `RedistributionKind` or `StepCause`
string the engine already enumerates — never a quantity. Set counts originate only in
`build()` (`redistribute.ts`) and the clamp arithmetic in `step-week.ts`. No applier has
a code path that can synthesise one.

At authority 2 this still holds: Jev returns a `StepCause` *label*; the engine maps
label → delta via its own `STEP_UP` / `STEP_DOWN` / `STEP_DOWN_HARD` constants and clamps
to `[mev, effectiveMrv]`.

### 3.3 Law 2 (no model-invented claims) is preserved by the foregrounding rule

Non-pick verdicts (`overreaching`, `volume_loss_materiality`) may influence **which
engine-computed `DecisionFact` is foregrounded**. They never become a sentence of their
own.

The athlete may see "this one's close" — a statement about the ranking's own certainty,
which is honest. The athlete never sees "you're over-reaching" — a model-invented claim
about their body.

### 3.4 The engine stays pure and synchronous

`src/engine/` contains zero `async` / `await` / `Promise` today, guarded by
`generate.golden.test.ts.snap`, `properties.test.ts` and `adaptation.properties.test.ts`.
Property-based testing requires fast, synchronous, deterministic functions; one network
call inside `redistributeWeek` would force every property suite to mock, which is
equivalent to deleting it.

Therefore: **the engine emits questions as data; the server layer executes them; a pure
function folds verdicts back.** The engine gains no dependency and no I/O.

## 4. Architecture

```
src/engine/judgement.ts          PURE  types + verdictById + isConfident
src/engine/redistribute.ts       PURE  + rescheduleQuestions() + applyRescheduleVerdicts()
src/engine/step-week.ts          PURE  + progressionQuestions() + applyProgressionVerdicts()
         │
         │  JudgementRequest (plain JSON-safe data)
         ▼
src/server/judgement/client.ts     I/O   @typesafe-ai/sdk wrapper, pinned model, backoff
src/server/judgement/execute.ts    I/O   get-or-ask against the Judgement table
src/server/judgement/canonical.ts  PURE  sorted-key JSON for stable hashing
src/server/judgement/fake.ts       test  deterministic seeded adapter
src/server/judgement/replay.ts     test  recorded real responses
```

Each seam owns its own applier beside its domain logic. A single central `applyVerdicts`
switch is explicitly rejected: it would pull both domains into one file and grow with
every seam.

`judgement.ts` holds only types and shared helpers.

### 4.1 Enforcement

ESLint `no-restricted-imports` forbids `@typesafe-ai/sdk` and `~/server/*` under
`src/engine/`. The rule is the guarantee; a comment is not.

## 5. Typed contracts

```ts
// src/engine/judgement.ts — pure, no imports outside the engine
export type JudgementAuthority = "ADVISORY" | "PROPOSAL";

export type JudgementQuestion =
  | { id: string; kind: "choice"; authority: JudgementAuthority; instructions: string; options: Record<string, string | null> }
  | { id: string; kind: "score";  authority: JudgementAuthority; instructions: string; levels: string[] }
  | { id: string; kind: "noul";   authority: JudgementAuthority; instructions: string; criteria?: { true: string; false: string } };

export interface JudgementRequest {
  subject: JudgementSubject;               // closed union, never a free string
  state: Record<string, unknown>;          // JSON-safe projection built by the seam
  questions: JudgementQuestion[];
}

export type JudgementSubject = "reschedule" | "progression";  // + "coach_intent" | "coach_guardrail" when seam 3 lands

export type Verdict =
  | { id: string; kind: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { id: string; kind: "score";  score: number; confidence: number }
  | { id: string; kind: "noul";   noul: number };   // no confidence — Jev provides none for noul

export type JudgementOutcome =
  | { ok: true; verdicts: Verdict[]; model: string }
  | { ok: false; reason: "no_key" | "timeout" | "rate_limited" | "auth" | "overloaded" | "invalid_response" };
```

`Verdict` mirrors Jev's response shape exactly, **including noul's absent `confidence`**.
Authoritatively, a noul has no `probabilities` property, so there is no distribution to
compute a confidence from. A synthetic confidence derived from `|noul − 0.5|` is
deliberately not fabricated — that would invent a calibration the model never claimed,
which is Law 2 applied to our own code.

Option descriptions are `string | null`: upstream permits `null` "when option names are
clear on their own."

**Question ids are never sent to the model.** They exist for code only. Every question's
full meaning must therefore live in its `instructions` — see §6.2 and §7.4, where this is
load-bearing because the per-muscle questions would otherwise be unanswerable.

### 5.1 Upstream API shape (verified 2026-10-01 against docs.typesafe.ai)

- `npm install @typesafe-ai/sdk` (SDK v0.6.0), Node 20+
- The SDK reads the key from the **`TYPESAFE_API_KEY`** environment variable itself — no
  custom wiring needed (§13)
- `client.systemOne({ model, state, questions })` → `POST /v1/systemone`
- `state` must be a string, JSON object, or array of text values. Text only — no images,
  audio or video. Prefer an object so every part has a descriptive name.
- Request `questions` is a map of `{ type: "noul" | "choice" | "score", instructions, criteria }`
  - choice `criteria`: map of option → description. **Descriptions may be `null`.** Max
    255 options. Add an explicit `other` / none-of-the-above option when the list might
    not cover every input.
  - score `criteria`: array of 2–10 ordered level descriptions, each standing on its own
  - noul `criteria`: optional `{ true, false }`
  - `instructions` and `criteria` also accept structured objects/arrays when contrasts or
    exclusions need spelling out
- Response `answers` keyed by question id; `usage.input_tokens` / `output_tokens`
  - choice → `{ choice, probabilities, confidence }`
  - score → `{ score, legend, probabilities, confidence }`
  - noul → `{ noul }` (0–1 probability of yes; **no `confidence`**)
- Typed SDK errors: `AuthenticationError`, `UnprocessableEntityError`, `RateLimitError`,
  `APITimeoutError`
- HTTP: 401 / 422 / 429 / 529. 429 and 529 want exponential backoff.

**Models.** `jev-1.13.0` is the versioned id; `jev-latest` and `jev-preview` are aliases
that both currently resolve to it. Upstream advises pinning a version id "if confidence
thresholds require consistency" — which is exactly our case (§9.2), so §13 pins it.

**Hard limits.**

| Limit | Value |
|---|---|
| Context per request | 64k tokens total |
| State + longest question | 32k tokens |
| Requests | 40 / second |
| Tokens | 100k / second |
| Choice options | 255 |
| Score levels | 2–10 |
| Questions per request | **no documented cap** — the binding constraint is the context budget (§10.5) |

- Pricing: $0.042 / MTok input, output free.
- Upstream guidance: **treat an exception as a failure requiring fallback, never as a
  low-confidence answer.** §9 enforces this.

### 5.2 jev-1.13 limitations that constrain this design

From the model-jaggedness page. These are not incidental; two of them forced design
changes in §6.1, §7.1 and §7.4.

| Limitation | Consequence here |
|---|---|
| **"Jev is not a calculator"** — cannot reliably assess "nearness" of numbers, counting, or score interpolation | `approaching_mrv` is a numeric-proximity test and was **removed from Jev's remit** (§7.1). All numeric comparison stays in the engine, which already computes it. |
| **Context bloat** — "unrelated detail acts as a distractor" | State projections carry the engine's derived categorical facts, not raw numbers for the model to compare (§6.1, §7.3) |
| **Literal interpretation** — "answers the question you wrote, not the one you meant" | Instructions must be explicit and self-contained; ids are not sent (§5) |
| **Contradictory instructions** — misalignment between instructions and criteria confuses it | Criteria must separate options from one another |
| **Adversarial content** — "does not treat state as hostile"; injected instructions can steer outputs | Harmless for seams 1–2 (engine-generated state). **A live risk for seam 3** — see §8 |
| **Structural inconsistency** — `P(noul) ≠ 1 − P(not_noul)` | Never derive one noul from another's complement; ask what you need (§11) |
| Not trained to generate text | Irrelevant here — every verdict is a selector (§3.2) |

Mitigation stance, straight from upstream: *"Implement math, counting, and date arithmetic
in code."* Which is Law 1 restated from the model's side.

Sources: <https://docs.typesafe.ai/api.md>, <https://docs.typesafe.ai/sdk/javascript.md>,
<https://docs.typesafe.ai/models.md>, <https://docs.typesafe.ai/confidence.md>,
<https://docs.typesafe.ai/concepts/state.md>, <https://docs.typesafe.ai/primitives/choice.md>,
<https://docs.typesafe.ai/model-jaggedness/jev-1.13.md>,
<https://docs.typesafe.ai/cookbooks/parallel_questions.md>

## 6. Seam 1 — reschedule ranking (ADVISORY)

Fires on `session.getRescheduleOptions`.

```
loadRescheduleContext → weekPlanFromDb + adaptationContextFrom
  → redistributeWeek(week, [missed], ctx)          PURE  candidates; recommended = heuristic FLOOR
  → rescheduleQuestions(candidates, week, ctx)     PURE  JudgementRequest
  → executeJudgement(db, mesocycleId, request)     I/O   get-or-ask, persists Judgement
  → applyRescheduleVerdicts(candidates, verdicts)  PURE  may move `recommended`, appends facts
  → toRescheduleOptionViews(...)                   PURE  → RescheduleDialog
```

The existing recommendation policy at `redistribute.ts:123-130` is **retained unchanged**
as the floor. It is not deleted; it is what stands whenever Jev is absent or unsure.

### 6.1 State projection

A named JSON object. Per §5.2, it carries the engine's **derived categorical facts**
rather than raw numbers for Jev to compare:

- `blockPhase`: `"early" | "mid" | "late"` — from the existing `lateBlock` computation
- `week`: index, `isDeload`
- `muscles[]`: per muscle, `name` plus `volumeStanding`:
  `"below MEV" | "between MEV and MAV" | "at or above MAV" | "at MRV ceiling"` — derived
  from the comparisons `redistribute.ts` already performs
- `candidates[]`: `kind`, and `tradeoff: { recovered, dropped }` as set counts
- `readiness`: `formTrend`: `"rising" | "flat" | "falling"`, derived from the
  `ReadinessSample` series in `readiness.ts`

Set counts in `tradeoff` are retained because they are the *subject* of the judgement
(how much work is recovered vs. dropped), not a proximity comparison. Every threshold
comparison — near-MRV, below-MEV, late-block — is resolved to a label in code.

### 6.2 Questions — one batched `systemOne()` call

| id | kind | authority | notes |
|---|---|---|---|
| `reschedule_pick` | choice | ADVISORY | `options` built **only** from the candidates `redistribute` actually emitted (the `out` array is 1–3 long), so Jev cannot select a plan that does not exist |
| `overreaching` | noul | ADVISORY | recorded only (§9.5) |
| `volume_loss_materiality` | score | ADVISORY | 4 ordered levels; recorded only (§9.5) |

`reschedule_pick` needs **no** `other` option: the candidate set is exhaustive by
construction, since `redistribute` enumerates every plan the athlete could be offered.
This is the documented exception to "add a none-of-the-above option."

Instructions reference the shared state by backticked path (e.g. `candidates[0].tradeoff`)
rather than relying on position, since ids are not sent to the model (§5).

### 6.3 Applier

`applyRescheduleVerdicts` may only move the `recommended` flag and append `judged` /
`close_call` facts. It must leave every `muscleVolume` entry and every prescription's
`sets` byte-identical — asserted as a property in §11.

## 7. Seam 2 — progression cause (PROPOSAL)

Fires on `checkin.submitWeeklyCheckIn`; replayed on `checkin.getWeeklyCheckIn`.

### 7.1 Deterministic safety preemption

The branches of `step-week.ts:52-79` are not equal in kind:

| Branch | Nature | Jev consulted? |
|---|---|---|
| `joint_stress` (joint ≥ `JOINT_PAIN`) | safety floor | **never** |
| `under_recovered` (rec ≤ `RECOVERY_LOW`) | safety floor | **never** |
| `default_progression` (no feedback / deload next) | structural | **never** |
| `approaching_mrv` (`plannedNext > effectiveMrv − MRV_PROXIMITY_SETS`) | **numeric proximity** | **never** — see below |
| `responding_well` vs `on_track` | genuinely ambiguous | yes |

`approaching_mrv` is excluded for a different reason than the safety floors: it is a
numeric-proximity test, and §5.2 records that jev-1.13 "cannot reliably assess nearness of
numbers." The engine already computes it exactly. Handing it to the model would be asking
for the one thing it is documented to get wrong — so the deterministic result stands, and
Jev judges only the genuinely semantic residue: *is this muscle responding well enough to
warrant more volume?*

If a hard guard fires for a muscle, Jev is not asked about that muscle at all and the
engine's answer stands un-overridably. Jev is confined to the region where the existing
`rec >= SCORE_GOOD && perf >= SCORE_GOOD` thresholds were arbitrary anyway.

This makes "could Jev tell an athlete to push through joint pain?" answerable with *no*
rather than *unlikely*.

**Implementation note:** preemption is a filter, not new logic.
`WeekAdjustment.adjustments[].cause` already records which branch fired, so
`progressionQuestions` reads the engine's own output to decide whom to ask.

### 7.2 Flow

```
submitWeeklyCheckIn (mutation)
  persist CheckIn + CheckInMuscle rows
  → computeProposal(...) → stepWeek(...)          PURE  adjustments = FLOOR
  → progressionQuestions(adj, readiness, ctx)     PURE  one noul per ambiguous muscle
  → executeJudgement(...)                         I/O   ONE call, N questions in parallel
  → applyProgressionVerdicts(adj, verdicts)       PURE  swaps cause; engine recomputes delta
  → toProgressionProposalView(...) → DecisionLog PROPOSED
```

**`applyProgression` passes the persisted verdicts into `computeProposal` and never asks.**
That is the procedure that matters: it recomputes the proposal at accept time and writes
the result to the plan (`checkin.ts:363`). `getWeeklyCheckIn` does not call
`computeProposal` at all — it reads `DecisionLog.status`. See §10.1.

### 7.3 State projection

A named JSON object, keyed by muscle so questions can address parts of it by path. Per
§5.2 it carries derived labels, not raw numbers awaiting comparison:

- `block`: `weeksRemaining`, `upcomingIsDeload`, `phase`
- `muscles`: map of muscle name →
  - `volumeStanding`: as §6.1
  - `headroomToCeiling`: `"none" | "small" | "ample"` — derived in code from
    `effectiveMrv − plannedNext`
  - `recovery`, `joint`, `performance`: the ordinal check-in levels **with their meanings
    spelled out** (`"2 — recovered well"`), since the model reads these as text, not as
    ordered quantities
- `readiness`: `formTrend` and `recoveryTrend` as labels, derived from the
  `ReadinessSample` series and the blended signal in `readiness.ts`

The case for Jev here: the threshold ladder sees only `rec` and `perf` as two scalars at a
single instant, while this projection carries a *trend* and the athlete's standing
relative to their own landmarks. That is a semantic judgement, which is what the model is
for — as distinct from the proximity arithmetic, which stays in code (§7.1).

### 7.4 Questions

One **noul** per ambiguous muscle — not a choice. With `approaching_mrv` returned to the
engine (§7.1), the residual judgement is binary, and upstream is explicit: *"If it's a yes
or no, use a Noul."*

- id: `responds_well_<muscle>` (for code only)
- authority: PROPOSAL
- instructions: must **name the muscle** and reference its state by backticked path, e.g.
  *"Does the logged response for `muscles.quads` justify adding volume next week?"* This
  is load-bearing, not stylistic: ids are not sent to the model (§5), so a question whose
  only mention of the muscle is in its id is unanswerable.
- `criteria`: `{ true, false }` spelled out, so instructions and criteria cannot drift
  apart (§5.2)

**Mapping back.** `noul ≥ JUDGEMENT_MIN_NOUL_PROPOSAL` → cause `responding_well`;
otherwise the engine's `on_track` stands. The engine then computes the delta from its own
`STEP_UP` constant and clamps — Jev still never names a number (§3.2).

Gating on the noul's probability is not a fabricated confidence: it is the calibrated
number the primitive exists to return. See §9.2.

## 8. Seam 3 — Coach (paper contract, not implemented)

Included solely to pressure-test the abstraction.

| subject | state | questions |
|---|---|---|
| `coach_intent` | athlete utterance + plan context | `intent`: choice ADVISORY over engine operations (`explain`, `redistribute`, `edit_block`, `log`, `progression`, `out_of_scope`) |
| `coach_guardrail` | **a proposed tool call** + plan context | `tool_call_permitted`: noul ADVISORY; `needs_confirmation`: noul ADVISORY → routes to an accept-gate |

**Pressure-test result — the abstraction holds, for two reasons.**

1. `JudgementRequest.state` is `Record<string, unknown>`, so a proposed tool call is as
   valid a subject as a week plan. The executor, client, caching, thresholds and
   degradation paths are reused without change.
2. A guardrail **vetoes** rather than selects. Because appliers are per-seam rather than
   one central switch, a veto is simply an applier that returns a narrowed set. And a
   veto is inherently safe under Law 1 — it can only reduce what happens, never
   introduce a quantity — which is why it is ADVISORY despite blocking an action.

Seam 3 requires no change to §5's types. Only `JudgementSubject` gains two members.

**Unresolved risk, to be settled in seam 3's own spec: prompt injection.** §5.2 records
that the model "does not treat state as hostile" and that injected instructions can steer
outputs. Seams 1 and 2 are immune because their state is engine-generated. The Coach's
state contains athlete free text, and `coach_guardrail` would screen a tool call while
reading attacker-influenced content — the guardrail and the attack surface in one request.
Mitigation (fencing untrusted text in a named field, never letting a guardrail noul be the
sole authority for a mutation) is seam 3's design problem, flagged here so it is not
discovered late.

## 9. Confidence and degradation

### 9.1 Three states, never conflated

| State | Trigger | Effect |
|---|---|---|
| `{ ok: true, verdicts }` | 200 response, zod-valid | verdicts tested against thresholds |
| `{ ok: false, reason }` | `APITimeoutError`, `RateLimitError`, `AuthenticationError`, 529, zod failure, **or no API key configured** | engine floor stands; logged as *infrastructure*; **no** `DecisionFact` |
| confident: false | 200, `confidence` below threshold | engine floor stands; recorded as a *real judgement* that was unsure |

A missing key is deliberately the same code path as a timeout. This is what makes the
app fully functional without Jev credentials, and it means the fallback path is exercised
constantly in development rather than only during a production incident.

### 9.2 Thresholds

In `src/engine/constants.ts`, beside the existing thresholds, so they are deterministic
and testable:

```ts
export const JUDGEMENT_MIN_CONFIDENCE_ADVISORY = 0.60;  // Choice: reordering a recommendation
export const CLOSE_CALL_MARGIN = 0.15;                  // Choice: top-two probability gap
```

There is deliberately **no** `JUDGEMENT_MIN_CONFIDENCE_PROPOSAL`. The only PROPOSAL
question that ships is seam 2's noul (§7.4), which gates on its probability rather than a
confidence, so a PROPOSAL *confidence* threshold would be a constant with no consumer. The
first choice- or score-shaped PROPOSAL question adds it, at a higher value than the
advisory gate because the consequence is larger.

**Nouls are gated on their own probability, never on a confidence.** Jev supplies no
`confidence` for a noul and §5 forbids fabricating one — but the `noul` value *is* a
calibrated probability, and it is the axis the primitive exists to provide. Seam 2's
PROPOSAL verdict is a noul (§7.4), gated by:

```ts
export const JUDGEMENT_MIN_NOUL_PROPOSAL = 0.75;   // PROPOSAL tier: influences training load
```

A noul near 0.5 means yes and no are near-equally likely — not "medium intensity." Below
the gate, the engine's `on_track` stands.

This is consistent with upstream guidance that *"a confidence threshold is not one number;
different actions within the same system should be gated at different levels depending on
the consequences of getting it wrong."*

**All four thresholds in this section are guesses.** They are unvalidated starting points, to be
calibrated against the dataset §10 accumulates. They must not be described as tuned.

### 9.3 Close-call definition

Close-call is defined per primitive, because the two seams now use different ones.

**Choice (seam 1):** the **gap between the top two probabilities**, not `confidence`. A
0.45/0.42/0.13 split and a 0.45/0.30/0.25 split can report similar confidence while
meaning materially different things; the gap is what "this was close" actually describes.

**Noul (seam 2):** distance from the midpoint — `|noul − 0.5| < CLOSE_CALL_NOUL_MARGIN`.
Upstream is explicit that a noul near 0.5 means yes and no are near-equally likely, which
is exactly a close call. Note this is *not* distance from the 0.75 gate: a verdict can sit
below the gate while still being a clear no, and that is not close.

```ts
export const CLOSE_CALL_NOUL_MARGIN = 0.12;
```

Without this, §12's close-call hint on the progression dialog would be unreachable, since
a noul has no probability distribution to take a top-two gap from.

### 9.4 New DecisionFact variants

```ts
| { kind: "judged"; subject: string; questionId: string; selected: string; deterministic: string;
    basis: { kind: "confidence"; value: number } | { kind: "noul"; value: number } }
| { kind: "close_call"; subject: string; questionId: string; between: [string, string]; margin: number }
```

`basis` is a discriminated union rather than a bare `confidence: number` because the two
seams gate on different axes: seam 1 on a Choice's confidence, seam 2 on a noul's
probability (§9.2). A single `confidence` field would have forced a fabricated value for
every seam-2 fact — the exact thing §5 forbids.

Verified safe to add: nothing in `src/views`, `src/server/views` or `src/components`
switches exhaustively on `DecisionFact.kind`.

Infrastructure failure gets **no** fact. Facts explain why the plan is what it is; "Jev
timed out" explains nothing about the plan and belongs in logs.

### 9.5 Non-pick verdicts are recorded-only this cycle

`overreaching` and `volume_loss_materiality` (§6.2) are asked, persisted and logged, but
**do not alter any output in this cycle.** Nothing renders them and nothing reorders on
them.

They are included deliberately, for two reasons: they are what exercises Jev's parallel
multi-question batching against real state — the capability this foundation exists to
provide — and they begin accumulating the calibration dataset of §10.2.

Foregrounding (letting them choose which engine-computed `DecisionFact` leads) is a
follow-up, governed by §3.3 when it lands. Specifying its ranking behaviour here would be
inventing a UI rule ahead of a surface to judge it against.

**Accepted cost.** Upstream warns that "extra questions still cost tokens." Measured
against §14's per-decision cost this is negligible, and §10.2's batching means they add no
extra request. If the calibration data proves uninteresting after a few weeks, delete the
two questions — nothing depends on them.

## 10. Stability and persistence

### 10.1 The bug this fixes

`computeProposal` (`checkin.ts:125`) is documented as *"Rebuild CheckInFeedback + stepWeek
proposal deterministically from a persisted CheckIn's rows"* and is called from exactly two
places: `submitWeeklyCheckIn` (`checkin.ts:307`), which shows the athlete the proposal and
persists `adj` into `DecisionLog.payload`, and `applyProgression` (`checkin.ts:363`), which
**recomputes it from scratch** and builds the week plan that gets written.

So the proposal the athlete sees comes from submit, while the plan actually applied comes
from a recomputation at accept time. Today that is safe precisely because every input is
persisted (the `CheckIn` rows) and `stepWeek` is deterministic.

Add a non-persisted Jev verdict and the two diverge — and the divergence is the one that
writes to the plan: the athlete accepts what they were shown, and `applyProgression`
applies something else.

Seam 1 has the same shape — `getRescheduleOptions` is a query, so a React Query refetch
would reshuffle which candidate is recommended mid-decision.

### 10.2 The `Judgement` model

`DecisionLog` cannot serve this: it is written on *apply*, so it cannot stabilise a read
that happens before any decision exists.

```prisma
model Judgement {
  id          String    @id @default(cuid())
  mesocycleId String
  mesocycle   Mesocycle @relation(fields: [mesocycleId], references: [id], onDelete: Cascade)
  subject     String    // "reschedule" | "progression"
  stateHash   String    // sha256 of the canonical JSON state projection
  questionsHash String  // sha256 of the canonical question set (instructions + criteria)
  model       String    // pinned version actually used, e.g. "jev-1.13.0"
  verdicts    Json
  fallback    Json      // the deterministic pick, recorded alongside
  createdAt   DateTime  @default(now())

  @@unique([mesocycleId, subject, stateHash, questionsHash])
  @@index([mesocycleId, createdAt])
  @@map("judgement")
}
```

`executeJudgement` is **get-or-ask**: hash the state projection, look up, replay if found,
otherwise call Jev and persist.

Keying on `stateHash` means a legitimate state change (the athlete logs more sets)
naturally triggers a fresh ask, while a refetch of unchanged state cannot.

`questionsHash` is equally necessary. Upstream notes that cached inference stays valid only
while "evidence and question meanings are unchanged" — so editing a question's
`instructions` or `criteria` must invalidate the cache. Without it, a reworded question
would silently replay a verdict that answered a *different* question.

`model` is deliberately **excluded from the unique key** and recorded as data. Including
it would mean deploying a new pinned version reshuffles a proposal an athlete is mid-way
through accepting. Stability wins; the recorded version keeps the audit honest.

Storing `fallback` alongside yields **shadow mode for free**: every row is a
(deterministic pick, Jev verdict, confidence) triple — simultaneously the audit trail and
the calibration dataset for §9.2's guessed thresholds.

### 10.3 Accepted wart

This makes `getRescheduleOptions` — a tRPC *query* — write a row on cache miss. Accepted
deliberately: the alternative is in-memory caching, which does not survive serverless
instances and so would not actually deliver the stability guarantee that is the whole
point.

### 10.4 Canonical hashing

`canonical.ts` provides sorted-key JSON serialisation. Plain `JSON.stringify` key order
would silently fragment the cache and reintroduce the instability above.

### 10.5 Request chunking

There is no documented cap on questions per request; the binding limits are **64k tokens
per request and 32k for state plus the longest question** (§5.1). `executeJudgement`
therefore chunks on an estimated **token budget**, not a question count, and merges
results.

Batching is strongly preferred over splitting: upstream measured 13 questions in one call
at **12.2x cheaper and 10x faster** than 13 separate calls, with answers "statistically
indistinguishable" — the shared state is transmitted once instead of N times. A realistic
10-muscle block is nowhere near the budget and stays a single call; chunking exists so a
pathological constraint set degrades gracefully instead of returning 422.

Rate limits (40 req/s, 100k tok/s) are far above anything a per-athlete interaction
produces, but the backoff in §9.1 covers them.

## 11. Testing

| Test | Asserts |
|---|---|
| `applyVerdicts(x, []) ≡ x` | identity on empty — **this property is the fallback mechanism** |
| Law 1 property | for arbitrary candidates × arbitrary verdicts, `applyRescheduleVerdicts` leaves every `muscleVolume` value and prescription `sets` untouched; only `recommended` and `facts` may differ |
| Safety-preemption property | where a hard guard fires, no verdict changes that muscle's `cause` or `adjustedSets` |
| Clamp property | `applyProgressionVerdicts` never yields `adjustedSets` outside `[mev, effectiveMrv]` (reuses the invariant in `adaptation.properties.test.ts`) |
| Adversarial verdicts | unknown choice strings, `confidence` of `NaN` / `-1` / `2`, duplicate ids, empty probability maps → never throws, degrades to floor |
| `generate.golden.test.ts.snap` | byte-identical — the deterministic path genuinely unchanged |
| **Self-contained instructions** | every generated question's `instructions` names its subject (e.g. the muscle) — guards the §5 rule that ids are never sent to the model, which is the one defect that would silently produce plausible-but-wrong verdicts |
| No complementary nouls | no code derives a noul from `1 −` another noul (§5.2) |
| Projection carries no bare thresholds | state projections contain no raw `mev`/`mav`/`effectiveMrv` numbers for the model to compare (§6.1, §7.3) |
| Contract test | real API, `describe.skipIf(!process.env.TYPESAFE_API_KEY)`. Credentials are available locally (§15), so this runs for real here and records the §11 replay fixtures; it stays skipped wherever the key is absent, so `pnpm test` is green without it. |

Jev returning an option that was never sent is possible in principle, so the SDK response
is **zod-validated at the boundary** and a validation failure is classified
`{ ok: false, reason: "invalid_response" }` — an infrastructure failure, not a
low-confidence answer (§9.1).

All property tests remain viable precisely because the engine stayed synchronous (§3.4).

`pnpm test` must be green with no credentials configured.

## 12. UI

`reschedule-dialog.tsx` and `progression-proposal-dialog.tsx` each gain one hint,
rendered only when a `close_call` fact is present: muted text, no new accent, no badge —
per the flat / accent-scarce doctrine in `DESIGN.md`.

**No provenance in the UI.** The athlete never sees "judged by Jev." Mesodapt has one
coach voice; attributing some recommendations to a named model would fracture it while
telling the athlete nothing actionable. Provenance lives in the `judged` fact and the
`Judgement` table, where it is auditable.

Copy follows the warmer in-app register currently shipping, not the louder voice in
`DESIGN.md` — that gap is flagged there and is not this spec's to resolve.

## 13. Environment

- `TYPESAFE_API_KEY` added to `src/env.js` as **optional** — absence yields the
  `{ ok: false, reason: "no_key" }` path, never a boot failure. This is the variable the
  SDK reads natively (§5.1), so `client.ts` passes no key explicitly; `env.js` declares it
  only so its presence is validated and typed.
- `JEV_MODEL` defaulting to the pinned `jev-1.13.0`. `jev-latest` and `jev-preview` both
  resolve to that today but must not be used in production — upstream advises pinning
  precisely because our thresholds require consistency (§9.2).

## 14. Observability and cost

Each call logs `subject`, model, latency, per-question confidence, `usage.input_tokens`,
and `agreedWithFallback`. That boolean is what turns the `Judgement` table into the
calibration dataset for §9.2.

A state projection runs ~500–1500 input tokens; output is free. At $0.042/MTok that is
roughly **$0.00002–0.00006 per decision** — a rounding error at any plausible user count.
Recorded here so the cache is not later "optimised" for cost: its job is stability (§10),
not savings.

Batching keeps it there. Because cost is dominated by transmitting the state, N questions
in one call cost barely more than one; upstream measured 12.2x against the split
alternative (§10.5). The right instinct when a new question seems useful is to add it to
the existing batch, not to open a second request.

## 15. Risks and open items

| Item | Status |
|---|---|
| Early-access credentials | **Closed 2026-10-01** — `TYPESAFE_API_KEY` is in `.env` (gitignored, untracked). The contract test (§11) and the replay fixtures can be recorded against the real service in this cycle. The `no_key` path remains implemented and tested regardless, since CI and other contributors will not have a key. |
| The three thresholds are guesses | Accepted; §10.2 accumulates the data to calibrate them. |
| Per-request question limit undocumented | Mitigated by chunking at 32 (§10.5). |
| Query-with-write-side-effect | Accepted deliberately (§10.3). |
| Pinned model version drifts | `model` recorded per row; upgrades do not disturb in-flight decisions (§10.2). |
| Model cannot do numeric comparison | Designed around, not mitigated: all proximity/threshold arithmetic stays in the engine (§5.2, §7.1). Any future question must be checked against §5.2 before being added. |
| Context bloat degrades accuracy | Projections carry derived labels only (§6.1, §7.3); a test asserts no bare landmark numbers reach the model (§11). |
| Prompt injection via athlete free text | Not applicable to seams 1–2 (engine-generated state). Open for seam 3 (§8). |
| Model jaggedness page is versioned | §5.2 is pinned to `jev-1.13`. Re-read `model-jaggedness/` before changing `JEV_MODEL`. |

## 16. Out of scope

- Seam 3 / the Coach agent surface — own spec→plan cycle.
- Authority level 3 (inline replacement of engine logic) — explicitly rejected, §3.1.
- Replacing any safety threshold with a judgement — explicitly rejected, §7.1.
- Endurance / biodata seams — phase 2.

## 17. Branch

Branches from `freddy/experimental` at `7a637cb` (*Merge recovery→Form blend (④-C-2)*),
which is the first commit where all of ④'s readiness work — `readiness.ts`, the
recovery→Form blend, and the accept-gated deload — is present. §7.3's state projection
depends on that readiness data existing.

Work branch: `freddy/feat/jev-judgement-foundation`. Merges back to
`freddy/experimental` after visual review, per project workflow.
