import { BoardSkeleton } from "~/components/schedule/board-skeleton";
import { Skeleton } from "~/components/ui-kit/app-shell-kit";

export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-[800px] px-6 pt-10 pb-20 md:px-10"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading your week…</span>
      <Skeleton className="h-4 w-16" />
      <Skeleton className="mt-6 h-3 w-20" />
      <Skeleton className="mt-2 h-8 w-44" />
      <Skeleton className="mt-3 h-4 w-56" />
      <div className="mt-8">
        <BoardSkeleton />
      </div>
    </div>
  );
}
