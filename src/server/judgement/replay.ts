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
