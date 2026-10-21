import { Panel, Skeleton } from "~/components/ui-kit/app-shell-kit";

/** Mirrors NowHome: header + readiness chip, next-session hero, status and coach pair. */
export default function NowLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-56" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
        <Skeleton className="h-6 w-28 rounded-pill" />
      </div>
      <Panel padding="none" className="p-6 md:p-8">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-8 w-48" />
        <Skeleton className="mt-3 h-4 w-52" />
        <div className="mt-5 flex flex-wrap gap-1.5">
          <Skeleton className="h-7 w-28 rounded-pill" />
          <Skeleton className="h-7 w-24 rounded-pill" />
          <Skeleton className="h-7 w-32 rounded-pill" />
        </div>
        <div className="mt-7 border-t border-border-subtle pt-6">
          <Skeleton className="h-11 w-full rounded-pill sm:w-40" />
        </div>
      </Panel>
      <div className="grid gap-6 md:grid-cols-2">
        {[0, 1].map((i) => (
          <Panel key={i}>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-4 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-3/4" />
            <Skeleton className="mt-2 h-4 w-1/2" />
          </Panel>
        ))}
      </div>
    </div>
  );
}
