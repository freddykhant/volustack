import type { ReadinessLabel } from "~/views/types";

/** Band a Form value (Fitness − Fatigue) into a readiness state. Classification
 * only — invents no numbers (Law 1). Top-down, first match wins. */
export function readinessState(form: number): ReadinessLabel {
  if (form >= 5) return "Fresh";
  if (form >= -10) return "Productive";
  if (form >= -25) return "Fatigued";
  return "Overreaching";
}
