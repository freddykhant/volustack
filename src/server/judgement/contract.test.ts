// src/server/judgement/contract.test.ts
import { describe, expect, it } from "vitest";
import { jevClient } from "./client";
import type { JudgementRequest } from "~/engine";

const request: JudgementRequest = {
  subject: "reschedule",
  state: {
    blockPhase: "late",
    muscles: [{ name: "CHEST", volumeStanding: "at MRV ceiling", prioritised: true }],
    candidates: [
      { option: "MAKE_UP", setsRecovered: 6, setsDropped: 0 },
      { option: "LET_GO", setsRecovered: 0, setsDropped: 6 },
    ],
    readiness: { formTrend: "falling" },
  },
  questions: [
    {
      id: "reschedule_pick", kind: "choice", authority: "ADVISORY",
      instructions:
        "A strength athlete missed a training session this week. Each option in `candidates` is a complete, already-costed plan for the rest of the week. Given `muscles`, `blockPhase` and `readiness.formTrend`, which option serves this athlete best?",
      options: {
        MAKE_UP: "Move every missed set into the remaining sessions this week.",
        LET_GO: "Recover nothing; accept the lost sets.",
      },
    },
    {
      id: "overreaching", kind: "noul", authority: "ADVISORY",
      instructions: "Considering `muscles` and `readiness.formTrend`, is this athlete accumulating more fatigue than they are recovering from?",
    },
  ],
};

// Runs only where a key exists. `pnpm test` must stay green without one.
describe.skipIf(!process.env.TYPESAFE_API_KEY)("Jev contract", () => {
  it("answers a real batched request in the shape we parse", async () => {
    const out = await jevClient().ask(request);
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.model).toContain("jev-1.13");
    const pick = out.verdicts.find((v) => v.id === "reschedule_pick");
    expect(pick?.kind).toBe("choice");
    if (pick?.kind === "choice") {
      expect(["MAKE_UP", "LET_GO"]).toContain(pick.choice);
      expect(pick.confidence).toBeGreaterThanOrEqual(0);
      expect(pick.confidence).toBeLessThanOrEqual(1);
    }

    const over = out.verdicts.find((v) => v.id === "overreaching");
    expect(over?.kind).toBe("noul");
    // Noul carries NO confidence — guards against a future refactor inventing one.
    expect(over && "confidence" in over).toBe(false);

    // Record the fixture for replay tests.
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync("src/server/judgement/__fixtures__", { recursive: true });
    writeFileSync(
      "src/server/judgement/__fixtures__/reschedule-response.json",
      JSON.stringify({ model: out.model, verdicts: out.verdicts }, null, 2) + "\n",
    );
  }, 20_000);
});
