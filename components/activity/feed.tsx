import { Fragment } from "react";
import { DateBlock, LedgerRow, MonthHeading, PaymentLabel, StakeLabel } from "@/components/ui/ledger";
import { formatMoney, type Cents } from "@/lib/domain/money";
import { displayName, type PersonStatus } from "@/lib/utils/person";

type Person = { id: string; name: string; status?: PersonStatus | null };
type GroupRef = { id: string; name: string } | null;

/**
 * One row of a ledger feed. `ActivityItem` (lib/server/activity) is assignable to this, and the
 * friend page maps its expenses/payments into the same shape.
 */
export type FeedItem =
  | {
      type: "expense";
      id: string;
      date: Date;
      createdAt: Date;
      description: string;
      amountCents: Cents;
      currency: string;
      paidBy: Person;
      group: GroupRef;
      /** For direct expenses: the other person (null when the page already says who). */
      friend?: Person | null;
      myStakeCents: Cents;
    }
  | {
      type: "payment";
      id: string;
      date: Date;
      createdAt: Date;
      amountCents: Cents;
      currency: string;
      from: Person;
      to: Person;
      group: GroupRef;
    };

/** "You" / "you" for the viewer, otherwise the person's name. */
function who(p: Person, meId: string, start: boolean) {
  if (p.id !== meId) return displayName(p);
  return start ? "You" : "you";
}

export function expenseMeta(item: Extract<FeedItem, { type: "expense" }>, meId: string) {
  const paid = `${who(item.paidBy, meId, true)} paid ${formatMoney(item.amountCents, item.currency)}`;
  if (item.group) return `${paid} in ${item.group.name}`;
  if (!item.friend) return paid;
  // Direct expense: name the other person, or "you" when they paid.
  return item.paidBy.id === meId ? `${paid} with ${displayName(item.friend)}` : `${paid} with you`;
}

export function paymentTitle(item: Extract<FeedItem, { type: "payment" }>, meId: string) {
  return `${who(item.from, meId, true)} paid ${who(item.to, meId, false)}`;
}

/**
 * `variant="friend"`: on a friend's page the person is implied, so direct items drop "with …" /
 * ", direct" and direct payments don't link back to the page you're on.
 */
export function FeedRow({ item, meId, variant = "feed" }: { item: FeedItem; meId: string; variant?: "feed" | "friend" }) {
  if (item.type === "expense") {
    const involved = item.myStakeCents !== 0 || item.paidBy.id === meId;
    return (
      <LedgerRow
        href={`/expenses/${item.id}`}
        leading={<DateBlock date={item.date} />}
        title={item.description}
        meta={expenseMeta(variant === "friend" ? { ...item, friend: null } : item, meId)}
        trailing={<StakeLabel cents={item.myStakeCents} currency={item.currency} involved={involved} />}
      />
    );
  }

  const other = item.from.id === meId ? item.to : item.from;
  const href = item.group ? `/groups/${item.group.id}` : variant === "feed" ? `/friends/${other.id}` : undefined;
  const meta = item.group ? `Payment in ${item.group.name}` : variant === "feed" ? "Payment, direct" : "Payment";
  return (
    <LedgerRow
      href={href}
      leading={<DateBlock date={item.date} />}
      title={paymentTitle(item, meId)}
      meta={meta}
      trailing={<PaymentLabel cents={item.amountCents} currency={item.currency} />}
    />
  );
}

/** Newest calendar date first; ties broken by when it was recorded. */
export function sortByDate<T extends { date: Date; createdAt: Date }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.date.getTime() - a.date.getTime() || b.createdAt.getTime() - a.createdAt.getTime());
}

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** Consecutive items in the same (UTC) calendar month, keeping the given order. */
export function groupByMonth<T extends { date: Date }>(items: T[]) {
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const d = new Date(item.date);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: monthFormat.format(d), items: [item] });
  }
  return groups;
}

/** A ledger of feed rows under month headings. */
export function MonthlyFeed({
  items,
  meId,
  variant = "feed",
  label,
}: {
  items: FeedItem[];
  meId: string;
  variant?: "feed" | "friend";
  label: string;
}) {
  return (
    <div aria-label={label} role="region">
      {/* Headings and lists are siblings so MonthHeading's first:pt-0 only trims the first one. */}
      {groupByMonth(items).map((month) => (
        <Fragment key={month.key}>
          <MonthHeading>{month.label}</MonthHeading>
          <ul aria-label={month.label}>
            {month.items.map((item) => (
              <li key={`${item.type}-${item.id}`}>
                <FeedRow item={item} meId={meId} variant={variant} />
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
    </div>
  );
}

/** A flat list of feed rows (no month headings), e.g. "Recent activity" on Home. */
export function FeedList({ items, meId, label }: { items: FeedItem[]; meId: string; label: string }) {
  return (
    <ul aria-label={label}>
      {items.map((item) => (
        <li key={`${item.type}-${item.id}`}>
          <FeedRow item={item} meId={meId} />
        </li>
      ))}
    </ul>
  );
}
