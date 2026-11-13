import { Repeat } from "lucide-react";
import { groupByMonth, sortByDate } from "@/components/activity/feed";
import { DateBlock, LedgerRow, MonthHeading, StakeLabel } from "@/components/ui/ledger";
import { formatMoney } from "@/lib/domain/money";
import type { GroupDetail } from "@/lib/server/groups";
import { EmptyLedger } from "./empty-ledger";
import { paidSentence, personName } from "./format";
import { PaymentRow } from "./payment-row";

type Entry =
  | { kind: "expense"; date: Date; createdAt: Date; expense: GroupDetail["expenses"][number] }
  | { kind: "payment"; date: Date; createdAt: Date; payment: GroupDetail["payments"][number] };

/** Expenses and payments merged, newest first, grouped by calendar month. */
export function GroupLedger({ group, meId }: { group: GroupDetail; meId: string }) {
  const entries = sortByDate<Entry>([
    ...group.expenses.map((e) => ({ kind: "expense" as const, date: new Date(e.date), createdAt: new Date(e.createdAt), expense: e })),
    ...group.payments.map((p) => ({ kind: "payment" as const, date: new Date(p.date), createdAt: new Date(p.createdAt), payment: p })),
  ]);

  if (entries.length === 0) {
    return (
      <EmptyLedger groupId={group.id} groupName={group.name} alone={group.members.length < 2} isAdmin={group.isAdmin} archived={group.archived} />
    );
  }

  return (
    <div>
      {groupByMonth(entries).map((m) => (
        <section key={m.key} aria-label={m.label}>
          <MonthHeading>{m.label}</MonthHeading>
          <ul className="border-t border-rule">
            {m.items.map((entry) =>
              entry.kind === "expense" ? (
                <li key={`e-${entry.expense.id}`}>
                  <LedgerRow
                    href={`/expenses/${entry.expense.id}`}
                    leading={<DateBlock date={entry.expense.date} />}
                    title={entry.expense.recurring ? <RecurringTitle title={entry.expense.description} /> : entry.expense.description}
                    meta={`${personName(entry.expense.paidBy, meId, true)} paid ${formatMoney(entry.expense.amountCents, group.currency)}`}
                    trailing={
                      <StakeLabel cents={entry.expense.myStakeCents} currency={group.currency} involved={entry.expense.involvesMe} />
                    }
                  />
                </li>
              ) : (
                <PaymentRow
                  key={`p-${entry.payment.id}`}
                  id={entry.payment.id}
                  title={paidSentence(entry.payment.from, entry.payment.to, meId)}
                  note={entry.payment.note}
                  date={entry.payment.date}
                  amountCents={entry.payment.amountCents}
                  currency={group.currency}
                  readOnly={group.archived}
                />
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The title plus a small repeat icon, which stays visible when a long title truncates. Named for screen readers. */
function RecurringTitle({ title }: { title: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{title}</span>
      <Repeat role="img" aria-label="Recurring" className="size-[15px] shrink-0 text-ink-muted" strokeWidth={2.25}>
        <title>Recurring</title>
      </Repeat>
    </span>
  );
}
