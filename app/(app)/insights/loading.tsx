import { PageSkeleton } from "@/components/ui/page";

export default function Loading() {
  return (
    <div className="max-w-[720px]">
      <PageSkeleton rows={4} />
    </div>
  );
}
