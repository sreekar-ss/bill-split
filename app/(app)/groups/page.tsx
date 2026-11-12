import type { Metadata } from "next";
import { GroupBalance } from "@/components/groups/group-balance";
import { listNames } from "@/components/groups/format";
import { NewGroupButton } from "@/components/groups/new-group-button";
import { Avatar } from "@/components/ui/avatar";
import { LedgerRow } from "@/components/ui/ledger";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { requireUser } from "@/lib/auth/session";
import { listGroups } from "@/lib/server/groups";

export const metadata: Metadata = { title: "Groups" };

export default async function GroupsPage() {
  const user = await requireUser();
  const groups = await listGroups(user.id);

  if (groups.length === 0) {
    return (
      <div className="max-w-[720px]">
        <PageHeader title="Groups" />
        <EmptyState
          title="No groups yet"
          body="Make one for a trip, a flat or a team, and we'll keep the tally."
          action={<NewGroupButton defaultCurrency={user.defaultCurrency} variant="primary" />}
        />
      </div>
    );
  }

  return (
    <div className="max-w-[720px]">
      <PageHeader title="Groups" actions={<NewGroupButton defaultCurrency={user.defaultCurrency} />} />
      <ul className="border-t border-rule" aria-label="Your groups">
        {groups.map((g) => (
          <li key={g.id}>
            <LedgerRow
              href={`/groups/${g.id}`}
              leading={<Avatar id={g.id} name={g.name} size={40} />}
              title={g.name}
              meta={
                g.memberCount > 1
                  ? // The viewer reads as "You", first, like on the group page.
                    listNames(["You", ...g.memberPreview.filter((m) => m.id !== user.id).map((m) => m.name)], g.memberCount)
                  : "Just you"
              }
              trailing={<GroupBalance cents={g.myNetCents} currency={g.currency} />}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
