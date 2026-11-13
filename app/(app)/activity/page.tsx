import type { Metadata } from "next";
import { AddExpenseButton } from "@/components/activity/add-expense-button";
import { MonthlyFeed, sortByDate } from "@/components/activity/feed";
import { ActivitySearch } from "@/components/search/activity-search";
import { filtersToQuery, parseFilters, toSearchInput, type FilterOption } from "@/components/search/filters";
import { SectionLink } from "@/components/home/section-link";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { requireUser } from "@/lib/auth/session";
import { listActivity } from "@/lib/server/activity";
import { withRecurringFlags } from "@/lib/server/activity-recurring";
import { listFriends } from "@/lib/server/friends";
import { listGroups } from "@/lib/server/groups";
import { searchExpenses } from "@/lib/server/search";
import { displayName } from "@/lib/utils/person";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const filters = parseFilters(await searchParams);
  const key = filtersToQuery(filters);

  const [items, groups, friends, initialResult] = await Promise.all([
    listActivity(user.id).then(withRecurringFlags),
    listGroups(user.id),
    listFriends(user.id),
    // A failed first search isn't fatal: the client island retries and shows the error with "Try again".
    key ? searchExpenses(user.id, toSearchInput(filters, 0)).catch(() => null) : null,
  ]);

  if (items.length === 0 && !key) {
    return (
      <div className="max-w-[720px]">
        <PageHeader title="Activity" />
        <EmptyState
          title="Nothing here yet"
          body="Expenses and payments from your groups and friends will show up here. Add the first one and we'll keep the tally."
          action={<AddExpenseButton />}
        />
      </div>
    );
  }

  // Active groups first, archived ones after (still searchable: their history doesn't go away).
  const groupOptions: FilterOption[] = [...groups]
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name))
    .map((g) => ({ id: g.id, label: `${g.icon ? `${g.icon} ` : ""}${g.name}${g.archived ? " (archived)" : ""}` }));
  const friendOptions: FilterOption[] = friends
    .map((f) => ({ id: f.id, label: displayName(f) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="max-w-[720px]">
      <PageHeader
        title="Activity"
        subtitle="Every expense and payment you can see, newest first."
        actions={<SectionLink href="/insights">See your spending</SectionLink>}
      />
      <ActivitySearch
        meId={user.id}
        groups={groupOptions}
        friends={friendOptions}
        initial={key && initialResult ? { key, result: initialResult } : null}
      >
        {items.length ? (
          <MonthlyFeed items={sortByDate(items)} meId={user.id} label="Activity" />
        ) : (
          <EmptyState
            title="Nothing here yet"
            body="Expenses and payments from your groups and friends will show up here. Add the first one and we'll keep the tally."
            action={<AddExpenseButton />}
          />
        )}
      </ActivitySearch>
    </div>
  );
}
