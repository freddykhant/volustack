import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../../../generated/prisma";
import { createCallerFactory } from "~/server/api/trpc";
import { readinessState } from "~/components/viz/readiness-state";
import { readinessSamplesFrom } from "~/server/mesocycle/readiness-samples";
import { BLOCK_OVER_LINES } from "~/views/coach";
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
    model: "claude-haiku-4-5-20251001",
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

// The block as the readiness query selects it: one finished session with logged sets, so the
// series is not empty. Nothing about it is a week-loader field.
const READINESS_BLOCK = {
  startDate: START,
  lengthWeeks: 4,
  weeks: [
    {
      index: 1,
      sessions: [
        {
          status: "COMPLETED",
          completedAt: new Date("2026-10-06T10:00:00Z"),
          prescriptions: [{ setLogs: Array.from({ length: 24 }, () => ({ achievedRir: 1 })) }],
        },
      ],
      checkIns: [],
    },
  ],
};
// A block with nothing logged yet: it yields an empty series without throwing.
const EMPTY_BLOCK = { startDate: START, lengthWeeks: 4, weeks: [{ index: 1, sessions: [], checkIns: [] }] };

interface Opts {
  noBlock?: boolean;
  /** The block the readiness query sees: a block, or "reject" for a failed read. Default: nothing logged. */
  readinessBlock?: typeof READINESS_BLOCK | "reject";
  /** Rows the dismissal lookup finds. */
  dismissed?: { payload: unknown }[];
  /** The viewed week's sessions (default: Upper A on Thursday, Upper B on Saturday). */
  week1?: ReturnType<typeof sessionRow>[];
  /** Coach messages already sent in the last 24 hours. */
  messagesToday?: number;
  weeks?: ReturnType<typeof weekRow>[];
  exceptions?: { date: Date; daypart: "AM" | "PM" }[];
  scheduleMode?: "DAY" | "HALF_DAY";
}

