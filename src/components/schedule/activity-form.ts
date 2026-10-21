import {
  ACTIVITY_MAX_MINUTES,
  ACTIVITY_MIN_MINUTES,
  type ActivityAddInput,
  type ActivityIntensity,
  type ActivityKind,
  type Daypart,
} from "~/schema";

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
    if (!Number.isInteger(n) || n < ACTIVITY_MIN_MINUTES || n > ACTIVITY_MAX_MINUTES)
      return `Minutes should be a whole number from ${ACTIVITY_MIN_MINUTES} to ${ACTIVITY_MAX_MINUTES}.`;
    durationMin = n;
  }
  return { weekIndex, date, kind: draft.kind, intensity: draft.intensity, daypart: draft.daypart, durationMin };
}
