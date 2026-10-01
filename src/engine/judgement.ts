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
 * name speaks for itself. Question ids are for code only: they ARE transmitted, as
 * the wire `questions` map's keys, but are never presented to the model as question
 * content — every question's full meaning must live in `instructions`. */
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

/** Non-sensitive diagnostic fields only — never the response body or headers, which
 * may carry the state we sent or credential material. Populated when the client has
 * something from the SDK's error to report beyond the collapsed `JudgementFailure`
 * bucket (several distinct SDK error shapes currently collapse to "invalid_response"). */
export interface JudgementFailureDetail {
  name?: string;
  status?: number;
  requestId?: string;
}

export type JudgementOutcome =
  | { ok: true; verdicts: Verdict[]; model: string }
  | { ok: false; reason: JudgementFailure; detail?: JudgementFailureDetail };

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
    v?.kind === "choice" &&
    isProb(v.confidence) &&
    v.confidence >= JUDGEMENT_MIN_CONFIDENCE_ADVISORY &&
    offered.includes(v.choice)
  );
}

/** Usable at PROPOSAL authority. Gated on the noul's own probability — the calibrated
 * number the primitive exists to return, not a synthesised confidence. */
export function isUsableNoulProposal(v: Verdict | undefined): v is Extract<Verdict, { kind: "noul" }> {
  return v?.kind === "noul" && isProb(v.noul) && v.noul >= JUDGEMENT_MIN_NOUL_PROPOSAL;
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