function makeCaller(opts: Opts = {}) {
  const week1 = opts.week1 ?? [sessionRow("s1", "wk-1", 0, "Upper A", 3), sessionRow("s2", "wk-1", 1, "Upper B", 5)];
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
    // Two reads per request: the week loader (selects the athlete profile), then readiness.
    mesocycle: {
      findFirst: vi.fn((args: { select: Record<string, unknown> }) => {
        if ("athleteProfile" in args.select) return Promise.resolve(opts.noBlock ? null : meso);
        if (opts.readinessBlock === "reject") return Promise.reject(new Error("db down"));
        return Promise.resolve(opts.readinessBlock ?? EMPTY_BLOCK);
      }),
    },
    // The count runs after this message's own row is written, so it includes that row.
    coachMessage: {
      create: vi.fn<(args: { data: Record<string, unknown> }) => Promise<unknown>>().mockResolvedValue({ id: "msg-1" }),
      count: vi.fn().mockResolvedValue((opts.messagesToday ?? 0) + 1),
      update: vi.fn<(args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>>().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    decisionLog: { findMany: vi.fn().mockResolvedValue(opts.dismissed ?? []) },
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
      alreadyBlockedLine: null,
    });
    expect(db.availabilityException.createMany).not.toHaveBeenCalled();
    expect(db.trainingSession.updateMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.trainingSession.update).not.toHaveBeenCalled();
    expect(db.availabilityException.deleteMany).not.toHaveBeenCalled();
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

  it("writes the message's row first, then fills in the form, the outcome and the token counts", async () => {
    understood({ intent: "ask_recovery" });
    const { caller, db } = makeCaller();
    await caller.interpret({ weekIndex: 1, text: "how's my recovery?" });
    expect(db.coachMessage.create).toHaveBeenCalledWith({
      data: { athleteProfileId: "profile-1", weekIndex: 1, text: "how's my recovery?", outcome: "pending" },
      select: { id: true },
    });
    expect(db.coachMessage.create.mock.invocationCallOrder[0]).toBeLessThan(db.coachMessage.count.mock.invocationCallOrder[0]!);
    expect(db.coachMessage.create.mock.invocationCallOrder[0]).toBeLessThan(interpret.mock.invocationCallOrder[0]!);
    expect(db.coachMessage.update).toHaveBeenCalledWith({
      where: { id: "msg-1" },
      data: {
        form: { intent: "ask_recovery", dates: [], sessionKey: null },
        outcome: "answer",
        model: "claude-haiku-4-5-20251001",
        inputTokens: 900,
        outputTokens: 40,
      },
    });
    expect(db.coachMessage.create).toHaveBeenCalledTimes(1);
    expect(db.coachMessage.delete).not.toHaveBeenCalled();
  });

  it("answers with the fixed line and still logs when the model fails", async () => {
    interpret.mockResolvedValue({ ok: false, reason: "timeout" });
    const { caller, db } = makeCaller();
    await expect(caller.interpret({ weekIndex: 1, text: "can't make Thursday" })).resolves.toEqual({
      kind: "unavailable",
      lines: ["I couldn't work that out just now. You can still block time from the board."],
    });
    const { data } = db.coachMessage.update.mock.calls[0]![0];
    expect(data).toMatchObject({ outcome: "timeout", model: null });
    expect(data.form).toBe(Prisma.DbNull);
  });

  it("answers with the fixed line when the interpreter throws", async () => {
    interpret.mockRejectedValue(new Error("boom"));
    const { caller, db } = makeCaller();
    await expect(caller.interpret({ weekIndex: 1, text: "hello" })).resolves.toMatchObject({ kind: "unavailable" });
    expect(db.coachMessage.update.mock.calls[0]![0].data).toMatchObject({ outcome: "api_error", model: null });
  });

  it("still returns the reply when the log update fails", async () => {
    understood({ intent: "ask_recovery" });
    const { caller, db } = makeCaller();
    db.coachMessage.update.mockRejectedValue(new Error("db down"));
    await expect(caller.interpret({ weekIndex: 1, text: "recovery?" })).resolves.toMatchObject({ kind: "answer", topic: "recovery" });
    expect(db.coachMessage.update).toHaveBeenCalledTimes(1);
  });

  it("refuses at the daily limit, removes its own row and makes no model call", async () => {
    const { caller, db } = makeCaller({ messagesToday: 50 });
    await expect(caller.interpret({ weekIndex: 1, text: "can't make Thursday" })).resolves.toEqual({
      kind: "unavailable",
      lines: ["You've reached today's limit for the coach. The board still works."],
    });
    expect(interpret).not.toHaveBeenCalled();
    expect(db.coachMessage.create).toHaveBeenCalledTimes(1);
    expect(db.coachMessage.delete).toHaveBeenCalledWith({ where: { id: "msg-1" } });
    expect(db.coachMessage.update).not.toHaveBeenCalled();
    expect(db.coachMessage.count.mock.calls[0]![0]).toMatchObject({
      where: { athleteProfileId: "profile-1", createdAt: { gte: new Date(NOW.getTime() - 24 * 60 * 60 * 1000) } },
    });
  });

  it("allows the fiftieth message and fills in its row", async () => {
    understood({ intent: "ask_recovery" });
    const { caller, db } = makeCaller({ messagesToday: 49 });
    await expect(caller.interpret({ weekIndex: 1, text: "recovery?" })).resolves.toMatchObject({ kind: "answer" });
    expect(interpret).toHaveBeenCalledTimes(1);
    expect(db.coachMessage.delete).not.toHaveBeenCalled();
    expect(db.coachMessage.update.mock.calls[0]![0]).toMatchObject({ where: { id: "msg-1" }, data: { outcome: "answer" } });
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

  it("reads recovery from the athlete's logged training", async () => {
    understood({ intent: "ask_recovery" });
    const { caller } = makeCaller({ readinessBlock: READINESS_BLOCK });
    // The same pure functions on the same fixture give the expected label.
    const sample = readinessSamplesFrom(READINESS_BLOCK).filter((x) => x.weekIndex <= 1).at(-1)!;
    const reply = await caller.interpret({ weekIndex: 1, text: "how's my recovery?" });
    expect(reply).toMatchObject({ kind: "answer", topic: "recovery" });
    if (reply.kind !== "answer") return;
    expect(reply.lines[0]).toBe(`Your form reads ${readinessState(sample)}.`);
    expect(reply.lines[1]).toMatch(/^Fitness \d+\.\d, fatigue \d+\.\d, form -?\d+\.\d\.$/);
    expect(reply.lines[1]).toBe(`Fitness ${sample.fitness.toFixed(1)}, fatigue ${sample.fatigue.toFixed(1)}, form ${sample.form.toFixed(1)}.`);
  });

  it("says there is not enough logged training when nothing is logged", async () => {
    understood({ intent: "ask_recovery" });
    const { caller } = makeCaller();
    await expect(caller.interpret({ weekIndex: 1, text: "recovery?" })).resolves.toEqual({
      kind: "answer",
      topic: "recovery",
      lines: ["There isn't enough logged training yet to read your recovery."],
    });
  });

  it("says recovery is not available, not that nothing is logged, when the readiness read fails", async () => {
    understood({ intent: "ask_recovery" });
    const { caller } = makeCaller({ readinessBlock: "reject" });
    await expect(caller.interpret({ weekIndex: 1, text: "recovery?" })).resolves.toEqual({
      kind: "answer",
      topic: "recovery",
      lines: ["Recovery isn't available right now."],
    });
  });

  it("answers the other questions as usual when the readiness read fails", async () => {
    understood({ intent: "ask_next_session" });
    const { caller } = makeCaller({ readinessBlock: "reject" });
    await expect(caller.interpret({ weekIndex: 1, text: "what's next?" })).resolves.toMatchObject({
      kind: "answer",
      topic: "next_session",
      lines: ["Next up is Upper A on Thursday, about 60 minutes.", "It starts with Barbell Bench Press, 4 sets of 6 to 10."],
    });
  });
});

describe("coach.interpret early exits", () => {
  it("reports a finished week before it mentions the missing key", async () => {
    vi.mocked(coachEnabled).mockReturnValue(false);
    vi.setSystemTime(new Date("2026-10-14T02:00:00Z"));
    try {
      const { caller } = makeCaller({ weeks: [weekRow(1, []), weekRow(2, [])] });
      await expect(caller.interpret({ weekIndex: 1, text: "hi" })).resolves.toMatchObject({
        kind: "unsupported",
        lines: ["That week is over, so there is nothing to change in it."],
      });
    } finally {
      vi.setSystemTime(NOW);
    }
  });

  it("reports the missing key before it counts the day's messages", async () => {
    vi.mocked(coachEnabled).mockReturnValue(false);
    const { caller, db } = makeCaller({ messagesToday: 50 });
    await expect(caller.interpret({ weekIndex: 1, text: "hi" })).resolves.toEqual({
      kind: "unavailable",
      lines: ["I couldn't work that out just now. You can still block time from the board."],
    });
    expect(db.coachMessage.count).not.toHaveBeenCalled();
  });

  it("says the block is over, with no model call and no log, once no date is left", async () => {
    // The block ran 5 Oct to Sun 1 Nov; it is still ACTIVE on 3 Nov and its last week is current.
    vi.setSystemTime(new Date("2026-11-03T02:00:00Z"));
    try {
      const { caller, db } = makeCaller({ weeks: [weekRow(4, [])] });
      await expect(caller.interpret({ weekIndex: 4, text: "can't make Thursday" })).resolves.toEqual({
        kind: "unsupported",
        lines: BLOCK_OVER_LINES,
      });
      expect(interpret).not.toHaveBeenCalled();
      expect(db.coachMessage.count).not.toHaveBeenCalled();
      expect(db.coachMessage.create).not.toHaveBeenCalled();
    } finally {
      vi.setSystemTime(NOW);
    }
  });
});

describe("coach.interpret and a dismissed suggestion", () => {
  // Two chest sessions on consecutive days: the engine wants them apart, and has a suggestion.
  const tight = () => [sessionRow("s1", "wk-1", 0, "Upper A", 3), sessionRow("s2", "wk-1", 1, "Upper B", 4)];
  const CURRENT_KEY = "s1:3:-|s2:4:-";

  it("offers the suggestion when none was dismissed", async () => {
    understood({ intent: "rearrange_week" });
    const { caller } = makeCaller({ week1: tight() });
    const reply = await caller.interpret({ weekIndex: 1, text: "sort out my week" });
    expect(reply).toMatchObject({ kind: "rearrange", state: "suggestion" });
  });

  it("says there is nothing to change once that layout's suggestion was dismissed", async () => {
    understood({ intent: "rearrange_week" });
    const { caller, db } = makeCaller({ week1: tight(), dismissed: [{ payload: { layoutKey: CURRENT_KEY } }] });
    await expect(caller.interpret({ weekIndex: 1, text: "sort out my week" })).resolves.toMatchObject({
      kind: "rearrange",
      state: "nothing",
    });
    expect(db.decisionLog.findMany).toHaveBeenCalledWith({
      where: { mesocycleId: "meso-1", weekIndex: 1, type: "SCHEDULE", status: "REJECTED" },
      select: { payload: true },
    });
  });

  it("does not list the dismissed suggestion among the week's issues", async () => {
    understood({ intent: "ask_week_issues" });
    const { caller } = makeCaller({ week1: tight(), dismissed: [{ payload: { layoutKey: CURRENT_KEY } }] });
    const reply = await caller.interpret({ weekIndex: 1, text: "what's wrong with my week?" });
    expect(reply.kind).toBe("answer");
    if (reply.kind === "answer") expect(reply.lines.some((l) => l.startsWith("Suggested:"))).toBe(false);
  });

  it("lists the suggestion among the week's issues when it was not dismissed", async () => {
    understood({ intent: "ask_week_issues" });
    const { caller } = makeCaller({ week1: tight() });
    const reply = await caller.interpret({ weekIndex: 1, text: "what's wrong with my week?" });
    if (reply.kind === "answer") expect(reply.lines.some((l) => l.startsWith("Suggested:"))).toBe(true);
    else expect.unreachable();
  });

  it("suggests again when the dismissed layout was a different one", async () => {
    understood({ intent: "rearrange_week" });
    const { caller } = makeCaller({ week1: tight(), dismissed: [{ payload: { layoutKey: "s1:3:-|s2:6:-" } }] });
    await expect(caller.interpret({ weekIndex: 1, text: "sort out my week" })).resolves.toMatchObject({
      kind: "rearrange",
      state: "suggestion",
    });
  });
});
