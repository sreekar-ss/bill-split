import { Skeleton } from "@/components/ui/page";

export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="max-w-[440px]">
      <span className="sr-only">Loading…</span>
      <Skeleton className="mb-6 h-8 w-32" />
      <div className="mb-8 flex items-center gap-3.5">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-52" />
        </div>
      </div>
      <Skeleton className="mb-4 h-6 w-24" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="mb-4 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-full rounded-[10px]" />
        </div>
      ))}
      <Skeleton className="h-11 w-36 rounded-[10px]" />
    </div>
  );
}
