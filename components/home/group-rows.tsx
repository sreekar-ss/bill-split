import { GroupAvatar } from "@/components/groups/group-avatar";
import { LedgerRow } from "@/components/ui/ledger";
import { GroupBalance } from "@/components/groups/group-balance";
import type { Cents } from "@/lib/domain/money";

export interface GroupRowData {
  id: string;
  name: string;
  currency: string;
  memberCount: number;
  myNetCents: Cents;
  /** A single emoji chosen in the group's settings, or null for initials. */
  icon?: string | null;
}

/** The group's emoji or initials. Same tile as the groups list and group header (GroupAvatar). */
export function GroupIcon({ id, name, icon, size = 40 }: { id: string; name: string; icon?: string | null; size?: number }) {
  return <GroupAvatar id={id} name={name} icon={icon} size={size} />;
}

export function GroupRows({ groups }: { groups: GroupRowData[] }) {
  return (
    <ul aria-label="Groups">
      {groups.map((g) => (
        <li key={g.id}>
          <LedgerRow
            href={`/groups/${g.id}`}
            leading={<GroupIcon id={g.id} name={g.name} icon={g.icon} />}
            title={g.name}
            meta={g.memberCount === 1 ? "Just you" : `${g.memberCount} people`}
            trailing={<GroupBalance cents={g.myNetCents} currency={g.currency} />}
          />
        </li>
      ))}
    </ul>
  );
}
