import { describe, expect, it } from "vitest";
import type { CoachIntentForm } from "~/schema";
import { resolveCoachForm, type CoachDate, type CoachWeek } from "./resolve";

// Today is Wed 14 Oct 2026. Week 2 of the block runs Mon 12 … Sun 18; week 3 follows.
const date = (iso: string, weekday: number, weekIndex: number, over: Partial<CoachDate> = {}): CoachDate => ({
  date: iso, weekday, weekIndex, am: null, pm: null, ...over,
});
const DATES: CoachDate[] = [
  date("2026-10-14", 2, 2),
  date("2026-10-15", 3, 2),
  date("2026-10-16", 4, 2),
  date("2026-10-17", 5, 2),
  date("2026-10-18", 6, 2),
  date("2026-10-19", 0, 3),
  date("2026-10-20", 1, 3),
];

const week = (over: Partial<CoachWeek> = {}): CoachWeek => ({
  mode: "DAY",
  weekIndex: 2,
  dates: DATES,
  sessions: [
    { key: "S1", id: "id-upper", label: "Upper A", status: "COMPLETED", placement: { day: 0, daypart: null } },
    { key: "S2", id: "id-legs", label: "Legs", status: "SCHEDULED", placement: { day: 3, daypart: null } },
    { key: "S3", id: "id-arms", label: "Arms", status: "SCHEDULED", placement: { day: 5, daypart: null } },
  ],
  stranded: false,
  warnings: [],
  suggestion: null,
  next: null,
  readiness: null,
  explain: () => null,
  ...over,
});

const form = (over: Partial<CoachIntentForm>): CoachIntentForm => ({ intent: "block_time", dates: [], sessionKey: null, ...over });
const whole = (iso: string) => ({ date: iso, daypart: null });

describe("block_time", () => {
  it("offers to block the named days, in date order", () => {
    const reply = resolveCoachForm(form({ dates: [whole("2026-10-17"), whole("2026-10-15")] }), week());
    expect(reply).toEqual({
      kind: "confirm_block",
      cells: [whole("2026-10-15"), whole("2026-10-17")],
      summary: "Block Thu 15 Oct and Sat 17 Oct?",
      alreadyBlocked: [],
    });
  });

  it("leaves out days that are already blocked and says which", () => {
    const dates = DATES.map((d) => (d.date === "2026-10-16" ? { ...d, am: "standing" as const, pm: "one_off" as const } : d));
    const reply = resolveCoachForm(
      form({ dates: [whole("2026-10-15"), whole("2026-10-16"), whole("2026-10-17")] }),
      week({ dates }),
    );
    expect(reply).toMatchObject({
      kind: "confirm_block",
      cells: [whole("2026-10-15"), whole("2026-10-17")],
      alreadyBlocked: ["Fri 16 Oct"],
    });
  });

  it("says so when everything asked for is already blocked", () => {
    const dates = DATES.map((d) => (d.date === "2026-10-15" ? { ...d, am: "one_off" as const, pm: "one_off" as const } : d));
    expect(resolveCoachForm(form({ dates: [whole("2026-10-15")] }), week({ dates }))).toEqual({
      kind: "note",
      lines: ["Thu 15 Oct is already blocked."],
    });
  });

  it("in one-a-day mode a half-day becomes the whole day", () => {
    const reply = resolveCoachForm(form({ dates: [{ date: "2026-10-15", daypart: "AM" }] }), week());
    expect(reply).toMatchObject({ kind: "confirm_block", cells: [whole("2026-10-15")], summary: "Block Thu 15 Oct?" });
  });

  it("in one-a-day mode a day with only one half standing-blocked is still offered whole", () => {
    const dates = DATES.map((d) => (d.date === "2026-10-15" ? { ...d, am: "standing" as const } : d));
    expect(resolveCoachForm(form({ dates: [whole("2026-10-15")] }), week({ dates }))).toMatchObject({
      kind: "confirm_block",
      cells: [whole("2026-10-15")],
    });
  });

  it("in AM/PM mode keeps half-days, merges two halves into a day, and trims a blocked half", () => {
    const dates = DATES.map((d) => (d.date === "2026-10-17" ? { ...d, pm: "standing" as const } : d));
    const reply = resolveCoachForm(
      form({
        dates: [
          { date: "2026-10-15", daypart: "PM" },
          { date: "2026-10-16", daypart: "AM" },
          { date: "2026-10-16", daypart: "PM" },
          whole("2026-10-17"),
        ],
      }),
      week({ mode: "HALF_DAY", dates }),
    );
    expect(reply).toMatchObject({
      kind: "confirm_block",
      cells: [{ date: "2026-10-15", daypart: "PM" }, whole("2026-10-16"), { date: "2026-10-17", daypart: "AM" }],
      alreadyBlocked: ["Sat 17 Oct (afternoon)"],
    });
  });

  it("drops dates it was never offered and asks which day when none are left", () => {
    const reply = resolveCoachForm(form({ dates: [whole("2026-10-01"), whole("2027-01-01")] }), week());
    expect(reply.kind).toBe("clarify");
    if (reply.kind !== "clarify") return;
    expect(reply.question).toBe("Which day can't you train?");
    // The rest of the viewed week, today onward.
    expect(reply.choices.map((c) => c.label)).toEqual(["Wed 14 Oct", "Thu 15 Oct", "Fri 16 Oct", "Sat 17 Oct", "Sun 18 Oct"]);
    expect(reply.choices[1]!.reply).toMatchObject({ kind: "confirm_block", cells: [whole("2026-10-15")] });
  });

  it("collapses duplicate dates", () => {
    const reply = resolveCoachForm(form({ dates: [whole("2026-10-15"), whole("2026-10-15")] }), week());
    expect(reply).toMatchObject({ kind: "confirm_block", cells: [whole("2026-10-15")] });
  });
});

