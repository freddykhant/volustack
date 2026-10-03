// src/server/judgement/client.ts
import "server-only";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { z } from "zod";
import { env } from "~/env";
import type {
  JudgementFailure,
  JudgementFailureDetail,
  JudgementOutcome,
  JudgementQuestion,
  JudgementRequest,
  JudgementUsage,
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

/** `usage` and its fields are all OPTIONAL: a response that omits usage entirely, or
 * omits one of its fields, must still validate — this is additive cost observability
 * (spec §14), never a new way for an otherwise-valid response to be rejected. */
const UsageSchema = z.object({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
});

/** `model` is REQUIRED: an answer we cannot attribute to the model that produced it
 * is a malformed response, not a response we can silently backfill with our own
 * requested model — see the model-provenance note on `validateResponse`. */
const ResponseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), AnswerSchema),
  usage: UsageSchema.optional(),
});

function toVerdicts(answers: z.infer<typeof ResponseSchema>["answers"]): Verdict[] {
  const verdicts: Verdict[] = [];
  for (const [id, a] of Object.entries(answers)) {
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

interface ParsedResponse {
  model: string;
  verdicts: Verdict[];
  usage?: JudgementUsage;
}

/** Validate at the boundary. A malformed payload is an INFRASTRUCTURE failure, never a
 * low-confidence answer — the upstream docs are explicit that conflating the two is
 * the classic bug. Returning null makes the caller take the fallback path.
 *
 * The model is taken verbatim from the response, never defaulted to the model we
 * requested: a verdict attributed to a model the response never claimed would be a
 * silent provenance hole, which matters once outcomes are cached and replayed. */
function validateResponse(payload: unknown): ParsedResponse | null {
  const parsed = ResponseSchema.safeParse(payload);
  if (!parsed.success) return null;
  return { model: parsed.data.model, verdicts: toVerdicts(parsed.data.answers), usage: parsed.data.usage };
}

/** Public helper for callers/tests that only need the verdicts. `jevClient` uses
 * `validateResponse` directly so it also gets the response's own model string. */
export function parseAnswers(payload: unknown): Verdict[] | null {
  return validateResponse(payload)?.verdicts ?? null;
}

/** True only when the response answered exactly the questions we asked: no asked id
 * left unanswered, and no answer for an id we never asked about. An empty-but-"ok"
 * response, or one keyed by stray ids, would otherwise parse cleanly and (once a
 * later task adds caching) be persisted and replayed forever. */
function verdictsMatchQuestions(verdicts: Verdict[], questions: JudgementQuestion[]): boolean {
  const asked = new Set(questions.map((q) => q.id));
  const answered = new Set(verdicts.map((v) => v.id));
  if (asked.size !== answered.size) return false;
  for (const id of asked) if (!answered.has(id)) return false;
  return true;
}

export function classifyError(err: unknown): JudgementFailure {
  const o = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : {};
  const name = typeof o.name === "string" ? o.name : "";
  const status = typeof o.status === "number" ? o.status : undefined;
  if (name === "AuthenticationError" || status === 401) return "auth";
  if (name === "RateLimitError" || status === 429) return "rate_limited";
  // APIConnectionError covers DNS/TLS/connection-reset failures; APITimeoutError is a
  // subclass of it; APIUserAbortError is our own AbortSignal firing. None of these are
  // a response we can retry-and-hope-for-different-content, so all three collapse to
  // the same "transient, didn't get a response" bucket as a genuine timeout.
  if (name === "APITimeoutError" || name === "APIConnectionError" || name === "APIUserAbortError") return "timeout";
  if (status === 529) return "overloaded";
  // Everything else — 400/403/422/500-528, or an SDK client-side throw for a bad
  // request shape (empty questions, <2 score levels), or a thrown value which is
  // neither of the above — means WE built a bad request or got something we didn't
  // anticipate. Surfaced as invalid_response so the fallback path runs; `errorDetail`
  // carries the name/status/requestId so the executor can log the real cause.
  return "invalid_response";
}

/** Non-sensitive diagnostic fields only — never the response body or headers. */
export function errorDetail(err: unknown): JudgementFailureDetail | undefined {
  const o = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : {};
  const detail: JudgementFailureDetail = {};
  if (typeof o.name === "string") detail.name = o.name;
  if (typeof o.status === "number") detail.status = o.status;
  if (typeof o.requestId === "string") detail.requestId = o.requestId;
  return Object.keys(detail).length > 0 ? detail : undefined;
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
      // Construction itself can throw (TypeSafeError): a missing/whitespace-only key,
      // a bad TYPESAFE_BASE_URL, or an unsupported runtime. That is not retryable —
      // it won't be different on attempt two — so it's classified and returned here,
      // outside the retry loop, rather than left to reject ask()'s promise.
      // maxRetries: 0 — the SDK would otherwise retry 408/429/500-599 itself (default
      // maxRetries: 2), multiplying this already-bounded outer loop into up to 9 HTTP
      // attempts. This loop is the only retry layer.
      // timeout: 3000 — the SDK's own default (10s) per attempt, × MAX_ATTEMPTS plus
      // backoff, could otherwise hold the caller open for ~31s against a service whose
      // p99 is 500ms. logLevel: "off" — an ambient TYPESAFE_LOG_LEVEL=debug would make
      // the SDK log request bodies; credential headers are redacted but the state
      // projection (athlete training data) is not, so logging is forced off here
      // regardless of environment.
      let client: TypeSafeClient;
      try {
        client = new TypeSafeClient({ retry: { maxRetries: 0 }, timeout: 3000, logLevel: "off" });
      } catch (err) {
        const reason = classifyError(err);
        const detail = errorDetail(err);
        return detail ? { ok: false, reason, detail } : { ok: false, reason };
      }
      const body = {
        model: env.JEV_MODEL,
        state: request.state,
        questions: toWireQuestions(request.questions),
      };
      let last: JudgementFailure = "invalid_response";
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const raw: unknown = await client.systemOne(body as Parameters<typeof client.systemOne>[0]);
          const parsed = validateResponse(raw);
          if (parsed === null) return { ok: false, reason: "invalid_response" };
          if (!verdictsMatchQuestions(parsed.verdicts, request.questions)) {
            return { ok: false, reason: "invalid_response", detail: { name: "id_mismatch" } };
          }
          return parsed.usage
            ? { ok: true, verdicts: parsed.verdicts, model: parsed.model, usage: parsed.usage }
            : { ok: true, verdicts: parsed.verdicts, model: parsed.model };
        } catch (err) {
          last = classifyError(err);
          const detail = errorDetail(err);
          if (!RETRYABLE.includes(last) || attempt === MAX_ATTEMPTS - 1) {
            return detail ? { ok: false, reason: last, detail } : { ok: false, reason: last };
          }
          await new Promise((r) => setTimeout(r, backoffMs(attempt)));
        }
      }
      return { ok: false, reason: last };
    },
  };
}
