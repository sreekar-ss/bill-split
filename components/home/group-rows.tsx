import { Avatar } from "@/components/ui/avatar";
import { LedgerRow } from "@/components/ui/ledger";
import { GroupBalance } from "@/components/groups/group-balance";
import type { Cents } from "@/lib/domain/money";

export interface GroupRowData {
  id: string;
  name: string;
  currency: string;
  memberCount: number;
  myNetCents: Cents;
}

export function GroupRows({ groups }: { groups: GroupRowData[] }) {
  return (
    <ul aria-label="Groups">
      {groups.map((g) => (
        <li key={g.id}>
          <LedgerRow
            href={`/groups/${g.id}`}
            leading={<Avatar id={g.id} name={g.name} size={40} />}
            title={g.name}
            meta={g.memberCount === 1 ? "Just you" : `${g.memberCount} people`}
            trailing={<GroupBalance cents={g.myNetCents} currency={g.currency} />}
          />
        </li>
      ))}
    </ul>
  );
}
