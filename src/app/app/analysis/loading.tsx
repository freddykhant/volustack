import { Panel, Skeleton } from "~/components/ui-kit/app-shell-kit";

/** Mirrors AnalysisView: header with week picker, body map + landmark bars, distribution. */
export default function AnalysisLoading() {
  return (
    <div
      aria-busy="true"
      className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-6 pt-10 pb-20 md:px-10"
    >
      <header>
        <Skeleton className="h-3 w-14" />
        <div className="mt-2.5 flex items-end justify-between gap-4">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-28 rounded-pill" />
        </div>
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      </header>
      <Panel padding="lg">
        <Skeleton className="mb-5 h-4 w-80 max-w-full" />
        <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
          <Skeleton className="aspect-[320/220] w-full max-w-[320px] rounded-callout" />
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 flex-1 rounded-pill" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <Panel padding="lg">
        <Skeleton className="h-3 w-32" />
        <div className="mt-4 flex h-24 items-end gap-3">
          {["h-[60%]", "h-[90%]", "h-[75%]", "h-[45%]"].map((h) => (
            <Skeleton key={h} className={"w-full rounded-t-control " + h} />
          ))}
        </div>
      </Panel>
    </div>
  );
}
