import type { ActivityAddInput, ActivityIntensity, ActivityKind, Daypart } from "~/schema";

export interface ActivityDraft {
  kind: ActivityKind;
  intensity: ActivityIntensity;
  daypart: Daypart | null;
  /** As typed; blank means not said. */
  minutes: string;
}

export const EMPTY_ACTIVITY_DRAFT: ActivityDraft = { kind: "RUN", intensity: "MODERATE", daypart: null, minutes: "" };

/** The add request for a draft, or the sentence explaining why it can't be sent. */
export function toAddInput(draft: ActivityDraft, weekIndex: number, date: string): ActivityAddInput | string {
  const typed = draft.minutes.trim();
  let durationMin: number | null = null;
  if (typed !== "") {
    const n = Number(typed);
    if (!Number.isInteger(n) || n < 5 || n > 600) return "Minutes should be a whole number from 5 to 600.";
    durationMin = n;
  }
  return { weekIndex, date, kind: draft.kind, intensity: draft.intensity, daypart: draft.daypart, durationMin };
}
