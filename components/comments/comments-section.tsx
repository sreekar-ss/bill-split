import { Suspense } from "react";
import { Skeleton } from "@/components/ui/page";
import { listComments } from "@/lib/server/comments";
import { CommentThread } from "./comment-thread";

const HEADING_ID = "comments-heading";

type Props = {
  expenseId: string;
  me: { id: string; name: string };
  archived: boolean;
  /** Where to unarchive (the group page), linked from the archived note. */
  groupHref?: string;
};

/**
 * The "Comments" section of the expense page. The section and heading render straight away, so a
 * push notification's /expenses/<id>#comments link has its anchor, and the list streams in.
 */
export function CommentsSection(props: Props) {
  return (
    <section id="comments" aria-labelledby={HEADING_ID} className="mt-8 scroll-mt-6">
      <h2 id={HEADING_ID} tabIndex={-1} className="mb-3 text-title font-bold focus:outline-none">
        Comments
      </h2>
      <Suspense fallback={<CommentsSkeleton />}>
        <CommentList {...props} />
      </Suspense>
    </section>
  );
}

async function CommentList({ expenseId, me, archived, groupHref }: Props) {
  const comments = await listComments(me.id, expenseId);
  return <CommentThread expenseId={expenseId} comments={comments} me={me} archived={archived} groupHref={groupHref} headingId={HEADING_ID} />;
}

export function CommentsSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading comments…</span>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="flex gap-3 border-b border-rule py-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
      <Skeleton className="mt-5 h-24 w-full rounded-[10px]" />
    </div>
  );
}