describe("unblock_time", () => {
  const dates = DATES.map((d) =>
    d.date === "2026-10-15"
      ? { ...d, am: "one_off" as const, pm: "one_off" as const }
      : d.date === "2026-10-16"
        ? { ...d, am: "standing" as const, pm: "standing" as const }
        : d,
  );

  it("offers to unblock one-off time only, and points standing blocks to Settings", () => {
    const reply = resolveCoachForm(
      form({ intent: "unblock_time", dates: [whole("2026-10-15"), whole("2026-10-16")] }),
      week({ dates }),
    );
    expect(reply).toEqual({
      kind: "confirm_unblock",
      cells: [whole("2026-10-15")],
      summary: "Unblock Thu 15 Oct?",
      notes: ["Fri 16 Oct is blocked in your standing availability. Change that in Settings."],
    });
  });

  it("says so when nothing named is blocked", () => {
    expect(resolveCoachForm(form({ intent: "unblock_time", dates: [whole("2026-10-17")] }), week({ dates }))).toEqual({
      kind: "note",
      lines: ["Sat 17 Oct isn't blocked."],
    });
  });

  it("with no date, offers each one-off block in the viewed week", () => {
    const reply = resolveCoachForm(form({ intent: "unblock_time" }), week({ dates }));
    expect(reply).toMatchObject({ kind: "clarify", question: "Which blocked time should I open up?" });
    if (reply.kind === "clarify") expect(reply.choices.map((c) => c.label)).toEqual(["Thu 15 Oct"]);
  });
});

describe("skip_session", () => {
  it("offers to skip the named scheduled session", () => {
    expect(resolveCoachForm(form({ intent: "skip_session", sessionKey: "S2" }), week())).toEqual({
      kind: "skip",
      sessionId: "id-legs",
      label: "Legs",
      summary: "Skip Legs on Thursday this week?",
    });
  });

  it("refuses a session that is already done", () => {
    expect(resolveCoachForm(form({ intent: "skip_session", sessionKey: "S1" }), week())).toEqual({
      kind: "note",
      lines: ["Upper A is already done."],
    });
  });

  it("asks which when no usable key was given and several are scheduled", () => {
    const reply = resolveCoachForm(form({ intent: "skip_session", sessionKey: "S9" }), week());
    expect(reply).toMatchObject({ kind: "clarify", question: "Which session do you want to skip?" });
    if (reply.kind === "clarify") expect(reply.choices.map((c) => c.label)).toEqual(["Legs", "Arms"]);
  });

  it("takes the only scheduled session when there is just one", () => {
    const sessions = week().sessions.map((s) => (s.key === "S3" ? { ...s, status: "MISSED" as const } : s));
    expect(resolveCoachForm(form({ intent: "skip_session" }), week({ sessions }))).toMatchObject({ kind: "skip", sessionId: "id-legs" });
  });

  it("says so when nothing is left to skip", () => {
    const sessions = week().sessions.map((s) => ({ ...s, status: "COMPLETED" as const }));
    expect(resolveCoachForm(form({ intent: "skip_session" }), week({ sessions }))).toEqual({
      kind: "note",
      lines: ["Every session this week is done or missed."],
    });
  });
});

