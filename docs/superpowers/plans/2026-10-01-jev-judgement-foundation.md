# Jev Judgement Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TypeSafe Jev as a typed-judgement layer over the deterministic training engine, replacing two crude threshold heuristics (reschedule ranking, progression cause) with calibrated model verdicts that can never alter a number.

**Architecture:** The engine stays pure and synchronous. It emits `JudgementRequest`s as plain data; a server-side executor runs them against Jev with get-or-ask persistence; pure per-seam appliers fold verdicts back. Verdicts carry only selectors the engine already enumerates, so every number still originates in engine arithmetic. Any failure, missing key, or low-confidence verdict leaves the engine's deterministic pick standing.

**Tech Stack:** TypeScript, Next.js 15 (App Router), tRPC 11, Prisma 6 + Postgres, vitest 4, fast-check 4, `@typesafe-ai/sdk`, zod 3.

**Spec:** `docs/superpowers/specs/2026-10-01-jev-judgement-foundation-design.md`

## Global Constraints

- **Branch from `freddy/experimental` at `7a637cb`.** Work branch: `freddy/feat/jev-judgement-foundation` (already created).
- **`src/engine/` must gain no `async`, no `await`, no `Promise`, and no new dependency.** ESLint enforces it (Task 1). Adding one breaks `properties.test.ts` and `adaptation.properties.test.ts`.
- **`src/engine/__snapshots__/generate.golden.test.ts.snap` must stay byte-identical.** If it changes, the deterministic path changed and the task is wrong.
- **A `Verdict` may never carry a quantity that enters a plan.** Payloads are selectors only: `RedistributionKind` or `StepCause` strings.
- **Model pin: `jev-1.13.0`.** Never `jev-latest` or `jev-preview` in code.
- **`pnpm test` must pass with no `TYPESAFE_API_KEY` configured.** The no-key path is a first-class code path, not an error path.
- **Question ids are never sent to the model.** Every question's full meaning lives in its `instructions`.
- **jev-1.13 cannot compare numbers.** No question may ask for proximity, counting, or numeric nearness. State projections carry derived labels, not raw landmark numbers.
- Thresholds live in `src/engine/constants.ts`, never inline.
- Verification commands: `pnpm test`, `pnpm typecheck`, `pnpm lint`.

---

### Task 1: Judgement types, thresholds, facts, and the purity guard

The pure vocabulary everything else consumes. No consumers yet — that is fine; later tasks import from here.

**Files:**
- Create: `src/engine/judgement.ts`
- Create: `src/engine/judgement.test.ts`
- Modify: `src/engine/constants.ts` (append a new section at end of file)
- Modify: `src/engine/facts.ts` (add two union members)
- Modify: `src/engine/index.ts` (add exports)
- Modify: `eslint.config.js:50-62` (extend the existing engine-purity rule)

**Interfaces:**
- Consumes: nothing.
- Produces: `JudgementAuthority`, `JudgementSubject`, `JudgementQuestion`, `JudgementRequest`, `Verdict`, `JudgementBasis`, `JudgementFailure`, `JudgementOutcome`, `verdictById(verdicts, id)`, `isUsableChoice(v, offered)`, `isUsableNoulProposal(v)`, `choiceCloseCall(v)`, `noulCloseCall(noul)`, `trendOf(series, flatBand)`. New `DecisionFact` kinds `"judged"` and `"close_call"`.

- [ ] **Step 1: Append the thresholds to `src/engine/constants.ts`**

```ts
// ─── Jev judgement layer ───

/** Choice: minimum confidence for an ADVISORY verdict to override the engine's pick. */
export const JUDGEMENT_MIN_CONFIDENCE_ADVISORY = 0.6;
/** Choice: top-two probability gap below which the pick is reported as a close call. */
export const CLOSE_CALL_MARGIN = 0.15;
/** Noul: minimum probability for a PROPOSAL verdict to stand. */
export const JUDGEMENT_MIN_NOUL_PROPOSAL = 0.75;
/** Noul: distance from 0.5 below which a yes/no is reported as a close call. */
export const CLOSE_CALL_NOUL_MARGIN = 0.12;
/** Trend labels: |Δ| strictly below this reads as "flat". */
export const TREND_FLAT_BAND = 0.5;
```

All five are **unvalidated guesses** (spec §9.2). Do not tune them in this plan.

- [ ] **Step 2: Write the failing test** — create `src/engine/judgement.test.ts`

```ts
// src/engine/judgement.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  choiceCloseCall,
  isUsableChoice,
  isUsableNoulProposal,
  noulCloseCall,
  trendOf,
  verdictById,
  type Verdict,
} from "./judgement";
import { TREND_FLAT_BAND } from "./constants";

const choiceV = (over: Partial<Extract<Verdict, { kind: "choice" }>> = {}): Verdict => ({
  id: "pick",
  kind: "choice",
  choice: "MAKE_UP",
  confidence: 0.9,
  probabilities: { MAKE_UP: 0.9, LET_GO: 0.1 },
  ...over,
});

describe("verdictById", () => {
  it("finds by id and returns undefined when absent", () => {
    const v = choiceV();
    expect(verdictById([v], "pick")).toBe(v);
    expect(verdictById([v], "nope")).toBeUndefined();
  });
});

describe("isUsableChoice", () => {
  const offered = ["MAKE_UP", "LET_GO"];

  it("accepts a confident verdict for an offered option", () => {
    expect(isUsableChoice(choiceV(), offered)).toBe(true);
  });

  it("rejects an option that was never offered", () => {
    expect(isUsableChoice(choiceV({ choice: "TELEPORT" }), offered)).toBe(false);
  });

  it("rejects confidence below the gate", () => {
    expect(isUsableChoice(choiceV({ confidence: 0.4 }), offered)).toBe(false);
  });

  it("rejects non-probability confidence", () => {
    for (const c of [NaN, -1, 2, Infinity]) {
      expect(isUsableChoice(choiceV({ confidence: c }), offered)).toBe(false);
    }
  });

  it("rejects undefined and wrong-kind verdicts", () => {
    expect(isUsableChoice(undefined, offered)).toBe(false);
    expect(isUsableChoice({ id: "pick", kind: "noul", noul: 0.9 }, offered)).toBe(false);
  });
});

describe("isUsableNoulProposal", () => {
  it("gates on the noul probability itself", () => {
    expect(isUsableNoulProposal({ id: "q", kind: "noul", noul: 0.8 })).toBe(true);
    expect(isUsableNoulProposal({ id: "q", kind: "noul", noul: 0.6 })).toBe(false);
  });

  it("rejects garbage probabilities", () => {
    for (const n of [NaN, -0.5, 1.5]) {
      expect(isUsableNoulProposal({ id: "q", kind: "noul", noul: n })).toBe(false);
    }
  });
});

describe("choiceCloseCall", () => {
  it("reports the top-two gap when below the margin", () => {
    const cc = choiceCloseCall({
      id: "pick", kind: "choice", choice: "MAKE_UP", confidence: 0.5,
      probabilities: { MAKE_UP: 0.45, PARTIAL: 0.42, LET_GO: 0.13 },
    });
    expect(cc).toEqual({ between: ["MAKE_UP", "PARTIAL"], margin: 0.03 });
  });

  it("returns undefined for a clear winner", () => {
    expect(choiceCloseCall(choiceV())).toBeUndefined();
  });

  it("returns undefined with fewer than two options", () => {
    expect(
      choiceCloseCall({ id: "p", kind: "choice", choice: "A", confidence: 1, probabilities: { A: 1 } }),
    ).toBeUndefined();
  });
});

describe("noulCloseCall", () => {
  it("is close near 0.5 and not close when decisive", () => {
    expect(noulCloseCall(0.52)).toBe(true);
    expect(noulCloseCall(0.9)).toBe(false);
    // Below the 0.75 PROPOSAL gate but still a clear no — not a close call.
    expect(noulCloseCall(0.1)).toBe(false);
  });
});

describe("trendOf", () => {
  it("labels direction outside the flat band", () => {
    expect(trendOf([1, 5], TREND_FLAT_BAND)).toBe("rising");
    expect(trendOf([5, 1], TREND_FLAT_BAND)).toBe("falling");
    expect(trendOf([1, 1.1], TREND_FLAT_BAND)).toBe("flat");
  });

  it("is unknown without two points", () => {
    expect(trendOf([], TREND_FLAT_BAND)).toBe("unknown");
    expect(trendOf([3], TREND_FLAT_BAND)).toBe("unknown");
  });

  it("never throws on arbitrary numeric input", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ noNaN: false })), (xs) => {
        expect(["rising", "falling", "flat", "unknown"]).toContain(trendOf(xs, TREND_FLAT_BAND));
      }),
      { numRuns: 200 },
    );
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm vitest run src/engine/judgement.test.ts`
Expected: FAIL — `Failed to resolve import "./judgement"`.

- [ ] **Step 4: Create `src/engine/judgement.ts`**

```ts
// src/engine/judgement.ts
import {
  CLOSE_CALL_MARGIN,
  CLOSE_CALL_NOUL_MARGIN,
  JUDGEMENT_MIN_CONFIDENCE_ADVISORY,
  JUDGEMENT_MIN_NOUL_PROPOSAL,
} from "./constants";

/** ADVISORY may reorder/annotate engine options. PROPOSAL may select among engine-
 * enumerated labels whose consequences the engine computes, behind an accept-gate.
 * There is deliberately no third level: a verdict can never carry a quantity. */
export type JudgementAuthority = "ADVISORY" | "PROPOSAL";

export type JudgementSubject = "reschedule" | "progression";

/** Mirrors Jev's three primitives. Option descriptions may be null when the option
 * name speaks for itself. Question ids are for code only and are NOT sent to the
 * model — every question's full meaning must live in `instructions`. */
export type JudgementQuestion =
  | {
      id: string;
      kind: "choice";
      authority: JudgementAuthority;
      instructions: string;
      options: Record<string, string | null>;
    }
  | { id: string; kind: "score"; authority: JudgementAuthority; instructions: string; levels: string[] }
  | {
      id: string;
      kind: "noul";
      authority: JudgementAuthority;
      instructions: string;
      criteria?: { true: string; false: string };
    };

export interface JudgementRequest {
  subject: JudgementSubject;
  /** JSON-safe projection. Carries derived labels, never raw landmark numbers:
   * jev-1.13 cannot reliably compare numbers (spec §5.2). */
  state: Record<string, unknown>;
  questions: JudgementQuestion[];
}

/** Mirrors Jev's answer shapes exactly — including that a noul has no `confidence`,
 * because it has no probability distribution to compute one from. */
export type Verdict =
  | { id: string; kind: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { id: string; kind: "score"; score: number; confidence: number }
  | { id: string; kind: "noul"; noul: number };

/** Which axis a judgement was gated on. A discriminated union rather than a bare
 * `confidence` because seam 2 gates on a noul's probability, and fabricating a
 * confidence for it would invent a calibration the model never claimed. */
export type JudgementBasis =
  | { kind: "confidence"; value: number }
  | { kind: "noul"; value: number };

export type JudgementFailure =
  | "no_key"
  | "timeout"
  | "rate_limited"
  | "auth"
  | "overloaded"
  | "invalid_response";

export type JudgementOutcome =
  | { ok: true; verdicts: Verdict[]; model: string }
  | { ok: false; reason: JudgementFailure };

export function verdictById(verdicts: Verdict[], id: string): Verdict | undefined {
  return verdicts.find((v) => v.id === id);
}

/** A finite number in [0,1]. Guards adversarial or malformed payloads. */
function isProb(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Usable at ADVISORY authority: a valid confidence above the gate, for an option we
 * actually offered. The `offered` check is what stops a hallucinated option name reaching
 * the plan. */
export function isUsableChoice(
  v: Verdict | undefined,
  offered: string[],
): v is Extract<Verdict, { kind: "choice" }> {
  return (
    v !== undefined &&
    v.kind === "choice" &&
    isProb(v.confidence) &&
    v.confidence >= JUDGEMENT_MIN_CONFIDENCE_ADVISORY &&
    offered.includes(v.choice)
  );
}

/** Usable at PROPOSAL authority. Gated on the noul's own probability — the calibrated
 * number the primitive exists to return, not a synthesised confidence. */
export function isUsableNoulProposal(v: Verdict | undefined): v is Extract<Verdict, { kind: "noul" }> {
  return v !== undefined && v.kind === "noul" && isProb(v.noul) && v.noul >= JUDGEMENT_MIN_NOUL_PROPOSAL;
}

/** Close-call for a Choice: the gap between the top two probabilities. Confidence
 * alone cannot distinguish 0.45/0.42/0.13 from 0.45/0.30/0.25. */
export function choiceCloseCall(
  v: Extract<Verdict, { kind: "choice" }>,
): { between: [string, string]; margin: number } | undefined {
  const ranked = Object.entries(v.probabilities)
    .filter(([, p]) => isProb(p))
    .sort((a, b) => b[1] - a[1]);
  if (ranked.length < 2) return undefined;
  const first = ranked[0]!;
  const second = ranked[1]!;
  const margin = first[1] - second[1];
  if (margin >= CLOSE_CALL_MARGIN) return undefined;
  return { between: [first[0], second[0]], margin: round2(margin) };
}

/** Close-call for a Noul: near the midpoint, where yes and no are near-equally likely.
 * NOT distance from the 0.75 gate — a 0.1 is below the gate but a clear no. */
export function noulCloseCall(noul: number): boolean {
  return isProb(noul) && Math.abs(noul - 0.5) < CLOSE_CALL_NOUL_MARGIN;
}

/** Label the direction of a series from its last two points. Used for readiness and
 * recovery trends, so the model is handed a word rather than numbers to compare. */
export function trendOf(
  series: number[],
  flatBand: number,
): "rising" | "flat" | "falling" | "unknown" {
  const clean = series.filter((n) => Number.isFinite(n));
  if (clean.length < 2) return "unknown";
  const delta = clean[clean.length - 1]! - clean[clean.length - 2]!;
  if (Math.abs(delta) < flatBand) return "flat";
  return delta > 0 ? "rising" : "falling";
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pnpm vitest run src/engine/judgement.test.ts`
Expected: PASS, all suites.

