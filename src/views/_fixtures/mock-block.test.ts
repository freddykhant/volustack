import { describe, expect, it } from "vitest";
import { mockMesocycle } from "~/views/_fixtures/mock-block";

describe("mockMesocycle.coachNotes", () => {
  it("has at least one note", () => {
    expect(mockMesocycle.coachNotes.length).toBeGreaterThan(0);
  });

  it("every note is well-formed", () => {
    const validTones = new Set(["info", "caution", "positive"]);
    for (const note of mockMesocycle.coachNotes) {
      expect(note.id.length).toBeGreaterThan(0);
      expect(note.text.length).toBeGreaterThan(0);
      expect(validTones.has(note.tone)).toBe(true);
    }
  });

  it("note ids are unique", () => {
    const ids = mockMesocycle.coachNotes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
