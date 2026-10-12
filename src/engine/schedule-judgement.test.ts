import { describe, expect, it } from "vitest";
import { makeInput, sess, withSaved } from "./_fixtures/schedule";
import { JUDGEMENT_MIN_CONFIDENCE_ADVISORY } from "./constants";
import type { Verdict } from "./judgement";
import { proposeLayouts } from "./schedule";
import { applyReplacementVerdict, REPLACEMENT_PICK_ID, replacementQuestions } from "./schedule-judgement";

const day = (d: number) => ({ day: d, daypart: null });
const input = withSaved(
  makeInput({
    sessions: ["a", "b", "c", "d", "e", "f"].map((id, i) => sess(id, i, { CHEST: 2 + i })),
    availability: [3, 6].flatMap((d) => [
      { day: d, daypart: "AM" as const, state: "BLOCKED" as const },
      { day: d, daypart: "PM" as const, state: "BLOCKED" as const },
    ]),
  }),
  Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((id, i) => [id, day(i)])),
);
const options = proposeLayouts(input); // SKIP_1, SKIP_2
const label = (id: string) => `Session ${id.toUpperCase()}`;

const pick = (choice: string, confidence: number): Verdict[] => [
  { id: REPLACEMENT_PICK_ID, kind: "choice", choice, confidence, probabilities: { [choice]: confidence } },
];

describe("replacementQuestions", () => {
  const request = replacementQuestions(options, input, label);

  it("asks one advisory choice over exactly the offered options", () => {
    expect(request.subject).toBe("replacement");
    expect(request.questions).toHaveLength(1);
    const q = request.questions[0]!;
    expect(q.kind).toBe("choice");
    expect(q.authority).toBe("ADVISORY");
    if (q.kind === "choice") expect(Object.keys(q.options)).toEqual(options.map((o) => o.id));
  });

  it("names skipped sessions by label and carries no session ids, scores or weights", () => {
    const json = JSON.stringify(request);
    expect(json).toContain("Session F");
    expect(json).not.toMatch(/"cost"/);
    expect(json).not.toMatch(/"sessionId"/);
    expect(json).not.toMatch(/"layout"/);
  });
});

describe("applyReplacementVerdict", () => {
  it("moves a confidently chosen option to the front and keeps the rest in order", () => {
    const res = applyReplacementVerdict(options, pick("SKIP_2", 0.95));
    expect(res.judged).toBe(true);
    expect(res.options.map((o) => o.id)).toEqual(["SKIP_2", "SKIP_1"]);
    expect(res.options).toHaveLength(options.length);
  });

  it("marks the lead as judged even when the verdict agrees with the engine", () => {
    const res = applyReplacementVerdict(options, pick("SKIP_1", 0.95));
    expect(res.judged).toBe(true);
    expect(res.options.map((o) => o.id)).toEqual(["SKIP_1", "SKIP_2"]);
  });

  it("ignores an option that was never offered", () => {
    const res = applyReplacementVerdict(options, pick("SKIP_9", 0.99));
    expect(res).toEqual({ options, judged: false });
  });

  it("ignores a verdict below the advisory confidence gate", () => {
    const res = applyReplacementVerdict(options, pick("SKIP_2", JUDGEMENT_MIN_CONFIDENCE_ADVISORY - 0.01));
    expect(res).toEqual({ options, judged: false });
  });

  it("ignores a missing verdict", () => {
    expect(applyReplacementVerdict(options, [])).toEqual({ options, judged: false });
  });
});
