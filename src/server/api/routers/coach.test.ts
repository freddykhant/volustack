import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../../../generated/prisma";
import { createCallerFactory } from "~/server/api/trpc";
import { coachRouter } from "./coach";

vi.mock("server-only", () => ({}));
// The model call is always mocked: no test reaches the Anthropic API.
const interpret = vi.hoisted(() => vi.fn<(text: string, context: unknown) => Promise<unknown>>());
vi.mock("~/server/coach/client", () => ({
  coachEnabled: vi.fn(() => true),
  anthropicInterpreter: { interpret },
}));
import { coachEnabled } from "~/server/coach/client";

const createCaller = createCallerFactory(coachRouter);

// Wednesday 7 Oct 2026 (UTC). The block started Monday 5 Oct, so week 1 runs Mon…Sun
// and Monday and Tuesday are already in the past.
const NOW = new Date("2026-10-07T02:00:00Z");
const START = new Date("2026-10-05T00:00:00Z");

// Fake only Date: tRPC's dev timing middleware awaits a real setTimeout.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

const understood = (form: { intent: string; dates?: { date: string; daypart: "AM" | "PM" | null }[]; sessionKey?: string | null }) =>
  interpret.mockResolvedValue({
    ok: true,
    form: { dates: [], sessionKey: null, ...form } as never,
    model: "claude-sonnet-5-5",
    inputTokens: 900,
    outputTokens: 40,
  });

afterEach(() => {
  interpret.mockReset();
  vi.mocked(coachEnabled).mockReturnValue(true);
});

type Status = "SCHEDULED" | "COMPLETED" | "MISSED";

