import type { Metadata } from "next";
import { FeedList, sortByDate } from "@/components/activity/feed";
import { GroupRows } from "@/components/home/group-rows";
import { SectionLink } from "@/components/home/section-link";
import { SpendingEntry } from "@/components/home/spending-entry";
import { SummaryPanel } from "@/components/home/summary-panel";
import { Welcome } from "@/components/home/welcome";
import { BalanceBeam } from "@/components/ui/balance-beam";
import { PageHeader, Section } from "@/components/ui/page";
import { requireUser } from "@/lib/auth/session";
import { getDashboard } from "@/lib/server/activity";
import { withRecurringFlags } from "@/lib/server/activity-recurring";
import { listFriends } from "@/lib/server/friends";
import { getPersonalInsights } from "@/lib/server/insights";
import { displayName } from "@/lib/utils/person";

export const metadata: Metadata = { title: "Home" };

const GROUP_LIMIT = 4;
const RECENT_LIMIT = 4;

export default async function HomePage() {
  const user = await requireUser();
  const [dash, friends, spending] = await Promise.all([
    getDashboard(user.id),
    listFriends(user.id),
    getPersonalInsights(user.id, { months: 6 }),
  ]);

  if (dash.groups.length === 0 && friends.length === 0) {
    return (
      <div className="max-w-[720px]">
        <PageHeader title="Home" />
        <Welcome name={user.name} />
      </div>
    );
  }

  // The most recently recorded items, labelled when a recurring schedule added them.
  const recent = await withRecurringFlags(dash.recent.slice(0, RECENT_LIMIT));

  // Only friends have a page; someone you share a group with but removed as a friend has no link.
  const friendIds = new Set(friends.map((f) => f.id));
  // One beam per currency, in the same order as the summary panel.
  const order = [...new Set([...dash.totals.map((t) => t.currency), ...dash.people.map((p) => p.currency)])];
  const beams = order
    .map((currency) => ({ currency, people: dash.people.filter((p) => p.currency === currency) }))
    .filter((b) => b.people.length > 0);

  // Archived groups are finished; Home lists the ones still in use (the Groups page has them all).
  const activeGroups = dash.groups.filter((g) => !g.archived);
  // Your share this month, default currency first (amounts in different currencies aren't added up).
  const spends = [...spending.currencies].sort((a, b) => Number(b.currency === dash.currency) - Number(a.currency === dash.currency));

  return (
    <div className="max-w-[720px]">
      <PageHeader title="Home" />
      <SummaryPanel totals={dash.totals} currency={dash.currency} />

      <Section title="People" className="mt-8" action={friends.length > 0 ? <SectionLink href="/friends">All friends</SectionLink> : undefined}>
        {dash.people.length === 0 ? (
          <p className="text-body-sm text-ink-muted">You&apos;re settled up with everyone.</p>
        ) : (
          beams.map((b) => (
            <div key={b.currency} className="mt-6 first:mt-0">
              {/* Amounts in different currencies aren't comparable, so each currency gets its own beam. */}
              {beams.length > 1 ? <h3 className="mb-2 text-body-sm font-semibold text-ink-muted">In {b.currency}</h3> : null}
              <BalanceBeam
                label={beams.length > 1 ? `Your balance with each person in ${b.currency}` : "Your balance with each person"}
                currency={b.currency}
                rows={b.people.map((p) => ({
                  id: p.user.id,
                  name: displayName(p.user),
                  cents: p.cents,
                  currency: p.currency,
                  phrase: { positive: "owes you", negative: "you owe" },
                  href: friendIds.has(p.user.id) ? `/friends/${p.user.id}` : undefined,
                }))}
              />
            </div>
          ))
        )}
      </Section>

      <Section title="Groups" action={<SectionLink href="/groups">All groups</SectionLink>}>
        {dash.groups.length === 0 ? (
          <p className="text-body-sm text-ink-muted">No groups yet. Start one for a trip, a flat or a regular dinner.</p>
        ) : activeGroups.length === 0 ? (
          <p className="text-body-sm text-ink-muted">All your groups are archived. Start a new one for your next trip or shared flat.</p>
        ) : (
          <GroupRows groups={activeGroups.slice(0, GROUP_LIMIT)} />
        )}
      </Section>

      {/* Hidden until there's something to show; nothing shared in 6 months means an empty page. */}
      {spends.length > 0 ? (
        <Section title="Your spending" action={<SectionLink href="/insights">See your spending</SectionLink>}>
          <SpendingEntry spends={spends} />
        </Section>
      ) : null}

      <Section title="Recent activity" action={dash.recent.length > 0 ? <SectionLink href="/activity">All activity</SectionLink> : undefined}>
        {recent.length === 0 ? (
          <p className="text-body-sm text-ink-muted">No expenses yet. Add the first one and we&apos;ll keep the tally.</p>
        ) : (
          // The most recently recorded items, shown in date order like every other ledger.
          <FeedList items={sortByDate(recent)} meId={user.id} label="Recent activity" />
        )}
      </Section>
    </div>
  );
}