- [ ] **Step 6: Add the two `DecisionFact` variants** to `src/engine/facts.ts`

Add the import at the top, after the existing `MuscleGroup` import:

```ts
import type { JudgementBasis } from "./judgement";
```

Append these two members to the end of the `DecisionFact` union (after the `dropped_volume` line, keeping the closing `;`):

```ts
  | { kind: "judged"; subject: string; questionId: string; selected: string; deterministic: string; basis: JudgementBasis }
  | { kind: "close_call"; subject: string; questionId: string; between: [string, string]; margin: number }
```

Safe to add: nothing in `src/views`, `src/server/views` or `src/components` switches exhaustively on `DecisionFact.kind`. Infrastructure failures get **no** fact — facts explain the plan, and "Jev timed out" explains nothing about it.

- [ ] **Step 7: Export from `src/engine/index.ts`**

Add after the existing `export type { DecisionFact } from "./facts";` line:

```ts
export {
  verdictById,
  isUsableChoice,
  isUsableNoulProposal,
  choiceCloseCall,
  noulCloseCall,
  trendOf,
} from "./judgement";
export type {
  JudgementAuthority,
  JudgementSubject,
  JudgementQuestion,
  JudgementRequest,
  Verdict,
  JudgementBasis,
  JudgementFailure,
  JudgementOutcome,
} from "./judgement";
```

- [ ] **Step 8: Extend the engine purity guard** in `eslint.config.js`

The rule already exists at `eslint.config.js:50-62`. Change only the DB/server pattern group to add the SDK:

```js
            { group: ["@prisma/*", "~/generated/*", "~/server/*", "@typesafe-ai/sdk"], message: "Engine is pure: no DB/server/SDK imports." },
```

- [ ] **Step 9: Verify the whole suite and the golden snapshot**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS. `generate.golden.test.ts.snap` must be unchanged — confirm with `git diff --stat src/engine/__snapshots__/` printing nothing.

- [ ] **Step 10: Commit**

```bash
git add src/engine/judgement.ts src/engine/judgement.test.ts src/engine/constants.ts src/engine/facts.ts src/engine/index.ts eslint.config.js
git commit -m "feat(judgement): pure judgement vocabulary, thresholds, and purity guard"
```

---

### Task 2: Canonical JSON hashing

Deterministic hashing for the get-or-ask cache key. `JSON.stringify` key order would silently fragment the cache and reintroduce the instability the cache exists to prevent.

**Files:**
- Create: `src/server/judgement/canonical.ts`
- Create: `src/server/judgement/canonical.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `canonicalJson(value: unknown): string`, `sha256(input: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/judgement/canonical.test.ts
import { describe, expect, it } from "vitest";
import { canonicalJson, sha256 } from "./canonical";

describe("canonicalJson", () => {
  it("is independent of object key insertion order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("sorts nested object keys too", () => {
    expect(canonicalJson({ x: { d: 1, c: 2 } })).toBe('{"x":{"c":2,"d":1}}');
  });

  it("preserves array order, which is meaningful", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("handles primitives and null", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson("s")).toBe('"s"');
    expect(canonicalJson(3)).toBe("3");
  });

  it("sorts keys inside objects nested in arrays", () => {
    expect(canonicalJson([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });
});

describe("sha256", () => {
  it("is stable and hex-encoded", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256("abc")).not.toBe(sha256("abd"));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run src/server/judgement/canonical.test.ts`
Expected: FAIL — cannot resolve `./canonical`.

- [ ] **Step 3: Create `src/server/judgement/canonical.ts`**

```ts
// src/server/judgement/canonical.ts
import { createHash } from "node:crypto";

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortDeep(v)]),
    );
  }
  return value;
}

/** Deterministic JSON: object keys sorted recursively, array order preserved
 * (order is meaningful in our projections). Without this the cache key would
 * depend on property insertion order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm vitest run src/server/judgement/canonical.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/judgement/canonical.ts src/server/judgement/canonical.test.ts
git commit -m "feat(judgement): canonical JSON hashing for the judgement cache key"
```

---

### Task 3: `Judgement` model and migration

Persistence that makes verdicts stable across the submit→apply boundary. Without it, `applyProgression` would recompute a different proposal than the athlete accepted and write that to the plan (spec §10.1).

**Files:**
- Modify: `prisma/schema.prisma` (add model; add relation to `Mesocycle` at `prisma/schema.prisma:328-329`)

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma model `Judgement` with fields `id, mesocycleId, subject, stateHash, questionsHash, model, verdicts, fallback, createdAt`; unique on `[mesocycleId, subject, stateHash, questionsHash]`. Accessible as `db.judgement`.

- [ ] **Step 1: Add the relation field to `Mesocycle`**

In `prisma/schema.prisma`, inside `model Mesocycle`, next to the existing `weeks` and `decisions` lines:

```prisma
  weeks Week[]
  decisions DecisionLog[]
  judgements Judgement[]
```

- [ ] **Step 2: Add the model** (place it immediately after `model DecisionLog { ... }`)

```prisma
/// One recorded Jev judgement, keyed by exactly what was judged. Serves three jobs:
/// stability (the same state+questions always replays the same verdicts, so a refetch
/// or a recompute at accept time cannot change the athlete's proposal), audit (which
/// model version influenced which decision), and calibration (verdicts paired with the
/// deterministic pick in `fallback` give agreement data for free).
model Judgement {
  id            String    @id @default(cuid())
  mesocycleId   String
  mesocycle     Mesocycle @relation(fields: [mesocycleId], references: [id], onDelete: Cascade)
  subject       String // "reschedule" | "progression"
  stateHash     String // sha256 of the canonical JSON state projection
  questionsHash String // sha256 of the canonical question set — question meaning is part of the key
  model         String // the pinned version that actually answered, e.g. "jev-1.13.0"
  verdicts      Json
  fallback      Json // the deterministic pick, recorded alongside for calibration
  createdAt     DateTime  @default(now())

  @@unique([mesocycleId, subject, stateHash, questionsHash])
  @@index([mesocycleId, createdAt])
  @@map("judgement")
}
```

`model` is deliberately **not** in the unique key: including it would mean deploying a new pinned version reshuffles a proposal an athlete is mid-way through accepting.

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate --name add_judgement`
Expected: a new folder under `prisma/migrations/` and `prisma generate` succeeding. If the local database is not running, start it with `./start-database.sh` first.

- [ ] **Step 4: Verify the client types exist**

Run: `pnpm typecheck`
Expected: PASS. Then confirm the delegate is generated:

```bash
grep -q "judgement" generated/*.ts generated/**/*.ts 2>/dev/null && echo "judgement delegate present" || echo "CHECK: inspect the generated client output path"
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): Judgement model — stable, auditable verdict records"
```

---

### Task 4: Jev client and fake adapter

**Files:**
- Create: `src/server/judgement/client.ts`
- Create: `src/server/judgement/fake.ts`
- Create: `src/server/judgement/client.test.ts`
- Modify: `src/env.js` (add two server vars in both `server` and `runtimeEnv`)
- Modify: `package.json` (dependency)

**Interfaces:**
- Consumes: `JudgementRequest`, `JudgementOutcome`, `Verdict`, `JudgementFailure` from `~/engine` (Task 1).
- Produces: `JudgementClient` interface with `ask(request: JudgementRequest): Promise<JudgementOutcome>`; `jevClient(): JudgementClient`; `classifyError(err: unknown): JudgementFailure`; `toWireQuestions(questions: JudgementQuestion[]): Record<string, unknown>`; `parseAnswers(payload: unknown): Verdict[] | null`; `fakeClient(answers: Record<string, Verdict>, opts?: { failWith?: JudgementFailure }): JudgementClient`.

- [ ] **Step 1: Install the SDK**

```bash
pnpm add @typesafe-ai/sdk
```

- [ ] **Step 2: Add the env vars** to `src/env.js`

In the `server` object:

```js
    TYPESAFE_API_KEY: z.string().optional(),
    JEV_MODEL: z.string().default("jev-1.13.0"),
```

In `runtimeEnv`:

```js
    TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
    JEV_MODEL: process.env.JEV_MODEL,
```

`TYPESAFE_API_KEY` is **optional on purpose**: absence is the `no_key` code path, not a boot failure. The SDK reads this exact variable itself, so `client.ts` never passes a key explicitly.

- [ ] **Step 3: Write the failing test**

```ts
// src/server/judgement/client.test.ts
import { describe, expect, it } from "vitest";
import { classifyError, parseAnswers, toWireQuestions } from "./client";
import { fakeClient } from "./fake";
import type { JudgementQuestion, JudgementRequest } from "~/engine";

const req: JudgementRequest = { subject: "reschedule", state: { a: 1 }, questions: [] };

describe("toWireQuestions", () => {
  it("maps each kind to the documented wire shape", () => {
    const qs: JudgementQuestion[] = [
      { id: "pick", kind: "choice", authority: "ADVISORY", instructions: "Which?", options: { A: "a desc", B: null } },
      { id: "grade", kind: "score", authority: "ADVISORY", instructions: "How bad?", levels: ["none", "some"] },
      { id: "yn", kind: "noul", authority: "PROPOSAL", instructions: "Yes?", criteria: { true: "t", false: "f" } },
    ];
    expect(toWireQuestions(qs)).toEqual({
      pick: { type: "choice", instructions: "Which?", criteria: { A: "a desc", B: null } },
      grade: { type: "score", instructions: "How bad?", criteria: ["none", "some"] },
      yn: { type: "noul", instructions: "Yes?", criteria: { true: "t", false: "f" } },
    });
  });

  it("omits criteria for a noul without one", () => {
    expect(toWireQuestions([{ id: "yn", kind: "noul", authority: "ADVISORY", instructions: "Yes?" }])).toEqual({
      yn: { type: "noul", instructions: "Yes?" },
    });
  });
});

