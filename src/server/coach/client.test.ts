import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// A stand-in SDK: the call shape is asserted here and nothing reaches the network.
const sdk = vi.hoisted(() => {
  class APIError extends Error {
    status: number | undefined;
    constructor(status: number | undefined, message: string) {
      super(message);
      this.status = status;
    }
  }
  class APIConnectionTimeoutError extends APIError {
    constructor(message: string) {
      super(undefined, message);
    }
  }
  const create = vi.fn();
  const constructed = vi.fn();
  class Anthropic {
    static APIError = APIError;
    static APIConnectionTimeoutError = APIConnectionTimeoutError;
    messages = { create };
    constructor(options: unknown) {
      constructed(options);
    }
  }
  const env: { ANTHROPIC_API_KEY: string | undefined; COACH_MODEL: string } = {
    ANTHROPIC_API_KEY: undefined,
    COACH_MODEL: "test-coach-model",
  };
  return { Anthropic, APIError, APIConnectionTimeoutError, create, constructed, env };
});

vi.mock("@anthropic-ai/sdk", () => ({ default: sdk.Anthropic }));
vi.mock("~/env", () => ({ env: sdk.env }));

import { anthropicInterpreter, coachEnabled, parseToolResponse } from "./client";

const tool = (input: unknown) => [{ type: "tool_use", name: "coach_intent", input }];
const good = { intent: "block_time", dates: [{ date: "2026-10-15", daypart: null }], sessionKey: null };
const ctx = { today: "2026-10-14", todayWeekday: "Wednesday", scheduleMode: "one session a day", viewedWeek: 1, dates: [], sessions: [] };

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
    sdk.env.ANTHROPIC_API_KEY = undefined;
    expect(coachEnabled()).toBe(false);
    await expect(anthropicInterpreter.interpret("can't make Thursday", ctx)).resolves.toEqual({ ok: false, reason: "no_key" });
    expect(sdk.constructed).not.toHaveBeenCalled();
    expect(sdk.create).not.toHaveBeenCalled();
  });
});

describe("with a key", () => {
  const text = "can't make Thursday, my secret plans";
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    sdk.env.ANTHROPIC_API_KEY = "test-key";
    sdk.create.mockReset();
    sdk.constructed.mockReset();
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    sdk.env.ANTHROPIC_API_KEY = undefined;
    warn.mockRestore();
  });

  const response = (stop_reason: string, content: unknown = tool(good)) => ({
    stop_reason,
    content,
    model: "test-coach-model-v1",
    usage: { input_tokens: 812, output_tokens: 41 },
  });

  it("builds the client with a short timeout, no retry and a quiet log level", async () => {
    sdk.create.mockResolvedValue(response("tool_use"));
    await anthropicInterpreter.interpret(text, ctx);
    expect(sdk.constructed).toHaveBeenCalledTimes(1);
    expect(sdk.constructed.mock.calls[0]![0]).toMatchObject({ timeout: 8000, maxRetries: 0, logLevel: "warn" });
  });

  it("forces one call of the coach_intent tool on the configured model", async () => {
    sdk.create.mockResolvedValue(response("tool_use"));
    await anthropicInterpreter.interpret(text, ctx);
    const body = sdk.create.mock.calls[0]![0] as {
      model: string;
      max_tokens: number;
      tools: { name: string }[];
      tool_choice: unknown;
    };
    expect(body.model).toBe("test-coach-model");
    expect(body.max_tokens).toBe(400);
    expect(body.tools.map((t) => t.name)).toEqual(["coach_intent"]);
    expect(body.tool_choice).toEqual({ type: "tool", name: "coach_intent" });
  });

  it("returns the form and usage when the model calls the tool", async () => {
    sdk.create.mockResolvedValue(response("tool_use"));
    await expect(anthropicInterpreter.interpret(text, ctx)).resolves.toEqual({
      ok: true,
      form: good,
      model: "test-coach-model-v1",
      inputTokens: 812,
      outputTokens: 41,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("refuses a response that did not stop on the tool call", async () => {
    sdk.create.mockResolvedValue(response("max_tokens"));
    await expect(anthropicInterpreter.interpret(text, ctx)).resolves.toEqual({ ok: false, reason: "invalid_form" });
  });

  it("reports a timeout", async () => {
    sdk.create.mockRejectedValue(new sdk.APIConnectionTimeoutError("Request timed out."));
    await expect(anthropicInterpreter.interpret(text, ctx)).resolves.toEqual({ ok: false, reason: "timeout" });
  });

  it("reports any other error and logs one line without the athlete's text", async () => {
    sdk.create.mockRejectedValue(new sdk.APIError(400, `400 bad request: ${text}`));
    await expect(anthropicInterpreter.interpret(text, ctx)).resolves.toEqual({ ok: false, reason: "api_error" });
    expect(warn).toHaveBeenCalledTimes(1);
    const args = warn.mock.calls[0]!.map(String);
    expect(args.join(" ")).toContain("coach.interpret");
    expect(args.join(" ")).toContain("api_error");
    expect(args.join(" ")).toContain("status=400");
    for (const arg of args) {
      expect(arg).not.toContain("secret plans");
      expect(arg).not.toContain("test-key");
    }
  });
});
