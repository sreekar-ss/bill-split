import { DateBlock, LedgerRow, MonthHeading, StakeLabel } from "@/components/ui/ledger";
import { formatMoney } from "@/lib/domain/money";
import type { GroupDetail } from "@/lib/server/groups";
import { EmptyLedger } from "./empty-ledger";
import { monthLabel, paidSentence, personName } from "./format";
import { PaymentRow } from "./payment-row";

type Entry =
  | { kind: "expense"; at: Date; created: Date; expense: GroupDetail["expenses"][number] }
  | { kind: "payment"; at: Date; created: Date; payment: GroupDetail["payments"][number] };

/** Expenses and payments merged, newest first, grouped by calendar month. */
export function GroupLedger({ group, meId }: { group: GroupDetail; meId: string }) {
  const entries: Entry[] = [
    ...group.expenses.map((e) => ({ kind: "expense" as const, at: new Date(e.date), created: new Date(e.createdAt), expense: e })),
    ...group.payments.map((p) => ({ kind: "payment" as const, at: new Date(p.date), created: new Date(p.createdAt), payment: p })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime() || b.created.getTime() - a.created.getTime());

  if (entries.length === 0) return <EmptyLedger groupId={group.id} groupName={group.name} alone={group.members.length < 2} isAdmin={group.isAdmin} />;

  const months: { label: string; entries: Entry[] }[] = [];
  for (const entry of entries) {
    const label = monthLabel(entry.at);
    const last = months[months.length - 1];
    if (last?.label === label) last.entries.push(entry);
    else months.push({ label, entries: [entry] });
  }

  return (
    <div>
      {months.map((m) => (
        <section key={m.label} aria-label={m.label}>
          <MonthHeading>{m.label}</MonthHeading>
          <ul className="border-t border-rule">
            {m.entries.map((entry) =>
              entry.kind === "expense" ? (
                <li key={`e-${entry.expense.id}`}>
                  <LedgerRow
                    href={`/expenses/${entry.expense.id}`}
                    leading={<DateBlock date={entry.expense.date} />}
                    title={entry.expense.description}
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
                />
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
