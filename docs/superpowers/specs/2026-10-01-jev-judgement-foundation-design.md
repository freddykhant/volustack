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
  | { id: string; kind: "choice"; authority: JudgementAuthority; instructions: string; options: Record<string, string> }
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
A synthetic confidence derived from `|noul − 0.5|` is deliberately not fabricated — that
would invent a calibration the model never claimed, which is Law 2 applied to our own code.

### 5.1 Upstream API shape (verified 2026-10-01)

- `npm install @typesafe-ai/sdk`, Node 20+
- `client.systemOne({ model, state, questions })` → `POST /v1/systemone`
- Request `questions` is a map of `{ type: "noul" | "choice" | "score", instructions, criteria }`
  - choice `criteria`: map of option → description, max 255 options
  - score `criteria`: array of 2–10 level descriptions
  - noul `criteria`: optional `{ true, false }`
- Response `answers` keyed by question id; `usage.input_tokens` / `output_tokens`
  - choice → `{ choice, probabilities, confidence }`
  - score → `{ score, legend, probabilities, confidence }`
  - noul → `{ noul }` (0–1 probability of yes)
- Typed SDK errors: `AuthenticationError`, `UnprocessableEntityError`, `RateLimitError`, `APITimeoutError`
- HTTP: 401 / 422 / 429 / 529. 429 and 529 want exponential backoff.
- Pricing: $0.042 / MTok input, output free.
- Upstream guidance: **treat an exception as a failure requiring fallback, never as a
  low-confidence answer.** §9 enforces this.

Sources: <https://docs.typesafe.ai/api>, <https://jevmanual.com/sdk/javascript/>,
<https://typesafe.ai/blog/introducing-system-one-models-and-jev>

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

Week index, block length, `isDeload`, per-muscle planned volume against `mev` / `mav` /
`effectiveMrv`, each candidate's `kind` and `tradeoff: { recovered, dropped }`, and the
current `ReadinessSample` (fitness / fatigue / form) from `readiness.ts`.

### 6.2 Questions — one batched `systemOne()` call

| id | kind | authority | notes |
|---|---|---|---|
| `reschedule_pick` | choice | ADVISORY | `options` built **only** from the candidates `redistribute` actually emitted (the `out` array is 1–3 long), so Jev cannot select a plan that does not exist |
| `overreaching` | noul | ADVISORY | foregrounding only (§3.3) |
| `volume_loss_materiality` | score | ADVISORY | 4 levels; foregrounding only (§3.3) |

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
| `responding_well` / `approaching_mrv` / `on_track` | genuinely ambiguous | yes |

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
  → progressionQuestions(adj, readiness, ctx)     PURE  one choice per ambiguous muscle
  → executeJudgement(...)                         I/O   ONE call, N questions in parallel
  → applyProgressionVerdicts(adj, verdicts)       PURE  swaps cause; engine recomputes delta
  → toProgressionProposalView(...) → DecisionLog PROPOSED
```

`getWeeklyCheckIn` passes the **persisted** verdicts into `computeProposal` and never
asks. See §10 — this is what keeps its documented deterministic-rebuild contract true.

### 7.3 State projection

Per muscle: planned next sets, current volume, `mev` / `mav` / `effectiveMrv`, and
`recovery` / `joint` / `performance` from `CheckInFeedback`. Plus block-level: weeks
remaining, `upcomingIsDeload`, the `ReadinessSample` series and the blended recovery
signal from `readiness.ts`.

The case for Jev here: the threshold ladder can see only `rec` and `perf` as scalars,
while the projected state carries a *trend*.

### 7.4 Questions

One `choice` per ambiguous muscle, id `cause_<muscle>`, authority PROPOSAL, options
`{ responding_well, approaching_mrv, on_track }`.

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
export const JUDGEMENT_MIN_CONFIDENCE_ADVISORY = 0.60;  // reordering a recommendation
export const JUDGEMENT_MIN_CONFIDENCE_PROPOSAL = 0.75;  // influences training load
export const CLOSE_CALL_MARGIN = 0.15;                  // top-two probability gap
```

PROPOSAL demands more confidence than ADVISORY because the consequence is larger.

**Noul verdicts are never threshold-gated.** Jev supplies no `confidence` for a noul, and
§5 forbids fabricating one. Gating is therefore defined only for `choice` and `score`.
This is sound because no noul verdict in this cycle can alter a decision — see §9.5.

