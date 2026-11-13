import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { AddExpenseButton } from "@/components/activity/add-expense-button";
import { MonthlyFeed, sortByDate, type FeedItem } from "@/components/activity/feed";
import { BalanceBreakdown } from "@/components/friends/balance-breakdown";
import { RemoveFriendButton } from "@/components/friends/remove-friend-button";
import { RecurringList } from "@/components/recurring/recurring-list";
import { Avatar } from "@/components/ui/avatar";
import { balancePhrase, Money } from "@/components/ui/money";
import { EmptyState, Panel, Section } from "@/components/ui/page";
import { requireUser } from "@/lib/auth/session";
import { withRecurringFlags } from "@/lib/server/activity-recurring";
import { getFriend } from "@/lib/server/friends";
import { orNotFound } from "@/lib/server/page";
import { listRecurring } from "@/lib/server/recurring";
import { cn } from "@/lib/utils/cn";
import { displayName, isInvited } from "@/lib/utils/person";

type Params = { params: Promise<{ id: string }> };

// Shared by generateMetadata and the page so the friend is loaded once per request.
const loadFriend = cache((userId: string, friendId: string) => orNotFound(getFriend(userId, friendId)));

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  const detail = await loadFriend(user.id, id);
  return { title: displayName(detail.friend) };
}

export default async function FriendPage({ params }: Params) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  const { friend, balances, breakdown, expenses, payments } = await loadFriend(user.id, id);
  // Balances are per currency (never added together); the default currency comes first.
  const [primary, ...others] = balances;
  const name = displayName(friend);
  const invited = isInvited(friend);

  const [recurring, history] = await Promise.all([
    // Direct schedules between the two of you (group schedules live on the group page).
    listRecurring(user.id, { friendId: friend.id }),
    withRecurringFlags<FeedItem>(
      sortByDate<FeedItem>([
        ...expenses.map((e) => ({ type: "expense" as const, ...e, friend: null })),
        ...payments.map((p) => ({ type: "payment" as const, ...p })),
      ]),
    ),
  ]);

  const headline = !primary ? `You and ${name} are settled up` : primary.cents > 0 ? `${name} owes you` : `You owe ${name}`;
  const sentence = balances.length ? balances.map((b) => balancePhrase(b.cents, b.currency, name)).join(", and ") : "settled up";

  return (
    <div className="max-w-[720px]">
      <Link
        href="/friends"
        className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-[10px] px-2 text-body-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="size-[18px]" aria-hidden />
        Friends
      </Link>

      <header className="flex items-center gap-3.5">
        <Avatar id={friend.id} name={friend.name} size={56} />
        <div className="min-w-0">
          <h1 className="truncate text-heading font-bold">{name}</h1>
          {friend.status === "deleted" ? null : <p className="truncate text-body-sm text-ink-muted">{friend.email}</p>}
        </div>
      </header>

      {invited ? (
        <p className="mt-4 rounded-[10px] border border-rule px-3.5 py-3 text-body-sm">
          <span className="font-semibold">Invited.</span>{" "}
          <span className="text-ink-muted">{friend.name} hasn&apos;t joined yet — expenses you add still count.</span>
        </p>
      ) : null}

      <Panel className="mt-5" aria-label={`Your balance with ${name}: ${sentence}`} role="region">
        <p className="text-body-sm font-semibold text-ink-muted">{headline}</p>
        {primary ? (
          <>
            <p className="mt-1">
              <Money cents={primary.cents} currency={primary.currency} tone="signed" className="hero-figure text-hero leading-[1.15]" />
            </p>
            {others.map((b) => (
              <p key={b.currency} className={cn("mt-1 text-body-sm font-semibold", b.cents > 0 ? "text-owed" : "text-owe")}>
                Also, {balancePhrase(b.cents, b.currency, name)}
              </p>
            ))}
          </>
        ) : (
          <p className="mt-1 text-body-sm text-ink-muted">Nothing is owed either way across your groups and direct expenses.</p>
        )}
        <BalanceBreakdown
          me={{ id: user.id, name: user.name }}
          friend={{
            id: friend.id,
            name: friend.name,
            status: friend.status,
            venmoHandle: friend.venmoHandle,
            paypalMe: friend.paypalMe,
            cashTag: friend.cashTag,
            upiId: friend.upiId,
          }}
          breakdown={breakdown}
        />
      </Panel>

      {recurring.length > 0 ? (
        <Section title="Recurring" className="mt-8">
          <RecurringList items={recurring} />
        </Section>
      ) : null}

      {/* The shell's add button is already preset to this friend, so the section only offers one when empty. */}
      <Section title="Shared history" className="mt-8">
        {history.length === 0 ? (
          <EmptyState
            title={`Nothing with ${name} yet`}
            body={`Expenses and payments between you and ${name} will show up here, including ones in shared groups.`}
            action={<AddExpenseButton preset={{ friendId: friend.id }} />}
          />
        ) : (
          <MonthlyFeed items={history} meId={user.id} variant="friend" label={`Shared history with ${name}`} />
        )}
      </Section>

      <div className="mt-8">
        <RemoveFriendButton friend={{ id: friend.id, name: friend.name, status: friend.status }} />
      </div>
    </div>
  );
}
