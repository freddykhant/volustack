import type { SessionView, WeekView } from "~/views/types";

/** The next session to train in a week: the first still-scheduled one, in the order
 * the week lays them out (placement order). Undefined when nothing is left. */
export function nextSession(week: WeekView): SessionView | undefined {
  return week.sessions.find((s) => s.status === "SCHEDULED");
}
