import type { Metadata } from "next";
import { AddFriendButton } from "@/components/friends/add-friend-button";
import { Avatar } from "@/components/ui/avatar";
import { LedgerRow } from "@/components/ui/ledger";
import { BalanceLabel } from "@/components/ui/money";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { requireUser } from "@/lib/auth/session";
import { listFriends } from "@/lib/server/friends";

export const metadata: Metadata = { title: "Friends" };

export default async function FriendsPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const [user, { add }] = await Promise.all([requireUser(), searchParams]);
  const friends = await listFriends(user.id);
  const openAdd = add === "1";

  return (
    <div className="max-w-[720px]">
      <PageHeader
        title="Friends"
        subtitle={friends.length ? "Your balance with each person, across groups and direct expenses." : undefined}
        actions={friends.length ? <AddFriendButton variant="secondary" defaultOpen={openAdd} /> : undefined}
      />
      {friends.length === 0 ? (
        <EmptyState
          title="No friends yet"
          body="Add a friend by email to split costs with just the two of you. People you share a group with show up here too."
          action={<AddFriendButton defaultOpen={openAdd} />}
        />
      ) : (
        <ul aria-label="Friends">
          {friends.map((f) => (
            <li key={f.id}>
              <LedgerRow
                href={`/friends/${f.id}`}
                leading={<Avatar id={f.id} name={f.name} size={40} />}
                title={f.name}
                meta={f.email}
                trailing={
                  f.balances.length === 0 ? (
                    <BalanceLabel cents={0} currency={user.defaultCurrency} />
                  ) : (
                    // One label per currency: different currencies are never added together.
                    <span className="flex flex-col items-end gap-1.5">
                      {f.balances.map((b) => (
                        <BalanceLabel key={b.currency} cents={b.cents} currency={b.currency} />
                      ))}
                    </span>
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
