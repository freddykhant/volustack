import { deriveCues } from "~/engine/cues";
import { toCueView, type CueView } from "~/views/cues";

// Kept apart from demo-data.ts, which client vignettes import, so the cue engine stays off the client.
/**
 * The coach-cue card, built by the app's own cue engine and wording rather than written by hand:
 * Lower B in the morning, a 10k in the evening, an 80 kg athlete at maintenance.
 */
const fuelBetween = deriveCues({
  date: "2026-11-14",
  lifts: [{ id: "lower-b", label: "Lower B", daypart: "AM", footprint: { QUADS: 6, HAMSTRINGS: 4 } }],
  activities: [{ id: "run", kind: "RUN", intensity: "MODERATE", daypart: "PM", durationMin: 50 }],
  previous: { lifts: [], activities: [] },
  weightKg: 80,
  phase: "MAINTAIN",
}).find((f) => f.kind === "fuel_between");
if (!fuelBetween) throw new Error("The demo day no longer produces a fuel_between cue");
export const DEMO_CUE: CueView = toCueView(fuelBetween, "tomorrow");
