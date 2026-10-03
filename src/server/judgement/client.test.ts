// src/server/judgement/client.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyError, errorDetail, jevClient, parseAnswers, toWireQuestions } from "./client";
import { fakeClient } from "./fake";
import type { JudgementQuestion, JudgementRequest } from "~/engine";

const req: JudgementRequest = { subject: "reschedule", state: { a: 1 }, questions: [] };

// Scripts consulted by the mocks below. `vi.hoisted` keeps them reachable from the
// `vi.mock` factories, which vitest hoists above these imports/declarations.
interface SdkScript {
  constructorThrows: Error | null;
  systemOneImpl: ((request: unknown) => unknown) | null;
}

const sdkScript: SdkScript = vi.hoisted(() => ({
  constructorThrows: null,
  systemOneImpl: null,
}));

const envScript = vi.hoisted(() => ({
  TYPESAFE_API_KEY: "test-key",
  JEV_MODEL: "jev-1.13.0",
}));

// A fake TypeSafeClient: lets jevClient's construction-throws and systemOne-response
// paths be exercised with no network and no real SDK, controlled per test via
// sdkScript. This is what makes the CRITICAL construction-inside-try fix and the
// id-cross-check testable without hitting the network.
vi.mock("@typesafe-ai/sdk", () => ({
  TypeSafeClient: class {
    constructor() {
      if (sdkScript.constructorThrows) throw sdkScript.constructorThrows;
    }
    systemOne(request: unknown) {
      if (!sdkScript.systemOneImpl) throw new Error("test must set sdkScript.systemOneImpl");
      return Promise.resolve(sdkScript.systemOneImpl(request));
    }
  },
}));

vi.mock("~/env", () => ({ env: envScript }));

beforeEach(() => {
  sdkScript.constructorThrows = null;
  sdkScript.systemOneImpl = null;
  envScript.TYPESAFE_API_KEY = "test-key";
  envScript.JEV_MODEL = "jev-1.13.0";
});

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

  it("maps connection-level and abort errors to timeout", () => {
    expect(classifyError({ name: "APIConnectionError" })).toBe("timeout");
    expect(classifyError({ name: "APIUserAbortError" })).toBe("timeout");
  });
});

describe("errorDetail", () => {
  it("carries name/status/requestId but never the response body or headers", () => {
    const err = {
      name: "UnprocessableEntityError",
      status: 422,
      requestId: "req_123",
      body: { secret: "nope" },
      headers: new Headers({ "x-api-key": "shh" }),
    };
    expect(errorDetail(err)).toEqual({ name: "UnprocessableEntityError", status: 422, requestId: "req_123" });
  });

  it("returns undefined when there is nothing to report", () => {
    expect(errorDetail("nope")).toBeUndefined();
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

  it("rejects a response missing the model field", () => {
    expect(parseAnswers({ answers: { pick: { type: "noul", noul: 0.5 } } })).toBeNull();
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

describe("jevClient", () => {
  const reqWithQuestion: JudgementRequest = {
    subject: "reschedule",
    state: {},
    questions: [{ id: "pick", kind: "noul", authority: "ADVISORY", instructions: "Yes?" }],
  };

  it("returns a classified outcome instead of throwing when client construction fails (e.g. a whitespace-only key)", async () => {
    sdkScript.constructorThrows = Object.assign(new Error("API key is missing or invalid"), {
      name: "TypeSafeError",
    });
    const out = await jevClient().ask(reqWithQuestion);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected a failure outcome");
    expect(out.reason).toBe("invalid_response");
    expect(out.detail).toEqual({ name: "TypeSafeError" });
  });

  it("rejects an empty answers map rather than succeeding with zero verdicts", async () => {
    sdkScript.systemOneImpl = () => ({ model: "jev-1.13.0", answers: {} });
    const out = await jevClient().ask(reqWithQuestion);
    expect(out).toEqual({ ok: false, reason: "invalid_response", detail: { name: "id_mismatch" } });
  });

  it("rejects an answer keyed by an id that was never asked", async () => {
    sdkScript.systemOneImpl = () => ({
      model: "jev-1.13.0",
      answers: { someone_elses_question: { type: "noul", noul: 0.5 } },
    });
    const out = await jevClient().ask(reqWithQuestion);
    expect(out).toEqual({ ok: false, reason: "invalid_response", detail: { name: "id_mismatch" } });
  });

  it("succeeds, with the response's own model, when answered ids exactly match asked ids", async () => {
    sdkScript.systemOneImpl = () => ({ model: "jev-1.13.0", answers: { pick: { type: "noul", noul: 0.9 } } });
    const out = await jevClient().ask(reqWithQuestion);
    expect(out).toEqual({ ok: true, verdicts: [{ id: "pick", kind: "noul", noul: 0.9 }], model: "jev-1.13.0" });
  });

  it("returns no_key without ever constructing a client when the key is absent", async () => {
    envScript.TYPESAFE_API_KEY = "";
    const out = await jevClient().ask(reqWithQuestion);
    expect(out).toEqual({ ok: false, reason: "no_key" });
  });
});
