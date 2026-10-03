// src/server/judgement/execute.test.ts
import { describe, expect, it, vi } from "vitest";
import type { JudgementRequest, Verdict } from "~/engine";
import { chunkQuestions, executeJudgement, type JudgementDb } from "./execute";
import { fakeClient } from "./fake";

const request: JudgementRequest = {
  subject: "reschedule",
  state: { phase: "late" },
  questions: [{ id: "pick", kind: "choice", authority: "ADVISORY", instructions: "Which?", options: { A: null } }],
};
const verdict: Verdict = { id: "pick", kind: "choice", choice: "A", confidence: 0.9, probabilities: { A: 0.9 } };

function dbStub(existing: { verdicts: unknown } | null) {
  return {
    judgement: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({}),
    },
  } as unknown as JudgementDb & {
    judgement: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  };
}

describe("executeJudgement", () => {
  it("asks and persists on a cache miss", async () => {
    const db = dbStub(null);
    const out = await executeJudgement({
      db, mesocycleId: "m1", request, fallback: { recommended: "MAKE_UP" },
      client: fakeClient({ pick: verdict }),
    });
    expect(out).toEqual([verdict]);
    expect(db.judgement.create).toHaveBeenCalledTimes(1);
    const arg = db.judgement.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.subject).toBe("reschedule");
    expect(arg.data.stateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.data.questionsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.data.fallback).toEqual({ recommended: "MAKE_UP" });
  });

  it("replays a cached judgement without asking", async () => {
    const db = dbStub({ verdicts: [verdict] });
    const client = fakeClient({ pick: verdict });
    const spy = vi.spyOn(client, "ask");
    const out = await executeJudgement({ db, mesocycleId: "m1", request, fallback: null, client });
    expect(out).toEqual([verdict]);
    expect(spy).not.toHaveBeenCalled();
    expect(db.judgement.create).not.toHaveBeenCalled();
  });

  it("returns [] and persists nothing when the client fails", async () => {
    const db = dbStub(null);
    const out = await executeJudgement({
      db, mesocycleId: "m1", request, fallback: null,
      client: fakeClient({}, { failWith: "timeout" }),
    });
    expect(out).toEqual([]);
    expect(db.judgement.create).not.toHaveBeenCalled();
  });

  it("returns [] when a cached row holds unparseable verdicts", async () => {
    const db = dbStub({ verdicts: [{ id: "pick", kind: "choice" }] });
    const out = await executeJudgement({
      db, mesocycleId: "m1", request, fallback: null, client: fakeClient({ pick: verdict }),
    });
    expect(out).toEqual([]);
  });

  it("survives a concurrent insert by re-reading", async () => {
    const db = dbStub(null);
    db.judgement.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    db.judgement.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ verdicts: [verdict] });
    const out = await executeJudgement({
      db, mesocycleId: "m1", request, fallback: null, client: fakeClient({ pick: verdict }),
    });
    expect(out).toEqual([verdict]);
  });

  it("keeps a realistic question set in a single chunk", () => {
    const many: JudgementRequest = {
      ...request,
      questions: Array.from({ length: 10 }, (_, i) => ({
        id: `q${i}`, kind: "noul" as const, authority: "PROPOSAL" as const,
        instructions: "Does this muscle justify adding volume next week?".repeat(3),
      })),
    };
    expect(chunkQuestions(many)).toHaveLength(1);
  });

  it("splits when the question set cannot fit the budget", () => {
    const huge: JudgementRequest = {
      ...request,
      questions: Array.from({ length: 4 }, (_, i) => ({
        id: `q${i}`, kind: "noul" as const, authority: "ADVISORY" as const,
        instructions: "x".repeat(100_000),
      })),
    };
    expect(chunkQuestions(huge).length).toBeGreaterThan(1);
    expect(chunkQuestions(huge).flat()).toHaveLength(4);
  });

  it("keys differently when question wording changes", async () => {
    const db = dbStub(null);
    const hashes: string[] = [];
    for (const instructions of ["Which?", "Which one?"]) {
      db.judgement.create.mockClear();
      await executeJudgement({
        db, mesocycleId: "m1",
        request: { ...request, questions: [{ ...request.questions[0]!, instructions }] },
        fallback: null, client: fakeClient({ pick: verdict }),
      });
      const arg = db.judgement.create.mock.calls[0]![0] as { data: { questionsHash: string } };
      hashes.push(arg.data.questionsHash);
    }
    expect(hashes[0]).not.toBe(hashes[1]);
  });
});
