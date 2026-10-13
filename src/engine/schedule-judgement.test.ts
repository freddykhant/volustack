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

const request = replacementQuestions(options, input, label);

describe("replacementQuestions", () => {

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

describe("replacementQuestions, state", () => {
  // The same six sessions in AM/PM mode, the first already trained: a double-up is on offer.
  const halfInput = withSaved(
    {
      ...input,
      mode: "HALF_DAY",
      firstOpenDay: 1,
      sessions: input.sessions.map((s, i) => (i === 0 ? { ...s, locked: true } : s)),
    },
    Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((id, i) => [id, { day: i, daypart: "AM" as const }])),
  );
  const halfOptions = proposeLayouts(halfInput);
  const halfRequest = replacementQuestions(halfOptions, halfInput, label);
  const state = (r: typeof request) =>
    r.state as {
      scheduleMode: string;
      sessionsLeftThisWeek: number;
      options: { option: string; warningsLeft: Record<string, number> }[];
    };

  it("describes a double-up as training twice on one day", () => {
    expect(halfOptions.map((o) => o.id)).toContain("DOUBLE_UP");
    const q = halfRequest.questions[0]!;
    if (q.kind !== "choice") throw new Error("expected a choice question");
    expect(q.options.DOUBLE_UP).toBe("Keep every session by training twice on one day.");
  });

  it("counts each option's remaining warnings by kind", () => {
    for (const [opts, req] of [[options, request], [halfOptions, halfRequest]] as const) {
      expect(state(req).options.map((o) => o.option)).toEqual(opts.map((o) => o.id));
      for (const o of opts) {
        const expected: Record<string, number> = {};
        for (const f of o.score.facts) expected[f.kind] = (expected[f.kind] ?? 0) + 1;
        expect(state(req).options.find((x) => x.option === o.id)!.warningsLeft).toEqual(expected);
      }
    }
    expect(halfOptions.some((o) => o.score.facts.length > 0)).toBe(true);
  });

  it("says which schedule mode the athlete trains in", () => {
    expect(state(request).scheduleMode).toBe("one session a day");
    expect(state(halfRequest).scheduleMode).toBe("morning or afternoon sessions");
  });

  it("counts only the sessions that can still be trained", () => {
    expect(state(request).sessionsLeftThisWeek).toBe(6);
    expect(state(halfRequest).sessionsLeftThisWeek).toBe(5);
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
