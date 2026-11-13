import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { categoryLabel } from "@/components/expenses/categories";
import { ExpenseActions } from "@/components/expenses/expense-actions";
import { ExpenseRecurring } from "@/components/expenses/expense-recurring";
import { Avatar } from "@/components/ui/avatar";
import { LedgerRow } from "@/components/ui/ledger";
import { Money } from "@/components/ui/money";
import { Panel, Section } from "@/components/ui/page";
import { requireUser } from "@/lib/auth/session";
import { formatDay } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import type { SplitMethod } from "@/lib/domain/splits";
import { getExpense, type ExpenseDetail } from "@/lib/server/expenses";
import { orNotFound } from "@/lib/server/page";
import { cn } from "@/lib/utils/cn";
import { displayName } from "@/lib/utils/person";

type Props = { params: Promise<{ id: string }> };

// One query per request, shared by the metadata and the page.
const loadExpense = cache(async (id: string) => {
  const user = await requireUser();
  return { user, expense: await orNotFound(getExpense(user.id, id)) };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { expense } = await loadExpense(id);
  return { title: expense.description };
}

const METHOD_LABEL: Record<SplitMethod, string> = {
  equal: "Equally",
  exact: "Exact amounts",
  percentage: "By percentage",
  shares: "By shares",
};

const LONG_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

function trimNumber(n: number) {
  return String(Math.round(n * 100) / 100);
}

function contextOf(e: ExpenseDetail) {
  if (e.group) return { href: `/groups/${e.group.id}`, name: e.group.name, label: "Group" };
  const friend = e.shares.find((s) => s.user.id === e.friendId)?.user;
  if (e.friendId) return { href: `/friends/${e.friendId}`, name: friend ? displayName(friend) : "Your friend", label: "With" };
  return { href: "/activity", name: "Activity", label: "With" };
}

export default async function ExpensePage({ params }: Props) {
  const { id } = await params;
  const { user, expense: e } = await loadExpense(id);
  const ctx = contextOf(e);

  const nameOf = (person: { id: string; name: string; status?: string | null }) => (person.id === user.id ? "You" : displayName(person));
  const paidByMe = e.paidBy.id === user.id;
  const myShare = e.shares.find((s) => s.user.id === user.id)?.amountCents ?? 0;
  const stake = paidByMe ? e.amountCents - myShare : -myShare;
  const involved = paidByMe || myShare > 0;

  // Direct expenses store a zero row for a friend who isn't sharing; leave those out of the list.
  const rows = e.shares
    .filter((s) => s.amountCents > 0)
    .sort((a, b) => {
      const rank = (uid: string) => (uid === e.paidBy.id ? 0 : uid === user.id ? 1 : 2);
      return rank(a.user.id) - rank(b.user.id) || displayName(a.user).localeCompare(displayName(b.user));
    });
  const payerInSplit = rows.some((s) => s.user.id === e.paidBy.id);

  const edited = new Date(e.updatedAt).getTime() - new Date(e.createdAt).getTime() > 60_000;
  const addedBy = e.createdBy.id === user.id ? "you" : displayName(e.createdBy);

  return (
    <div className="max-w-[720px]">
      <Link
        href={ctx.href}
        className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-[10px] pl-1 pr-3 text-body-sm font-medium text-ink-muted hover:bg-ink/5 hover:text-ink"
      >
        <ChevronLeft className="size-5" aria-hidden />
        {ctx.name}
      </Link>

      <header className="mb-5">
        <h1 className="text-heading font-bold [overflow-wrap:anywhere]">{e.description}</h1>
        <p className="mt-1 text-body-sm text-ink-muted">{categoryLabel(e.category)}</p>
      </header>

      <Panel>
        <p className="text-body-sm text-ink-muted">{paidByMe ? "You paid" : `${displayName(e.paidBy)} paid`}</p>
        <p className="mt-1 text-hero leading-none">
          <Money cents={e.amountCents} currency={e.currency} className="hero-figure" />
        </p>
        <p
          className={cn(
            "mt-3 text-body-sm font-semibold",
            !involved || stake === 0 ? "text-ink-muted" : stake > 0 ? "text-owed" : "text-owe",
          )}
        >
          {!involved ? (
            "You're not involved in this expense"
          ) : stake === 0 ? (
            "Nothing owed either way"
          ) : (
            <>
              {stake > 0 ? "You lent " : "You borrowed "}
              <span className="num">{formatMoney(stake, e.currency, { abs: true })}</span>
            </>
          )}
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-rule pt-4 text-body-sm">
          <div className="min-w-0">
            <dt className="text-meta text-ink-muted">Date</dt>
            <dd className="num font-medium">{formatDay(e.date, LONG_DATE)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-meta text-ink-muted">Paid by</dt>
            <dd className="truncate font-medium">{nameOf(e.paidBy)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-meta text-ink-muted">{ctx.label}</dt>
            <dd className="truncate font-medium">
              <Link href={ctx.href} className="underline decoration-rule underline-offset-4 hover:decoration-ink">
                {ctx.name}
              </Link>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-meta text-ink-muted">Split</dt>
            <dd className="font-medium">{METHOD_LABEL[e.splitMethod] ?? "Equally"}</dd>
          </div>
        </dl>

        {e.recurring ? <ExpenseRecurring recurring={e.recurring} description={e.description} /> : null}
      </Panel>

      <div className="mt-4">
        <ExpenseActions expense={e} backHref={ctx.href} />
      </div>

      <Section title="Shares" className="mt-8">
        <ul>
          {!payerInSplit ? (
            <li>
              <LedgerRow
                leading={<Avatar id={e.paidBy.id} name={e.paidBy.name} size={40} />}
                title={nameOf(e.paidBy)}
                meta={`Paid ${formatMoney(e.amountCents, e.currency)}`}
                trailing={<span className="text-meta text-ink-muted">not in the split</span>}
              />
            </li>
          ) : null}
          {rows.map((s) => {
            const isPayer = s.user.id === e.paidBy.id;
            const detail =
              e.splitMethod === "percentage" && s.percentage != null
                ? `${trimNumber(s.percentage)}%`
                : e.splitMethod === "shares" && s.shares != null
                  ? `${trimNumber(s.shares)} ${s.shares === 1 ? "share" : "shares"}`
                  : null;
            const meta = [isPayer ? `Paid ${formatMoney(e.amountCents, e.currency)}` : null, detail].filter(Boolean).join(", ");
            return (
              <li key={s.user.id}>
                <LedgerRow
                  leading={<Avatar id={s.user.id} name={s.user.name} size={40} />}
                  title={nameOf(s.user)}
                  meta={meta || undefined}
                  trailing={
                    <span className="flex flex-col items-end leading-tight">
                      <span className="text-meta text-ink-muted">{s.user.id === user.id ? "your share" : "share"} </span>
                      <Money cents={s.amountCents} currency={e.currency} className="font-bold" />
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      </Section>

      {e.notes ? (
        <Section title="Note" className="mt-8">
          <p className="max-w-[60ch] whitespace-pre-wrap [overflow-wrap:anywhere]">{e.notes}</p>
        </Section>
      ) : null}

      <p className="mt-8 text-meta text-ink-muted">
        Added by {addedBy} on <span className="num">{formatDay(e.createdAt, LONG_DATE)}</span>.
        {edited ? (
          <>
            {" "}
            Last edited <span className="num">{formatDay(e.updatedAt, LONG_DATE)}</span>.
          </>
        ) : null}
      </p>
    </div>
  );
}
