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
    // Infrastructure, not a judgement. No DecisionFact; logs only. `detail` is already
    // narrowed to name/status/requestId — never the response body or headers, which
    // may carry the state we sent or credential material — so it is safe to log
    // verbatim, and it is what makes a 422 (WE built a bad request) findable in logs.
    console.info(
      JSON.stringify({
        at: "judgement.failed", subject: request.subject, reason: outcome.reason,
        detail: outcome.detail, questions: request.questions.length, latencyMs,
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
        verdicts: outcome.verdicts,
        fallback: fallback ?? {},
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