function sessionRow(id: string, weekId: string, order: number, label: string, dayOfWeek: number | null, status: Status = "SCHEDULED") {
  return {
    id,
    weekId,
    order,
    splitSlot: label,
    dayOfWeek,
    daypart: null,
    targetDurationMin: 60,
    status,
    completedAt: status === "COMPLETED" ? START : null,
    prescriptions: [
      {
        id: `p-${id}`,
        trainingSessionId: id,
        exerciseId: "e1",
        order: 0,
        sets: 4,
        targetRepLow: 6,
        targetRepHigh: 10,
        targetRir: 2,
        exercise: { id: "e1", name: "Barbell Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "BARBELL", contraindications: [] },
      },
    ],
  };
}

function weekRow(index: number, sessions: ReturnType<typeof sessionRow>[]) {
  return { id: `wk-${index}`, mesocycleId: "meso-1", index, isDeload: false, sessions };
}

interface Opts {
  noBlock?: boolean;
  /** Coach messages already sent in the last 24 hours. */
  messagesToday?: number;
  weeks?: ReturnType<typeof weekRow>[];
  exceptions?: { date: Date; daypart: "AM" | "PM" }[];
  scheduleMode?: "DAY" | "HALF_DAY";
}

function makeCaller(opts: Opts = {}) {
  const week1 = [sessionRow("s1", "wk-1", 0, "Upper A", 3), sessionRow("s2", "wk-1", 1, "Upper B", 5)];
  const meso = {
    id: "meso-1",
    startDate: START,
    lengthWeeks: 4,
    athleteProfile: {
      id: "profile-1",
      scheduleMode: opts.scheduleMode ?? "DAY",
      timezone: "UTC",
      availability: [],
      availabilityExceptions: opts.exceptions ?? [],
    },
    weeks: opts.weeks ?? [weekRow(1, week1)],
  };
  const db = {
    mesocycle: { findFirst: vi.fn().mockResolvedValue(opts.noBlock ? null : meso) },
    coachMessage: {
      count: vi.fn().mockResolvedValue(opts.messagesToday ?? 0),
      create: vi.fn<(args: { data: Record<string, unknown> }) => Promise<unknown>>().mockResolvedValue({}),
    },
    decisionLog: { findMany: vi.fn().mockResolvedValue([]) },
    trainingSession: { update: vi.fn(), updateMany: vi.fn() },
    availabilityException: { createMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const caller = createCaller({ db, session: { user: { id: "user-1" } } } as unknown as Parameters<typeof createCaller>[0]);
  return { caller, db };
}

const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const bothHalves = (iso: string) => [
  { date: D(iso), daypart: "AM" as const },
  { date: D(iso), daypart: "PM" as const },
];

describe("coach.status", () => {
  it("is enabled only with a key", async () => {
    const { caller } = makeCaller();
    await expect(caller.status()).resolves.toEqual({ enabled: true });
    vi.mocked(coachEnabled).mockReturnValue(false);
    await expect(caller.status()).resolves.toEqual({ enabled: false });
  });
});

describe("coach.interpret", () => {
  it("turns a block request into a confirm card and writes nothing to the schedule", async () => {
    understood({ intent: "block_time", dates: [{ date: "2026-10-08", daypart: null }] });
    const { caller, db } = makeCaller();
    const reply = await caller.interpret({ weekIndex: 1, text: "can't make Thursday" });
    expect(reply).toEqual({
      kind: "confirm_block",
      cells: [{ date: "2026-10-08", daypart: null }],
      summary: "Block Thu 8 Oct?",
      alreadyBlocked: [],
    });
    expect(db.availabilityException.createMany).not.toHaveBeenCalled();
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("sends the model the athlete's week without any database id", async () => {
    understood({ intent: "ask_next_session" });
    const { caller } = makeCaller();
    await caller.interpret({ weekIndex: 1, text: "what's next?" });
    const [text, context] = interpret.mock.calls[0]!;
    expect(text).toBe("what's next?");
    const json = JSON.stringify(context);
    expect(json).toContain('"today":"2026-10-07"');
    expect(json).toContain("Upper A");
    for (const id of ["s1", "s2", "meso-1", "profile-1", "user-1"]) expect(json).not.toContain(`"${id}"`);
  });

  it("maps a session key back to the real session", async () => {
    understood({ intent: "skip_session", sessionKey: "S2" });
    const { caller } = makeCaller();
    await expect(caller.interpret({ weekIndex: 1, text: "skip upper b" })).resolves.toMatchObject({
      kind: "skip",
      sessionId: "s2",
      label: "Upper B",
    });
  });

  it("logs the message, the form, the outcome and the token counts", async () => {
    understood({ intent: "ask_recovery" });
    const { caller, db } = makeCaller();
    await caller.interpret({ weekIndex: 1, text: "how's my recovery?" });
    expect(db.coachMessage.create).toHaveBeenCalledWith({
      data: {
        athleteProfileId: "profile-1",
        weekIndex: 1,
        text: "how's my recovery?",
        form: { intent: "ask_recovery", dates: [], sessionKey: null },
        outcome: "answer",
        model: "claude-sonnet-5-5",
        inputTokens: 900,
        outputTokens: 40,
      },
    });
  });

  it("answers with the fixed line and still logs when the model fails", async () => {
    interpret.mockResolvedValue({ ok: false, reason: "timeout" });
    const { caller, db } = makeCaller();
    await expect(caller.interpret({ weekIndex: 1, text: "can't make Thursday" })).resolves.toEqual({
      kind: "unavailable",
      lines: ["I couldn't work that out just now. You can still block time from the board."],
    });
    const { data } = db.coachMessage.create.mock.calls[0]![0] as { data: { form: unknown } };
    expect(data).toMatchObject({ outcome: "timeout", model: null });
    expect(data.form).toBe(Prisma.JsonNull);
  });

  it("answers with the fixed line when the interpreter throws", async () => {
    interpret.mockRejectedValue(new Error("boom"));
    const { caller, db } = makeCaller();
    await expect(caller.interpret({ weekIndex: 1, text: "hello" })).resolves.toMatchObject({ kind: "unavailable" });
    expect(db.coachMessage.create.mock.calls[0]![0].data).toMatchObject({ outcome: "api_error", model: null });
  });

  it("still returns the reply when the log write fails", async () => {
    understood({ intent: "ask_recovery" });
    const { caller, db } = makeCaller();
    db.coachMessage.create.mockRejectedValue(new Error("db down"));
    await expect(caller.interpret({ weekIndex: 1, text: "recovery?" })).resolves.toMatchObject({ kind: "answer", topic: "recovery" });
    expect(db.coachMessage.create).toHaveBeenCalledTimes(1);
  });

  it("makes no model call and logs nothing at the daily limit", async () => {
    const { caller, db } = makeCaller({ messagesToday: 50 });
    await expect(caller.interpret({ weekIndex: 1, text: "can't make Thursday" })).resolves.toEqual({
      kind: "unavailable",
      lines: ["You've reached today's limit for the coach. The board still works."],
    });
    expect(interpret).not.toHaveBeenCalled();
    expect(db.coachMessage.create).not.toHaveBeenCalled();
    expect(db.coachMessage.count.mock.calls[0]![0]).toMatchObject({
      where: { athleteProfileId: "profile-1", createdAt: { gte: new Date(NOW.getTime() - 24 * 60 * 60 * 1000) } },
    });
  });

  it("allows the fiftieth message", async () => {
    understood({ intent: "ask_recovery" });
    const { caller } = makeCaller({ messagesToday: 49 });
    await expect(caller.interpret({ weekIndex: 1, text: "recovery?" })).resolves.toMatchObject({ kind: "answer" });
  });

  it("is unavailable without a key, with no model call and no log", async () => {
    vi.mocked(coachEnabled).mockReturnValue(false);
    const { caller, db } = makeCaller();
    await expect(caller.interpret({ weekIndex: 1, text: "hi" })).resolves.toMatchObject({ kind: "unavailable" });
    expect(interpret).not.toHaveBeenCalled();
    expect(db.coachMessage.create).not.toHaveBeenCalled();
  });

  it("says a finished week is over, with no model call and no log", async () => {
    // Week 1 ended once week 2 began: move the clock a week on.
    vi.setSystemTime(new Date("2026-10-14T02:00:00Z"));
    try {
      const { caller, db } = makeCaller({ weeks: [weekRow(1, []), weekRow(2, [])] });
      await expect(caller.interpret({ weekIndex: 1, text: "can't make Thursday" })).resolves.toEqual({
        kind: "unsupported",
        lines: ["That week is over, so there is nothing to change in it."],
      });
      expect(interpret).not.toHaveBeenCalled();
      expect(db.coachMessage.create).not.toHaveBeenCalled();
    } finally {
      vi.setSystemTime(NOW);
    }
  });

  it("returns NOT_FOUND without an active block", async () => {
    const { caller } = makeCaller({ noBlock: true });
    await expect(caller.interpret({ weekIndex: 1, text: "hi" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("drops a date the athlete cannot use and asks which day", async () => {
    understood({ intent: "block_time", dates: [{ date: "2026-10-05", daypart: null }] }); // Monday, already past
    const { caller } = makeCaller();
    await expect(caller.interpret({ weekIndex: 1, text: "can't make Monday" })).resolves.toMatchObject({
      kind: "clarify",
      question: "Which day can't you train?",
    });
  });

  it("explains a placement through the engine", async () => {
    understood({ intent: "ask_why_placement", sessionKey: "S1" });
    const { caller } = makeCaller();
    const reply = await caller.interpret({ weekIndex: 1, text: "why is upper a on thursday?" });
    expect(reply).toMatchObject({ kind: "answer", topic: "why_placement" });
    if (reply.kind === "answer") expect(reply.lines[0]).toBe("Upper A is on Thursday.");
  });

  it("points to the options when the week is stranded", async () => {
    understood({ intent: "rearrange_week" });
    const { caller } = makeCaller({ exceptions: bothHalves("2026-10-08") });
    await expect(caller.interpret({ weekIndex: 1, text: "sort out my week" })).resolves.toMatchObject({ kind: "rearrange", state: "options" });
  });
});
