import { describe, expect, it } from "vitest";
import { blockedReason, confirmErrorText } from "./messages";

describe("blockedReason", () => {
  it("names an open draft first", () => {
    expect(blockedReason({ draftOpen: true, boardSaving: true })).toBe(
      "Finish or discard your changes first.",
    );
  });

  it("names the board's own save in flight", () => {
    expect(blockedReason({ draftOpen: false, boardSaving: true })).toBe(
      "Saving your change…",
    );
  });

  it("is null when nothing stands in the way", () => {
    expect(blockedReason({ draftOpen: false, boardSaving: false })).toBeNull();
  });
});

describe("confirmErrorText", () => {
  it("shows the server's sentence for a bad request or a conflict", () => {
    expect(
      confirmErrorText({
        message: "Too many dates.",
        data: { code: "BAD_REQUEST" },
      }),
    ).toBe("Too many dates.");
    expect(
      confirmErrorText({
        message: "The week changed.",
        data: { code: "CONFLICT" },
      }),
    ).toBe("The week changed.");
  });

  it("shows fixed copy for any other failure", () => {
    expect(
      confirmErrorText({
        message: "boom",
        data: { code: "INTERNAL_SERVER_ERROR" },
      }),
    ).toBe("That didn’t save. Try again.");
    expect(confirmErrorText({ message: "Failed to fetch", data: null })).toBe(
      "That didn’t save. Try again.",
    );
  });

  it("is null when there is no error", () => {
    expect(confirmErrorText(null)).toBeNull();
  });
});
