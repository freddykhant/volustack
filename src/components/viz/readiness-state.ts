import type { ReadinessLabel } from "~/views/types";

/** Below this settled-fitness level there is too little logged load to judge form. */
export const FITNESS_FLOOR = 1.5;

/** Band Form as a fraction of Fitness (athlete-relative, TSB-style). Classification
 * only — invents no numbers (Law 1). Cold start (fitness below floor) → Building. */
export function readinessState(point: { fitness: number; form: number }): ReadinessLabel {
  if (point.fitness < FITNESS_FLOOR) return "Building";
  const pct = point.form / point.fitness;
  if (pct >= 0.05) return "Fresh";
  if (pct >= -0.1) return "Productive";
  if (pct >= -0.3) return "Fatigued";
  return "Overreaching";
}