**These three numbers are guesses.** They are unvalidated starting points, to be
calibrated against the dataset §10 accumulates. They must not be described as tuned.

### 9.3 Close-call definition

Close-call is the **gap between the top two probabilities**, not `confidence`. A
0.45/0.42/0.13 split and a 0.45/0.30/0.25 split can report similar confidence while
meaning materially different things; the gap is what "this was close" actually describes.

### 9.4 New DecisionFact variants

```ts
| { kind: "judged"; subject: string; questionId: string; selected: string; deterministic: string; confidence: number }
| { kind: "close_call"; subject: string; questionId: string; between: [string, string]; margin: number }
```

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

## 10. Stability and persistence

### 10.1 The bug this fixes

`computeProposal` (`checkin.ts:125`) is documented as *"Rebuild CheckInFeedback + stepWeek
proposal deterministically from a persisted CheckIn's rows"* and is called from **both**
`getWeeklyCheckIn` (read) and `submitWeeklyCheckIn` (write). It re-runs `stepWeek` on
every read.

If a Jev verdict influenced a cause at submit time and were not persisted, every
subsequent read would recompute a different proposal: the athlete would watch the
recommendation change under them, and `applyProgression` would apply something other than
what they accepted.

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
  model       String    // pinned version actually used, e.g. "jev-1.13.0"
  verdicts    Json
  fallback    Json      // the deterministic pick, recorded alongside
  createdAt   DateTime  @default(now())

  @@unique([mesocycleId, subject, stateHash])
  @@index([mesocycleId, createdAt])
  @@map("judgement")
}
```

`executeJudgement` is **get-or-ask**: hash the state projection, look up, replay if found,
otherwise call Jev and persist.

Keying on `stateHash` means a legitimate state change (the athlete logs more sets)
naturally triggers a fresh ask, while a refetch of unchanged state cannot.

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

The per-request question limit is undocumented upstream. `executeJudgement` chunks at
**32 questions per call** and merges results. A 10-muscle block remains a single call; a
pathological constraint set cannot produce a 422.

## 11. Testing

| Test | Asserts |
|---|---|
| `applyVerdicts(x, []) ≡ x` | identity on empty — **this property is the fallback mechanism** |
| Law 1 property | for arbitrary candidates × arbitrary verdicts, `applyRescheduleVerdicts` leaves every `muscleVolume` value and prescription `sets` untouched; only `recommended` and `facts` may differ |
| Safety-preemption property | where a hard guard fires, no verdict changes that muscle's `cause` or `adjustedSets` |
| Clamp property | `applyProgressionVerdicts` never yields `adjustedSets` outside `[mev, effectiveMrv]` (reuses the invariant in `adaptation.properties.test.ts`) |
| Adversarial verdicts | unknown choice strings, `confidence` of `NaN` / `-1` / `2`, duplicate ids, empty probability maps → never throws, degrades to floor |
| `generate.golden.test.ts.snap` | byte-identical — the deterministic path genuinely unchanged |
| Contract test | real API, `describe.skipIf(!process.env.TYPESAFE_API_KEY)` |

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
  `{ ok: false, reason: "no_key" }` path, never a boot failure.
- `JEV_MODEL` defaulting to a pinned version (`jev-1.13.0`). `jev-latest` must not be
  used in production.

## 14. Observability and cost

Each call logs `subject`, model, latency, per-question confidence, `usage.input_tokens`,
and `agreedWithFallback`. That boolean is what turns the `Judgement` table into the
calibration dataset for §9.2.

A state projection runs ~500–1500 input tokens; output is free. At $0.042/MTok that is
roughly **$0.00002–0.00006 per decision** — a rounding error at any plausible user count.
Recorded here so the cache is not later "optimised" for cost: its job is stability (§10),
not savings.

## 15. Risks and open items

| Item | Status |
|---|---|
| Early-access credentials | **Open.** Jev is waitlist-gated. The design ships either way — the fake and replay adapters plus the `no_key` path mean the feature degrades to today's behaviour with no credentials. Validation against the real service is blocked until access lands. |
| The three thresholds are guesses | Accepted; §10.2 accumulates the data to calibrate them. |
| Per-request question limit undocumented | Mitigated by chunking at 32 (§10.5). |
| Query-with-write-side-effect | Accepted deliberately (§10.3). |
| Pinned model version drifts | `model` recorded per row; upgrades do not disturb in-flight decisions (§10.2). |

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