describe("rearrange_week", () => {
  it("points to the options when a session is on blocked time", () => {
    expect(resolveCoachForm(form({ intent: "rearrange_week" }), week({ stranded: true }))).toEqual({
      kind: "rearrange",
      state: "options",
      lines: ["A session is on time you've blocked. Your options are just below."],
    });
  });
  it("relays the engine's suggestion when it has one", () => {
    const suggestion = { headline: "Move Arms from Sat to Sun.", reasons: ["4 training days in a row."] };
    expect(resolveCoachForm(form({ intent: "rearrange_week" }), week({ suggestion }))).toEqual({
      kind: "rearrange",
      state: "suggestion",
      lines: ["Move Arms from Sat to Sun.", "4 training days in a row.", "You can accept it on the board below."],
    });
  });
  it("says the week needs nothing otherwise", () => {
    expect(resolveCoachForm(form({ intent: "rearrange_week" }), week())).toEqual({
      kind: "rearrange",
      state: "nothing",
      lines: ["The engine has no change to suggest for this week."],
    });
  });
});

describe("questions", () => {
  it("answers what's wrong with the week", () => {
    expect(resolveCoachForm(form({ intent: "ask_week_issues" }), week({ warnings: ["4 training days in a row."] }))).toEqual({
      kind: "answer",
      topic: "week_issues",
      lines: ["4 training days in a row."],
    });
  });

  it("answers why a session is where it is, through the engine's explanation", () => {
    const explain = (id: string) =>
      id === "id-legs"
        ? { sessionId: "id-legs", current: { day: 3, daypart: null }, currentFacts: [], alternatives: [], better: null, isBest: true, inSuggestion: false }
        : null;
    expect(resolveCoachForm(form({ intent: "ask_why_placement", sessionKey: "S2" }), week({ explain }))).toEqual({
      kind: "answer",
      topic: "why_placement",
      lines: ["Legs is on Thursday.", "There is no other open time for it this week."],
    });
  });

  it("explains that a finished session stays where it was", () => {
    expect(resolveCoachForm(form({ intent: "ask_why_placement", sessionKey: "S1" }), week())).toEqual({
      kind: "answer",
      topic: "why_placement",
      lines: ["Upper A is already done, so it stays where it was."],
    });
  });

  it("asks which session when none was named", () => {
    const reply = resolveCoachForm(form({ intent: "ask_why_placement" }), week());
    expect(reply).toMatchObject({ kind: "clarify", question: "Which session do you mean?" });
    if (reply.kind === "clarify") expect(reply.choices.map((c) => c.label)).toEqual(["Legs", "Arms"]);
  });

  it("answers what's next and how recovery reads", () => {
    expect(resolveCoachForm(form({ intent: "ask_next_session" }), week())).toEqual({
      kind: "answer",
      topic: "next_session",
      lines: ["Every session this week is done or missed."],
    });
    expect(resolveCoachForm(form({ intent: "ask_recovery" }), week())).toEqual({
      kind: "answer",
      topic: "recovery",
      lines: ["There isn't enough logged training yet to read your recovery."],
    });
  });
});

describe("unclear and out of scope", () => {
  it("offers the questions that need no more input when the message was unclear", () => {
    const reply = resolveCoachForm(form({ intent: "unclear" }), week());
    expect(reply).toMatchObject({ kind: "clarify", question: "I didn't catch that. Did you mean one of these?" });
    if (reply.kind === "clarify") {
      expect(reply.choices.map((c) => c.label)).toEqual(["What's wrong with my week?", "What's next?", "How's my recovery?"]);
    }
  });
  it("says what it can do when the message is out of scope", () => {
    expect(resolveCoachForm(form({ intent: "out_of_scope" }), week()).kind).toBe("unsupported");
  });
  it("ignores fields an intent does not use", () => {
    const reply = resolveCoachForm(form({ intent: "ask_recovery", dates: [whole("2026-10-15")], sessionKey: "S2" }), week());
    expect(reply.kind).toBe("answer");
  });
});
