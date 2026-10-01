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
