import { ArrowRight, Clock, Dumbbell, ListChecks, Moon } from "lucide-react";
import type { ReadinessLabel, SessionView } from "~/views/types";
import { ButtonLink, Chip, Panel } from "~/components/ui-kit/app-shell-kit";
import { SessionSwapControl } from "~/components/home/session-swap-control";

/** The Now page's hero: the one session to do next, with the page's single ink action. */
export function NextSessionCard({
  session,
  weekIndex,
  readinessLabel,
}: {
  session: SessionView | undefined;
  weekIndex: number;
  readinessLabel?: ReadinessLabel;
}) {
  if (!session) {
    return (
      <Panel padding="none" className="flex items-center gap-4 p-6 md:p-8">
        <span className="bg-aura flex size-11 shrink-0 items-center justify-center rounded-pill text-fg-soft">
          <Moon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-eyebrow font-medium text-fg-subtle">Next session</div>
          <div className="mt-1 text-card-title text-fg">Nothing on deck — recovery is training too.</div>
        </div>
      </Panel>
    );
  }
  const exercises = session.prescriptions.map((p) => p.exerciseName);
  const shown = exercises.slice(0, 4);
  const more = exercises.length - shown.length;
  return (
    <Panel as="section" padding="none" aria-label="Next session" className="p-6 md:p-8">
      <div className="flex items-center gap-2 text-eyebrow font-medium text-accent">
        <span className="size-1.5 rounded-full bg-accent" aria-hidden />
        Next session
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-page-title text-fg">{session.label}</h2>
        {session.dayTag ? <Chip>{session.dayTag}</Chip> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-card-desc text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <ListChecks className="size-4 text-fg-subtle" aria-hidden />
          <span className="tabular-nums">{session.prescriptions.length}</span> exercises
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-4 text-fg-subtle" aria-hidden />
          <span className="tabular-nums">~{session.estimatedMinutes}</span> min
        </span>
      </div>
      {shown.length > 0 ? (
        <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Exercises">
          {shown.map((name, i) => (
            <li
              key={`${name}-${i}`}
              className="rounded-pill bg-sunken px-3 py-1 text-meta text-fg-soft"
            >
              {name}
            </li>
          ))}
          {more > 0 ? (
            <li className="rounded-pill px-2 py-1 text-meta text-fg-subtle tabular-nums">+{more}</li>
          ) : null}
        </ul>
      ) : null}
      <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-6">
        <ButtonLink
          href={`/app/block/week/${weekIndex}`}
          variant="primary"
          size="lg"
          icon={Dumbbell}
          trailingIcon={ArrowRight}
          className="w-full sm:w-auto"
        >
          {"Let's train"}
        </ButtonLink>
        {session.swapOptions && session.swapOptions.length > 0 ? (
          <SessionSwapControl options={session.swapOptions} readinessLabel={readinessLabel} />
        ) : null}
      </div>
    </Panel>
  );
}
