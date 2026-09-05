import type { SessionView, WeekView } from "~/views/types";

/** The next session to train in a week. Skeleton rule: the first session
 * (no completion state yet). Returns undefined for a session-less week. */
export function nextSession(week: WeekView): SessionView | undefined {
  return week.sessions[0];
}