describe("classifyError", () => {
  it("maps SDK error names and HTTP statuses", () => {
    expect(classifyError({ name: "AuthenticationError" })).toBe("auth");
    expect(classifyError({ name: "RateLimitError" })).toBe("rate_limited");
    expect(classifyError({ name: "APITimeoutError" })).toBe("timeout");
    expect(classifyError({ status: 401 })).toBe("auth");
    expect(classifyError({ status: 429 })).toBe("rate_limited");
    expect(classifyError({ status: 529 })).toBe("overloaded");
    expect(classifyError({ status: 422 })).toBe("invalid_response");
    expect(classifyError(new Error("boom"))).toBe("invalid_response");
  });
});

describe("parseAnswers", () => {
  it("parses all three answer shapes into Verdicts", () => {
    const verdicts = parseAnswers({
      model: "jev-1.13.0",
      answers: {
        pick: { type: "choice", choice: "A", confidence: 0.9, probabilities: { A: 0.9, B: 0.1 } },
        grade: { type: "score", score: 2.5, confidence: 0.8 },
        yn: { type: "noul", noul: 0.77 },
      },
    });
    expect(verdicts).toEqual([
      { id: "pick", kind: "choice", choice: "A", confidence: 0.9, probabilities: { A: 0.9, B: 0.1 } },
      { id: "grade", kind: "score", score: 2.5, confidence: 0.8 },
      { id: "yn", kind: "noul", noul: 0.77 },
    ]);
  });

  it("returns null for a malformed payload rather than guessing", () => {
    expect(parseAnswers({ answers: { pick: { type: "choice" } } })).toBeNull();
    expect(parseAnswers("nope")).toBeNull();
    expect(parseAnswers({ model: "m", answers: { x: { type: "wat" } } })).toBeNull();
  });
});

