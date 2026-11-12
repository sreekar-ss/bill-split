import type { Metadata } from "next";
import { AddExpenseButton } from "@/components/activity/add-expense-button";
import { MonthlyFeed, sortByDate } from "@/components/activity/feed";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { requireUser } from "@/lib/auth/session";
import { listActivity } from "@/lib/server/activity";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const user = await requireUser();
  const items = await listActivity(user.id);

  return (
    <div className="max-w-[720px]">
      <PageHeader title="Activity" subtitle={items.length ? "Every expense and payment you can see, newest first." : undefined} />
      {items.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Expenses and payments from your groups and friends will show up here. Add the first one and we'll keep the tally."
          action={<AddExpenseButton />}
        />
      ) : (
        <MonthlyFeed items={sortByDate(items)} meId={user.id} label="Activity" />
      )}
    </div>
  );
}
