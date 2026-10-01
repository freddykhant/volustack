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
