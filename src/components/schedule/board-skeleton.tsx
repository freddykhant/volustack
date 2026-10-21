import { Skeleton } from "~/components/ui-kit/app-shell-kit";

/** The week board's shape while it loads: a composer, then seven timeline rows. */
export function BoardSkeleton({ composer = true }: { composer?: boolean }) {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      {composer ? <Skeleton className="h-12 w-full rounded-pill" /> : null}
      <ol className="flex flex-col">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <li key={i} className="grid grid-cols-[56px_1fr] gap-3 sm:grid-cols-[88px_1fr] sm:gap-5">
            <div className="flex flex-col gap-1.5 pt-4">
              <Skeleton className="h-4 w-9" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="relative py-1.5 pl-6">
              <span className="absolute top-0 bottom-0 left-[4px] border-l border-dashed border-border-strong" />
              <span className="absolute top-[22px] left-0 size-2.5 rounded-full bg-border-strong" />
              {i % 2 === 0 ? (
                <Skeleton className="h-[84px] w-full rounded-callout" />
              ) : (
                <Skeleton className="h-14 w-full rounded-callout opacity-60" />
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
