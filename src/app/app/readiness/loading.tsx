import { Panel, Skeleton } from "~/components/ui-kit/app-shell-kit";

/** Mirrors ReadinessScreen: header, headline panel with three stats, chart panel. */
export default function ReadinessLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-8 w-44" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </div>
      <Panel padding="none" className="p-6 md:p-8">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-8 w-36" />
        <div className="mt-7 grid grid-cols-3 gap-4 border-t border-border-subtle pt-6">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="h-3 w-14" />
              <Skeleton className="mt-2 h-9 w-16" />
            </div>
          ))}
        </div>
      </Panel>
      <Panel padding="none" className="p-6 md:p-8">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2 h-4 w-56" />
        <Skeleton className="mt-8 h-52 w-full md:h-60" />
      </Panel>
    </div>
  );
}