describe("fakeClient", () => {
  it("returns scripted verdicts", async () => {
    const client = fakeClient({ pick: { id: "pick", kind: "noul", noul: 0.9 } });
    const out = await client.ask(req);
    expect(out).toEqual({ ok: true, verdicts: [{ id: "pick", kind: "noul", noul: 0.9 }], model: "fake" });
  });

  it("can simulate a failure", async () => {
    const client = fakeClient({}, { failWith: "timeout" });
    expect(await client.ask(req)).toEqual({ ok: false, reason: "timeout" });
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `pnpm vitest run src/server/judgement/client.test.ts`
Expected: FAIL — cannot resolve `./client` and `./fake`.

- [ ] **Step 5: Create `src/server/judgement/client.ts`**

Questions are built as **plain objects matching the documented HTTP contract** rather than via the SDK's `choice()`/`score()`/`noul()` factories. The wire shape is specified precisely in the docs; the factory signatures are not fully documented, and depending on them would couple us to an undocumented surface.

```ts
// src/server/judgement/client.ts
import "server-only";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { z } from "zod";
import { env } from "~/env";
import type {
  JudgementFailure,
  JudgementOutcome,
  JudgementQuestion,
  JudgementRequest,
  Verdict,
} from "~/engine";

export interface JudgementClient {
  ask(request: JudgementRequest): Promise<JudgementOutcome>;
}

/** Documented wire shape: { type, instructions, criteria }. */
export function toWireQuestions(questions: JudgementQuestion[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const q of questions) {
    if (q.kind === "choice") {
      out[q.id] = { type: "choice", instructions: q.instructions, criteria: q.options };
    } else if (q.kind === "score") {
      out[q.id] = { type: "score", instructions: q.instructions, criteria: q.levels };
    } else {
      out[q.id] = q.criteria
        ? { type: "noul", instructions: q.instructions, criteria: q.criteria }
        : { type: "noul", instructions: q.instructions };
    }
  }
  return out;
}

const AnswerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    confidence: z.number(),
    probabilities: z.record(z.string(), z.number()),
  }),
  z.object({
    type: z.literal("score"),
    score: z.number(),
    confidence: z.number(),
    probabilities: z.record(z.string(), z.number()).optional(),
    legend: z.record(z.string(), z.string()).optional(),
  }),
  z.object({ type: z.literal("noul"), noul: z.number() }),
]);

const ResponseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(z.string(), AnswerSchema),
});

/** Validate at the boundary. A malformed payload is an INFRASTRUCTURE failure, never a
 * low-confidence answer — the upstream docs are explicit that conflating the two is
 * the classic bug. Returning null makes the caller take the fallback path. */
export function parseAnswers(payload: unknown): Verdict[] | null {
  const parsed = ResponseSchema.safeParse(payload);
  if (!parsed.success) return null;
  const verdicts: Verdict[] = [];
  for (const [id, a] of Object.entries(parsed.data.answers)) {
    if (a.type === "choice") {
      verdicts.push({ id, kind: "choice", choice: a.choice, confidence: a.confidence, probabilities: a.probabilities });
    } else if (a.type === "score") {
      verdicts.push({ id, kind: "score", score: a.score, confidence: a.confidence });
    } else {
      verdicts.push({ id, kind: "noul", noul: a.noul });
    }
  }
  return verdicts;
}

export function classifyError(err: unknown): JudgementFailure {
  const o = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : {};
  const name = typeof o.name === "string" ? o.name : "";
  const status = typeof o.status === "number" ? o.status : undefined;
  if (name === "AuthenticationError" || status === 401) return "auth";
  if (name === "RateLimitError" || status === 429) return "rate_limited";
  if (name === "APITimeoutError") return "timeout";
  if (status === 529) return "overloaded";
  // 422 means WE built a bad request. Surfaced as invalid_response so the fallback
  // path runs, but it is logged loudly by the executor because it is our bug.
  return "invalid_response";
}

const RETRYABLE: JudgementFailure[] = ["rate_limited", "overloaded"];
const MAX_ATTEMPTS = 3;

function backoffMs(attempt: number): number {
  return 250 * 2 ** attempt + Math.floor(Math.random() * 100);
}

export function jevClient(): JudgementClient {
  return {
    async ask(request: JudgementRequest): Promise<JudgementOutcome> {
      if (!env.TYPESAFE_API_KEY) return { ok: false, reason: "no_key" };
      const client = new TypeSafeClient();
      const body = {
        model: env.JEV_MODEL,
        state: request.state,
        questions: toWireQuestions(request.questions),
      };
      let last: JudgementFailure = "invalid_response";
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const raw: unknown = await client.systemOne(body as Parameters<typeof client.systemOne>[0]);
          const verdicts = parseAnswers(raw);
          if (verdicts === null) return { ok: false, reason: "invalid_response" };
          const model =
            typeof raw === "object" && raw !== null && typeof (raw as { model?: unknown }).model === "string"
              ? (raw as { model: string }).model
              : env.JEV_MODEL;
          return { ok: true, verdicts, model };
        } catch (err) {
          last = classifyError(err);
          if (!RETRYABLE.includes(last) || attempt === MAX_ATTEMPTS - 1) return { ok: false, reason: last };
          await new Promise((r) => setTimeout(r, backoffMs(attempt)));
        }
      }
      return { ok: false, reason: last };
    },
  };
}
```

- [ ] **Step 6: Create `src/server/judgement/fake.ts`**

```ts
// src/server/judgement/fake.ts
import type { JudgementFailure, JudgementOutcome, JudgementRequest, Verdict } from "~/engine";
import type { JudgementClient } from "./client";

/** Deterministic adapter for unit and property tests: no network, no key, no SDK.
 * Verdicts are keyed by question id; ids absent from the script are simply not
 * answered, which is itself a case worth testing. */
export function fakeClient(
  answers: Record<string, Verdict>,
  opts: { failWith?: JudgementFailure } = {},
): JudgementClient {
  return {
    ask(request: JudgementRequest): Promise<JudgementOutcome> {
      if (opts.failWith) return Promise.resolve({ ok: false, reason: opts.failWith });
      const asked = new Set(request.questions.map((q) => q.id));
      const scripted = Object.entries(answers)
        .filter(([id]) => asked.size === 0 || asked.has(id))
        .map(([, v]) => v);
      return Promise.resolve({ ok: true, verdicts: scripted, model: "fake" });
    },
  };
}
```

- [ ] **Step 7: Run the test to confirm it passes**

Run: `pnpm vitest run src/server/judgement/client.test.ts`
Expected: PASS.

- [ ] **Step 8: Verify the suite with no API key present**

Run: `TYPESAFE_API_KEY= pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS. If the SDK's `systemOne` parameter type rejects the `body as ...` cast, replace the cast with the SDK's exported request type — do not loosen the zod schema.

- [ ] **Step 9: Commit**

```bash
git add src/server/judgement/client.ts src/server/judgement/fake.ts src/server/judgement/client.test.ts src/env.js package.json pnpm-lock.yaml
git commit -m "feat(judgement): Jev client with validated boundary, backoff, and fake adapter"
```

---

### Task 5: `executeJudgement` — get-or-ask

**Files:**
- Create: `src/server/judgement/execute.ts`
- Create: `src/server/judgement/execute.test.ts`

**Interfaces:**
- Consumes: `canonicalJson`, `sha256` (Task 2); `JudgementClient`, `jevClient` (Task 4); `Judgement` model (Task 3).
- Produces: `executeJudgement(args: { db: JudgementDb; mesocycleId: string; request: JudgementRequest; fallback: unknown; client?: JudgementClient }): Promise<Verdict[]>`. Returns `[]` on every failure, which makes the appliers no-op. Also exports `type JudgementDb` and `chunkQuestions(request): JudgementQuestion[][]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/judgement/execute.test.ts
import { describe, expect, it, vi } from "vitest";
import type { JudgementRequest, Verdict } from "~/engine";
import { chunkQuestions, executeJudgement, type JudgementDb } from "./execute";
import { fakeClient } from "./fake";

const request: JudgementRequest = {
  subject: "reschedule",
  state: { phase: "late" },
  questions: [{ id: "pick", kind: "choice", authority: "ADVISORY", instructions: "Which?", options: { A: null } }],
};
const verdict: Verdict = { id: "pick", kind: "choice", choice: "A", confidence: 0.9, probabilities: { A: 0.9 } };

function dbStub(existing: { verdicts: unknown } | null) {
  return {
    judgement: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({}),
    },
  } as unknown as JudgementDb & {
    judgement: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  };
}

describe("executeJudgement", () => {
  it("asks and persists on a cache miss", async () => {
    const db = dbStub(null);
    const out = await executeJudgement({
      db, mesocycleId: "m1", request, fallback: { recommended: "MAKE_UP" },
      client: fakeClient({ pick: verdict }),
    });
    expect(out).toEqual([verdict]);
    expect(db.judgement.create).toHaveBeenCalledTimes(1);
    const arg = db.judgement.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.subject).toBe("reschedule");
    expect(arg.data.stateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.data.questionsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.data.fallback).toEqual({ recommended: "MAKE_UP" });
  });

  it("replays a cached judgement without asking", async () => {
    const db = dbStub({ verdicts: [verdict] });
    const client = fakeClient({ pick: verdict });
    const spy = vi.spyOn(client, "ask");
    const out = await executeJudgement({ db, mesocycleId: "m1", request, fallback: null, client });
    expect(out).toEqual([verdict]);
    expect(spy).not.toHaveBeenCalled();
    expect(db.judgement.create).not.toHaveBeenCalled();
  });

  it("returns [] and persists nothing when the client fails", async () => {
    const db = dbStub(null);
    const out = await executeJudgement({
      db, mesocycleId: "m1", request, fallback: null,
      client: fakeClient({}, { failWith: "timeout" }),
    });
    expect(out).toEqual([]);
    expect(db.judgement.create).not.toHaveBeenCalled();
  });

  it("returns [] when a cached row holds unparseable verdicts", async () => {
    const db = dbStub({ verdicts: [{ id: "pick", kind: "choice" }] });
    const out = await executeJudgement({
      db, mesocycleId: "m1", request, fallback: null, client: fakeClient({ pick: verdict }),
    });
    expect(out).toEqual([]);
  });

  it("survives a concurrent insert by re-reading", async () => {
    const db = dbStub(null);
    db.judgement.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    db.judgement.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ verdicts: [verdict] });
    const out = await executeJudgement({
      db, mesocycleId: "m1", request, fallback: null, client: fakeClient({ pick: verdict }),
    });
    expect(out).toEqual([verdict]);
  });

  it("keeps a realistic question set in a single chunk", () => {
    const many: JudgementRequest = {
      ...request,
      questions: Array.from({ length: 10 }, (_, i) => ({
        id: `q${i}`, kind: "noul" as const, authority: "PROPOSAL" as const,
        instructions: "Does this muscle justify adding volume next week?".repeat(3),
      })),
    };
    expect(chunkQuestions(many)).toHaveLength(1);
  });

  it("splits when the question set cannot fit the budget", () => {
    const huge: JudgementRequest = {
      ...request,
      questions: Array.from({ length: 4 }, (_, i) => ({
        id: `q${i}`, kind: "noul" as const, authority: "ADVISORY" as const,
        instructions: "x".repeat(100_000),
      })),
    };
    expect(chunkQuestions(huge).length).toBeGreaterThan(1);
    expect(chunkQuestions(huge).flat()).toHaveLength(4);
  });

  it("keys differently when question wording changes", async () => {
    const db = dbStub(null);
    const hashes: string[] = [];
    for (const instructions of ["Which?", "Which one?"]) {
      db.judgement.create.mockClear();
      await executeJudgement({
        db, mesocycleId: "m1",
        request: { ...request, questions: [{ ...request.questions[0]!, instructions } as never] },
        fallback: null, client: fakeClient({ pick: verdict }),
      });
      const arg = db.judgement.create.mock.calls[0]![0] as { data: { questionsHash: string } };
      hashes.push(arg.data.questionsHash);
    }
    expect(hashes[0]).not.toBe(hashes[1]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run src/server/judgement/execute.test.ts`
Expected: FAIL — cannot resolve `./execute`.

- [ ] **Step 3: Create `src/server/judgement/execute.ts`**

```ts
// src/server/judgement/execute.ts
import "server-only";
import { z } from "zod";
import type { JudgementOutcome, JudgementQuestion, JudgementRequest, Verdict } from "~/engine";
import { canonicalJson, sha256 } from "./canonical";
import { jevClient, type JudgementClient } from "./client";

/** Only the delegate we touch, so tests can stub it and transactions can be passed. */
export interface JudgementDb {
  judgement: {
    findUnique(args: {
      where: {
        mesocycleId_subject_stateHash_questionsHash: {
          mesocycleId: string;
          subject: string;
          stateHash: string;
          questionsHash: string;
        };
      };
      select?: { verdicts: true };
    }): Promise<{ verdicts: unknown } | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

const VerdictSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string(), kind: z.literal("choice"), choice: z.string(),
    confidence: z.number(), probabilities: z.record(z.string(), z.number()),
  }),
  z.object({ id: z.string(), kind: z.literal("score"), score: z.number(), confidence: z.number() }),
  z.object({ id: z.string(), kind: z.literal("noul"), noul: z.number() }),
]);
const VerdictsSchema = z.array(VerdictSchema);

function parseStored(value: unknown): Verdict[] | null {
  const parsed = VerdictsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Spec §10.5. There is no documented cap on questions per request; the binding limits
 * are 64k tokens per request and 32k for state plus the longest question. A realistic
 * 10-muscle block is nowhere near either, so this exists so a pathological constraint
 * set degrades gracefully instead of returning 422. ~4 chars per token is the usual
 * rough estimate and is deliberately conservative here. */
const REQUEST_TOKEN_CAP = 64_000;
const CHARS_PER_TOKEN = 4;

function estTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value ?? null).length / CHARS_PER_TOKEN);
}

export function chunkQuestions(request: JudgementRequest): JudgementQuestion[][] {
  if (request.questions.length <= 1) return [request.questions];
  const budget = Math.max(1, REQUEST_TOKEN_CAP - estTokens(request.state));
  const chunks: JudgementQuestion[][] = [];
  let current: JudgementQuestion[] = [];
  let used = 0;
  for (const q of request.questions) {
    const cost = estTokens(q);
    if (current.length > 0 && used + cost > budget) {
      chunks.push(current);
      current = [];
      used = 0;
    }
    current.push(q);
    used += cost;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Batching is strongly preferred — upstream measured 13 questions in one call at 12.2x
 * cheaper and 10x faster than 13 separate calls, with statistically indistinguishable
 * answers — so this splits only when the budget forces it. Any chunk failing fails the
 * whole judgement: a partial verdict set would silently judge some muscles and not
 * others. */
async function askChunked(
  client: JudgementClient,
  request: JudgementRequest,
): Promise<JudgementOutcome> {
  const chunks = chunkQuestions(request);
  if (chunks.length <= 1) return client.ask(request);

  const all: Verdict[] = [];
  let model = "";
  for (const questions of chunks) {
    const outcome = await client.ask({ ...request, questions });
    if (!outcome.ok) return outcome;
    all.push(...outcome.verdicts);
    model = outcome.model;
  }
  return { ok: true, verdicts: all, model };
}

/**
 * Get-or-ask. The engine's deterministic result is always computed BEFORE this is
 * called, so every failure mode here simply returns `[]` and the appliers no-op.
 * There is no error path for the caller to handle — that is the whole fallback design.
 */
export async function executeJudgement(args: {
  db: JudgementDb;
  mesocycleId: string;
  request: JudgementRequest;
  /** The deterministic pick, recorded for audit + calibration. */
  fallback: unknown;
  client?: JudgementClient;
}): Promise<Verdict[]> {
  const { db, mesocycleId, request, fallback } = args;
  const client = args.client ?? jevClient();
  const stateHash = sha256(canonicalJson(request.state));
  const questionsHash = sha256(canonicalJson(request.questions));
  const where = {
    mesocycleId_subject_stateHash_questionsHash: {
      mesocycleId, subject: request.subject, stateHash, questionsHash,
    },
  };

  const cached = await db.judgement.findUnique({ where, select: { verdicts: true } });
  if (cached) return parseStored(cached.verdicts) ?? [];

  const started = Date.now();
  const outcome = await askChunked(client, request);
  const latencyMs = Date.now() - started;

  if (!outcome.ok) {
    // Infrastructure, not a judgement. No DecisionFact; logs only.
    console.info(
      JSON.stringify({
        at: "judgement.failed", subject: request.subject, reason: outcome.reason,
        questions: request.questions.length, latencyMs,
      }),
    );
    return [];
  }

  console.info(
    JSON.stringify({
      at: "judgement.ok", subject: request.subject, model: outcome.model,
      questions: request.questions.length, latencyMs,
      confidences: outcome.verdicts.map((v) =>
        v.kind === "noul" ? { id: v.id, noul: v.noul } : { id: v.id, confidence: v.confidence },
      ),
      fallback,
    }),
  );

  try {
    await db.judgement.create({
      data: {
        mesocycleId, subject: request.subject, stateHash, questionsHash,
        model: outcome.model,
        verdicts: outcome.verdicts as unknown as object,
        fallback: (fallback ?? {}) as object,
      },
    });
  } catch {
    // Concurrent insert for the same key (two tabs, double-click). The other writer's
    // row is equally valid — replay it so both callers see the same verdicts.
    const raced = await db.judgement.findUnique({ where, select: { verdicts: true } });
    if (raced) return parseStored(raced.verdicts) ?? [];
  }
  return outcome.verdicts;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm vitest run src/server/judgement/execute.test.ts`
Expected: PASS, eight tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/judgement/execute.ts src/server/judgement/execute.test.ts
git commit -m "feat(judgement): get-or-ask executor with stable keying and silent fallback"
```

---

### Task 6: Seam 1 — reschedule questions and applier (pure)

**Files:**
- Modify: `src/engine/redistribute.ts` (append exports; do not touch `redistributeWeek`'s existing body or its recommendation policy at `src/engine/redistribute.ts:123-130`)
- Create: `src/engine/reschedule-judgement.test.ts`
- Modify: `src/engine/index.ts` (export the two new functions and the id constant)

**Interfaces:**
- Consumes: `JudgementRequest`, `Verdict`, `isUsableChoice`, `choiceCloseCall`, `verdictById`, `trendOf` (Task 1); existing `RedistributionCandidate`, `WeekPlan`, `AdaptationContext`, `ResolvedMuscleTarget`, `ReadinessSample`.
- Produces: `RESCHEDULE_PICK_ID = "reschedule_pick"`; `rescheduleQuestions(candidates, week, ctx, readiness)`; `applyRescheduleVerdicts(candidates, verdicts)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/reschedule-judgement.test.ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  RESCHEDULE_PICK_ID,
  applyRescheduleVerdicts,
  rescheduleQuestions,
} from "./redistribute";
import type { AdaptationContext, RedistributionCandidate, WeekPlan } from "./types";
import type { Verdict } from "./judgement";

const week: WeekPlan = {
  index: 4, isDeload: false,
  muscleVolume: { CHEST: 14 } as WeekPlan["muscleVolume"],
  sessions: [],
};

const ctx = {
  targets: [{ muscle: "CHEST", weeklySetTarget: 16, priority: 1, mev: 8, mav: 14, effectiveMrv: 20 }],
  splitType: "UPPER_LOWER", daysPerWeek: 4, sessionLengthCapMin: 75,
  blockLengthWeeks: 6, deloadWeekIndex: 6, isBeginner: false, library: [],
} as unknown as AdaptationContext;

const cand = (kind: RedistributionCandidate["kind"], recommended: boolean): RedistributionCandidate => ({
  kind, week, tradeoff: { recovered: kind === "LET_GO" ? 0 : 6, dropped: kind === "LET_GO" ? 6 : 0 },
  recommended, facts: [],
});

const candidates = [cand("MAKE_UP", true), cand("LET_GO", false)];

describe("rescheduleQuestions", () => {
  it("offers only the candidates that exist", () => {
    const req = rescheduleQuestions(candidates, week, ctx, []);
    const pick = req.questions.find((q) => q.id === RESCHEDULE_PICK_ID)!;
    expect(pick.kind).toBe("choice");
    expect(Object.keys((pick as { options: Record<string, unknown> }).options).sort()).toEqual(["LET_GO", "MAKE_UP"]);
  });

  it("batches the recorded-only questions into the same request", () => {
    const req = rescheduleQuestions(candidates, week, ctx, []);
    expect(req.questions.map((q) => q.id).sort()).toEqual([
      "overreaching", RESCHEDULE_PICK_ID, "volume_loss_materiality",
    ].sort());
  });

  it("projects derived labels and no raw landmark numbers", () => {
    const req = rescheduleQuestions(candidates, week, ctx, []);
    const json = JSON.stringify(req.state);
    expect(json).toContain("at or above MAV");
    expect(json).toContain("late");
    // The model must never be handed landmarks to compare.
    expect(json).not.toContain('"mev"');
    expect(json).not.toContain('"effectiveMrv"');
  });

  it("names the subject inside the instructions, since ids are not sent", () => {
    const req = rescheduleQuestions(candidates, week, ctx, []);
    for (const q of req.questions) expect(q.instructions.length).toBeGreaterThan(20);
  });
});

describe("applyRescheduleVerdicts", () => {
  const confident = (choice: string, probabilities: Record<string, number>): Verdict => ({
    id: RESCHEDULE_PICK_ID, kind: "choice", choice, confidence: 0.9, probabilities,
  });

  it("is identity on an empty verdict list", () => {
    expect(applyRescheduleVerdicts(candidates, [])).toEqual(candidates);
  });

  it("moves the recommendation and records a judged fact", () => {
    const out = applyRescheduleVerdicts(candidates, [confident("LET_GO", { LET_GO: 0.9, MAKE_UP: 0.1 })]);
    expect(out.find((c) => c.kind === "LET_GO")!.recommended).toBe(true);
    expect(out.find((c) => c.kind === "MAKE_UP")!.recommended).toBe(false);
    const fact = out.find((c) => c.kind === "LET_GO")!.facts.find((f) => f.kind === "judged");
    expect(fact).toMatchObject({
      kind: "judged", subject: "reschedule", selected: "LET_GO", deterministic: "MAKE_UP",
      basis: { kind: "confidence", value: 0.9 },
    });
  });

  it("adds a close_call fact when the top two are near-tied", () => {
    const out = applyRescheduleVerdicts(candidates, [
      { id: RESCHEDULE_PICK_ID, kind: "choice", choice: "LET_GO", confidence: 0.61, probabilities: { LET_GO: 0.5, MAKE_UP: 0.45 } },
    ]);
    expect(out.find((c) => c.kind === "LET_GO")!.facts.some((f) => f.kind === "close_call")).toBe(true);
  });

  it("ignores a verdict for an option that was never offered", () => {
    expect(applyRescheduleVerdicts(candidates, [confident("PARTIAL", { PARTIAL: 1 })])).toEqual(candidates);
  });

  it("ignores an under-confident verdict", () => {
    const out = applyRescheduleVerdicts(candidates, [
      { id: RESCHEDULE_PICK_ID, kind: "choice", choice: "LET_GO", confidence: 0.3, probabilities: { LET_GO: 0.3 } },
    ]);
    expect(out).toEqual(candidates);
  });

  it("LAW 1: never changes a single number, for arbitrary verdicts", () => {
    const arbVerdict = fc.record({
      id: fc.constantFrom(RESCHEDULE_PICK_ID, "overreaching", "junk"),
      kind: fc.constant("choice" as const),
      choice: fc.constantFrom("MAKE_UP", "LET_GO", "PARTIAL", "", "???"),
      confidence: fc.double({ noNaN: false }),
      probabilities: fc.dictionary(fc.string(), fc.double({ noNaN: false })),
    });
    fc.assert(
      fc.property(fc.array(arbVerdict, { maxLength: 4 }), (verdicts) => {
        const out = applyRescheduleVerdicts(candidates, verdicts as unknown as Verdict[]);
        expect(out).toHaveLength(candidates.length);
        for (let i = 0; i < out.length; i++) {
          expect(out[i]!.kind).toBe(candidates[i]!.kind);
          expect(out[i]!.tradeoff).toEqual(candidates[i]!.tradeoff);
          expect(out[i]!.week.muscleVolume).toEqual(candidates[i]!.week.muscleVolume);
        }
        // Exactly one recommendation survives.
        expect(out.filter((c) => c.recommended)).toHaveLength(1);
      }),
      { numRuns: 300 },
    );
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run src/engine/reschedule-judgement.test.ts`
Expected: FAIL — `RESCHEDULE_PICK_ID` is not exported from `./redistribute`.

- [ ] **Step 3: Append to `src/engine/redistribute.ts`**

Adjust the **existing** import block rather than adding duplicate imports from the same modules:

- extend the existing `./constants` import (currently `PER_SET_MIN, SETUP_MIN`) to also pull `MRV_PROXIMITY_SETS, TREND_FLAT_BAND`
- extend the existing `./types` type-import (currently `AdaptationContext, PrescriptionPlan, RedistributionCandidate, RedistributionKind, SessionPlan, WeekPlan`) to also pull `ResolvedMuscleTarget`
- `DecisionFact` is already imported from `./facts` — leave it
- add these two new imports:

```ts
import {
  choiceCloseCall,
  isUsableChoice,
  trendOf,
  verdictById,
  type JudgementRequest,
  type Verdict,
} from "./judgement";
import type { ReadinessSample } from "./readiness";
```

Then append to the end of the file:

```ts
export const RESCHEDULE_PICK_ID = "reschedule_pick";

type VolumeStanding = "below MEV" | "between MEV and MAV" | "at or above MAV" | "at MRV ceiling";

/** Resolve the athlete's position against their own landmarks to a LABEL. jev-1.13
 * cannot reliably compare numbers, so every threshold comparison happens here. */
function volumeStanding(sets: number, t: ResolvedMuscleTarget): VolumeStanding {
  if (sets >= t.effectiveMrv - MRV_PROXIMITY_SETS) return "at MRV ceiling";
  if (sets >= t.mav) return "at or above MAV";
  if (sets >= t.mev) return "between MEV and MAV";
  return "below MEV";
}

function blockPhase(weekIndex: number, blockLengthWeeks: number): "early" | "mid" | "late" {
  const frac = weekIndex / Math.max(1, blockLengthWeeks);
  if (frac <= 1 / 3) return "early";
  if (frac <= 2 / 3) return "mid";
  return "late";
}

/**
 * The questions worth asking about a missed session, as data. The engine owns WHAT is
 * asked (it is domain knowledge); the server layer owns the asking.
 *
 * Only `reschedule_pick` influences anything this cycle; the other two are recorded for
 * calibration and cost almost nothing because they ride the same request.
 */
export function rescheduleQuestions(
  candidates: RedistributionCandidate[],
  week: WeekPlan,
  ctx: AdaptationContext,
  readiness: ReadinessSample[],
): JudgementRequest {
  const options: Record<string, string | null> = {};
  for (const c of candidates) {
    options[c.kind] =
      c.kind === "MAKE_UP"
        ? "Move every missed set into the remaining sessions this week."
        : c.kind === "PARTIAL"
          ? "Recover only the sets for muscles the athlete has prioritised; drop the rest."
          : "Recover nothing; accept the lost sets and keep the rest of the week as planned.";
  }

  const state = {
    blockPhase: blockPhase(week.index, ctx.blockLengthWeeks),
    week: { index: week.index, isDeload: week.isDeload },
    muscles: ctx.targets.map((t) => ({
      name: t.muscle,
      volumeStanding: volumeStanding(week.muscleVolume[t.muscle] ?? 0, t),
      prioritised: t.priority > 0,
    })),
    candidates: candidates.map((c) => ({
      option: c.kind,
      setsRecovered: c.tradeoff.recovered,
      setsDropped: c.tradeoff.dropped,
    })),
    readiness: { formTrend: trendOf(readiness.map((r) => r.form), TREND_FLAT_BAND) },
  };

  return {
    subject: "reschedule",
    state,
    questions: [
      {
        id: RESCHEDULE_PICK_ID,
        kind: "choice",
        authority: "ADVISORY",
        instructions:
          "A strength athlete missed a training session this week. Each option in `candidates` is a complete, already-costed plan for the rest of the week, with the sets it recovers and the sets it gives up. Using `muscles` for how much work each muscle has already taken, `blockPhase` for how far into the training block they are, and `readiness.formTrend` for whether they are freshening or fatiguing, which option serves this athlete best?",
        options,
      },
      {
        id: "overreaching",
        kind: "noul",
        authority: "ADVISORY",
        instructions:
          "Considering `muscles` and `readiness.formTrend` together, is this athlete accumulating more fatigue than they are recovering from?",
        criteria: {
          true: "Fatigue is outpacing recovery; adding work would dig the hole deeper.",
          false: "They are absorbing the current workload.",
        },
      },
      {
        id: "volume_loss_materiality",
        kind: "score",
        authority: "ADVISORY",
        instructions:
          "If the missed sets in `candidates` are not recovered at all, how much does that cost this athlete's training for the week?",
        levels: [
          "Nothing meaningful — every muscle still gets enough work to make progress.",
          "Slight — a little progress is left on the table, but nothing is undertrained.",
          "Meaningful — a muscle the athlete has prioritised loses real stimulus.",
          "Serious — one or more muscles drop below the minimum that maintains progress.",
        ],
      },
    ],
  };
}

/**
 * ADVISORY applier. May move `recommended` and append facts — nothing else. Every set
 * count and every muscle volume is passed through untouched, which the Law 1 property
 * in `reschedule-judgement.test.ts` asserts for arbitrary verdicts.
 */
export function applyRescheduleVerdicts(
  candidates: RedistributionCandidate[],
  verdicts: Verdict[],
): RedistributionCandidate[] {
  if (verdicts.length === 0) return candidates;
  const offered = candidates.map((c) => c.kind);
  const v = verdictById(verdicts, RESCHEDULE_PICK_ID);
  if (!isUsableChoice(v, offered)) return candidates;

  const deterministic = candidates.find((c) => c.recommended)?.kind ?? offered[0]!;
  const facts: DecisionFact[] = [
    {
      kind: "judged",
      subject: "reschedule",
      questionId: RESCHEDULE_PICK_ID,
      selected: v.choice,
      deterministic,
      basis: { kind: "confidence", value: v.confidence },
    },
  ];
  const close = choiceCloseCall(v);
  if (close) {
    facts.push({
      kind: "close_call",
      subject: "reschedule",
      questionId: RESCHEDULE_PICK_ID,
      between: close.between,
      margin: close.margin,
    });
  }

  return candidates.map((c) =>
    c.kind === v.choice
      ? { ...c, recommended: true, facts: [...c.facts, ...facts] }
      : { ...c, recommended: false },
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm vitest run src/engine/reschedule-judgement.test.ts`
Expected: PASS, including the 300-run Law 1 property.

- [ ] **Step 5: Export from `src/engine/index.ts`**

Extend the existing `redistribute` export line:

```ts
export { redistributeWeek, rescheduleQuestions, applyRescheduleVerdicts, RESCHEDULE_PICK_ID } from "./redistribute";
```

- [ ] **Step 6: Verify nothing deterministic moved**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS, and `git diff --stat src/engine/__snapshots__/` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/engine/redistribute.ts src/engine/reschedule-judgement.test.ts src/engine/index.ts
git commit -m "feat(engine): reschedule judgement questions + advisory applier"
```

---

### Task 7: Seam 1 — wire it through the session router and dialog

**Files:**
- Create: `src/server/mesocycle/readiness-samples.ts`
- Modify: `src/server/api/routers/session.ts:171-195` (`computeCandidates` returns its context) and `src/server/api/routers/session.ts:100-110` (`getRescheduleOptions`)
- Modify: `src/server/api/routers/readiness.ts:10-46` (reuse the new helper)
- Modify: `src/views/reschedule.ts` (add `closeCall` to `RescheduleOptionView`)
- Modify: `src/views/reschedule.test.ts` (cover the new field)
- Modify: `src/components/block/reschedule-dialog.tsx:121` (render the hint)

**Interfaces:**
- Consumes: `rescheduleQuestions`, `applyRescheduleVerdicts` (Task 6); `executeJudgement` (Task 5).
- Produces: `readinessSamplesFrom(block): ReadinessSample[]`; `BLOCK_FOR_READINESS_SELECT`; `RescheduleOptionView.closeCall?: boolean`.

- [ ] **Step 1: Extract the readiness pipeline** — create `src/server/mesocycle/readiness-samples.ts`

Three call sites now need blended readiness samples, so the pipeline currently inlined in `readinessRouter` moves here.

```ts
// src/server/mesocycle/readiness-samples.ts
import "server-only";
import { blendRecovery, computeReadiness, type ReadinessSample } from "~/engine";
import { readinessInputsFromBlock } from "./readiness-inputs";
import { recoveryByWeekFromBlock } from "./recovery-by-week";

/** The select the readiness pipeline needs. Exported so callers fetch exactly this. */
export const BLOCK_FOR_READINESS_SELECT = {
  startDate: true,
  lengthWeeks: true,
  weeks: {
    select: {
      index: true,
      sessions: {
        select: {
          status: true,
          completedAt: true,
          prescriptions: { select: { setLogs: { select: { achievedRir: true } } } },
        },
      },
      checkIns: {
        where: { scope: "WEEK" as const },
        select: { scope: true, muscleFeedback: { select: { recovery: true } } },
      },
    },
  },
} as const;

type BlockForReadiness = Parameters<typeof readinessInputsFromBlock>[0] &
  Parameters<typeof recoveryByWeekFromBlock>[0];

/** Blended Fitness/Fatigue/Form samples, or [] when there is not enough logged data.
 * Pure given the block; all I/O stays with the caller. */
export function readinessSamplesFrom(block: BlockForReadiness): ReadinessSample[] {
  const inputs = readinessInputsFromBlock(block);
  if (!inputs) return [];
  const samples = computeReadiness(inputs.events, inputs.weekEnds);
  return blendRecovery(samples, recoveryByWeekFromBlock(block));
}
```

- [ ] **Step 2: Use it in `readinessRouter`** — replace lines 41-45 of `src/server/api/routers/readiness.ts`

```ts
    const blended = readinessSamplesFrom(block);
    if (blended.length === 0) return { series: [], currentWeekIndex: curIdx };
    return toReadinessView(blended, curIdx);
```

Add `import { readinessSamplesFrom } from "~/server/mesocycle/readiness-samples";` and drop the now-unused `computeReadiness`, `blendRecovery`, `readinessInputsFromBlock`, `recoveryByWeekFromBlock` imports.

- [ ] **Step 3: Run the existing suite to prove the refactor is behaviour-preserving**

Run: `pnpm test && pnpm typecheck`
Expected: PASS with no test changes. This step exists to separate the refactor from the feature — if something fails here it is the extraction, not Jev.

- [ ] **Step 4: Commit the refactor on its own**

```bash
git add src/server/mesocycle/readiness-samples.ts src/server/api/routers/readiness.ts
git commit -m "refactor(readiness): extract the blended-samples pipeline for reuse"
```

- [ ] **Step 5: Write the failing view test** — add to `src/views/reschedule.test.ts`

```ts
it("surfaces a close call from the candidate's facts", () => {
  const candidates = [
    {
      kind: "MAKE_UP" as const,
      week: { index: 2, isDeload: false, muscleVolume: {} as never, sessions: [] },
      tradeoff: { recovered: 4, dropped: 0 },
      recommended: true,
      facts: [
        {
          kind: "close_call" as const, subject: "reschedule", questionId: "reschedule_pick",
          between: ["MAKE_UP", "LET_GO"] as [string, string], margin: 0.04,
        },
      ],
    },
  ];
  const views = toRescheduleOptionViews(candidates, { index: 2, isDeload: false, muscleVolume: {} as never, sessions: [] });
  expect(views[0]!.closeCall).toBe(true);
});

it("leaves closeCall undefined when the pick was clear", () => {
  const candidates = [
    {
      kind: "LET_GO" as const,
      week: { index: 2, isDeload: false, muscleVolume: {} as never, sessions: [] },
      tradeoff: { recovered: 0, dropped: 4 },
      recommended: true,
      facts: [],
    },
  ];
  const views = toRescheduleOptionViews(candidates, { index: 2, isDeload: false, muscleVolume: {} as never, sessions: [] });
  expect(views[0]!.closeCall).toBeUndefined();
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `pnpm vitest run src/views/reschedule.test.ts`
Expected: FAIL — `closeCall` does not exist on `RescheduleOptionView`.

- [ ] **Step 7: Add the field** in `src/views/reschedule.ts`

Add to the interface:

```ts
  /** The judgement reported the top two options as near-tied. Undefined when the pick
   * was clear or unjudged — never `false`, so the UI renders nothing by default. */
  closeCall?: boolean;
```

And inside the `candidates.map(...)` object literal:

```ts
    closeCall: c.facts.some((f) => f.kind === "close_call") ? true : undefined,
```

- [ ] **Step 8: Run the test to confirm it passes**

Run: `pnpm vitest run src/views/reschedule.test.ts`
Expected: PASS.

- [ ] **Step 9: Return the context from `computeCandidates`**

In `src/server/api/routers/session.ts`, change the final return of `computeCandidates` (currently `return { forRedistribute, candidates };`) to:

```ts
  return { forRedistribute, candidates, ctx: ctxA };
```

- [ ] **Step 10: Thread the judgement through `getRescheduleOptions`**

Replace the body of the `.query(...)` at `src/server/api/routers/session.ts:102-110` with:

```ts
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const session = await loadRescheduleContext(ctx.db, userId, input.sessionId);
      if (session.status !== "SCHEDULED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only a scheduled session can be rescheduled." });
      }
      const { forRedistribute, candidates, ctx: adaptCtx } = await computeCandidates(ctx.db, session);

      // The engine's deterministic pick is already set on `candidates` and stands
      // unless a confident verdict says otherwise. Jev failing is a no-op.
      const block = await ctx.db.mesocycle.findUniqueOrThrow({
        where: { id: session.week.mesocycleId },
        select: BLOCK_FOR_READINESS_SELECT,
      });
      const request = rescheduleQuestions(candidates, forRedistribute, adaptCtx, readinessSamplesFrom(block));
      const verdicts = await executeJudgement({
        db: ctx.db,
        mesocycleId: session.week.mesocycleId,
        request,
        fallback: { recommended: candidates.find((c) => c.recommended)?.kind ?? null },
      });
      return toRescheduleOptionViews(applyRescheduleVerdicts(candidates, verdicts), forRedistribute);
    }),
```

Add the imports at the top of the file:

```ts
import { applyRescheduleVerdicts, rescheduleQuestions } from "~/engine";
import { executeJudgement } from "~/server/judgement/execute";
import { BLOCK_FOR_READINESS_SELECT, readinessSamplesFrom } from "~/server/mesocycle/readiness-samples";
```

`applyReschedule` (the mutation) deliberately keeps using the **unjudged** `candidates`: it selects by the `kind` the athlete explicitly chose, so the recommendation never enters that path.

- [ ] **Step 11: Render the hint** in `src/components/block/reschedule-dialog.tsx`

At `src/components/block/reschedule-dialog.tsx:121` the option label is rendered. Immediately after that label element, add:

```tsx
                  {o.closeCall ? (
                    <span className="ml-2 text-caption text-fg-muted">Close call</span>
                  ) : null}
```

Muted text only — no new accent colour, no badge, per the flat/accent-scarce doctrine in `DESIGN.md`. The athlete never sees that a model was involved; Mesodapt has one coach voice.

- [ ] **Step 12: Verify end to end**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS. Then start the app and open a week with a scheduled session, click through to the reschedule dialog, and confirm a recommendation still renders **with no `TYPESAFE_API_KEY`** set:

```bash
TYPESAFE_API_KEY= pnpm dev
```

- [ ] **Step 13: Commit**

```bash
git add src/views/reschedule.ts src/views/reschedule.test.ts src/server/api/routers/session.ts src/components/block/reschedule-dialog.tsx
git commit -m "feat(reschedule): judged recommendation with close-call hint"
```

---

### Task 8: Seam 2 — progression questions and applier (pure)

**Files:**
- Modify: `src/engine/step-week.ts` (append exports; leave `stepWeek`'s cascade at `src/engine/step-week.ts:52-79` untouched)
- Create: `src/engine/progression-judgement.test.ts`
- Modify: `src/engine/index.ts`

**Interfaces:**
- Consumes: Task 1 helpers; `WeekAdjustment`, `MuscleAdjustment`, `AdaptationContext`, `CheckInFeedback`, `ReadinessSample`.
- Produces: `progressionNoulId(muscle): string`; `progressionQuestions(adj, ctx, feedback, readiness, recoveryByWeek)`; `applyProgressionVerdicts(adj, ctx, verdicts)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/progression-judgement.test.ts
import { describe, expect, it } from "vitest";
import { applyProgressionVerdicts, progressionNoulId, progressionQuestions } from "./step-week";
import { STEP_UP } from "./constants";
import type { AdaptationContext, WeekAdjustment } from "./types";
import type { CheckInFeedback } from "./types";
import type { Verdict } from "./judgement";

const ctx = {
  targets: [
    { muscle: "CHEST", weeklySetTarget: 16, priority: 1, mev: 8, mav: 14, effectiveMrv: 20 },
    { muscle: "BICEPS", weeklySetTarget: 12, priority: 0, mev: 6, mav: 10, effectiveMrv: 16 },
  ],
  splitType: "UPPER_LOWER", daysPerWeek: 4, sessionLengthCapMin: 75,
  blockLengthWeeks: 6, deloadWeekIndex: 6, isBeginner: false, library: [],
} as unknown as AdaptationContext;

const feedback: CheckInFeedback = {
  weekIndex: 3,
  muscles: [
    { muscle: "CHEST", recovery: 3, joint: 0, performance: 3 },
    { muscle: "BICEPS", recovery: 0, joint: 3, performance: 1 },
  ],
};

const adj: WeekAdjustment = {
  fromWeekIndex: 3, appliesToWeekIndex: 4, checkInValue: "low", facts: [],
  adjustments: [
    { muscle: "CHEST", plannedSets: 12, adjustedSets: 12, delta: 0, cause: "on_track", swapCandidate: false },
    { muscle: "BICEPS", plannedSets: 10, adjustedSets: 8, delta: -2, cause: "joint_stress", swapCandidate: true },
  ],
};

describe("progressionQuestions", () => {
  it("asks only about muscles in the ambiguous middle", () => {
    const req = progressionQuestions(adj, ctx, feedback, [], new Map());
    expect(req.questions.map((q) => q.id)).toEqual([progressionNoulId("CHEST")]);
  });

  it("never asks about a safety-preempted muscle", () => {
    const req = progressionQuestions(adj, ctx, feedback, [], new Map());
    expect(req.questions.some((q) => q.id.includes("BICEPS"))).toBe(false);
  });

  it("uses a noul, not a two-option choice", () => {
    const req = progressionQuestions(adj, ctx, feedback, [], new Map());
    expect(req.questions[0]!.kind).toBe("noul");
    expect(req.questions[0]!.authority).toBe("PROPOSAL");
  });

  it("names the muscle in the instructions, since ids are not sent to the model", () => {
    const req = progressionQuestions(adj, ctx, feedback, [], new Map());
    expect(req.questions[0]!.instructions).toContain("CHEST");
    expect(req.questions[0]!.instructions).toContain("muscles.CHEST");
  });

  it("projects labels, not landmark numbers", () => {
    const req = progressionQuestions(adj, ctx, feedback, [], new Map());
    const json = JSON.stringify(req.state);
    expect(json).toContain("headroomToCeiling");
    expect(json).not.toContain('"effectiveMrv"');
    expect(json).not.toContain('"mav"');
  });

  it("asks nothing when no muscle is ambiguous", () => {
    const allGuarded: WeekAdjustment = {
      ...adj,
      adjustments: [{ ...adj.adjustments[1]!, muscle: "BICEPS" }],
    };
    expect(progressionQuestions(allGuarded, ctx, feedback, [], new Map()).questions).toHaveLength(0);
  });
});

describe("applyProgressionVerdicts", () => {
  const noul = (muscle: string, n: number): Verdict => ({ id: progressionNoulId(muscle), kind: "noul", noul: n });

  it("is identity on an empty verdict list", () => {
    expect(applyProgressionVerdicts(adj, ctx, [])).toEqual(adj);
  });

  it("steps up and relabels when the noul clears the gate", () => {
    const out = applyProgressionVerdicts(adj, ctx, [noul("CHEST", 0.9)]);
    const chest = out.adjustments.find((a) => a.muscle === "CHEST")!;
    expect(chest.cause).toBe("responding_well");
    expect(chest.adjustedSets).toBe(12 + STEP_UP);
    expect(chest.delta).toBe(STEP_UP);
    expect(out.facts.some((f) => f.kind === "judged")).toBe(true);
  });

  it("leaves the engine's on_track standing below the gate", () => {
    const out = applyProgressionVerdicts(adj, ctx, [noul("CHEST", 0.4)]);
    expect(out.adjustments.find((a) => a.muscle === "CHEST")!.cause).toBe("on_track");
    expect(out.adjustments.find((a) => a.muscle === "CHEST")!.adjustedSets).toBe(12);
  });

  it("records a close_call near the midpoint", () => {
    const out = applyProgressionVerdicts(adj, ctx, [noul("CHEST", 0.52)]);
    expect(out.facts.some((f) => f.kind === "close_call")).toBe(true);
  });

  it("SAFETY: never touches a preempted muscle, whatever the verdict says", () => {
    for (const n of [0.99, 0.5, 0, NaN, -1, 2]) {
      const out = applyProgressionVerdicts(adj, ctx, [noul("BICEPS", n)]);
      const biceps = out.adjustments.find((a) => a.muscle === "BICEPS")!;
      expect(biceps.cause).toBe("joint_stress");
      expect(biceps.adjustedSets).toBe(8);
    }
  });

  it("CLAMP: never exceeds effectiveMrv", () => {
    const atCeiling: WeekAdjustment = {
      ...adj,
      adjustments: [{ muscle: "CHEST", plannedSets: 20, adjustedSets: 20, delta: 0, cause: "on_track", swapCandidate: false }],
    };
    const out = applyProgressionVerdicts(atCeiling, ctx, [noul("CHEST", 0.95)]);
    expect(out.adjustments[0]!.adjustedSets).toBe(20);
  });

  it("never throws on garbage verdicts", () => {
    const junk = [
      { id: progressionNoulId("CHEST"), kind: "choice", choice: "x", confidence: NaN, probabilities: {} },
      { id: "unknown", kind: "noul", noul: 0.9 },
    ] as unknown as Verdict[];
    expect(() => applyProgressionVerdicts(adj, ctx, junk)).not.toThrow();
    expect(applyProgressionVerdicts(adj, ctx, junk).adjustments[0]!.cause).toBe("on_track");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run src/engine/progression-judgement.test.ts`
Expected: FAIL — `progressionNoulId` is not exported.

- [ ] **Step 3: Append to `src/engine/step-week.ts`**

Adjust the **existing** imports rather than duplicating them:

- extend the existing `./constants` import to also pull `MRV_PROXIMITY_SETS, TREND_FLAT_BAND` (`STEP_UP` is already there)
- the existing `./types` type-import already has `AdaptationContext, CheckInFeedback, MuscleAdjustment, StepCause, WeekAdjustment` — extend it with `ResolvedMuscleTarget`
- `DecisionFact` is already imported from `./facts` — leave it
- add these two new imports:

```ts
import {
  isUsableNoulProposal,
  noulCloseCall,
  trendOf,
  verdictById,
  type JudgementQuestion,
  type JudgementRequest,
  type Verdict,
} from "./judgement";
import type { ReadinessSample } from "./readiness";
```

Then append to the end of the file:

```ts
export function progressionNoulId(muscle: string): string {
  return `responds_well_${muscle}`;
}

/** Jev is consulted ONLY here: the residue left after the safety floors and the numeric
 * proximity test have had their say. `joint_stress` and `under_recovered` are clinical
 * guards; `approaching_mrv` is arithmetic jev-1.13 cannot do; `default_progression` is
 * structural. All four stand un-overridably. */
function isAmbiguous(a: MuscleAdjustment): boolean {
  return a.cause === "responding_well" || a.cause === "on_track";
}

function headroom(a: MuscleAdjustment, t: ResolvedMuscleTarget): "none" | "small" | "ample" {
  const gap = t.effectiveMrv - a.plannedSets;
  if (gap <= 0) return "none";
  if (gap <= MRV_PROXIMITY_SETS) return "small";
  return "ample";
}

const RECOVERY_WORDS = ["0 — still wrecked", "1 — sore and sluggish", "2 — recovered well", "3 — fully fresh"];
const JOINT_WORDS = ["0 — no joint complaints", "1 — mild niggle", "2 — painful", "3 — very painful"];
const PERF_WORDS = ["0 — regressed", "1 — flat", "2 — progressing", "3 — strong progression"];

function word(table: string[], level: number | undefined): string {
  if (level === undefined || !Number.isInteger(level) || level < 0 || level >= table.length) return "not reported";
  return table[level]!;
}

/**
 * One noul per ambiguous muscle, over one shared state. Ordinal check-in levels are
 * spelled out in words because the model reads them as text, not as ordered quantities.
 */
export function progressionQuestions(
  adj: WeekAdjustment,
  ctx: AdaptationContext,
  feedback: CheckInFeedback | null,
  readiness: ReadinessSample[],
  recoveryByWeek: ReadonlyMap<number, number | null>,
): JudgementRequest {
  const targetByMuscle = new Map(ctx.targets.map((t) => [t.muscle, t]));
  const fbByMuscle = new Map((feedback?.muscles ?? []).map((m) => [m.muscle, m]));
  const ambiguous = adj.adjustments.filter(isAmbiguous);

  const muscles: Record<string, unknown> = {};
  for (const a of adj.adjustments) {
    const t = targetByMuscle.get(a.muscle);
    const fb = fbByMuscle.get(a.muscle);
    muscles[a.muscle] = {
      headroomToCeiling: t ? headroom(a, t) : "unknown",
      recovery: word(RECOVERY_WORDS, fb?.recovery),
      jointStress: word(JOINT_WORDS, fb?.joint),
      performance: word(PERF_WORDS, fb?.performance),
    };
  }

  const recoverySeries = [...recoveryByWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v)
    .filter((v): v is number => v !== null);

  const state = {
    block: {
      weeksRemaining: Math.max(0, ctx.blockLengthWeeks - adj.appliesToWeekIndex + 1),
      upcomingWeekIndex: adj.appliesToWeekIndex,
    },
    muscles,
    readiness: {
      formTrend: trendOf(readiness.map((r) => r.form), TREND_FLAT_BAND),
      recoveryTrend: trendOf(recoverySeries, TREND_FLAT_BAND),
    },
  };

  const questions: JudgementQuestion[] = ambiguous.map((a) => ({
    id: progressionNoulId(a.muscle),
    kind: "noul",
    authority: "PROPOSAL",
    instructions:
      `A strength athlete just finished a training week. For ${a.muscle} specifically, read ` +
      `\`muscles.${a.muscle}\` for how recovered that muscle was, whether the joints involved ` +
      `complained, how performance moved, and how much room is left before their ceiling; and ` +
      `\`readiness\` for whether they are freshening or fatiguing overall. Does ${a.muscle} ` +
      `justify adding training volume next week?`,
    criteria: {
      true: `${a.muscle} recovered and performed well enough that more volume should drive further progress.`,
      false: `Hold ${a.muscle} where it is — more volume would not be productive yet.`,
    },
  }));

  return { subject: "progression", state, questions };
}

/**
 * PROPOSAL applier. A cleared noul relabels the cause `responding_well`; the ENGINE then
 * computes the delta from its own STEP_UP constant and clamps to the athlete's landmarks.
 * Jev never names a set count. Preempted muscles are untouchable by construction: they
 * were never asked about, and `isAmbiguous` gates the write too.
 */
export function applyProgressionVerdicts(
  adj: WeekAdjustment,
  ctx: AdaptationContext,
  verdicts: Verdict[],
): WeekAdjustment {
  if (verdicts.length === 0) return adj;
  const targetByMuscle = new Map(ctx.targets.map((t) => [t.muscle, t]));
  const facts: DecisionFact[] = [];

  const adjustments = adj.adjustments.map((a) => {
    if (!isAmbiguous(a)) return a;
    const v = verdictById(verdicts, progressionNoulId(a.muscle));
    if (!isUsableNoulProposal(v)) {
      if (v !== undefined && v.kind === "noul" && noulCloseCall(v.noul)) {
        facts.push({
          kind: "close_call", subject: "progression", questionId: progressionNoulId(a.muscle),
          between: ["responding_well", "on_track"], margin: Math.round(Math.abs(v.noul - 0.5) * 100) / 100,
        });
      }
      return a;
    }

    const t = targetByMuscle.get(a.muscle);
    let adjusted = a.plannedSets + STEP_UP;
    if (t) {
      if (adjusted > t.effectiveMrv) adjusted = t.effectiveMrv;
      if (adjusted < t.mev) adjusted = t.mev;
    }

    facts.push({
      kind: "judged", subject: "progression", questionId: progressionNoulId(a.muscle),
      selected: "responding_well", deterministic: a.cause,
      basis: { kind: "noul", value: v.noul },
    });
    if (noulCloseCall(v.noul)) {
      facts.push({
        kind: "close_call", subject: "progression", questionId: progressionNoulId(a.muscle),
        between: ["responding_well", "on_track"], margin: Math.round(Math.abs(v.noul - 0.5) * 100) / 100,
      });
    }

    return { ...a, cause: "responding_well" as const, adjustedSets: adjusted, delta: adjusted - a.plannedSets };
  });

  return { ...adj, adjustments, facts: [...adj.facts, ...facts] };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm vitest run src/engine/progression-judgement.test.ts`
Expected: PASS, all cases including the safety and clamp assertions.

- [ ] **Step 5: Export from `src/engine/index.ts`**

```ts
export { stepWeek, progressionQuestions, applyProgressionVerdicts, progressionNoulId } from "./step-week";
```

- [ ] **Step 6: Verify**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS, snapshot unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/engine/step-week.ts src/engine/progression-judgement.test.ts src/engine/index.ts
git commit -m "feat(engine): progression noul questions + accept-gated applier"
```

---

### Task 9: Seam 2 — wire submit and apply, with replay

The correctness-critical task. `submitWeeklyCheckIn` creates the proposal the athlete sees; `applyProgression` **recomputes** it and writes the result to the plan. Both must see the same verdicts or the athlete accepts one thing and gets another.

**Files:**
- Modify: `src/server/api/routers/checkin.ts:126-154` (`computeProposal` takes verdicts), `:307` (submit), `:363` (apply)
- Modify: `src/views/progression.ts` (add `closeCall`)
- Modify: `src/views/progression.test.ts`
- Modify: `src/views/types.ts` (`ProgressionProposalView`)
- Modify: `src/components/checkin/progression-proposal-dialog.tsx`

**Interfaces:**
- Consumes: `progressionQuestions`, `applyProgressionVerdicts` (Task 8); `executeJudgement` (Task 5); `readinessSamplesFrom`, `BLOCK_FOR_READINESS_SELECT` (Task 7).
- Produces: `computeProposal(ctxObjs, feedbackMuscles, verdicts)`; `ProgressionProposalView.closeCall?: boolean`.

- [ ] **Step 1: Give `computeProposal` a verdicts parameter**

Change its signature and the `stepWeek` line in `src/server/api/routers/checkin.ts`:

```ts
function computeProposal(
  ctxObjs: LoadedContext,
  feedbackMuscles: { muscle: MuscleGroup; recovery: number; joint: number }[],
  verdicts: Verdict[] = [],
) {
```

and replace `const adj = stepWeek(plan, week.index, feedback, ctx);` with:

```ts
  const base = stepWeek(plan, week.index, feedback, ctx);
  const adj = applyProgressionVerdicts(base, ctx, verdicts);
```

Defaulting to `[]` keeps every existing caller deterministic and makes `applyProgressionVerdicts` a no-op until verdicts are threaded in — so this step cannot change behaviour on its own.

Add imports:

```ts
import { applyProgressionVerdicts, progressionQuestions, type Verdict } from "~/engine";
import { executeJudgement } from "~/server/judgement/execute";
import { BLOCK_FOR_READINESS_SELECT, readinessSamplesFrom } from "~/server/mesocycle/readiness-samples";
import { recoveryByWeekFromBlock } from "~/server/mesocycle/recovery-by-week";
```

- [ ] **Step 2: Run the suite to confirm nothing changed**

Run: `pnpm test && pnpm typecheck`
Expected: PASS with no test edits.

- [ ] **Step 3: Add a shared helper for asking** — insert above `computeProposal` in the same file

```ts
/** Ask (or replay) the progression judgement for this week. Both submit and apply call
 * this, which is what keeps the proposal the athlete accepted identical to the plan that
 * gets written: the Judgement row is keyed by state + questions, so the second caller
 * replays the first caller's verdicts instead of asking again. */
async function progressionVerdicts(
  db: ProgressionDb,
  ctxObjs: LoadedContext,
  feedbackMuscles: { muscle: MuscleGroup; recovery: number; joint: number }[],
): Promise<Verdict[]> {
  const { mesocycle, week, cs, athlete } = ctxObjs;
  const ctx = adaptationContextFrom(cs, athlete);
  const perf = derivePerformance(toWeekForPerformance(week), ctx.targets, EXERCISE_LIBRARY);
  const feedback: CheckInFeedback = {
    weekIndex: week.index,
    muscles: feedbackMuscles.map((m) => ({
      muscle: m.muscle, recovery: m.recovery, joint: m.joint, performance: perf.get(m.muscle),
    })),
  };
  const plan = mesocyclePlanFromDb(mesocycle.weeks, cs.splitType);
  const base = stepWeek(plan, week.index, feedback, ctx);

  const block = await db.mesocycle.findUniqueOrThrow({
    where: { id: mesocycle.id },
    select: BLOCK_FOR_READINESS_SELECT,
  });
  const request = progressionQuestions(
    base, ctx, feedback, readinessSamplesFrom(block), recoveryByWeekFromBlock(block),
  );
  if (request.questions.length === 0) return [];

  return executeJudgement({
    db, mesocycleId: mesocycle.id, request,
    fallback: { causes: base.adjustments.map((a) => ({ muscle: a.muscle, cause: a.cause })) },
  });
}
```

Declare `ProgressionDb` immediately above the helper — the executor's `JudgementDb` widened with the one `mesocycle` read this function performs:

```ts
type ProgressionDb = Parameters<typeof executeJudgement>[0]["db"] & {
  mesocycle: {
    findUniqueOrThrow(args: {
      where: { id: string };
      select: typeof BLOCK_FOR_READINESS_SELECT;
    }): Promise<Parameters<typeof readinessSamplesFrom>[0]>;
  };
};
```

`ctx.db` satisfies this structurally, so call sites pass it unchanged.

- [ ] **Step 4: Thread into `submitWeeklyCheckIn`** — replace line 307

```ts
      const verdicts = await progressionVerdicts(ctx.db, loaded, input.muscles);
      const { adj, view } = computeProposal(loaded, input.muscles, verdicts);
```

- [ ] **Step 5: Thread into `applyProgression`** — replace line 363

```ts
      const verdicts = await progressionVerdicts(ctx.db, loaded, feedbackMuscles);
      const { adj, view, upcoming } = computeProposal(loaded, feedbackMuscles, verdicts);
```

This is the step that closes the divergence. `progressionVerdicts` hits the `Judgement` row written at submit time — same `mesocycleId`, same `subject`, same state, same questions — so it **replays** rather than asking, and the plan written here matches what the athlete accepted.

- [ ] **Step 6: Write the failing view test** — add to `src/views/progression.test.ts`

```ts
it("flags a close call from the adjustment's facts", () => {
  const withClose = {
    ...adj(),
    facts: [
      {
        kind: "close_call" as const, subject: "progression", questionId: "responds_well_CHEST",
        between: ["responding_well", "on_track"] as [string, string], margin: 0.02,
      },
    ],
  };
  const v = toProgressionProposalView(withClose, { hasUpcoming: true, upcomingIsDeload: false });
  expect(v.closeCall).toBe(true);
});

it("leaves closeCall undefined otherwise", () => {
  const v = toProgressionProposalView(adj(), { hasUpcoming: true, upcomingIsDeload: false });
  expect(v.closeCall).toBeUndefined();
});
```

- [ ] **Step 7: Run it to confirm it fails**

Run: `pnpm vitest run src/views/progression.test.ts`
Expected: FAIL — `closeCall` is not on `ProgressionProposalView`.

- [ ] **Step 8: Add the field**

In `src/views/types.ts`, add to `ProgressionProposalView`:

```ts
  /** At least one muscle's judgement was a near-tie. Undefined when clear or unjudged. */
  closeCall?: boolean;
```

In `src/views/progression.ts`, add to the returned object:

```ts
    closeCall: adj.facts.some((f) => f.kind === "close_call") ? true : undefined,
```

- [ ] **Step 9: Run the test to confirm it passes**

Run: `pnpm vitest run src/views/progression.test.ts`
Expected: PASS.

- [ ] **Step 10: Render the hint** in `src/components/checkin/progression-proposal-dialog.tsx`

Inside the `CHANGES` branch, below the heading built at `src/components/checkin/progression-proposal-dialog.tsx:100`, add:

```tsx
      {proposal.closeCall ? (
        <p className="mt-1 text-caption text-fg-muted">Some of these were close calls — adjust if they don’t match how you felt.</p>
      ) : null}
```

Warm register, matching current in-app copy. No provenance, no accent.

- [ ] **Step 11: Verify, including the no-key path**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

Then exercise the real flow twice and confirm the proposal is stable:

```bash
pnpm dev
```

Complete every session in a week, submit the weekly check-in, note the proposed set changes, reload, then accept. The applied changes must equal what was shown. Repeat with `TYPESAFE_API_KEY=` to confirm the deterministic path is identical to today's behaviour.

- [ ] **Step 12: Commit**

```bash
git add src/server/api/routers/checkin.ts src/views/progression.ts src/views/types.ts src/views/progression.test.ts src/components/checkin/progression-proposal-dialog.tsx
git commit -m "feat(checkin): judged progression proposals, replayed at accept time"
```

---

### Task 10: Contract test and replay fixtures

Everything so far runs against the fake. This proves the wire contract against the real service and captures fixtures so future tests exercise real payload shapes without a network.

**Files:**
- Create: `src/server/judgement/contract.test.ts`
- Create: `src/server/judgement/__fixtures__/reschedule-response.json`
- Create: `src/server/judgement/replay.ts`

**Interfaces:**
- Consumes: `jevClient`, `parseAnswers`, `toWireQuestions` (Task 4); `rescheduleQuestions` (Task 6).
- Produces: `replayClient(fixture): JudgementClient`.

- [ ] **Step 1: Write the contract test**

```ts
// src/server/judgement/contract.test.ts
import { describe, expect, it } from "vitest";
import { jevClient } from "./client";
import type { JudgementRequest } from "~/engine";

const request: JudgementRequest = {
  subject: "reschedule",
  state: {
    blockPhase: "late",
    muscles: [{ name: "CHEST", volumeStanding: "at MRV ceiling", prioritised: true }],
    candidates: [
      { option: "MAKE_UP", setsRecovered: 6, setsDropped: 0 },
      { option: "LET_GO", setsRecovered: 0, setsDropped: 6 },
    ],
    readiness: { formTrend: "falling" },
  },
  questions: [
    {
      id: "reschedule_pick", kind: "choice", authority: "ADVISORY",
      instructions:
        "A strength athlete missed a training session this week. Each option in `candidates` is a complete, already-costed plan for the rest of the week. Given `muscles`, `blockPhase` and `readiness.formTrend`, which option serves this athlete best?",
      options: {
        MAKE_UP: "Move every missed set into the remaining sessions this week.",
        LET_GO: "Recover nothing; accept the lost sets.",
      },
    },
    {
      id: "overreaching", kind: "noul", authority: "ADVISORY",
      instructions: "Considering `muscles` and `readiness.formTrend`, is this athlete accumulating more fatigue than they are recovering from?",
    },
  ],
};

// Runs only where a key exists. `pnpm test` must stay green without one.
describe.skipIf(!process.env.TYPESAFE_API_KEY)("Jev contract", () => {
  it("answers a real batched request in the shape we parse", async () => {
    const out = await jevClient().ask(request);
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.model).toContain("jev-1.13");
    const pick = out.verdicts.find((v) => v.id === "reschedule_pick");
    expect(pick?.kind).toBe("choice");
    if (pick?.kind === "choice") {
      expect(["MAKE_UP", "LET_GO"]).toContain(pick.choice);
      expect(pick.confidence).toBeGreaterThanOrEqual(0);
      expect(pick.confidence).toBeLessThanOrEqual(1);
    }

    const over = out.verdicts.find((v) => v.id === "overreaching");
    expect(over?.kind).toBe("noul");
    // Noul carries NO confidence — guards against a future refactor inventing one.
    expect(over && "confidence" in over).toBe(false);

    // Record the fixture for replay tests.
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync("src/server/judgement/__fixtures__", { recursive: true });
    writeFileSync(
      "src/server/judgement/__fixtures__/reschedule-response.json",
      JSON.stringify({ model: out.model, verdicts: out.verdicts }, null, 2) + "\n",
    );
  }, 20_000);
});
```

- [ ] **Step 2: Run it with the key present**

Run: `pnpm vitest run src/server/judgement/contract.test.ts`
Expected: PASS, and `src/server/judgement/__fixtures__/reschedule-response.json` now exists.

If it fails on the request shape (a 422 surfacing as `invalid_response`), the wire mapping in `toWireQuestions` is wrong — fix it there and re-run. Do **not** loosen the response zod schema to make a failure pass.

- [ ] **Step 3: Confirm it skips cleanly without a key**

Run: `TYPESAFE_API_KEY= pnpm vitest run src/server/judgement/contract.test.ts`
Expected: the suite is skipped, exit code 0.

- [ ] **Step 4: Create the replay adapter**

```ts
// src/server/judgement/replay.ts
import type { JudgementOutcome, JudgementRequest, Verdict } from "~/engine";
import type { JudgementClient } from "./client";

/** Plays a recorded real response. Lets integration tests run against genuine payload
 * shapes with no network and no key. */
export function replayClient(fixture: { model: string; verdicts: Verdict[] }): JudgementClient {
  return {
    ask(_request: JudgementRequest): Promise<JudgementOutcome> {
      return Promise.resolve({ ok: true, verdicts: fixture.verdicts, model: fixture.model });
    },
  };
}
```

- [ ] **Step 5: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS. Then confirm with no key: `TYPESAFE_API_KEY= pnpm test` — also PASS.

Finally confirm the deterministic path is untouched:

```bash
git diff freddy/experimental --stat -- src/engine/__snapshots__/
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/server/judgement/contract.test.ts src/server/judgement/replay.ts src/server/judgement/__fixtures__
git commit -m "test(judgement): real-service contract test + replay fixtures"
```

---

## Verification Summary

Before declaring the branch done, all of these must hold:

- [ ] `pnpm test` passes **with** `TYPESAFE_API_KEY` set
- [ ] `pnpm test` passes **without** `TYPESAFE_API_KEY` set
- [ ] `pnpm typecheck` and `pnpm lint` pass
- [ ] `src/engine/__snapshots__/generate.golden.test.ts.snap` is byte-identical to `freddy/experimental`
- [ ] `grep -rnE "\b(async|await|Promise)\b" src/engine/*.ts | grep -v test` prints nothing
- [ ] `grep -rn "1 - .*noul\|1 − .*noul" src/` prints nothing — `P(noul) ≠ 1 − P(not_noul)`, so no code may derive one noul from another's complement (spec §5.2)
- [ ] Reschedule dialog renders a recommendation with no key configured
- [ ] A weekly check-in proposal, once shown, applies exactly as shown — including after a reload

## Follow-ups this plan deliberately does not do

- **Foregrounding** — `overreaching` and `volume_loss_materiality` are recorded only (spec §9.5). Nothing renders them.
- **Threshold calibration** — all four thresholds are guesses. The `Judgement.fallback` column accumulates the agreement data; tuning is a later cycle with real rows.
- **Seam 3 (Coach)** — paper contract in spec §8, including its unresolved prompt-injection risk.
