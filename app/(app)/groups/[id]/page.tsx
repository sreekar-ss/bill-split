import { ChartColumn, ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { ArchivedBanner } from "@/components/groups/archive-controls";
import { listNames, memberCount } from "@/components/groups/format";
import { GroupAvatar } from "@/components/groups/group-avatar";
import { GroupHeaderActions } from "@/components/groups/group-header-actions";
import { GroupLedger } from "@/components/groups/group-ledger";
import { SettlePlan } from "@/components/groups/settle-plan";
import { RecurringList } from "@/components/recurring/recurring-list";
import { BalanceBeam, type BeamRow } from "@/components/ui/balance-beam";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/ui/page";
import { requireUser } from "@/lib/auth/session";
import { formatMoney } from "@/lib/domain/money";
import { displayName } from "@/lib/utils/person";
import { getGroup } from "@/lib/server/groups";
import { orNotFound } from "@/lib/server/page";
import { listRecurring } from "@/lib/server/recurring";

type Props = { params: Promise<{ id: string }> };

// One query per request, shared by generateMetadata and the page.
const loadGroup = cache(async (id: string) => {
  const user = await requireUser();
  const group = await orNotFound(getGroup(user.id, id));
  return { user, group };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { group } = await loadGroup(id);
  return { title: group.name };
}

export default async function GroupPage({ params }: Props) {
  const { id } = await params;
  // The session lookup is cached per request, so both queries run in parallel; a non-member gets a 404 from either.
  const viewer = await requireUser();
  const [{ user, group }, recurring] = await Promise.all([loadGroup(id), orNotFound(listRecurring(viewer.id, { groupId: id }))]);
  const meId = user.id;
  const solo = group.members.length < 2;

  const totalSpent = group.expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const spent = `${formatMoney(totalSpent, group.currency)} spent`;
  // The settle-up sheet labels people itself (displayName: "Ben (invited)"); handles drive its payment links.
  const people = group.members.map((m) => ({
    id: m.id,
    name: m.name,
    status: m.status,
    venmoHandle: m.venmoHandle,
    paypalMe: m.paypalMe,
    cashTag: m.cashTag,
    upiId: m.upiId,
  }));
  // Viewer first, so the subtitle reads "You, Ben (invited) and Chloe".
  const names = [...group.members]
    .sort((a, b) => Number(b.id === meId) - Number(a.id === meId))
    .map((m) => (m.id === meId ? "You" : displayName(m)));

  const beam: BeamRow[] = group.members.map((m) =>
    m.id === meId
      ? { id: m.id, name: "You", cents: m.netCents, phrase: { positive: "get back", negative: "owe" } }
      : { id: m.id, name: displayName(m), cents: m.netCents },
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr] lg:gap-x-10">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:max-w-[720px]">
        <PageHeader
          back={
            <Link
              href="/groups"
              className="-ml-2.5 mb-1 inline-flex min-h-11 items-center gap-0.5 rounded-[10px] pl-0.5 pr-2 text-body-sm font-medium hover:bg-ink/5"
            >
              <ChevronLeft className="size-[22px]" aria-hidden />
              Groups
            </Link>
          }
          title={
            group.icon ? (
              <span className="flex min-w-0 items-center gap-2.5">
                <GroupAvatar id={group.id} name={group.name} icon={group.icon} size={36} />
                <span className="truncate">{group.name}</span>
              </span>
            ) : (
              group.name
            )
          }
          subtitle={
            <>
              <span className="block">{memberCount(group.members.length)}</span>
              {group.members.length > 1 ? <span className="block truncate">{listNames(names)}</span> : null}
            </>
          }
          actions={
            <GroupHeaderActions
              meId={meId}
              group={{
                id: group.id,
                name: group.name,
                currency: group.currency,
                icon: group.icon,
                archived: group.archived,
                isAdmin: group.isAdmin,
                currencyLocked: group.currencyLocked,
                settled: group.settled,
                members: group.members,
              }}
            />
          }
        />
        {group.archived ? <ArchivedBanner groupId={group.id} /> : null}
        {group.expenses.length > 0 ? (
          <Link
            href={`/groups/${group.id}/insights`}
            className={buttonVariants({ variant: "ghost", className: group.archived ? "-ml-4 mb-3" : "-ml-4 -mt-2 mb-3" })}
          >
            <ChartColumn aria-hidden />
            Spending
          </Link>
        ) : null}
      </div>

      <aside
        aria-label="Balances and settle up"
        className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:border-l lg:border-rule lg:pl-8"
      >
        <Section title="Balances" action={totalSpent === 0 ? undefined : <span className="num text-body-sm text-ink-muted lg:hidden">{spent}</span>}>
          {solo ? (
            <p className="text-body-sm text-ink-muted">
              {group.archived ? "Nobody else was in this group." : "Add a member to start splitting costs."}
            </p>
          ) : (
            <BalanceBeam rows={beam} currency={group.currency} label="Members' balances" />
          )}
        </Section>
        {/* A group of one has nobody to settle with. */}
        {solo ? null : (
          <Section title="Settle up">
            <SettlePlan
              groupId={group.id}
              plan={group.plan}
              people={people}
              meId={meId}
              currency={group.currency}
              paymentNote={group.name}
              readOnly={group.archived}
            />
          </Section>
        )}
      </aside>

      {/* Main column on desktop (above the ledger); on mobile the order is balances, settle up, recurring, ledger. */}
      <div className="mt-8 min-w-0 lg:col-start-1 lg:row-start-2 lg:mt-6 lg:max-w-[720px]">
        {recurring.length > 0 ? (
          <Section title="Recurring">
            <RecurringList items={recurring} readOnly={group.archived} />
          </Section>
        ) : null}
        <Section title="Expenses" action={totalSpent === 0 ? undefined : <span className="num hidden text-body-sm text-ink-muted lg:inline">{spent} in total</span>}>
          <GroupLedger group={group} meId={meId} />
        </Section>
      </div>
    </div>
  );
}
