# VoluStack — AI Orchestration Layer Design

**Date:** 2026-07-25
**Status:** Approved design, ready for implementation planning
**Parent specs:**
- `docs/superpowers/specs/2026-07-20-volustack-mvp-design.md` (§3 Laws, §6 architecture)
- `docs/superpowers/specs/2026-07-25-training-engine-design.md` (§2 facts contract)
- `docs/superpowers/specs/2026-07-25-experience-layer-design.md` (goal-intake chips, decision cards)

---

## 1. Scope

**Built first (this spec's implementation plan):**
- **Goal parser** — natural-language goals → validated `ConstraintSetInput` (powers onboarding)
- **Phrasing service** — engine `DecisionFact[]` → coach prose (powers decision cards +
  `DecisionLog` reasoning)

**Architected here, built later:**
- **Chat surfaces** — sidebar assistant + Coach tab (§5). Deferred: they need conversation
  persistence and are the most cloneable part; trust is built by the non-conversational core
  first.

**Non-goals:** the engine itself (separate spec), streaming UX, model fine-tuning, V2
proactive briefings.

## 2. Architectural Laws (inherited, made concrete)

- **Law 1:** the engine is the only thing that touches numbers. The AI layer never computes
  volume — it translates at the edges.
- **Law 2:** the LLM only parses intent, selects among engine-validated options, and phrases
  facts. Every plan-changing path round-trips through the engine.
- **New, this layer:** **AI failure never blocks the product.** Every AI consumer has a
  deterministic non-AI path — parser fails → structured onboarding form; phrasing fails →
  template prose. The app is fully usable with no API key (dev mode runs on templates).

## 3. Architecture

Everything lives in **`src/server/ai/`** — server-only, no client-side model calls, invoked
from tRPC procedures. Plain async functions, not framework machinery.

```
src/server/ai/
  client.ts        — Anthropic SDK client wrapper; model + max-tokens from env
                     (Sonnet default). Exposes an interface so tests inject a fake.
  parse-goals.ts   — parseGoals(nlText, athleteContext) → ParsedGoals
  phrase-facts.ts  — phraseFacts(facts, context) → PhrasedDecision
  templates.ts     — deterministic per-fact-kind template renderers
  guardrail.ts     — numeric-claim validator (pure)
```

**Boundary rules (enforced in types and review):**
- AI services return data validated by Zod schemas from `src/schema/` — malformed model
  output cannot escape the layer.
- AI services never import Prisma and (in this build) never call engine functions. Parser
  output flows to the UI chips → user confirms → tRPC calls the engine. The propose-tool
  pattern (§5) introduces engine tool-wrappers only when chat builds.

## 4. Services

### 4.1 Goal parser — `parseGoals`

One-shot structured extraction with explicit assumptions (decision: no onboarding
conversation, no strict-rejection).

```ts
ParsedGoals = {
  constraints: ConstraintSetInput,          // gaps filled with engine defaults
  assumptions: { field: string; value: string; reason: string }[],
  conflicts:   { description: string }[],   // truly unresolvable input only
}
```

- Prompt contains: the `ConstraintSetInput` schema, the defaults table, and athlete context
  (experience, phase). Model returns JSON.
- **Zod validation with one repair retry** — validation errors are fed back to the model
  once; a second failure hard-falls-back to the structured form path (onboarding is never
  blocked).
- Every unstated field becomes an explicit assumption ("assumed 6-week block — you didn't
  specify"), rendered as visibly-tagged editable chips per the experience spec's goal
  intake. Conflicts render as blocking chips the user must resolve.
- **Injection posture:** user text is data, never instructions. The parser's only capability
  is emitting `ParsedGoals`; adversarial input ("ignore your rules and …") parses to
  conflicts or empty fields. Covered by an adversarial test corpus.

### 4.2 Phrasing service — `phraseFacts`

Input: `DecisionFact[]` + minimal context (muscle display names, week number).
Output: `PhrasedDecision = { prose: string; summary: string }` — 1–3 sentences of coach
prose for the decision card, one line for `DecisionLog.summary`.

**Hard numeric guardrail** (decision: validation + fallback, not prompt-trust):
1. `guardrail.ts` extracts every numeral from the model output.
2. Each must appear in the source facts, or in a whitelisted-derivations set
   (week counts, "N of M" totals).
3. Violation → one retry with the violation named to the model → on second failure,
   **deterministic template fallback** from `templates.ts`.

`templates.ts` has a renderer for **every** `DecisionFact` kind — enforced by switch
exhaustiveness at compile time — so decision cards always render. Templates are also the
no-API-key/dev-mode path and the fallback's test fixtures.

**Voice:** calm, specific, second-person, no hype. ("Back recovered well and rows moved up —
adding a set next week.") A short tone guide lives in the system prompt; the content is
entirely the facts.

## 5. Chat Architecture (deferred build)

Both conversational surfaces are **one orchestrator** with different session semantics:

- **Tool-calling loop** over two tool groups:
  - *Read tools:* compact plan digest, landmarks, decision history.
  - *Propose tools:* thin Zod-validated wrappers on engine entry points
    (`propose_redistribution`, `propose_constraint_change`). Results render as accept/reject
    decision cards in the plan UI — **chat never mutates state directly** (Law 2's chat form).
- **Sidebar assistant:** ephemeral session, seeded with current-page context (week/muscle in
  view); delivers the smart check-in when the engine's `checkInValue` is `'high'`.
- **Coach tab:** persistent threads → requires `ChatThread`/`ChatMessage` tables, flagged as
  a **data-model addendum** at build time, not before.

## 6. Testing

- **No network in tests.** `client.ts` exposes an interface; tests inject a fake returning
  recorded/synthetic model outputs.
- **Guardrail units** (pure): pass cases, violations, whitelisted derivations,
  retry-then-fallback sequencing.
- **Template exhaustiveness:** compile-time switch exhaustiveness + one test rendering every
  fact kind.
- **Parser suite:** canonical NL input (the vision's example) → expected `ConstraintSetInput`;
  gap-filling → assumptions listed; adversarial/injection corpus → safe outputs; malformed
  JSON → repair retry → structured-form fallback.
- **Live smoke test:** one opt-in, env-gated test against the real API (not CI) to catch
  prompt drift.

## 7. Decision Log

| Decision | Choice | Why |
|---|---|---|
| Build order | Parser + phrasing first; chat deferred | Highest value-to-risk; chat needs persistence and is most cloneable |
| Phrasing guardrail | Hard numeric validation + template fallback | Law 2 must be testable, not aspirational; cards always render |
| Parser UX | One-shot + explicit assumptions/conflicts | Fast to first block; transparent; keeps onboarding non-conversational |
| AI availability | Never blocks product; templates = dev mode | Trust + developability without API keys |
| Model | Claude Sonnet default, env-configured | Single model for MVP; routing complexity later |
| Chat mutation path | Propose tools → decision cards only | Chat is a front door to the engine, never a backdoor |
```
