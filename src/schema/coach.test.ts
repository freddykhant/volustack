import { describe, expect, it } from "vitest";
import {
  COACH_DAILY_LIMIT,
  CoachIntentEnum,
  CoachIntentFormSchema,
  CoachMessageInputSchema,
  ExceptionCellsInputSchema,
} from "./coach";

const form = (over: Record<string, unknown> = {}) => ({ intent: "block_time", dates: [], sessionKey: null, ...over });

describe("CoachIntentFormSchema", () => {
  it("accepts every intent", () => {
    for (const intent of CoachIntentEnum.options) {
      expect(CoachIntentFormSchema.safeParse(form({ intent })).success).toBe(true);
    }
    expect(CoachIntentEnum.options).toHaveLength(10);
  });

  it("accepts dates with a half-day or null, and a session key", () => {
    const parsed = CoachIntentFormSchema.safeParse(
      form({ dates: [{ date: "2026-10-15", daypart: null }, { date: "2026-10-16", daypart: "AM" }], sessionKey: "S3" }),
    );
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown intent, a malformed date, a malformed key and too many dates", () => {
    expect(CoachIntentFormSchema.safeParse(form({ intent: "delete_everything" })).success).toBe(false);
    expect(CoachIntentFormSchema.safeParse(form({ dates: [{ date: "Thursday", daypart: null }] })).success).toBe(false);
    expect(CoachIntentFormSchema.safeParse(form({ sessionKey: "cku1abc" })).success).toBe(false);
    const many = Array.from({ length: 15 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, daypart: null }));
    expect(CoachIntentFormSchema.safeParse(form({ dates: many })).success).toBe(false);
  });

  it("drops fields it does not know", () => {
    const parsed = CoachIntentFormSchema.parse({ ...form(), reply: "Sure, I blocked it." });
    expect(parsed).not.toHaveProperty("reply");
  });
});

describe("CoachMessageInputSchema", () => {
  it("trims, and refuses empty or over-long text", () => {
    expect(CoachMessageInputSchema.parse({ weekIndex: 1, text: "  can't make Thursday  " }).text).toBe("can't make Thursday");
    expect(CoachMessageInputSchema.safeParse({ weekIndex: 1, text: "   " }).success).toBe(false);
    expect(CoachMessageInputSchema.safeParse({ weekIndex: 1, text: "x".repeat(501) }).success).toBe(false);
    expect(CoachMessageInputSchema.safeParse({ weekIndex: 1, text: "x".repeat(500) }).success).toBe(true);
  });
});

describe("ExceptionCellsInputSchema", () => {
  it("takes one to fourteen cells", () => {
    const cell = { date: "2026-10-15", daypart: null };
    expect(ExceptionCellsInputSchema.safeParse({ cells: [] }).success).toBe(false);
    expect(ExceptionCellsInputSchema.safeParse({ cells: [cell] }).success).toBe(true);
    expect(ExceptionCellsInputSchema.safeParse({ cells: Array.from({ length: 15 }, () => cell) }).success).toBe(false);
  });
});

it("caps the coach at fifty messages a day", () => {
  expect(COACH_DAILY_LIMIT).toBe(50);
});
