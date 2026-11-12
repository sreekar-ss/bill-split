import { Skeleton } from "@/components/ui/page";

export default function Loading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-3 h-4 w-64" />
      <div className="mt-8 space-y-5">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-11 w-full rounded-[10px]" />
          </div>
        ))}
        <Skeleton className="h-12 w-full rounded-[10px]" />
      </div>
    </div>
  );
}
