import { describe, expect, it } from "vitest";
import { activityChipText, toActivityView } from "./activity";

describe("activity views", () => {
  it("reads the date column as the local calendar date", () => {
    const v = toActivityView({ id: "a", date: new Date("2026-10-20T00:00:00Z"), daypart: "AM", kind: "RUN", intensity: "HARD", durationMin: 45 });
    expect(v.date).toBe("2026-10-20");
  });
  it("writes a chip as kind · intensity · time · minutes, leaving out what is not set", () => {
    const base = { id: "a", date: "2026-10-20", kind: "RUN", intensity: "HARD" } as const;
    expect(activityChipText({ ...base, daypart: "AM", durationMin: 45 })).toBe("Run · hard · AM · 45 min");
    expect(activityChipText({ ...base, daypart: null, durationMin: null })).toBe("Run · hard");
    expect(activityChipText({ ...base, kind: "SPORT", intensity: "EASY", daypart: "PM", durationMin: null })).toBe("Sport · easy · PM");
  });
});
