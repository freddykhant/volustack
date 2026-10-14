import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({ env: { ANTHROPIC_API_KEY: undefined, COACH_MODEL: "claude-sonnet-5-5" } }));

import { anthropicInterpreter, coachEnabled, parseToolResponse } from "./client";

const tool = (input: unknown) => [{ type: "tool_use", name: "coach_intent", input }];
const good = { intent: "block_time", dates: [{ date: "2026-10-15", daypart: null }], sessionKey: null };

describe("parseToolResponse", () => {
  it("returns the form from the tool call", () => {
    expect(parseToolResponse(tool(good))).toEqual(good);
  });
  it("ignores text blocks and strips unknown fields", () => {
    expect(parseToolResponse([{ type: "text", text: "Sure!" }, ...tool({ ...good, reply: "done" })])).toEqual(good);
  });
  it("returns null for anything that is not the form", () => {
    expect(parseToolResponse([{ type: "text", text: "I blocked Thursday for you." }])).toBeNull();
    expect(parseToolResponse(tool({ intent: "wipe_account", dates: [], sessionKey: null }))).toBeNull();
    expect(parseToolResponse(tool({ ...good, dates: Array.from({ length: 30 }, () => good.dates[0]) }))).toBeNull();
    expect(parseToolResponse([{ type: "tool_use", name: "something_else", input: good }])).toBeNull();
    expect(parseToolResponse(null)).toBeNull();
    expect(parseToolResponse("block_time")).toBeNull();
  });
});

describe("without a key", () => {
  it("is disabled and makes no call", async () => {
    expect(coachEnabled()).toBe(false);
    const ctx = { today: "2026-10-14", todayWeekday: "Wednesday", scheduleMode: "one session a day", viewedWeek: 1, dates: [], sessions: [] };
    await expect(anthropicInterpreter.interpret("can't make Thursday", ctx)).resolves.toEqual({ ok: false, reason: "no_key" });
  });
});
