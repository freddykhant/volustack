import { PageHeader } from "~/components/ui-kit/app-shell-kit";
import { WeeklyCheckInFlow } from "~/components/checkin/weekly-checkin-flow";
import { NextSessionCard } from "~/components/home/next-session-card";
import { TrainingStatusCard } from "~/components/home/training-status-card";
import { CoachCard } from "~/components/home/coach-card";
import { ReadinessChip } from "~/components/readiness/readiness-chip";
import type {
  CoachNote,
  ReadinessLabel,
  ReadinessView,
  SessionView,
  TrainingStatusView,
} from "~/views/types";

/** The Now page's layout. Pure presentation: the route computes every value. */
export function NowHome({
  splitLabel,
  blockName,
  weekIndex,
  blockLengthWeeks,
  session,
  status,
  coachNotes,
  readiness,
  readinessLabel,
}: {
  splitLabel: string;
  blockName: string;
  weekIndex: number;
  blockLengthWeeks: number;
  session: SessionView | undefined;
  status: TrainingStatusView | undefined;
  coachNotes: CoachNote[];
  readiness: ReadinessView;
  readinessLabel: ReadinessLabel | undefined;
}) {
  const showCoach = coachNotes.length > 0;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          eyebrow={splitLabel}
          title={`Week ${weekIndex} of ${blockLengthWeeks}`}
          description={blockName}
        />
        <div className="animate-rise sm:pb-0.5">
          <ReadinessChip readiness={readiness} />
        </div>
      </div>

      <WeeklyCheckInFlow weekIndex={weekIndex} />

      <div className="animate-rise [animation-delay:60ms]">
        <NextSessionCard session={session} weekIndex={weekIndex} readinessLabel={readinessLabel} />
      </div>

      {status || showCoach ? (
        <div
          className={
            "grid animate-rise gap-6 [animation-delay:120ms] " +
            (status && showCoach ? "md:grid-cols-2" : "")
          }
        >
          {status ? <TrainingStatusCard status={status} /> : null}
          <CoachCard notes={coachNotes} />
        </div>
      ) : null}
    </div>
  );
}
