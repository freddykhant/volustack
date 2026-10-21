import { Skeleton } from "~/components/ui-kit/app-shell-kit";

/** Wizard-shaped placeholder while the session/block check resolves. */
export default function OnboardingLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-1 flex-1 rounded-pill" />
          ))}
        </div>
        <Skeleton className="h-4 w-8" />
      </div>

      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-4 w-12" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-11 rounded-control" />
            <Skeleton className="h-11 rounded-control" />
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-11 rounded-control" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-11 rounded-control" />
          </div>
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-11 rounded-control" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end border-t border-border-subtle pt-6">
        <Skeleton className="h-11 w-32 rounded-pill" />
      </div>
    </div>
  );
}
