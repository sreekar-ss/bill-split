import { ChevronDown } from "lucide-react";
import type { Metadata } from "next";
import { GroupBalance } from "@/components/groups/group-balance";
import { listNames } from "@/components/groups/format";
import { GroupAvatar } from "@/components/groups/group-avatar";
import { NewGroupButton } from "@/components/groups/new-group-button";
import { LedgerRow } from "@/components/ui/ledger";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { requireUser } from "@/lib/auth/session";
import { listGroups } from "@/lib/server/groups";
import { displayName } from "@/lib/utils/person";

export const metadata: Metadata = { title: "Groups" };

type GroupSummary = Awaited<ReturnType<typeof listGroups>>[number];

function GroupRows({ groups, meId, label }: { groups: GroupSummary[]; meId: string; label: string }) {
  return (
    <ul className="border-t border-rule" aria-label={label}>
      {groups.map((g) => (
        <li key={g.id}>
          <LedgerRow
            href={`/groups/${g.id}`}
            leading={<GroupAvatar id={g.id} name={g.name} icon={g.icon} size={40} />}
            title={g.name}
            meta={
              g.memberCount > 1
                ? // The viewer reads as "You", first, like on the group page.
                  listNames(["You", ...g.memberPreview.filter((m) => m.id !== meId).map((m) => displayName(m))], g.memberCount)
                : "Just you"
            }
            trailing={<GroupBalance cents={g.myNetCents} currency={g.currency} />}
          />
        </li>
      ))}
    </ul>
  );
}

export default async function GroupsPage() {
  const user = await requireUser();
  const groups = await listGroups(user.id);
  // Most recent activity first within each list (listGroups' order); finished groups sit at the bottom.
  const active = groups.filter((g) => !g.archived);
  const archived = groups.filter((g) => g.archived);

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
      {active.length > 0 ? (
        <GroupRows groups={active} meId={user.id} label="Your groups" />
      ) : (
        <p className="border-t border-rule pt-5 text-body-sm text-ink-muted">
          No active groups. Start a new one, or open an archived group below.
        </p>
      )}
      {archived.length > 0 ? (
        // Collapsed by default; open when there's nothing else to show.
        <details className="group mt-8" open={active.length === 0}>
          <summary className="-mx-2 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[10px] px-2 text-title font-bold hover:bg-ink/5 [&::-webkit-details-marker]:hidden">
            {/* A real heading, so people moving by headings find the archived groups. */}
            <h2 className="text-title font-bold">Archived ({archived.length})</h2>
            <ChevronDown className="size-5 text-ink-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
          </summary>
          <p className="mb-3 mt-1 text-body-sm text-ink-muted">Finished groups. They&apos;re read-only until someone unarchives them.</p>
          <GroupRows groups={archived} meId={user.id} label="Archived groups" />
        </details>
      ) : null}
    </div>
  );
}
