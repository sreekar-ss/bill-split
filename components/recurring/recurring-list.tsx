"use client";

// CONTRACT (owned by the expenses/recurring feature; used on group and friend pages). Keep props stable.
import type { RecurringSummary } from "@/lib/server/recurring";

export interface RecurringListProps {
  /** From listRecurring(userId, { groupId } | { friendId }). Render nothing when empty. */
  items: RecurringSummary[];
}

export function RecurringList({ items }: RecurringListProps) {
  if (items.length === 0) return null;
  return (
    <ul>
      {items.map((r) => (
        <li key={r.id}>
          {r.description}: {r.schedule}
        </li>
      ))}
    </ul>
  );
}
