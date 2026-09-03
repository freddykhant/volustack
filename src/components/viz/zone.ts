export type { Zone } from "~/views/types";
import type { Zone } from "~/views/types";

/** Classify a weekly set volume into its landmark zone. Boundaries are inclusive
 * at the lower edge: exactly MEV = building, exactly MAV = optimal, exactly MRV = max. */
export function zoneFor(
  volume: number,
  lm: { mev: number; mav: number; mrv: number },
): Zone {
  if (volume < lm.mev) return "rest";
  if (volume < lm.mav) return "building";
  if (volume < lm.mrv) return "optimal";
  return "max";
}
