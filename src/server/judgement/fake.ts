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
