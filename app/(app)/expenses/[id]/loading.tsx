import { CommentsSkeleton } from "@/components/comments/comments-section";
import { Skeleton } from "@/components/ui/page";

/** Mirrors the expense page: back link, title, summary panel, actions, shares, comments. */
export default function Loading() {
  return (
    <div className="max-w-[720px]" role="status" aria-busy="true">
      <span className="sr-only">Loading expense…</span>
      <Skeleton className="mb-4 h-6 w-28" />
      <Skeleton className="mb-2 h-8 w-2/3" />
      <Skeleton className="mb-5 h-4 w-24" />
      <Skeleton className="h-52 w-full rounded-[20px]" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-11 w-24 rounded-[10px]" />
        <Skeleton className="h-11 w-28 rounded-[10px]" />
      </div>
      <Skeleton className="mb-3 mt-8 h-6 w-24" />
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-rule py-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
      <Skeleton className="mb-3 mt-8 h-6 w-28" />
      <div aria-hidden>
        <CommentsSkeleton />
      </div>
    </div>
  );
}
