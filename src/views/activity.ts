import type { ActivityIntensity, ActivityKind, Daypart } from "~/schema";

export interface ActivityView {
  id: string;
  date: string; // "YYYY-MM-DD"
  daypart: Daypart | null;
  kind: ActivityKind;
  intensity: ActivityIntensity;
  durationMin: number | null;
}

export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  RUN: "Run",
  RIDE: "Ride",
  SWIM: "Swim",
  SPORT: "Sport",
  OTHER: "Other",
};

export const ACTIVITY_INTENSITY_LABEL: Record<ActivityIntensity, string> = {
  EASY: "easy",
  MODERATE: "moderate",
  HARD: "hard",
};

/** A `@db.Date` column arrives as UTC midnight of the stored calendar date. */
export function toActivityView(row: {
  id: string;
  date: Date;
  daypart: Daypart | null;
  kind: ActivityKind;
  intensity: ActivityIntensity;
  durationMin: number | null;
}): ActivityView {
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    daypart: row.daypart,
    kind: row.kind,
    intensity: row.intensity,
    durationMin: row.durationMin,
  };
}

/** "Run · hard · AM · 45 min". */
export function activityChipText(a: ActivityView): string {
  return [
    ACTIVITY_KIND_LABEL[a.kind],
    ACTIVITY_INTENSITY_LABEL[a.intensity],
    a.daypart,
    a.durationMin !== null ? `${a.durationMin} min` : null,
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");
}
