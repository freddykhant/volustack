import type { ReadinessSample } from "~/engine";
import type { ReadinessView } from "./types";

/** Wrap engine readiness samples into the view model. Samples are field-identical
 * to ReadinessPoint; no numbers invented (Law 1). */
export function toReadinessView(samples: ReadinessSample[], currentWeekIndex: number): ReadinessView {
  return { series: samples, currentWeekIndex };
}
